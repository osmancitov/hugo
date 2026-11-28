// Historial diario del Monitor (pedido del usuario, 28-nov-2026): elegir un día cerrado y ver cómo quedó.
// Significado fijado con el usuario: la jornada D muestra la lista VIP núcleo (54 campañas, nucleo.mjs) calculada
// AL CIERRE DE D-1 y el rendimiento de la vela diaria de D (apertura 00:00 UTC, cierre 23:59:59 UTC). La lista
// nunca usa velas de D ni posteriores: aparicionesActivo solo recorre hacia atrás desde D-1.
// Primera jornada: 2026-09-30 (con el cierre del 29-sep hay 60 velas desde el piso del 1-ago).
// Procedencias separadas, nunca mezcladas:
//   lista.origen = 'guardado'     la lista es el archivo registros/nucleo/<mercado>/<cierre D-1>_nucleo publicado;
//   lista.origen = 'reconstruido' la lista se recalculó hoy con la regla actual (fijada el 27-nov-2026) y las velas guardadas.
//   El rendimiento sale siempre de las velas diarias guardadas (no hay otra fuente para todos los días).
// Universo: los activos del catálogo con velas guardadas hasta D-1 (no el universo completo de Binance, que no
// consta). Un activo sin vela en D queda contado en `sin_vela`. No se reescribe ningún día ya guardado.
import fs from 'node:fs';
import path from 'node:path';
import { aparicionesActivo, validarNucleo, nombreNucleo, dirNucleo, MINIMO, DIA } from './nucleo.mjs';
import { vigentes } from './vigencia.mjs';

export const PRIMERA_JORNADA = '2026-09-30';
export const dirHistorial = (raiz, mercado) => path.join(raiz, 'historial-monitor', mercado);
export const diaMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
export const isoDia = (ms) => new Date(ms).toISOString().slice(0, 10);
export const mesDe = (iso) => iso.slice(2, 4) + iso.slice(5, 7);

// Retornos diarios (variación %) y velas por activo, solo hasta `tope` (inicio del último día a leer).
function leerVelas(raiz, mercado, a, tope) {
  const rets = new Map(), velas = new Map();
  for (const mes of a.meses) {
    const p = path.join(raiz, 'velas-24h', mercado, a.codigo, `${mes}_${a.codigo}`);
    if (!fs.existsSync(p)) continue;
    for (const v of JSON.parse(fs.readFileSync(p, 'utf8'))) {
      if (v[0] > tope) continue;
      const o = Number(v[1]), c = Number(v[4]), h = Number(v[2]), l = Number(v[3]);
      if (o > 0 && c > 0) { rets.set(v[0], (c / o - 1) * 100); velas.set(v[0], [o, c, h, l]); }
    }
  }
  return { rets, velas };
}

const redondo = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;

// Calcula las jornadas [desde, hasta] (ISO) de un mercado. `omitir` = días ya guardados (no se recalculan).
export function calcularJornadas({ raiz, mercado, desde, hasta, omitir = new Set() }) {
  const cat = JSON.parse(fs.readFileSync(path.join(raiz, 'catalogo', mercado), 'utf8'));
  const vig = vigentes(path.join(raiz, 'velas-24h'), mercado);
  const topeLectura = diaMs(hasta);
  const datos = [];
  for (const a of cat.activos) {
    if (!vig.has(a.codigo)) continue;
    datos.push({ codigo: a.codigo, ...leerVelas(raiz, mercado, a, topeLectura) });
  }
  const dias = {};
  for (let d = diaMs(desde); d <= diaMs(hasta); d += DIA) {
    const iso = isoDia(d);
    if (omitir.has(iso)) continue;
    const cierre = d - DIA, cierreIso = isoDia(cierre);
    let lista, origen = 'reconstruido';
    const f = path.join(dirNucleo(raiz, mercado), nombreNucleo(cierre));
    let guardado = null;
    if (fs.existsSync(f)) guardado = validarNucleo(JSON.parse(fs.readFileSync(f, 'utf8')), mercado);
    // Lista recalculada SOLO con velas hasta el cierre D-1 (se descartan las de D en adelante).
    const calc = [];
    for (const x of datos) {
      const rets = new Map([...x.rets].filter(([t]) => t <= cierre));
      const r = aparicionesActivo(rets, cierre);
      if (r.apariciones >= MINIMO) calc.push({ codigo: x.codigo, apariciones: r.apariciones });
    }
    calc.sort((p, q) => q.apariciones - p.apariciones || (p.codigo < q.codigo ? -1 : p.codigo > q.codigo ? 1 : 0));
    if (guardado) {
      const a = new Set(guardado.nucleo), b = new Set(calc.map((c) => c.codigo));
      if (a.size !== b.size || [...a].some((c) => !b.has(c))) throw Error(`El núcleo guardado de ${mercado} (${cierreIso}) no coincide con el recalculado; no escribo ${iso}.`);
      origen = 'guardado';
    }
    lista = calc;
    const activos = [];
    let suben = 0, bajan = 0, iguales = 0, sinVela = 0, suma = 0;
    for (const l of lista) {
      const x = datos.find((y) => y.codigo === l.codigo);
      const v = x.velas.get(d);
      if (!v) { sinVela++; continue; }
      const variacion = (v[1] / v[0] - 1) * 100;
      if (variacion > 0) suben++; else if (variacion < 0) bajan++; else iguales++;
      suma += variacion;
      // Extremos del día respecto a la MISMA apertura de la variación: mínimo ≤ min(0, variación), máximo ≥ max(0, variación).
      const minimo = v[3] > 0 ? Math.min((v[3] / v[0] - 1) * 100, variacion, 0) : null;
      const maximo = v[2] > 0 ? Math.max((v[2] / v[0] - 1) * 100, variacion, 0) : null;
      activos.push([l.codigo, l.apariciones, v[0], v[1], redondo(variacion), minimo === null ? null : redondo(minimo), maximo === null ? null : redondo(maximo)]);
    }
    const n = activos.length;
    dias[iso] = {
      lista: { cierre: cierreIso, origen, total: lista.length },
      rendimiento: { origen: 'velas diarias guardadas', apertura: `${iso}T00:00:00Z`, cierre: `${iso}T23:59:59Z` },
      resumen: { suben, bajan, iguales, sin_vela: sinVela, media: n ? redondo(suma / n) : null },
      campos: ['codigo', 'apariciones', 'apertura', 'cierre', 'variacion_pct', 'minimo_pct', 'maximo_pct'],
      activos,
    };
  }
  return dias;
}

