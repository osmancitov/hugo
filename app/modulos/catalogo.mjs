// Catalogo publicado por mercado (decisión del usuario, 20-nov-2026): la sincronización lo
// genera en cada pasada desde el registro local de velas. El nombre viene de la capa curada
// (ACTIVOS_INFO y el archivo de curados activos-curados.json) o del cotejo de Binance (el campo `an` de
// la lista de productos, ya limpio); el tipo es solo el curado. Un alta nueva aparece por su
// código y su nombre aunque no tenga información curada, y el reporte pide completarla; nunca
// se inventan tipos ni datos. Si la lista de productos falla, el catálogo se genera igual con
// lo curado (el alta no se oculta) y el reporte lo dice. A diferencia de los pre-cálculos por
// día, el catálogo es un archivo vivo: se reescribe cuando cambia y la copia local gana,
// porque la fuente es el propio registro.
import fs from 'node:fs';
import path from 'node:path';
import { CLASES, EXCLUIDOS } from './activos.mjs';
import { ACTIVOS_INFO } from './activos-info.mjs';
import { listarUniverso } from './universo-binance.mjs';

const PISO_AAMM = '2608'; // el mismo piso fijo del registro: lo anterior a ago-2026 no participa
const MAX_BYTES = 1024 * 1024; // el catálogo pesa KB; algo mayor es un error a revisar a mano
const ARCHIVO_OK = /^\d{4}_[\p{L}\p{N}]{1,15}$/u;
const ACTIVO_OK = /^[\p{L}\p{N}]{1,15}$/u;
const MES_OK = /^\d{4}$/;
const RUTA_CATALOGO = /^registros\/catalogo\/(?:stock|cripto)$/;

export const esRutaCatalogo = (rel) => RUTA_CATALOGO.test(rel);
export const dirCatalogo = (dirRaiz) => path.join(dirRaiz, 'catalogo');

// Validación de un catálogo leído de disco (lo usa la sincronización al subir o bajar): la misma
// forma que escribirCatalogo exige. Devuelve el número de activos.
export function validarCatalogo(buf) {
  let j;
  try { j = JSON.parse(String(buf)); } catch { throw Error('Catálogo ilegible.'); }
  if (!j || typeof j !== 'object' || Array.isArray(j) || !CLASES.includes(j.mercado) || typeof j.generado !== 'string' || !Array.isArray(j.activos)) {
    throw Error('Catálogo con forma inesperada.');
  }
  for (const e of j.activos) {
    if (!e || !ACTIVO_OK.test(e.codigo || '') || typeof e.nombre !== 'string' || !e.nombre
      || !Array.isArray(e.meses) || !e.meses.length || e.meses.some((m) => !MES_OK.test(m))) {
      throw Error('Entrada de catálogo inválida.');
    }
  }
  if (j.retirados !== undefined) {
    const ret = validarRetirados(j.retirados);
    const vigentes = new Set(j.activos.map((e) => e.codigo));
    if (ret.some((e) => vigentes.has(e.codigo))) throw Error('Un activo no puede estar a la vez en activos y en retirados.');
  }
  return j.activos.length;
}

// Sector `retirados` (idea del usuario, 24-nov-2026): referencia histórica de los activos dados de
// baja, junto a `activos` y fuera de todo cálculo y vista (los consumidores leen solo `.activos`).
// Cada entrada: código, nombre y fecha de retirada (AAAA-MM-DD). Solo se llena a mano, editando el
// catálogo; la pasada lo conserva tal cual y mantiene a esos códigos fuera de `activos`.
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;
export function validarRetirados(lista) {
  if (!Array.isArray(lista)) throw Error('Retirados con forma inesperada.');
  const vistos = new Set();
  for (const e of lista) {
    if (!e || !ACTIVO_OK.test(e.codigo || '') || typeof e.nombre !== 'string' || !e.nombre
      || !FECHA_OK.test(e.retirado || '') || Number.isNaN(Date.parse(e.retirado)) || vistos.has(e.codigo)) {
      throw Error('Entrada de retirados inválida.');
    }
    vistos.add(e.codigo);
  }
  return lista;
}

