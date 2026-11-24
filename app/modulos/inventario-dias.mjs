// Inventario de días registrados por activo: por mercado, contador acumulado de días UTC cerrados
// con vela válida guardada desde el 1-ago-2026. Mantenimiento incremental: con el archivo ya
// publicado, cada pasada agrega solo las columnas de los días cerrados que faltan, leyendo de
// cada activo únicamente los archivos mensuales de esos días. Cada columna nueva se calcula de la
// vela guardada de esa fecha (acumulado previo + 1 si existe, + 0 si no), nunca por un +1 ciego:
// repetir la pasada no cambia nada. Se reconstruye entero solo sin archivo previo o si es
// inválido (carga inicial); un activo nuevo en el registro se rellena solo él, desde sus velas.
// Solo días cerrados. Archivo vivo como el catálogo: se reescribe cuando cambia.
import fs from 'node:fs';
import path from 'node:path';
import { CLASES } from './activos.mjs';
import { universoLocal } from './catalogo.mjs';
import { vigentes } from './vigencia.mjs';
import { DIA, cierreUTC } from './registro-serie.mjs';

export const DESDE = Date.UTC(2026, 7, 1);
const MAX_BYTES = 2 * 1024 * 1024;
const RUTA = /^registros\/inventario\/(?:stock|cripto)$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVO_OK = /^[\p{L}\p{N}]{1,15}$/u;
export const esRutaInventario = (rel) => RUTA.test(rel);
export const dirInventario = (dirRaiz) => path.join(dirRaiz, 'inventario');
const dia = (ms) => new Date(ms).toISOString().slice(0, 10);

// Forma: { mercado, desde, hasta, activos: { CODIGO: [acumulado al día desde+0, desde+1, ...] } }
export function validarInventario(buf) {
  let o;
  try { o = JSON.parse(Buffer.isBuffer(buf) ? buf.toString('utf8') : buf); } catch { return 0; }
  if (!o || !CLASES.includes(o.mercado) || !FECHA.test(o.desde || '') || !FECHA.test(o.hasta || '') || !o.activos || typeof o.activos !== 'object') return 0;
  const n = Math.round((Date.parse(o.hasta) - Date.parse(o.desde)) / DIA) + 1;
  if (!(n >= 1)) return 0;
  const cods = Object.keys(o.activos);
  for (const c of cods) {
    const a = o.activos[c];
    if (!ACTIVO_OK.test(c) || !Array.isArray(a) || a.length !== n) return 0;
    for (let i = 0; i < n; i++) if (!Number.isInteger(a[i]) || a[i] < 0 || a[i] > i + 1 || (i && (a[i] < a[i - 1] || a[i] > a[i - 1] + 1))) return 0;
  }
  return cods.length;
}

// Días (ms UTC) con vela válida guardada de un activo, desde DESDE hasta el último cierre.
export function diasGuardados(dirRaiz, clase, cod, meses, hasta, desde = DESDE) {
  const dias = new Set();
  const aamm = (t) => { const d = new Date(t); return String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, '0'); };
  for (const m of meses) {
    if (m < aamm(desde)) continue; // solo los meses que contienen días por agregar
    let datos;
    try { datos = JSON.parse(fs.readFileSync(path.join(dirRaiz, 'velas-24h', clase, cod, `${m}_${cod}`), 'utf8')); } catch { continue; }
    if (!Array.isArray(datos)) continue;
    for (const v of datos) {
      if (!Array.isArray(v) || !Number.isSafeInteger(v[0]) || v[0] % DIA !== 0 || v[0] < desde || v[0] > hasta) continue;
      if (!(Number(v[1]) > 0 && Number(v[4]) > 0)) continue;
      dias.add(v[0]);
    }
  }
  return dias;
}

export function generarInventario(dirRaiz, clase, uni, ahora = Date.now(), previo = null) {
  const hasta = cierreUTC(ahora) - DIA; // último día UTC cerrado
  if (hasta < DESDE) return null;
  const n = (hasta - DESDE) / DIA + 1;
  const ok = previo && validarInventario(JSON.stringify(previo)) && previo.mercado === clase && previo.desde === dia(DESDE) && Date.parse(previo.hasta) <= hasta;
  const nPrev = ok ? (Date.parse(previo.hasta) - DESDE) / DIA + 1 : 0;
  const codigos = new Set([...uni[clase].keys(), ...(ok ? Object.keys(previo.activos) : [])]);
  const activos = {};
  for (const cod of [...codigos].sort()) {
    const base = ok && previo.activos[cod] ? previo.activos[cod] : null;
    const col = base ? base.slice() : [];
    const ini = col.length; // días ya contados: solo se agregan los que faltan (todos, si es carga inicial o activo nuevo)
    if (ini < n) {
      const dias = diasGuardados(dirRaiz, clase, cod, uni[clase].get(cod) || [], hasta, DESDE + ini * DIA);
      let c = ini ? col[ini - 1] : 0;
      for (let i = ini; i < n; i++) { if (dias.has(DESDE + i * DIA)) c++; col.push(c); }
    }
    activos[cod] = col;
  }
  return { mercado: clase, desde: dia(DESDE), hasta: dia(hasta), activos };
}

export function escribirInventario(dirRaiz, inv) {
  const dir = dirInventario(dirRaiz);
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, inv.mercado);
  const texto = `{"mercado":${JSON.stringify(inv.mercado)},"desde":"${inv.desde}","hasta":"${inv.hasta}","activos":{\n`
    + Object.keys(inv.activos).map((c) => `${JSON.stringify(c)}:${JSON.stringify(inv.activos[c])}`).join(',\n') + '\n}}\n';
  if (Buffer.byteLength(texto) > MAX_BYTES) throw Error('El inventario generado es mayor de lo esperado; revision manual.');
  try { if (fs.readFileSync(destino, 'utf8') === texto) return 'igual'; } catch {}
  const tmp = `${destino}.tmp`;
  fs.writeFileSync(tmp, texto);
  fs.renameSync(tmp, destino);
  return 'escrito';
}

export async function actualizarInventarios({ dirRaiz, ahora = Date.now() } = {}) {
  const lineas = [];
  const uni = universoLocal(dirRaiz);
  for (const clase of CLASES) {
    try {
      // La vigencia sale del catálogo (lanza si no sirve): el activo vigente sin velas aún no entra.
      const vig = vigentes(path.join(dirRaiz, 'velas-24h'), clase);
      for (const cod of [...uni[clase].keys()]) if (!vig.has(cod)) uni[clase].delete(cod);
      let previo = null;
      try { previo = JSON.parse(fs.readFileSync(path.join(dirInventario(dirRaiz), clase), 'utf8')); } catch {}
      const inv = generarInventario(dirRaiz, clase, uni, ahora, previo);
      if (!inv || !Object.keys(inv.activos).length) { lineas.push({ mercado: clase, estado: 'igual', periodo: 'sin activos o sin días cerrados' }); continue; } // nada que inventariar: no se escribe un archivo vacío
      if (!validarInventario(JSON.stringify(inv))) throw Error('inventario generado inválido');
      const estado = escribirInventario(dirRaiz, inv);
      lineas.push({ mercado: clase, estado, periodo: `${Object.keys(inv.activos).length} activos hasta ${inv.hasta}` });
    } catch (e) { lineas.push({ mercado: clase, estado: 'error', error: e.message }); }
  }
  return { lineas };
}
