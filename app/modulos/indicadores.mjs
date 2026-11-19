// Indicadores de mercado con histórico propio (decisión del usuario, 19-nov-2026), cada uno en
// registros/<serie>/<AAMM> como hermano de las velas, no mezclado con ellas. Un valor por día
// (0-100). Piso fijo 1-ago-2026, el mismo de los registros de velas. El de bolsa de CNN quedó
// descartado por el usuario (19-nov-2026): su espejo disponible difería del oficial en el día más
// reciente y «nos va a confundir».
// Series vigentes:
// - alternative-fear-greed: Crypto Fear & Greed Index de alternative.me, publicado hacia las
//   00:00 UTC del día y final desde su publicación: no cambia como una vela en curso, así que se
//   guarda el mismo día. La fuente exige atribución visible junto a los datos (el visor la pone
//   al pie del gráfico).
// - feargreedchart-bolsa: Fear & Greed de bolsa EE. UU. de FearGreedChart.com (VIX, momentum del
//   S&P 500, put/call, refugio y crédito). Solo días con sesión bursátil: fines de semana y
//   festivos no tienen lectura y jamás se rellenan (decisión del usuario, 19-nov-2026: huecos
//   visibles, sin inventar datos). La fuente no documenta qué sesión representa cada fecha del
//   histórico; lo observado (19-nov-2026): la entrada fechada con el día en curso no coincide con
//   el valor en vivo del índice (33 fechado frente a 44 en vivo antes de la apertura). Regla de
//   resguardo: un día solo se guarda cuando su fecha ya pasó en Nueva York; el día en curso nunca
//   se guarda. El cripto de esa misma fuente NO se registra: es el de alternative.me con otro
//   rótulo (verificado 19-nov-2026: misma serie, mismo valor).
import fs from 'node:fs';
import path from 'node:path';
import ROTULOS from './indicadores-rotulos.mjs';

// Los rotulos visibles de cada serie tienen UNA sola definicion (decision del usuario,
// 19-nov-2026): indicadores-rotulos.mjs, la misma que importa el visor. Si falta la clave,
// se usa la clave tecnica de la serie.
const rotulo = (serie) => ROTULOS[serie] || serie;

export const ARCHIVO_IND = /^\d{4}$/;
export const DIA = 86400000;
// Piso permanente y universal (decisión del usuario, 18-nov-2026): nada anterior a ago-2026.
export const PISO_DIA = Date.UTC(2026, 7, 1);

const cierreUTC = (t) => Math.floor(t / DIA) * DIA;
export const aammDe = (ts) => new Date(ts).toISOString().slice(2, 7).replace('-', '');

// Fecha civil de un instante en la bolsa de Nueva York (para saber si una sesión ya cerró).
const fechaNY = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t));

export const SERIES = [
  {
    serie: 'alternative-fear-greed',
    url: (ultimo, hoy00) => `https://api.alternative.me/fng/?limit=${Math.min(4000, Math.round((hoy00 - ultimo) / DIA) + 1)}`,
    // alternative.me publica el valor del día a las 00:00 UTC, final desde entonces.
    corte: (ahora) => cierreUTC(ahora),
    extraer: (cuerpo) => {
      if (!cuerpo || !Array.isArray(cuerpo.data)) throw new Error('La respuesta de alternative.me no trae la lista esperada.');
      return cuerpo.data.map((d) => [Number(d.timestamp) * 1000, Number(d.value)]);
    },
    nombreFuente: 'alternative.me',
  },
  {
    serie: 'feargreedchart-bolsa',
    url: () => 'https://feargreedchart.com/api/?action=history',
    // Resguardo mientras la fuente no documenta qué sesión representa cada fecha: solo se
    // guardan fechas ya pasadas en Nueva York; la del día en curso queda fuera siempre.
    corte: (ahora) => Date.parse(fechaNY(ahora)) - DIA,
    extraer: (cuerpo) => {
      if (!Array.isArray(cuerpo)) throw new Error('La respuesta de FearGreedChart no trae la lista esperada.');
      return cuerpo.map((d) => {
        const [a, m, dd] = String(d.date || '').split('-').map(Number);
        return [Date.UTC(a, m - 1, dd), Number(d.score)];
      });
    },
    nombreFuente: 'FearGreedChart',
  },
];
export const SERIE = SERIES[0].serie; // la primera, por compatibilidad con lo ya publicado
export const PREFIJOS_IND = SERIES.map((s) => `registros/${s.serie}`);
export const RUTA_IND = new RegExp(`^registros/(${SERIES.map((s) => s.serie).join('|')})/\\d{4}$`);
export const prefijoInd = (serie) => `registros/${serie}`;

// Archivo mensual: JSON [[tsDiaMs, valor0a100], ...], días UTC alineados, orden ascendente.
export function leerIndicador(buf) {
  let datos;
  try { datos = JSON.parse(buf); } catch { throw new Error('Archivo de indicador ilegible; no es JSON.'); }
  if (!Array.isArray(datos)) throw new Error('Archivo de indicador con forma inesperada; no es una lista.');
  let previo = -1;
  for (const p of datos) {
    if (!Array.isArray(p) || p.length !== 2) throw new Error('Punto de indicador con forma inesperada.');
    const [ts, v] = p;
    if (!Number.isInteger(ts) || ts % DIA !== 0) throw new Error('Fecha de indicador no alineada al día UTC.');
    if (ts < PISO_DIA) throw new Error('Punto de indicador anterior al piso de ago-2026.');
    if (!Number.isInteger(v) || v < 0 || v > 100) throw new Error('Valor de indicador fuera de 0-100.');
    if (ts <= previo) throw new Error('Días de indicador repetidos o desordenados.');
    previo = ts;
  }
  return datos;
}

