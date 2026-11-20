// Catalogo publicado por mercado (decisión del usuario, 20-nov-2026): la sincronización lo
// genera en cada pasada desde el registro local de velas. El nombre viene del cotejo de
// Binance (el campo `an` de la lista de productos, ya limpio) y el tipo de la información
// curada (ACTIVOS_INFO). Un alta nueva aparece por su código y su nombre aunque todavía no
// tenga información curada, y el reporte pide completarla; nunca se inventan tipos ni datos.
// A diferencia de los pre-cálculos por día, el catálogo es un archivo vivo: se reescribe
// cuando cambia y la copia local gana, porque la fuente es el propio registro.
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

// Entradas del catálogo de un mercado, ordenadas por código. Nombre: el curado primero,
// luego el del cotejo, y como último recurso el propio código. Tipo: solo el curado.
export function generarCatalogo(clase, uni, nombres = {}) {
  const activos = [];
  for (const [codigo, meses] of [...uni[clase].entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const info = ACTIVOS_INFO[codigo];
    activos.push({
      codigo,
      nombre: (info && info[0]) || nombres[codigo] || codigo,
      ...(info && info[1] ? { tipo: info[1] } : {}),
      meses,
    });
  }
  return activos;
}

// Escribe registros/catalogo/<mercado> solo cuando cambia (tmp + renombrar, como el registro).
export function escribirCatalogo(dirRaiz, clase, activos) {
  if (!CLASES.includes(clase)) throw Error('Mercado de catalogo desconocido.');
  for (const e of activos) {
    if (!e || !ACTIVO_OK.test(e.codigo || '') || typeof e.nombre !== 'string' || !e.nombre
      || !Array.isArray(e.meses) || !e.meses.length || e.meses.some((m) => !MES_OK.test(m))) {
      throw Error('Entrada de catalogo invalida; revision manual.');
    }
  }
  const texto = JSON.stringify({ mercado: clase, activos }, null, 1) + '\n';
  if (Buffer.byteLength(texto) > MAX_BYTES) throw Error('El catalogo generado es mayor de lo esperado; revision manual.');
  const dir = dirCatalogo(dirRaiz);
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, clase);
  try { if (fs.readFileSync(destino, 'utf8') === texto) return 'igual'; } catch {}
  const tmp = `${destino}.tmp`;
  fs.writeFileSync(tmp, texto);
  fs.renameSync(tmp, destino);
  return 'escrito';
}

// Paso de la pasada: genera ambos catálogos. Los nombres salen del mismo cotejo del universo;
// si no se puede consultar, el paso se anota y lo publicado queda como estaba.
export async function actualizarCatalogos({ dirRaiz, listarUniversoImpl = listarUniverso } = {}) {
  const lineas = [];
  const uni = universoLocal(dirRaiz);
  let nombres = { stock: {}, cripto: {} };
  try {
    const r = await listarUniversoImpl();
    if (r && r.nombres) nombres = r.nombres;
  } catch (e) {
    for (const clase of CLASES) lineas.push({ calculo: 'catalogo', mercado: clase, periodo: '', estado: 'error', error: `sin la lista de productos (${e.message})` });
    return { lineas };
  }
  for (const clase of CLASES) {
    const activos = generarCatalogo(clase, uni, nombres[clase]);
    const estado = escribirCatalogo(dirRaiz, clase, activos);
    // Información curada pendiente: solo stock, donde el bot es dueño de ACTIVOS_INFO (nombre y
    // tipo). En cripto los nombres que la API no trae los cubre la capa curada del visor; avisar
    // de esos códigos sería pedir completar lo que ya está completo.
    const sinInfo = clase === 'stock' ? activos.filter((e) => !e.tipo).map((e) => e.codigo) : [];
    lineas.push({ calculo: 'catalogo', mercado: clase, periodo: `${activos.length} activos`, estado, sinInfo });
  }
  return { lineas };
}
