// Vigencia de los activos: el catálogo publicado (registros/catalogo/<mercado>) es la lista de
// quién participa en vistas y cálculos. Las carpetas de velas conservan la historia y nunca se
// tocan aquí: un activo fuera del catálogo deja de contar, pero sus registros siguen en su sitio.
//
// Sin atajos: si el catálogo falta o no sirve (ilegible, vacío, de otro mercado o con códigos
// inválidos) esto LANZA un error. No se calcula con las carpetas en su lugar, porque eso
// reintroduciría en silencio activos dados de baja. El cálculo afectado se detiene, los
// resultados anteriores quedan como estaban y el fallo se ve en el informe o en el flujo.
// El catálogo va versionado en el repositorio y la pasada lo genera antes de los cálculos, así
// que no hay un arranque legítimo sin él.
import fs from 'node:fs';
import path from 'node:path';

const CODIGO_OK = /^[\p{L}\p{N}]{1,15}$/u;

// dirVelas es .../velas-24h; el catálogo vive en su hermano .../catalogo.
export function vigentes(dirVelas, clase) {
  const ruta = path.join(path.dirname(dirVelas), 'catalogo', clase);
  let j;
  try { j = JSON.parse(fs.readFileSync(ruta, 'utf8')); }
  catch (e) { throw new Error(`catálogo de ${clase} ${e.code === 'ENOENT' ? 'ausente' : 'ilegible'}; no calculo sin la vigencia`); }
  if (!j || j.mercado !== clase || !Array.isArray(j.activos) || !j.activos.length) {
    throw new Error(`catálogo de ${clase} con forma inesperada o vacío; no calculo sin la vigencia`);
  }
  const codigos = j.activos.map((e) => e && e.codigo);
  if (codigos.some((c) => typeof c !== 'string' || !CODIGO_OK.test(c))) {
    throw new Error(`catálogo de ${clase} con códigos inválidos; no calculo sin la vigencia`);
  }
  return new Set(codigos);
}

// Filtro listo para usar: true si el activo cuenta. Lanza si el catálogo no sirve.
export function esVigente(dirVelas, clase) {
  const set = vigentes(dirVelas, clase);
  return (codigo) => set.has(codigo);
}

// Comprueba todos los mercados antes de escribir nada: o todos sirven o no se toca ninguno.
export function exigirCatalogos(dirVelas, clases) {
  for (const clase of clases) vigentes(dirVelas, clase);
}