export function leerMes(raiz, mercado, iso) {
  const f = path.join(dirHistorial(raiz, mercado), mesDe(iso));
  if (!fs.existsSync(f)) return { version: 1, mercado, mes: mesDe(iso), dias: {} };
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (j.version !== 1 || j.mercado !== mercado || typeof j.dias !== 'object') throw Error(`Historial de ${mercado} ${mesDe(iso)} ilegible.`);
  return j;
}

// Agrega las jornadas que faltan entre PRIMERA_JORNADA y `hasta` (ISO, último día cerrado). Devuelve los días nuevos.
export function actualizarHistorial({ raiz, mercado, hasta }) {
  const existentes = new Set();
  for (let d = diaMs(PRIMERA_JORNADA); d <= diaMs(hasta); d += DIA) {
    const iso = isoDia(d);
    const ya = leerMes(raiz, mercado, iso).dias[iso];
    if (ya && ya.campos.includes('maximo_pct')) existentes.add(iso);
  }
  const nuevos = calcularJornadas({ raiz, mercado, desde: PRIMERA_JORNADA, hasta, omitir: existentes });
  // Días guardados antes de añadir máximo/mínimo: se completan SIN cambiar lista, procedencia ni variación (se comprueba).
  for (const [iso, dia] of Object.entries(nuevos)) {
    const ya = leerMes(raiz, mercado, iso).dias[iso];
    if (!ya) continue;
    const a = JSON.stringify(ya.activos.map((x) => x.slice(0, 5))), b = JSON.stringify(dia.activos.map((x) => x.slice(0, 5)));
    if (a !== b || ya.lista.origen !== dia.lista.origen) throw Error(`Completar ${mercado} ${iso} cambiaría lo ya guardado; no escribo.`);
  }
  const porMes = {};
  for (const [iso, dia] of Object.entries(nuevos)) (porMes[mesDe(iso)] ||= {})[iso] = dia;
  fs.mkdirSync(dirHistorial(raiz, mercado), { recursive: true });
  for (const [mes, dias] of Object.entries(porMes)) {
    const j = leerMes(raiz, mercado, `20${mes.slice(0, 2)}-${mes.slice(2)}-01`);
    Object.assign(j.dias, dias);
    j.dias = Object.fromEntries(Object.entries(j.dias).sort(([a], [b]) => (a < b ? -1 : 1)));
    fs.writeFileSync(path.join(dirHistorial(raiz, mercado), mes), JSON.stringify(j) + '\n');
  }
  // índice: qué meses y qué rango hay (lo lee el Monitor para el selector de fecha)
  const meses = [];
  for (let d = diaMs(PRIMERA_JORNADA); d <= diaMs(hasta); d += DIA) { const m = mesDe(isoDia(d)); if (!meses.includes(m)) meses.push(m); }
  const idx = { version: 1, mercado, desde: PRIMERA_JORNADA, hasta, meses };
  const fi = path.join(dirHistorial(raiz, mercado), 'indice');
  const nuevoIdx = JSON.stringify(idx) + '\n';
  if (!fs.existsSync(fi) || fs.readFileSync(fi, 'utf8') !== nuevoIdx) fs.writeFileSync(fi, nuevoIdx);
  return Object.keys(nuevos);
}
