// Catalogo publicado por mercado (decisión del usuario, 20-nov-2026): la sincronización lo
// genera en cada pasada desde el registro local de velas. El nombre viene de la capa curada
// (ACTIVOS_INFO y el CATALOGO incrustado del visor) o del cotejo de Binance (el campo `an` de
// la lista de productos, ya limpio); el tipo es solo el curado. Un alta nueva aparece por su
// código y su nombre aunque no tenga información curada, y el reporte pide completarla; nunca
// se inventan tipos ni datos. Si la lista de productos falla, el catálogo se genera igual con
// lo curado (el alta no se oculta) y el reporte lo dice. A diferencia de los pre-cálculos por
// día, el catálogo es un archivo vivo: se reescribe cuando cambia y la copia local gana,
// porque la fuente es el propio registro.
import fs from 'node:fs';
import path from 'node:path';
import { CLASES, EXCLUIDOS } from './activos.mjs';
import { ACTIVOS_INFO } from './radiografias.mjs';
import { listarUniverso } from './universo-binance.mjs';

const PISO_AAMM = '2608'; // el mismo piso fijo del registro: lo anterior a ago-2026 no participa
const MAX_BYTES = 1024 * 1024; // el catálogo pesa KB; algo mayor es un error a revisar a mano
const ARCHIVO_OK = /^\d{4}_[\p{L}\p{N}]{1,15}$/u;
const ACTIVO_OK = /^[\p{L}\p{N}]{1,15}$/u;
const MES_OK = /^\d{4}$/;
const RUTA_CATALOGO = /^registros\/catalogo\/(?:stock|cripto)$/;

export const esRutaCatalogo = (rel) => RUTA_CATALOGO.test(rel);
export const dirCatalogo = (dirRaiz) => path.join(dirRaiz, 'catalogo');

// Capa curada del visor: el CATALOGO incrustado en index.html es un literal JSON en una línea.
// De ella salen nombres y tipos curados que el bot no tiene (sobre todo cripto).
export function capaCuradaDesdeIndex(html) {
  const m = /^const CATALOGO = (\{.*\});?\s*$/m.exec(html || '');
  if (!m) throw Error('No encontré el CATALOGO incrustado en index.html.');
  const j = JSON.parse(m[1]);
  const capa = { stock: new Map(), cripto: new Map() };
  for (const clase of CLASES) {
    if (!Array.isArray(j[clase])) throw Error(`El CATALOGO incrustado no trae la lista ${clase}.`);
    for (const e of j[clase]) if (e && typeof e.codigo === 'string') capa[clase].set(e.codigo, e);
  }
  return capa;
}

export function leerCapaCurada(rutaIndex) {
  return capaCuradaDesdeIndex(fs.readFileSync(rutaIndex, 'utf8'));
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
    const info = ACTIVOS_INFO[codigo];
    const curado = capa[clase].get(codigo) || {};
    activos.push({
      codigo,
      nombre: (info && info[0]) || curado.nombre || nombres[codigo] || codigo,
      ...((info && info[1]) || curado.tipo ? { tipo: (info && info[1]) || curado.tipo } : {}),
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
    .filter((e) => (!ACTIVOS_INFO[e.codigo] && !capa[clase].has(e.codigo)) || (clase === 'stock' && !e.tipo))
    .map((e) => e.codigo);
}

// Escribe registros/catalogo/<mercado> solo cuando cambian los activos (tmp + renombrar, como
// el registro). La fecha `generado` marca la última vez que cambió el contenido, no cada pasada.
export function escribirCatalogo(dirRaiz, clase, activos, ahora = Date.now()) {
  if (!CLASES.includes(clase)) throw Error('Mercado de catalogo desconocido.');
  for (const e of activos) {
    if (!e || !ACTIVO_OK.test(e.codigo || '') || typeof e.nombre !== 'string' || !e.nombre
      || !Array.isArray(e.meses) || !e.meses.length || e.meses.some((m) => !MES_OK.test(m))) {
      throw Error('Entrada de catalogo invalida; revision manual.');
    }
  }
  const dir = dirCatalogo(dirRaiz);
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, clase);
  try {
    const prev = JSON.parse(fs.readFileSync(destino, 'utf8'));
    if (prev && JSON.stringify(prev.activos) === JSON.stringify(activos) && prev.generado) return 'igual';
  } catch {}
  const texto = JSON.stringify({ mercado: clase, generado: new Date(ahora).toISOString().slice(0, 10), activos }, null, 1) + '\n';
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
export async function actualizarCatalogos({ dirRaiz, ahora = Date.now(), rutaIndex, listarUniversoImpl = listarUniverso } = {}) {
  const lineas = [];
  const uni = universoLocal(dirRaiz);
  let capa = { stock: new Map(), cripto: new Map() }, avisoCapa = '';
  if (rutaIndex) {
    try { capa = leerCapaCurada(rutaIndex); }
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
    const activos = generarCatalogo(clase, uni, nombres[clase], capa);
    const estado = escribirCatalogo(dirRaiz, clase, activos, ahora);
    // Sin la capa curada leída no se puede distinguir lo revisado de lo faltante en cripto:
    // se avisa solo lo que no tiene nombre real de ninguna fuente.
    const sinInfo = avisoCapa
      ? activos.filter((e) => e.nombre === e.codigo || (clase === 'stock' && !e.tipo)).map((e) => e.codigo)
      : faltantes(clase, activos, capa);
    const avisos = [avisoApi, avisoCapa].filter(Boolean).join('; ');
    lineas.push({ calculo: 'catalogo', mercado: clase, periodo: `${activos.length} activos`, estado, sinInfo, ...(avisos ? { aviso: avisos } : {}) });
  }
  return { lineas };
}