export function escribirIndicador(destino, puntos) {
  leerIndicador(JSON.stringify(puntos)); // nunca escribo algo que no pasaría mi propia lectura
  fs.mkdirSync(path.dirname(destino), { recursive: true, mode: 0o700 });
  const tmp = destino + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(puntos) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, destino);
}

// Misma convención que las velas: 'ampliar' = b extiende a con los días compartidos idénticos;
// 'conservar' = a tiene más que b; conflicto = un día compartido con distinto valor (se avisa, no se pisa).
export function relacionIndicador(a, b) {
  const mapaB = new Map(b);
  for (const [ts, v] of a) {
    if (mapaB.has(ts) && mapaB.get(ts) !== v) throw new Error('conflicto: un día compartido tiene distinto valor');
  }
  const ultimoA = a.length ? a[a.length - 1][0] : -1;
  const ultimoB = b.length ? b[b.length - 1][0] : -1;
  if (a.length === b.length && ultimoA === ultimoB) return 'iguales';
  if (ultimoB > ultimoA) return 'ampliar';
  return 'conservar';
}

// Una pasada de actualización de UNA serie: pide a la fuente los días que faltan hasta su corte
// y los anexa al archivo del mes que toca (mes nuevo = archivo nuevo). Idempotente: sin días
// nuevos no escribe nada. La sincronización sube después los archivos tocados, como con las velas.
export async function actualizarIndicador({ dir, def = SERIES[0], fetchImpl = fetch, ahora = Date.now } = {}) {
  if (!dir) throw new Error('Falta la carpeta local del indicador.');
  const hoy00 = cierreUTC(ahora());
  const corte = Math.min(hoy00, def.corte(ahora()));
  let ultimo = PISO_DIA - DIA;
  try {
    for (const n of fs.readdirSync(dir)) {
      if (!ARCHIVO_IND.test(n)) continue;
      const puntos = leerIndicador(fs.readFileSync(path.join(dir, n)));
      if (puntos.length && puntos[puntos.length - 1][0] > ultimo) ultimo = puntos[puntos.length - 1][0];
    }
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (ultimo >= corte) return { nuevos: 0, dias: [], archivos: [] };
  let res;
  try { res = await fetchImpl(def.url(ultimo, hoy00)); }
  catch (e) { throw new Error(`no pude hablar con ${def.nombreFuente} (${e.message})`); }
  if (!res.ok) throw new Error(`${def.nombreFuente} respondió HTTP ${res.status}; no guardo nada.`);
  let cuerpo;
  try { cuerpo = await res.json(); } catch { throw new Error(`${def.nombreFuente} no devolvió JSON; no guardo nada.`); }
  const entrantes = new Map();
  for (const [ts, v] of def.extraer(cuerpo)) {
    if (!Number.isInteger(ts) || ts % DIA !== 0) continue;
    if (!Number.isInteger(v) || v < 0 || v > 100) continue;
    if (ts < PISO_DIA || ts > corte || ts <= ultimo) continue;
    entrantes.set(ts, v);
  }
  const nuevos = [...entrantes.entries()].sort((x, y) => x[0] - y[0]);
  if (!nuevos.length) return { nuevos: 0, dias: [], archivos: [] };
  const archivos = [];
  let mes = aammDe(nuevos[0][0]);
  let tramo = [];
  const volcar = () => {
    if (!tramo.length) return;
    const destino = path.join(dir, mes);
    let previos = [];
    try { previos = leerIndicador(fs.readFileSync(path.join(dir, mes))); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const ya = new Set(previos.map((p) => p[0]));
    const suma = previos.concat(tramo.filter((p) => !ya.has(p[0]))).sort((x, y) => x[0] - y[0]);
    if (suma.length !== previos.length) { escribirIndicador(destino, suma); archivos.push(mes); }
    tramo = [];
  };
  for (const p of nuevos) {
    const m = aammDe(p[0]);
    if (m !== mes) { volcar(); mes = m; }
    tramo.push(p);
  }
  volcar();
  return {
    nuevos: nuevos.length,
    dias: nuevos.map(([ts, v]) => ({ fecha: new Date(ts).toISOString().slice(0, 10), valor: v })),
    archivos,
  };
}

// Todas las series en orden. Un fallo de una fuente no tapa a las demás: cada una informa su
// resultado o su error, y la pasada de sincronización decide cómo contarlo.
export async function actualizarIndicadores({ dirRaiz, fetchImpl = fetch, ahora = Date.now } = {}) {
  const series = [];
  for (const def of SERIES) {
    try {
      const r = await actualizarIndicador({ dir: path.join(dirRaiz, def.serie), def, fetchImpl, ahora });
      series.push({ etiqueta: rotulo(def.serie), ...r });
    } catch (e) {
      series.push({ etiqueta: rotulo(def.serie), error: e.message });
    }
  }
  return { series };
}
