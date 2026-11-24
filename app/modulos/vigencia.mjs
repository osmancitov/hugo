// Vigencia de los activos: el catálogo publicado (registros/catalogo/<mercado>) es la lista de
// quién participa en vistas y cálculos. Las carpetas de velas conservan la historia y nunca se
// tocan aquí: un activo fuera del catálogo deja de contar, pero sus registros siguen en su sitio.
// Sin catálogo legible no se filtra nada (el comportamiento de antes), para no vaciar un cálculo
// por un archivo ausente o dañado.
import fs from 'node:fs';
import path from 'node:path';

// dirVelas es .../velas-24h; el catálogo vive en su hermano .../catalogo.
export function vigentes(dirVelas, clase) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(path.dirname(dirVelas), 'catalogo', clase), 'utf8'));
    if (!j || j.mercado !== clase || !Array.isArray(j.activos) || !j.activos.length) return null;
    const codigos = j.activos.map((e) => e && e.codigo).filter((c) => typeof c === 'string');
    return codigos.length ? new Set(codigos) : null;
  } catch { return null; }
}

// Filtro listo para usar: true si el activo cuenta (sin catálogo, todos cuentan).
export function esVigente(dirVelas, clase) {
  const set = vigentes(dirVelas, clase);
  return (codigo) => !set || set.has(codigo);
}
