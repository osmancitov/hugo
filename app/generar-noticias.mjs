// Archivo de noticias de un activo. Los datos viven en registros/noticias/<CODIGO>.json y la página
// en noticias/<CODIGO>.html. Sin red y sin automatismos: solo se actualiza cuando se ejecuta.
//   node app/generar-noticias.mjs GME                      regenera la página desde el archivo
//   node app/generar-noticias.mjs GME --agregar nuevas.json suma noticias nuevas (sin repetir) y regenera
// Formato de entrada de --agregar: lista de {medio, "fecha_local_utc-4": "25 nov · 18:35", titular, url, mensaje_ts?}
//
// Ventana visible: campaña de 30 días, como el resto del Observatorio (ventana móvil que avanza
// cada día). La página muestra solo las noticias desde las 00:00 UTC-4 de (hoy - 30 días);
// el archivo guarda también las anteriores y no se borran.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clave = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const DIAS_VENTANA = 30;
// Medianoche UTC-4 del día (hoy - DIAS_VENTANA): lo anterior no se muestra en la página.
export function inicioVentana(hoy = new Date()) {
  const u4 = new Date(hoy.getTime() - 4 * 3600000);
  return new Date(Date.UTC(u4.getUTCFullYear(), u4.getUTCMonth(), u4.getUTCDate() - DIAS_VENTANA, 4, 0));
}
const corta = (d) => `${d.getUTCDate()}-${MESES[d.getUTCMonth()]}-${d.getUTCFullYear()}`;

// «25 nov · 18:35» (hora UTC-4, sin año). El año no viene en la fuente: para ordenar se toma la fecha más
// reciente que no sea posterior a `hoy`. Es solo un criterio de orden salvo año verificado (campo anio_*).
export function ordenDe(texto, hoy = new Date()) {
  const m = /^(\d{1,2}) (\p{L}{3}) · (\d{2}):(\d{2})$/u.exec((texto || '').trim());
  const mes = m ? MESES.indexOf(m[2]) : -1;
  if (!m || mes < 0) return null;
  const f = (anio) => new Date(Date.UTC(anio, mes, +m[1], +m[3] + 4, +m[4])); // UTC-4 -> UTC
  let d = f(hoy.getUTCFullYear());
  if (d > hoy) d = f(hoy.getUTCFullYear() - 1);
  return d.toISOString();
}

// GuruFocus: dos orígenes distintos. (a) Salida de su Data API: su acuerdo prohíbe publicarla y el
// repositorio es público; esas filas (marcadas "fuente": "gurufocus") se retienen salvo permiso expreso.
// (b) Enlaces de su página pública /stock/<COD>/article: el dueño decidió el 26-nov-2026 sumarlos como
// vínculos normales; se agregan con --permitir-gurufocus. Esto registra la decisión para esos enlaces,
// no una conclusión legal general.
export const esGuruFocus = (fila) => /gurufocus/i.test(fila.fuente || '') || /(^|\.)gurufocus\.com$/i.test((() => { try { return new URL(fila.url).hostname; } catch { return ''; } })());

export function normalizar(fila, hoy) {
  const titular = (fila.titular || '').replace(/\s+/g, ' ').trim();
  let u; try { u = new URL(fila.url); } catch { return null; }
  const fecha = fila['fecha_local_utc-4'] || fila.fecha_texto || '';
  const orden = ordenDe(fecha, hoy);
  if (!titular || !orden || !/^https?:$/.test(u.protocol) || u.pathname.length < 2) return null;
  return { fecha_texto: fecha.trim(), orden, medio: (fila.medio || '').trim(), titular, enlace: u.href, lote: fila.mensaje_ts || fila.lote || '', anio: +orden.slice(0, 4), anio_estado: 'inferido' };
}

export function sumar(previas, filas, hoy, permitirGuruFocus = false) {
  const urls = new Set(previas.map((n) => n.enlace)), titulos = new Set(previas.map((n) => clave(n.titular)));
  const nuevas = [], descartadas = { invalidas: 0, repetidas: 0, guruFocus: 0 };
  for (const f of filas) {
    if (esGuruFocus(f) && !permitirGuruFocus) { descartadas.guruFocus++; continue; }
    const n = normalizar(f, hoy);
    if (!n) { descartadas.invalidas++; continue; }
    if (urls.has(n.enlace) || titulos.has(clave(n.titular))) { descartadas.repetidas++; continue; }
    urls.add(n.enlace); titulos.add(clave(n.titular)); nuevas.push(n);
  }
  const todas = [...previas, ...nuevas].sort((a, b) => b.orden.localeCompare(a.orden) || String(b.lote).localeCompare(String(a.lote)));
  return { todas, agregadas: nuevas.length, descartadas };
}

