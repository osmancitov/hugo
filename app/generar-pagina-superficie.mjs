// Entrada estática derivada del visor: el fragmento no llega a los lectores Open Graph.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
export function paginaSuperficie(html) {
  return html
    .replace('<title>Hugo · Observatorio Bursátil</title>', '<title>Superficie 3D · Hugo · Observatorio Bursátil</title>')
    .replace('property="og:title" content="Hugo · Observatorio Bursátil"', 'property="og:title" content="Superficie 3D · Hugo · Observatorio Bursátil"')
    .replace('property="og:description" content="Empresas y fondos · stocks y cripto"', 'property="og:description" content="El mercado como un paisaje: lecturas reales, relieve en tres dimensiones y una referencia diaria fija."')
    .replace('https://osmancitov.github.io/hugo/hugo3.jpg', 'https://osmancitov.github.io/hugo/superficie-og.jpg')
    .replace('property="og:url" content="https://osmancitov.github.io/hugo/"', 'property="og:url" content="https://osmancitov.github.io/hugo/superficie.html"')
    .replace('<meta property="og:type" content="website">', '<meta property="og:type" content="website">\n<meta property="og:image:width" content="1280">\n<meta property="og:image:height" content="640">\n<meta property="og:image:type" content="image/jpeg">\n<meta property="og:image:alt" content="Paisaje fantástico de pliegues rojos y verdes, inspirado en la superficie bursátil 3D de Hugo.">')
    .replace('href="#/"', 'href="index.html#/"')
    .replaceAll("href: '#/i/iceberg-stock'", "href: 'index.html#/i/iceberg-stock'")
    .replace("window.addEventListener('hashchange', ruta);\nruta();", "window.addEventListener('hashchange', ruta);\nif (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#/i/iceberg-stock/superficie');\nruta();");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raiz = new URL('../', import.meta.url);
  fs.writeFileSync(new URL('superficie.html', raiz), paginaSuperficie(fs.readFileSync(new URL('index.html', raiz), 'utf8')));
}