// Retirados del catálogo ya publicado de un mercado. Sin archivo previo: ninguno. Con archivo
// ilegible o con retirados inválidos: LANZA, para no reincorporar bajas en silencio.
export function leerRetirados(dirRaiz, clase) {
  const ruta = path.join(dirCatalogo(dirRaiz), clase);
  let texto;
  try { texto = fs.readFileSync(ruta, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return []; throw Error(`catálogo previo de ${clase} ilegible; no regenero para no reincorporar retirados`); }
  let j;
  try { j = JSON.parse(texto); } catch { throw Error(`catálogo previo de ${clase} ilegible; no regenero para no reincorporar retirados`); }
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw Error(`catálogo previo de ${clase} con forma inesperada; no regenero para no reincorporar retirados`);
  if (j.retirados === undefined) return [];
  try { return validarRetirados(j.retirados); } catch (e) { throw Error(`retirados del catálogo previo de ${clase} inválidos (${e.message}); no regenero`); }
}

// Capa curada: activos-curados.json (junto a este módulo) es el único sitio donde se anotan a mano
// los datos de cada activo que el cotejo no da: nombre, tipo, capitalización, ficha EDGAR (Gobierno),
// web oficial y si lleva fichas de Stock Analysis y TipRanks. La pasada los copia al catálogo
// publicado y el visor lee solo el catálogo.
export const RUTA_CURADOS = new URL('./activos-curados.json', import.meta.url);
const CAMPOS_CURADOS = ['cap', 'cap_sub', 'cap_fecha', 'edgar', 'edgar_titulo', 'web', 'ficha', 'lectura', 'traduccion'];
export function capaCuradaDesdeJson(texto) {
  const j = JSON.parse(texto || '');
  const capa = { stock: new Map(), cripto: new Map() };
  for (const clase of CLASES) {
    if (!Array.isArray(j[clase])) throw Error(`Los curados no traen la lista ${clase}.`);
    for (const e of j[clase]) if (e && typeof e.codigo === 'string') capa[clase].set(e.codigo, e);
  }
  return capa;
}

export function leerCapaCurada(ruta = RUTA_CURADOS) {
  return capaCuradaDesdeJson(fs.readFileSync(ruta, 'utf8'));
}

// Universo local: códigos y meses con velas registradas, por mercado. Misma criba que la
// sincronización: forma del nombre, piso fijo y excluidos.
export function universoLocal(dirRaiz) {
  const uni = { stock: new Map(), cripto: new Map() };
  for (const clase of CLASES) {
    let activos = [];
    try { activos = fs.readdirSync(path.join(dirRaiz, 'velas-24h', clase)); } catch { continue; }
    for (const a of activos) {
      if (!ACTIVO_OK.test(a) || (clase === 'cripto' && EXCLUIDOS.has(a))) continue;
      let nombres = [];
      try { nombres = fs.readdirSync(path.join(dirRaiz, 'velas-24h', clase, a)); } catch { continue; }
      const meses = nombres
        .filter((n) => ARCHIVO_OK.test(n) && n.slice(0, 4) >= PISO_AAMM && n === `${n.slice(0, 4)}_${a}`)
        .map((n) => n.slice(0, 4))
        .sort();
      if (meses.length) uni[clase].set(a, meses);
    }
  }
  return uni;
}

// Entradas del catálogo de un mercado, ordenadas por código. Nombre: ACTIVOS_INFO, luego la
// capa curada del visor, luego el cotejo, y como último recurso el propio código. Tipo: solo
// el curado (ACTIVOS_INFO o la capa), nunca derivado de etiquetas ni del nombre.
export function generarCatalogo(clase, uni, nombres = {}, capa = { stock: new Map(), cripto: new Map() }) {
  const activos = [];
  for (const [codigo, meses] of [...uni[clase].entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const info = clase === 'stock' ? ACTIVOS_INFO[codigo] : undefined; // ACTIVOS_INFO es de acciones: un cripto con el mismo código (BB, QNT, STX) no hereda su nombre ni su tipo
    const curado = capa[clase].get(codigo) || {};
    activos.push({
      codigo,
      nombre: (info && info[0]) || curado.nombre || nombres[codigo] || codigo,
      ...((info && info[1]) || curado.tipo ? { tipo: (info && info[1]) || curado.tipo } : {}),
      ...Object.fromEntries(CAMPOS_CURADOS.filter((k) => curado[k] !== undefined).map((k) => [k, curado[k]])),
      meses,
    });
  }
  return activos;
}

// Información curada pendiente, en ambos mercados: falta real es no estar en ninguna capa
// curada (ACTIVOS_INFO o la capa del visor); en stock también cuenta no tener tipo efectivo.
// Un código presente en la capa aunque su nombre sea el propio código (0G, BNB, XRP) ya fue
// revisado: no es faltante.
export function faltantes(clase, activos, capa) {
  return activos
    .filter((e) => ((clase !== 'stock' || !ACTIVOS_INFO[e.codigo]) && !capa[clase].has(e.codigo)) || (clase === 'stock' && !e.tipo))
    .map((e) => e.codigo);
}

// Escribe registros/catalogo/<mercado> solo cuando cambian los activos (tmp + renombrar, como
// el registro). La fecha `generado` marca la última vez que cambió el contenido, no cada pasada.
export function escribirCatalogo(dirRaiz, clase, activos, ahora = Date.now(), retirados = []) {
  if (!CLASES.includes(clase)) throw Error('Mercado de catalogo desconocido.');
  for (const e of activos) {
    if (!e || !ACTIVO_OK.test(e.codigo || '') || typeof e.nombre !== 'string' || !e.nombre
      || !Array.isArray(e.meses) || !e.meses.length || e.meses.some((m) => !MES_OK.test(m))) {
      throw Error('Entrada de catalogo invalida; revision manual.');
    }
  }
  validarRetirados(retirados);
  if (retirados.some((r) => activos.some((e) => e.codigo === r.codigo))) throw Error('Un activo no puede estar a la vez en activos y en retirados; revision manual.');
  const dir = dirCatalogo(dirRaiz);
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, clase);
  try {
    const prev = JSON.parse(fs.readFileSync(destino, 'utf8'));
    if (prev && JSON.stringify(prev.activos) === JSON.stringify(activos) && JSON.stringify(prev.retirados || []) === JSON.stringify(retirados) && prev.generado) return 'igual';
  } catch {}
  const cuerpo = { mercado: clase, generado: new Date(ahora).toISOString().slice(0, 10), activos, ...(retirados.length ? { retirados } : {}) };
  const texto = JSON.stringify(cuerpo, null, 1) + '\n';
  if (Buffer.byteLength(texto) > MAX_BYTES) throw Error('El catalogo generado es mayor de lo esperado; revision manual.');
  const tmp = `${destino}.tmp`;
  fs.writeFileSync(tmp, texto);
  fs.renameSync(tmp, destino);
  return 'escrito';
}

// Paso de la pasada: genera ambos catálogos. Los nombres salen de la capa curada y del mismo
// cotejo del universo; si la lista de productos falla, se genera igual con lo curado (un alta
// no se oculta: aparece por su código) y la línea lo anota. Si la capa curada no se puede leer,
// se genera igual y la línea avisa que el aviso de faltantes quedó limitado.
export async function actualizarCatalogos({ dirRaiz, ahora = Date.now(), rutaCurados = RUTA_CURADOS, listarUniversoImpl = listarUniverso } = {}) {
  const lineas = [];
  const uni = universoLocal(dirRaiz);
  let capa = { stock: new Map(), cripto: new Map() }, avisoCapa = '';
  if (rutaCurados) {
    try { capa = leerCapaCurada(rutaCurados); }
    catch (e) { avisoCapa = `capa curada sin leer (${e.message}); faltantes solo por nombre` ; }
  }
  let nombres = { stock: {}, cripto: {} }, avisoApi = '';
  try {
    const r = await listarUniversoImpl();
    if (r && r.nombres) nombres = r.nombres;
  } catch (e) {
    avisoApi = `lista de productos sin consultar (${e.message}); nombres solo curados`;
  }
  for (const clase of CLASES) {
    // Retirados del catálogo previo: se leen antes de generar; si no sirven, este mercado no se
    // regenera (error visible en la línea) y el catálogo publicado queda como estaba.
    let retirados;
    try { retirados = leerRetirados(dirRaiz, clase); }
    catch (e) { lineas.push({ calculo: 'catalogo', mercado: clase, estado: 'error', error: e.message, sinInfo: [] }); continue; }
    const fuera = new Set(retirados.map((r) => r.codigo));
    const uniVig = { ...uni, [clase]: new Map([...uni[clase]].filter(([c]) => !fuera.has(c))) };
    const activos = generarCatalogo(clase, uniVig, nombres[clase], capa);
    const estado = escribirCatalogo(dirRaiz, clase, activos, ahora, retirados);
    // Sin la capa curada leída no se puede distinguir lo revisado de lo faltante en cripto:
    // se avisa solo lo que no tiene nombre real de ninguna fuente.
    const sinInfo = avisoCapa
      ? activos.filter((e) => e.nombre === e.codigo || (clase === 'stock' && !e.tipo)).map((e) => e.codigo)
      : faltantes(clase, activos, capa);
    const avisos = [avisoApi, avisoCapa].filter(Boolean).join('; ');
    lineas.push({ calculo: 'catalogo', mercado: clase, periodo: `${activos.length} activos${retirados.length ? `, ${retirados.length} retirados` : ''}`, estado, sinInfo, ...(avisos ? { aviso: avisos } : {}) });
  }
  return { lineas };
}
