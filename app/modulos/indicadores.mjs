// Indicadores de mercado con histórico propio (decisión del usuario, 19-nov-2026): el primero es
// el Crypto Fear & Greed Index de alternative.me, guardado en registros/alternative-fear-greed/<AAMM>
// como hermano de las velas, no mezclado con ellas. Un valor por día (0-100), publicado hacia las
// 00:00 UTC del día y final desde su publicación: no cambia como una vela en curso, así que se
// guarda el mismo día. Piso fijo 1-ago-2026, el mismo de los registros de velas. La fuente exige
// atribución visible junto a los datos: el visor la muestra al pie del gráfico. El de bolsa (CNN)
// quedó descartado por el usuario (19-nov-2026): su espejo disponible difería del oficial en el
// día más reciente y «nos va a confundir».
import fs from 'node:fs';
import path from 'node:path';

export const SERIE = 'alternative-fear-greed';
export const PREFIJO_IND = `registros/${SERIE}`;
export const RUTA_IND = new RegExp(`^registros/${SERIE}/\\d{4}$`);
export const ARCHIVO_IND = /^\d{4}$/;
export const DIA = 86400000;
// Piso permanente y universal (decisión del usuario, 18-nov-2026): nada anterior a ago-2026.
export const PISO_DIA = Date.UTC(2026, 7, 1);
export const URL_API = 'https://api.alternative.me/fng/';

export const aammDe = (ts) => new Date(ts).toISOString().slice(2, 7).replace('-', '');
const cierreUTC = (t) => Math.floor(t / DIA) * DIA;

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

// Una pasada de actualización: pide a la fuente los días que faltan hasta el corte de hoy y los
// anexa al archivo del mes que toca (mes nuevo = archivo nuevo). Idempotente: sin días nuevos no
// escribe nada. La sincronización sube después los archivos tocados, como con las velas.
export async function actualizarIndicador({ dir, fetchImpl = fetch, ahora = Date.now } = {}) {
  if (!dir) throw new Error('Falta la carpeta local del indicador.');
  const hoy00 = cierreUTC(ahora());
  let ultimo = PISO_DIA - DIA;
  try {
    for (const n of fs.readdirSync(dir)) {
      if (!ARCHIVO_IND.test(n)) continue;
      const puntos = leerIndicador(fs.readFileSync(path.join(dir, n)));
      if (puntos.length && puntos[puntos.length - 1][0] > ultimo) ultimo = puntos[puntos.length - 1][0];
    }
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (ultimo >= hoy00) return { nuevos: 0, dias: [], archivos: [] };
  const limite = Math.min(4000, Math.round((hoy00 - ultimo) / DIA) + 1);
  let res;
  try { res = await fetchImpl(`${URL_API}?limit=${limite}`); }
  catch (e) { throw new Error(`no pude hablar con alternative.me (${e.message})`); }
  if (!res.ok) throw new Error(`alternative.me respondió HTTP ${res.status}; no guardo nada.`);
  let cuerpo;
  try { cuerpo = await res.json(); } catch { throw new Error('alternative.me no devolvió JSON; no guardo nada.'); }
  if (!cuerpo || !Array.isArray(cuerpo.data)) throw new Error('La respuesta de alternative.me no trae la lista esperada.');
  const entrantes = new Map();
  for (const d of cuerpo.data) {
    const ts = Number(d.timestamp) * 1000, v = Number(d.value);
    if (!Number.isInteger(ts) || ts % DIA !== 0) continue;
    if (!Number.isInteger(v) || v < 0 || v > 100) continue;
    if (ts < PISO_DIA || ts > hoy00 || ts <= ultimo) continue;
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
