// Lectura horaria de Hugo desde GitHub Actions, pensada para las horas en que la
// Debian está apagada. Reutiliza la toma de barra y el registro intradiario del
// bot, sin Slack. Reglas del dueño:
// - La lectura se toma a la hora en punto UTC (minuto 00) y guarda su instante
//   real de consulta; nunca se fuerza ni se arrastra una hora distinta.
// - La Debian manda cuando está viva: si ella ya publicó la lectura de esa hora,
//   esta corrida no duplica. La corrida empieza unos minutos antes del minuto 00
//   para absorber la demora de GitHub; si aun así llega tarde, toma la lectura
//   en cuanto puede, con su hora real.
// - La cola de corridas anteriores se publica COMBINADA con el remoto (unirDias
//   por instante): nunca se pisa lo que la Debian subió mientras una corrida no
//   lograba publicar.
// La cola y la pausa 429 viajan en la caché de Actions (.estado-intradia), como
// en la Debian viajan en disco.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { generarBarra, leerBarra } from '../app/modulos/barra-movil.mjs';
import { fetchConPausa } from '../app/modulos/intradia-fuente.mjs';
import { guardarLectura, recuperarIntradia, siguienteHitoUTC, intervaloIntradia, ultimaLecturaLocal, primeraLecturaDelDia } from '../app/modulos/registro-intradia.mjs';
import { leerIndice, RUTA_INDICE, diaUTC } from '../app/modulos/intradia-datos.mjs';
import { guardarEstado } from '../app/modulos/registro-motor.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'registros');
const REPO = path.join(RAIZ, '..');
const DIR_VELAS = path.join(RAIZ, 'velas-24h');
const COLA = path.join(RAIZ, '..', '.estado-intradia');
const COLA_JSON = path.join(COLA, 'pendientes.json');
// La corrida empieza unos minutos antes del minuto 00; si GitHub la retrasa más de
// esta espera, toma la lectura ya, con su hora real, en vez de esperar a la siguiente.
const ESPERA_MAX_MS = Number(process.env.HUGO_HORARIA_ESPERA_MAX_MS || 13 * 60000);
// Tras tomar la foto, margen para que la Debian publique la suya si está viva; si el
// remoto ya tiene lectura de esta hora, la nuestra se descarta antes de publicar.
const ESPERA_PUBLICACION_MS = Number(process.env.HUGO_HORARIA_ESPERA_PUBLICACION_MS || 45000);
const ahora = () => Date.now();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ex = promisify(execFile);
const git = async (args) => (await ex('git', args, { cwd: REPO, timeout: 60000 })).stdout;

const salida = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); console.log(`${k}=${v}`); };

// Fuente pública de solo lectura: data-api.binance.vision es el host documentado
// para datos públicos de mercado; api.binance.com responde 451 (ubicación
// restringida) desde algunas redes. Se comprueba la hora del servicio antes de elegir.
async function elegirHost() {
  for (const host of ['https://data-api.binance.vision', 'https://api.binance.com']) {
    try {
      const r = await fetch(`${host}/api/v3/time`, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'hugo' } });
      if (r.ok) return host;
      console.log(`${host} respondió HTTP ${r.status}; pruebo la siguiente fuente.`);
    } catch (e) { console.log(`${host} no respondió (${e.message}); pruebo la siguiente fuente.`); }
  }
  throw Error('Ninguna fuente pública de Binance respondió; no tomo la lectura.');
}

const traerRemoto = () => git(['fetch', '--quiet', 'origin', 'main']);
async function leerRemoto(rel) {
  try { return await git(['show', `origin/main:${rel}`]); }
  catch { return null; }
}
async function ultimaRemota() {
  const indice = await leerRemoto(RUTA_INDICE);
  if (indice === null) return null;
  try { return Date.parse(leerIndice(indice).ultima); } catch { return null; }
}

// La cola pendiente se materializa COMBINADA con el disco (origin/main recién
// traído): si la Debian subió lecturas mientras una corrida anterior no lograba
// publicar, se conservan ambas. Es la misma fusión del registro en la Debian.
const materializarCola = async () => recuperarIntradia(RAIZ);
const publicables = (archivos) => Object.keys(archivos).length;

fs.mkdirSync(COLA, { recursive: true });
const host = await elegirHost();
console.log(`Fuente de mercado: ${host}`);
const fetchPausa = fetchConPausa(RAIZ, fetch, ahora);

// ¿De qué hora es la lectura de esta corrida? La próxima hora en punto si falta
// poco; si la corrida llegó tarde (GitHub la demoró), la hora que ya empezó.
const inicioHora = Math.floor(ahora() / 3600000) * 3600000;
const siguiente = siguienteHitoUTC(ahora(), intervaloIntradia('60'));
const objetivo = siguiente - ahora() <= ESPERA_MAX_MS ? siguiente : inicioHora;
console.log(`Hora objetivo de la lectura: ${new Date(objetivo).toISOString()}.`);

await traerRemoto();
const ultima = await ultimaRemota();
if (ultima !== null && ultima >= objetivo) {
  console.log(`El remoto ya tiene lectura de esta hora (${new Date(ultima).toISOString()}); no duplico.`);
  const p = await materializarCola();
  salida('cambios', publicables(p) ? 'si' : 'no');
  process.exit(0);
}

const espera = objetivo - ahora();
if (espera > 0) { console.log(`Esperando al minuto 00 (${Math.ceil(espera / 1000)} s).`); await dormir(espera); }
await traerRemoto();
if ((await ultimaRemota()) >= objetivo) {
  console.log('La Debian publicó la lectura de esta hora mientras esperaba; no tomo otra.');
  const p = await materializarCola();
  salida('cambios', publicables(p) ? 'si' : 'no');
  process.exit(0);
}

const respaldoCola = await materializarCola();
// La foto se toma en cuanto llega el minuto 00; el instante guardado es el real.
// Misma toma que el ticker de la Debian: referencia diaria de la primera lectura
// del día y comparación con la lectura previa, sin depender de la ingesta diaria.
const instante = ahora();
const inicialTexto = primeraLecturaDelDia(RAIZ, instante);
const previaLocal = ultimaLecturaLocal(RAIZ);
const anteriorTexto = previaLocal !== null && diaUTC(leerBarra(previaLocal).generada) === diaUTC(instante) ? previaLocal : null;
const r = await generarBarra({ dirVelas: DIR_VELAS, host, fetchImpl: fetchPausa, anteriorTexto, inicialTexto, ahora: instante });
const reg = guardarLectura(RAIZ, r.texto);
console.log(`Lectura ${new Date(r.generada).toISOString()} guardada localmente: ${reg.lecturas} lectura(s) del día.`);

// Margen de cortesía: si la Debian estaba viva y publica la lectura de esta hora,
// la suya queda; la mía se retira de la cola y del disco, y no se publica.
await dormir(ESPERA_PUBLICACION_MS);
await traerRemoto();
if ((await ultimaRemota()) >= objetivo) {
  guardarEstado(COLA_JSON, { version: 1, archivos: respaldoCola });
  for (const [rel, texto] of Object.entries(respaldoCola)) guardarEstado(path.join(RAIZ, rel.slice('registros/'.length)), JSON.parse(texto));
  console.log('La Debian publicó la lectura de esta hora en el margen; descarto la mía y conservo la cola anterior combinada.');
  salida('cambios', publicables(respaldoCola) ? 'si' : 'no');
  process.exit(0);
}
console.log(`Rutas por publicar: ${reg.rutas.join(', ')}.`);
salida('cambios', 'si');
salida('generada', new Date(r.generada).toISOString());
