// Noticias de un activo: junta titulares de Yahoo Finance y Nasdaq (enlace original de cada medio),
// los suma al historial registros/noticias/<CODIGO>.json y escribe noticias/<CODIGO>.html.
// Uso: node app/generar-noticias.mjs GME          (lee la red)
//      node app/generar-noticias.mjs GME --solo-pagina   (solo regenera la página desde el JSON)
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const entidad = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function leerRss(xml, medioPorDefecto) {
  const campo = (b, n) => { const m = b.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i')); return m ? entidad(m[1]) : ''; };
  return (xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || []).flatMap((b) => {
    const titulo = campo(b, 'title').replace(/\s+/g, ' ');
    let u; try { u = new URL(campo(b, 'link')); } catch { return []; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return [];
    if (!/\/(m|markets|articles|news|story|stocks)\b|\.html$/i.test(u.pathname) && u.pathname.length < 12) return [];
    u.hash = ''; for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|\.tsrc)/i.test(k)) u.searchParams.delete(k);
    const t = Date.parse(campo(b, 'pubDate'));
    if (!titulo || !Number.isFinite(t)) return [];
    return [{ titulo, enlace: u.href, medio: campo(b, 'source') || medioPorDefecto, fecha: new Date(t).toISOString() }];
  });
}

export function unir(previas, nuevas) {
  const por = new Map();
  const titulos = new Set();
  for (const n of [...previas, ...nuevas]) { const t = n.titulo.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); if (por.has(n.enlace) || titulos.has(t)) continue; por.set(n.enlace, n); titulos.add(t); }
  return [...por.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

const fechaVE = (iso) => new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

export function pagina(codigo, items, actualizado) {
  const filas = items.map((n) => `<li><time datetime="${esc(n.fecha)}">${esc(fechaVE(n.fecha))}</time><a href="${esc(n.enlace)}" target="_blank" rel="noopener">${esc(n.titulo)}</a><span>${esc(n.medio)} ↗</span></li>`).join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#080604"><title>Noticias de ${esc(codigo)} · Observatorio Bursátil</title>
<style>*{box-sizing:border-box}html{background:#080604;color:#e8eaed;font-family:Lora,Georgia,serif}body{margin:0 auto;max-width:760px;padding:24px 24px 44px}a{color:#c2a15a;text-decoration:none}a:hover{text-decoration:underline}h1{font-family:Cinzel,Georgia,serif;font-weight:600;font-size:clamp(1.5rem,5vw,2.2rem);margin:22px 0 6px}header{border-bottom:1px solid #c2a15a;padding-bottom:14px}.nota{color:#9aa0ac;font-size:.78rem;line-height:1.6;margin:0 0 26px}ul{list-style:none;padding:0;margin:0}li{padding:16px 0;border-top:1px solid #2a3140;display:flex;flex-direction:column;gap:6px}li time,li span{font-size:.75rem;color:#9aa0ac}li a{font-size:1.02rem;line-height:1.45}footer{border-top:1px solid #2a3140;padding-top:18px;margin-top:10px;color:#9aa0ac;font-size:.75rem}</style></head><body>
<header><a href="../#/a/stock/${esc(codigo)}">← Observatorio Bursátil · ${esc(codigo)}</a></header>
<h1>Noticias de ${esc(codigo)}</h1>
<p class="nota">Más recientes primero. Fecha en hora de Caracas. Cada titular enlaza a la página original del medio. Fuentes: Yahoo Finance y Nasdaq. Actualizado el ${esc(fechaVE(actualizado))}.</p>
<ul>
${filas}
</ul>
<footer>Esta lista se actualiza al ejecutar <code>node app/generar-noticias.mjs ${esc(codigo)}</code>; no se refresca sola.</footer></body></html>
`;
}

async function principal() {
  const codigo = (process.argv[2] || '').toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/.test(codigo)) throw Error('uso: node app/generar-noticias.mjs CODIGO [--solo-pagina]');
  const ruta = `registros/noticias/${codigo}.json`;
  let datos = { codigo, actualizado: null, noticias: [] };
  try { datos = JSON.parse(await fs.readFile(ruta, 'utf8')); } catch {}
  if (!process.argv.includes('--solo-pagina')) {
    const fuentes = [[`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${codigo}&region=US&lang=en-US`, 'Yahoo Finance'], [`https://www.nasdaq.com/feed/rssoutbound?symbol=${codigo}`, 'Nasdaq']];
    let nuevas = [];
    for (const [url, medio] of fuentes) {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!r.ok) throw Error(`${medio}: HTTP ${r.status}`);
      nuevas = nuevas.concat(leerRss(await r.text(), medio));
    }
    datos.noticias = unir(datos.noticias, nuevas); datos.actualizado = new Date().toISOString();
    await fs.writeFile(ruta, JSON.stringify(datos, null, 1) + '\n');
  }
  await fs.writeFile(`noticias/${codigo}.html`, pagina(codigo, datos.noticias, datos.actualizado || new Date().toISOString()));
  console.log(`${codigo}: ${datos.noticias.length} noticias`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();
