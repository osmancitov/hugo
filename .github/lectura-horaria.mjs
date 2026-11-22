// Lectura horaria de Hugo desde GitHub Actions, pensada para las horas en que la
// Debian está apagada. Reutiliza la toma de barra y el registro intradiario del
// bot, sin Slack. Reglas del dueño:
// - La lectura se toma a la hora en punto UTC (minuto 00) y guarda su instante
//   real de consulta; nunca se fuerza ni se arrastra una hora distinta.
// - La Debian manda cuando está viva: una hora que ella ya publicó nunca se
//   duplica. La corrida empieza unos minutos antes del minuto 00 para absorber
//   la demora de GitHub; si aun así llega tarde, toma la lectura en cuanto
//   puede, con su hora real.
// - La cola se publica recombinada contra origin/main antes de cada intento, con
//   prioridad del remoto por hora (cola-horaria.mjs): nunca se pisa ni se
//   duplica lo que la Debian subió mientras una corrida no lograba publicar.
import fs from 'node:fs';
import path from 'node:path';
import { generarBarra, leerBarra } from '../app/modulos/barra-movil.mjs';
import { fetchConPausa } from '../app/modulos/intradia-fuente.mjs';
import { guardarLectura, siguienteHitoUTC, intervaloIntradia, ultimaLecturaLocal, primeraLecturaDelDia } from '../app/modulos/registro-intradia.mjs';
import { RUTA_INDICE, diaUTC } from '../app/modulos/intradia-datos.mjs';
import { guardarEstado } from '../app/modulos/registro-motor.mjs';
import { RAIZ, COLA, COLA_JSON, salida, dormir, traerRemoto, ultimaRemota, materializarCola } from './cola-horaria.mjs';

const DIR_VELAS = path.join(RAIZ, 'velas-24h');
// La corrida empieza unos minutos antes del minuto 00; si GitHub la retrasa más de
// esta espera, toma la lectura ya, con su hora real, en vez de esperar a la siguiente.
const ESPERA_MAX_MS = Number(process.env.HUGO_HORARIA_ESPERA_MAX_MS || 13 * 60000);
// Tras tomar la foto, margen para que la Debian publique la suya si está viva. Cubre
// su ciclo completo de reintentos de captura (5 intentos separados 1 minuto) más la
// publicación: si al cumplirse el margen el remoto ya tiene lectura de esta hora, la
// nuestra se descarta antes de publicar.
const ESPERA_PUBLICACION_MS = Number(process.env.HUGO_HORARIA_ESPERA_PUBLICACION_MS || 8 * 60000);
const ahora = () => Date.now();

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
  salida('cambios', Object.keys(p).length ? 'si' : 'no');
  process.exit(0);
}

const espera = objetivo - ahora();
if (espera > 0) { console.log(`Esperando al minuto 00 (${Math.ceil(espera / 1000)} s).`); await dormir(espera); }
await traerRemoto();
if ((await ultimaRemota()) >= objetivo) {
  console.log('La Debian publicó la lectura de esta hora mientras esperaba; no tomo otra.');
  const p = await materializarCola();
  salida('cambios', Object.keys(p).length ? 'si' : 'no');
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

// Margen de cortesía: cubre el ciclo de reintentos de la Debian. Si ella estaba
// viva y publica la lectura de esta hora, la suya queda; la mía se retira de la
// cola y del disco, y no se publica.
await dormir(ESPERA_PUBLICACION_MS);
await traerRemoto();
if ((await ultimaRemota()) >= objetivo) {
  guardarEstado(COLA_JSON, { version: 1, archivos: respaldoCola });
  for (const [rel, texto] of Object.entries(respaldoCola)) guardarEstado(path.join(RAIZ, rel.slice('registros/'.length)), JSON.parse(texto));
  console.log('La Debian publicó la lectura de esta hora en el margen; descarto la mía y conservo la cola anterior combinada.');
  salida('cambios', Object.keys(respaldoCola).length ? 'si' : 'no');
  process.exit(0);
}
console.log(`Rutas por publicar: ${reg.rutas.join(', ')}.`);
salida('cambios', 'si');
salida('generada', new Date(r.generada).toISOString());
