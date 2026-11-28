// Direcciones limpias de Mercado para GitHub Pages (que no reescribe rutas): al publicar se generan, a partir de
// index.html (la única fuente), una entrada mínima por dirección: mercado/, mercado/<grupo>/ y
// mercado/<stock|cripto>/<CÓDIGO>/. Todas dan 200 real y cargan los mismos app/observatorio.css y
// app/observatorio.mjs, que también se derivan de index.html (estilos y script de la página). No se versiona nada de esto:
// .gitignore lo excluye y el flujo de Pages lo regenera en cada publicación.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const GRUPOS = ['empresas', 'fondos', 'cripto'];
const CODIGO_VALIDO = /^[^\/\\?#%\s.][^\/\\?#%\s]*$/; // sin separadores ni caracteres de ruta; admite códigos no latinos

export function partirIndice(html) {
  const ini = html.indexOf('<style>'), fin = html.indexOf('</style>');
  const mi = html.indexOf('<script type="module">'), mf = html.lastIndexOf('</script>');
  if (ini < 0 || fin < ini || mi < fin || mf < mi) throw new Error('index.html no tiene la forma esperada (style y script module)');
  const css = html.slice(ini + '<style>'.length, fin);
  const js = html.slice(mi + '<script type="module">'.length, mf);
  return { css, js, antes: html.slice(0, ini), medio: html.slice(fin + '</style>'.length, mi), despues: html.slice(mf + '</script>'.length) };
}

// El script vive en app/: sus importaciones './x' (relativas a la raíz) pasan a ser relativas a app/.
export function reubicarImportaciones(js) {
  return js.replace(/(\bfrom\s*|\bimport\()\s*(['"])\.\/([^'"]+)\2/g, (_, pre, q, ruta) => {
    const rel = path.posix.relative('app', ruta);
    return `${pre}${q}${rel.startsWith('.') ? rel : './' + rel}${q}`;
  });
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function entrada(partes, { base, titulo, descripcion, url, hashCss, hashJs }) {
  let antes = partes.antes
    .replace('<title>Observatorio Bursátil</title>', `<title>${esc(titulo)}</title>`)
    .replace('<meta property="og:title" content="Observatorio Bursátil">', `<meta property="og:title" content="${esc(titulo)}">`)
    .replace('<meta property="og:description" content="Empresas y fondos · stocks y cripto">', `<meta property="og:description" content="${esc(descripcion)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(url)}">`)
    .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<base href="${esc(base)}">`);
  if (!antes.includes('<base ')) throw new Error('no se pudo poner <base>');
  return antes + `<link rel="stylesheet" href="app/observatorio.css?v=${hashCss}">` + partes.medio +
    `<script type="module" src="app/observatorio.mjs?v=${hashJs}"></script>` + partes.despues;
}

export function activos(raiz) {
  const lista = [];
  for (const m of ['stock', 'cripto']) {
    const cat = JSON.parse(fs.readFileSync(path.join(raiz, 'registros/catalogo', m), 'utf8'));
    for (const a of cat.activos) lista.push([m, a.codigo]);
  }
  return lista;
}

export function generar(raiz, { escribir = true } = {}) {
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const partes = partirIndice(html);
  const og = /<meta property="og:url" content="([^"]*)">/.exec(html)[1]; // https://…/hugo/
  const base = new URL(og).pathname;
  const hash = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 10);
  const js = reubicarImportaciones(partes.js);
  const hashCss = hash(partes.css), hashJs = hash(js);
  const paginas = new Map(); // ruta relativa → html
  const hacer = (ruta, titulo, descripcion) => paginas.set(ruta, entrada(partes, { base, titulo, descripcion, url: og + ruta, hashCss, hashJs }));
  hacer('mercado/', 'Mercado · Observatorio Bursátil', 'Empresas, fondos y cripto');
  const nombres = { empresas: 'Empresas', fondos: 'Fondos', cripto: 'Cripto' };
  for (const g of GRUPOS) hacer(`mercado/${g}/`, `${nombres[g]} · Mercado · Observatorio Bursátil`, 'Empresas, fondos y cripto');
  const omitidos = [];
  for (const [m, cod] of activos(raiz)) {
    if (!CODIGO_VALIDO.test(cod)) { omitidos.push(`${m}:${cod}`); continue; }
    hacer(`mercado/${m}/${cod}/`, `${cod} · Mercado · Observatorio Bursátil`, 'Empresas, fondos y cripto');
  }
  if (escribir) {
    fs.mkdirSync(path.join(raiz, 'app'), { recursive: true });
    fs.writeFileSync(path.join(raiz, 'app/observatorio.css'), partes.css);
    fs.writeFileSync(path.join(raiz, 'app/observatorio.mjs'), js);
    for (const [ruta, contenido] of paginas) {
      const f = path.join(raiz, ruta, 'index.html');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, contenido);
    }
  }
  return { paginas, omitidos, base };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raiz = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  const { paginas, omitidos } = generar(raiz);
  console.log(`Rutas de Mercado: ${paginas.size} entradas${omitidos.length ? '; omitidos por código no apto: ' + omitidos.join(', ') : ''}`);
}
