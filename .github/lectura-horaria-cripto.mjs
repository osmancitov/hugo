// Lectura horaria de cripto desde Actions (25-nov-2026). Paso aparte del de stocks: si falla,
// la lectura de stocks no se entera. Mismo reloj: se toma en el minuto 00 UTC y se guarda el
// instante real. Universo: admitidos de las tres campañas con las categorías ya publicadas.
// Una lectura por intervalo de 15 minutos (ritmo-vip.mjs): si el árbol ya trae una de este intervalo, no se duplica.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generarBarra } from '../app/modulos/barra-movil.mjs';
import { siguienteHitoUTC, intervaloIntradia } from '../app/modulos/registro-intradia.mjs';
import { RITMO_MIN, ESPERA_MAX_MS as ESPERA_RITMO_MS, cubeta } from '../app/modulos/ritmo-vip.mjs';
import { admitidosCripto, estadoDiaCripto, guardarLecturaCripto, simboloCripto, INICIO_CRIPTO } from '../app/modulos/registro-cripto.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'registros');
const ESPERA_MAX_MS = Number(process.env.HUGO_HORARIA_ESPERA_MAX_MS || ESPERA_RITMO_MS);
const salida = (k, v) => console.log(`${k}=${v}`);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function elegirHost() {
  for (const host of ['https://data-api.binance.vision', 'https://api.binance.com']) {
    try { const r = await fetch(`${host}/api/v3/time`, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'hugo' } }); if (r.ok) return host; } catch {}
  }
  throw Error('Ninguna fuente pública de Binance respondió; no tomo la lectura de cripto.');
}
const host = await elegirHost();
const inicioHora = cubeta(Date.now());
const siguiente = siguienteHitoUTC(Date.now(), intervaloIntradia(String(RITMO_MIN)));
const objetivo = siguiente - Date.now() <= ESPERA_MAX_MS ? siguiente : inicioHora;
if (objetivo < INICIO_CRIPTO) { console.log(`Cripto: el registro empieza el ${new Date(INICIO_CRIPTO).toISOString()}; esta hora (${new Date(objetivo).toISOString()}) queda fuera.`); process.exit(0); }
const espera = objetivo - Date.now();
if (espera > 0) { console.log(`Cripto: esperando al minuto 00 (${Math.ceil(espera / 1000)} s).`); await dormir(espera); }
const universo = admitidosCripto(RAIZ);
console.log(`Cripto: ${universo.length} admitidos.`);
const instante = Date.now();
const est = estadoDiaCripto(RAIZ, instante);
if (est.horas.has(cubeta(instante))) { console.log('Cripto: ya hay lectura de este intervalo; no duplico.'); salida('cambios', 'no'); process.exit(0); }
const r = await generarBarra({ dirVelas: path.join(RAIZ, 'velas-24h'), host, universo, simbolo: simboloCripto, sufijo: 'USDT', anteriorTexto: est.anteriorTexto, inicialTexto: est.inicialTexto, ahora: instante });
const reg = guardarLecturaCripto(RAIZ, r.texto);
console.log(`Cripto: lectura ${new Date(r.generada).toISOString()} guardada (${reg.lecturas} del día).`);
salida('cambios', 'si');
