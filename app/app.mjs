// Hugo - conecta a Slack (Socket Mode) y carga modulos. Cada capacidad vive en modulos/ y se usa desde aqui.
// Hugo es independiente de otros programas. Lee ../keys/.bot-token y ../keys/.app-token al arrancar
// y ../keys/.user-token solo cuando el modulo borrar-hilo lo necesita (nunca imprime su contenido).
import bolt from '@slack/bolt';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as confirmacion from './modulos/confirmacion.mjs';
import * as borrarHilo from './modulos/borrar-hilo.mjs';
import * as archivos from './modulos/archivos.mjs';
import * as actualizar from './modulos/actualizar.mjs';
import * as saludo from './modulos/saludo.mjs';
import * as github from './modulos/github.mjs';
import * as estado from './modulos/estado.mjs';
import * as estadoRegistro from './modulos/estado-registro.mjs';
import * as ayuda from './modulos/ayuda.mjs';
import * as reiniciar from './modulos/reiniciar.mjs';
import * as detener from './modulos/detener.mjs';
import * as velas from './modulos/velas.mjs';
import * as sincronizarRegistros from './modulos/sincronizar-registros.mjs';
import * as radiografias from './modulos/radiografias.mjs';
import * as barraMovil from './modulos/barra-movil.mjs';
import * as cicloDiario from './modulos/ciclo-diario.mjs';
import * as registroIntradia from './modulos/registro-intradia.mjs';
import * as reporte from './modulos/reporte.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const leerClave = (f) => { try { return fs.readFileSync(path.join(dir, '..', 'keys', f), 'utf8').trim(); } catch { return ''; } };

// config.env: valores NO secretos (KEY=VALUE)
const conf = {};
try {
  for (const l of fs.readFileSync(path.join(dir, 'config.env'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) conf[m[1]] = m[2];
  }
} catch {}
const CANAL = process.env.HUGO_AVISO_CANAL || conf.HUGO_AVISO_CANAL;
const USUARIO = process.env.HUGO_USUARIO || conf.HUGO_USUARIO || ''; // su 👍 es el que confirma las ordenes que lo piden (id de Slack)
const DELEGADO = process.env.HUGO_DELEGADO || conf.HUGO_DELEGADO || ''; // id de Slack del asistente (lo usa actualizar para reconocer instaladores suyos)
const botToken = leerClave('.bot-token');
const appToken = leerClave('.app-token');
if (!botToken || !appToken || !CANAL) {
  console.error('Falta ' + [!botToken && '../keys/.bot-token', !appToken && '../keys/.app-token', !CANAL && 'HUGO_AVISO_CANAL en config.env'].filter(Boolean).join(', '));
  process.exit(2);
}

const app = new bolt.App({ token: botToken, appToken, socketMode: true });

// Contexto comun que reciben todos los modulos.
const comandos = [];
const alIniciar = [];
const alMencionar = [];
const activas = new Map();   // trabajo en curso: id -> { que, desde, largo }; lo ven los modulos (estado, detener, reiniciar)
const parada = { n: 0 };      // parada unica: stop y restart la suben; cada trabajo largo la mira en cada paso y frena limpio
const ctx = {
  app, botToken, canal: CANAL, leerClave, conf, usuario: USUARIO, delegado: DELEGADO,
  botUserId: '',
  desde: Date.now(),
  activas, parada,
  comandos: () => comandos.map((c) => ({ nombre: c.nombre })),
  comando: (patron, fn, opciones = {}) => comandos.push({ patron, fn, nombre: opciones.nombre || '' }),   // patron: regex sobre el texto, o funcion (texto, evento) => bool
  porDefecto: (fn) => { ctx._defecto = fn; },               // si ningun comando coincide
  alIniciar: (fn) => alIniciar.push(fn),
  alMencionar: (fn) => alMencionar.push(fn),               // completa el evento antes de buscar el comando
  confirmar: null,                                          // lo define el modulo confirmacion
  // La caja unica de reportes, conectada aqui una sola vez: todo modulo la recibe en el contexto
  // por defecto; ninguno se conecta a mano ni remienda sus propios mensajes.
  reporte: {
    crear: (o) => reporte.crearReporte({ client: app.client, token: botToken, ...o }),
    crearSync: (o) => reporte.crearReporteSync({ client: app.client, token: botToken, ...o }),
    avisador: (o = {}) => reporte.crearAvisador({ client: app.client, token: botToken, ...o }),
    hilo: (o) => reporte.abrirHilo({ client: app.client, token: botToken, ...o }),
  },
};

// Los ojitos: cada mencion autorizada recibe de inmediato un mensaje 👀 y la primera respuesta
// del comando edita ese mismo mensaje. La caja envuelve postMessage una sola vez.
const ojos = reporte.crearOjos({ client: app.client, token: botToken });

// Orden: confirmacion primero (los demas la usan).
for (const m of [confirmacion, borrarHilo, actualizar, github, archivos, estado, estadoRegistro, ayuda, reiniciar, detener, saludo, velas, sincronizarRegistros, radiografias, barraMovil, registroIntradia, cicloDiario]) m.registrar(ctx);

app.event('app_mention', async ({ event }) => {
  const texto = (event.text || '').replace(/<@[A-Z0-9]+>/g, ' ').trim();
  try {
    for (const fn of alMencionar) { try { await fn(event); } catch (e) { console.error('Completar mencion:', e.data?.error || e.message); } }
    const c = comandos.find((x) => (typeof x.patron === 'function' ? x.patron(texto, event) : x.patron.test(texto)));
    if (c) {
      // Cualquiera puede pedir cualquier comando (decisión del usuario, 20-nov-2026: los bots
      // tienen sus comandos y ya). Las ordenes que comprometen piden confirmación y el 👍 que
      // cuenta es siempre el de HUGO_USUARIO (lo fija cada módulo con user: ctx.usuario).
      const delegado = !!DELEGADO && event.user === DELEGADO;
      try { event.ojos = await ojos.anunciar(event); } catch (e) { console.error('Ojitos:', e.data?.error || e.message); }
      const idAct = `${Date.now()}-${Math.random()}`;
      activas.set(idAct, { que: c.nombre || 'atender una orden', desde: Date.now() });
      try { await c.fn(event, texto, { delegado }); } finally { activas.delete(idAct); }
    } else if (ctx._defecto) {
      try { event.ojos = await ojos.anunciar(event); } catch (e) { console.error('Ojitos:', e.data?.error || e.message); }
      await ctx._defecto(event, texto);
    }
  } catch (e) {
    console.error('Error en mencion:', e.data?.error || e.message);
  }
});

await app.start();
try { ctx.botUserId = (await app.client.auth.test({ token: botToken })).user_id || ''; } catch (e) { console.error('auth.test:', e.data?.error || e.message); }
console.log('Hugo conectado a Slack');

for (const fn of alIniciar) {
  try { await fn(); } catch (e) { console.error('Aviso de arranque:', e.data?.error || e.message); }
}