// Fecha visible: con año cuando está verificado contra la fuente («28 ene 2021 · 04:00», «25 nov 2026»).
function fechaVisible(n) {
  const t = n.fecha_texto;
  if (n.anio_estado === 'verificado' && n.anio) return t.includes(' · ') ? t.replace(' · ', ` ${n.anio} · `) : `${t} ${n.anio}`;
  return t;
}

export function pagina(codigo, fuente, items, hoy = new Date()) {
  const desde = inicioVentana(hoy);
  const vis = items.filter((n) => n.orden >= desde.toISOString());
  const filas = vis.map((n) => {
    const extra = (n.enlaces_extra || []).map((e) => ` · <a class="alt" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.etiqueta)} ↗</a>`).join('');
    const nota = n.nota_fecha ? `<small class="nf">${esc(n.nota_fecha)}</small>` : '';
    return `<li><time datetime="${esc(n.orden)}">${esc(fechaVisible(n))}</time><a href="${esc(n.enlace)}" target="_blank" rel="noopener">${esc(n.titular)}</a><span>${esc(n.medio)} ↗${extra}</span>${nota}</li>`;
  }).join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#080604"><title>Noticias archivadas de ${esc(codigo)} · Observatorio Bursátil</title>
<style>*{box-sizing:border-box}html{background:#080604;color:#e8eaed;font-family:Lora,Georgia,serif}body{margin:0 auto;max-width:760px;padding:24px 24px 44px}a{color:#c2a15a;text-decoration:none}a:hover{text-decoration:underline}h1{font-family:Cinzel,Georgia,serif;font-weight:600;font-size:clamp(1.5rem,5vw,2.2rem);margin:22px 0 6px}header{border-bottom:1px solid #c2a15a;padding-bottom:14px}.nota{color:#9aa0ac;font-size:.78rem;line-height:1.6;margin:0 0 26px}ul{list-style:none;padding:0;margin:0}li{padding:16px 0;border-top:1px solid #2a3140;display:flex;flex-direction:column;gap:6px}li time,li span,li small.nf{font-size:.75rem;color:#9aa0ac}li a{font-size:1.02rem;line-height:1.45}li span a.alt{font-size:.75rem}footer{border-top:1px solid #2a3140;padding-top:18px;margin-top:10px;color:#9aa0ac;font-size:.75rem;line-height:1.6}</style></head><body>
<header><a href="../#/a/stock/${esc(codigo)}">← Observatorio Bursátil · ${esc(codigo)}</a></header>
<h1>Noticias archivadas de ${esc(codigo)}</h1>
<p class="nota">${vis.length} noticias de la campaña de 30 días (ventana móvil: hoy desde el ${corta(desde)}; el archivo guarda ${items.length} en total y las anteriores no se muestran), de la más reciente a la más antigua por la fecha de la noticia. Horas en UTC-4; las filas sin hora solo tienen el día comprobado. El año, cuando aparece, está verificado contra la fuente original (lista en docs/noticias.md); donde no aparece, la fuente no lo indica y el orden supone el año más reciente que no dé una fecha futura (inferencia, no verificada). ${esc(fuente)}</p>
<ul>
${filas}
</ul>
<footer>El archivo crece al sumar noticias nuevas con <code>node app/generar-noticias.mjs ${esc(codigo)} --agregar nuevas.json</code>; no se actualiza solo. Ver docs/noticias.md.</footer></body></html>
`;
}

async function principal() {
  const codigo = (process.argv[2] || '').toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/.test(codigo)) throw Error('uso: node app/generar-noticias.mjs CODIGO [--agregar archivo.json]');
  const ruta = `registros/noticias/${codigo}.json`;
  let datos = { codigo, fuente: '', noticias: [] };
  try { datos = JSON.parse(await fs.readFile(ruta, 'utf8')); } catch {}
  const i = process.argv.indexOf('--agregar');
  if (i > 0) {
    const filas = JSON.parse(await fs.readFile(process.argv[i + 1], 'utf8'));
    const r = sumar(datos.noticias, Array.isArray(filas) ? filas : [], new Date(), process.argv.includes('--permitir-gurufocus'));
    datos.noticias = r.todas;
    await fs.writeFile(ruta, JSON.stringify(datos, null, 1) + '\n');
    console.log(`agregadas ${r.agregadas}, repetidas ${r.descartadas.repetidas}, inválidas ${r.descartadas.invalidas}, GuruFocus retenidas ${r.descartadas.guruFocus}`);
  }
  const hoy = new Date();
  const vis = datos.noticias.filter((n) => n.orden >= inicioVentana(hoy).toISOString());
  await fs.writeFile(`noticias/${codigo}.html`, pagina(codigo, datos.fuente, datos.noticias, hoy));
  console.log(`${codigo}: ${vis.length} visibles de ${datos.noticias.length} guardadas`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await principal();
