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
import * as ayuda from './modulos/ayuda.mjs';
import * as reiniciar from './modulos/reiniciar.mjs';
import * as velas from './modulos/velas.mjs';
import * as sincronizarRegistros from './modulos/sincronizar-registros.mjs';

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
const USUARIO = process.env.HUGO_USUARIO || conf.HUGO_USUARIO || ''; // unica persona que puede dar ordenes (id de Slack)
const DELEGADO = process.env.HUGO_DELEGADO || conf.HUGO_DELEGADO || ''; // id de Slack del asistente: solo puede pedir los comandos marcados delegables; registra y sincroniza son directos, las actualizaciones las confirma USUARIO
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
const activas = new Map();   // trabajo en curso: id -> { que, desde }; lo ven los modulos (estado, reiniciar)
const ctx = {
  app, botToken, canal: CANAL, leerClave, conf, usuario: USUARIO, delegado: DELEGADO,
  botUserId: '',
  desde: Date.now(),
  activas,
  comandos: () => comandos.map((c) => ({ nombre: c.nombre, delegable: c.delegable })),
  comando: (patron, fn, opciones = {}) => comandos.push({ patron, fn, delegable: !!opciones.delegable, nombre: opciones.nombre || '' }),   // patron: regex sobre el texto, o funcion (texto, evento) => bool
  porDefecto: (fn) => { ctx._defecto = fn; },               // si ningun comando coincide
  alIniciar: (fn) => alIniciar.push(fn),
  alMencionar: (fn) => alMencionar.push(fn),               // completa el evento antes de buscar el comando
  confirmar: null,                                          // lo define el modulo confirmacion
};

// Orden: confirmacion primero (los demas la usan).
for (const m of [confirmacion, borrarHilo, actualizar, github, archivos, estado, ayuda, reiniciar, saludo, velas, sincronizarRegistros]) m.registrar(ctx);

app.event('app_mention', async ({ event }) => {
  const texto = (event.text || '').replace(/<@[A-Z0-9]+>/g, ' ').trim();
  try {
    for (const fn of alMencionar) { try { await fn(event); } catch (e) { console.error('Completar mencion:', e.data?.error || e.message); } }
    const c = comandos.find((x) => (typeof x.patron === 'function' ? x.patron(texto, event) : x.patron.test(texto)));
    if (c) {
      // Ordenes (borrar, guardar, servir, actualizar): solo la persona definida en HUGO_USUARIO. Sin definir, nadie.
      // Excepcion explicita: HUGO_DELEGADO (el asistente) puede pedir SOLO los comandos marcados delegables; registra y sincroniza son directos, actualizar conserva el pulgar de HUGO_USUARIO.
      const delegado = !!USUARIO && !!DELEGADO && event.user === DELEGADO && c.delegable;
      if (!USUARIO || (event.user !== USUARIO && !delegado)) { console.error(`Orden ignorada: usuario ${event.user || '?'} no autorizado`); return; }
      const idAct = `${Date.now()}-${Math.random()}`;
      activas.set(idAct, { que: c.nombre || 'atender una orden', desde: Date.now() });
      try { await c.fn(event, texto, { delegado }); } finally { activas.delete(idAct); }
    } else if (ctx._defecto) await ctx._defecto(event, texto);
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
