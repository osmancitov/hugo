// Reconstruccion (NO es lectura en vivo) de precios horarios de cripto VIP para el dia 25-nov-2026
// y de la frontera 00:00 UTC del 26-nov de los VIP que no entraron en la lectura real.
// Fuente: velas de 1 hora de Binance (/api/v3/klines, apertura = primer precio negociado de H:00:00 UTC).
// Salida aparte: registros/intradia/cripto-reconstruido/. No toca el registro programado ni sus lecturas.
// Solo lectura de red; escribe unicamente con --escribir. Uso: node .github/reconstruir-cripto.mjs [--escribir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatearBarra, leerBarra } from '../app/modulos/barra-movil.mjs';
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'https://data-api.binance.vision', H = 3600000, D = 24 * H;
const DIA = Date.parse('2026-11-25T00:00:00Z');
const FRONTERA = DIA + D;
const RECUPERADO = new Date().toISOString().slice(0, 19) + 'Z';
// VIP cripto de las tres campañas en el ultimo cierre (sin Rezagados).
const vip = new Set();
for (const n of [30, 60, 90]) {
  const dir = path.join(RAIZ, 'registros/categorias');
  const f = fs.readdirSync(dir).filter((x) => new RegExp(`^\\d{6}-\\d{6}_carrera-${n}d$`).test(x)).sort().at(-1);
  for (const a of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).clasificados) if (a.id.startsWith('cripto:') && a.grupo !== 'rezagados') vip.add(a.id.slice(7));
}
const codigos = [...vip].sort();
const real = leerBarra(JSON.parse(fs.readFileSync(path.join(RAIZ, 'registros/intradia/cripto/2026-11-26.json'), 'utf8')).lecturas[0].texto);
const faltan = codigos.filter((c) => !real.activos.has(c));
const velas = {};
for (const c of codigos) {
  const r = await fetch(`${HOST}/api/v3/klines?symbol=${c}USDT&interval=1h&startTime=${DIA - D}&endTime=${FRONTERA}&limit=100`, { headers: { 'User-Agent': 'hugo' } });
  if (!r.ok) throw Error(`Binance ${c}: ${r.status}`);
  velas[c] = new Map((await r.json()).map((k) => [k[0], k[1]]));
}
const cierreDia = (c) => { const a = JSON.parse(fs.readFileSync(path.join(RAIZ, `registros/velas-24h/cripto/${c}/2611_${c}`), 'utf8')); const f = a.find((r) => r[0] === DIA - D); return f ? f[4] : null; };
function lectura(t, lista, base) {
  const act = [];
  for (const c of lista) {
    const u = velas[c].get(t), ap = velas[c].get(t - D);
    if (u === undefined || ap === undefined) continue; // sin vela: sin dato, no se rellena
    act.push({ codigo: c, ultimoTexto: u, aperturaTexto: ap, cierre: t, diaCierreTexto: cierreDia(c) ?? undefined });
  }
  let suben = 0, bajan = 0, ds = 0, db = 0, di = 0;
  for (const a of act) { if (Number(a.ultimoTexto) >= Number(a.aperturaTexto)) suben++; else bajan++; }
  const b0 = base || act;
  for (const a of act) { const r = b0.find((x) => x.codigo === a.codigo); if (!r) continue; const p = Number(a.ultimoTexto), q = Number(r.ultimoTexto); if (p >= q) { ds++; if (p === q) di++; } else db++; }
  const sinDia = act.length - ds - db;
  const barra = { inicio: t - D, cierreMin: t, fin: t, dispersionMs: null, consultados: act.length, conDato: act.length, sinDato: 0, suben, bajan, activos: act, dia: { ref: new Date(DIA - D).toISOString().slice(0, 10), base: base ? base.t : t, suben: ds, bajan: db, iguales: di, sinDato: sinDia } };
  return { act, texto: formatearBarra(barra, t).replace(/^# Barra movil.*\n# Foto real.*\n/, `# Origen tecnico: valores historicos de Binance klines 1h (primer precio negociado de H:00:00 UTC; apertura de 24 h = vela de 24 h antes), recuperados el ${RECUPERADO}.\n`) };
}
const salida = { dia25: { version: 1, dia: '2026-11-25', origen: 'reconstruido', fuente: 'Binance /api/v3/klines 1h', lecturas: [] }, dia26: { version: 1, dia: '2026-11-26', origen: 'reconstruido', fuente: 'Binance /api/v3/klines 1h', lecturas: [{}] } };
let base = null;
for (let t = DIA; t < FRONTERA; t += H) {
  const l = lectura(t, codigos, base);
  if (!base) { base = l.act.slice(); base.t = t; }
  salida.dia25.lecturas.push({ generada: new Date(t).toISOString(), texto: l.texto });
}
const f = lectura(FRONTERA, faltan, null);
salida.dia26.lecturas = [{ generada: new Date(FRONTERA).toISOString(), texto: f.texto, solo: faltan }];
for (const l of [...salida.dia25.lecturas, ...salida.dia26.lecturas]) leerBarra(l.texto); // valida el formato
console.log('VIP cripto', codigos.length, '| en lectura real 00:00:', codigos.length - faltan.length, '| sin ella:', faltan.join(','));
console.log('dia25 lecturas', salida.dia25.lecturas.length, 'activos/lectura', salida.dia25.lecturas.map((l) => leerBarra(l.texto).conDato).join(','));
console.log('frontera 26 (solo faltantes):', leerBarra(salida.dia26.lecturas[0].texto).activos.size, [...leerBarra(salida.dia26.lecturas[0].texto).activos].map(([c, a]) => c + '=' + a.ultimoTexto).join(' '));
if (process.argv.includes('--registrar')) {
  const base = path.join(RAIZ, 'registros/intradia/cripto');
  const f25 = path.join(base, '2026-11-25.json'), f26 = path.join(base, '2026-11-26.json'), fi = path.join(base, 'indice.json');
  if (fs.existsSync(f25)) throw Error('Ya existe el dia 25 de cripto; no sobrescribo.');
  const j26 = JSON.parse(fs.readFileSync(f26, 'utf8'));
  const prim = j26.lecturas[0];
  const pb = leerBarra(prim.texto);
  if (faltan.some((c) => pb.activos.has(c))) throw Error('La primera lectura del 26 ya trae alguno de los faltantes; no los toco.');
  const b8 = leerBarra(salida.dia26.lecturas[0].texto);
  let ds = 0, tx = prim.texto.replace(/\n$/, '');
  const add = [], F = new Date(FRONTERA).toISOString();
  let suben = 0, bajan = 0;
  for (const [c, a] of b8.activos) {
    if (Number(a.ultimoTexto) >= Number(a.apertura)) suben++; else bajan++;
    add.push(`${c} apertura: ${a.apertura}`, `${c} ultimo: ${a.ultimoTexto}`, `${c} cierre: ${F}`, `${c} dia_cierre: ${a.dia_cierre ?? 'sin dato'}`, `${c} previo: ${a.ultimoTexto}`, `${c} mov: igual`);
  }
  const n = b8.activos.size, inc = (k, d) => { tx = tx.replace(new RegExp(`^${k}: (\\d+)$`, 'm'), (_, v) => `${k}: ${Number(v) + d}`); };
  inc('consultados', n); inc('con_dato', n); inc('suben', suben); inc('bajan', bajan); inc('dia_suben', n); inc('dia_iguales', n); inc('mov_suben', n); inc('mov_iguales', n);
  tx += '\n# Completada con los activos VIP sin lectura a las 00:00 UTC (' + [...b8.activos.keys()].sort().join(', ') + '): primer precio de la vela de 1 h de Binance a las 00:00:00 UTC, recuperado el ' + RECUPERADO + '. Los valores reales existentes no se tocan.\n' + add.join('\n') + '\n';
  leerBarra(tx);
  prim.texto = tx;
  fs.writeFileSync(f26, JSON.stringify(j26) + '\n');
  fs.writeFileSync(f25, JSON.stringify({ version: 1, dia: '2026-11-25', lecturas: salida.dia25.lecturas.map((l) => ({ generada: l.generada, texto: l.texto })) }) + '\n');
  const idx = JSON.parse(fs.readFileSync(fi, 'utf8'));
  idx.dias = [...new Set([...idx.dias, '2026-11-25'])].sort();
  fs.writeFileSync(fi, JSON.stringify(idx) + '\n');
  console.log('registrado: dia 25 con', salida.dia25.lecturas.length, 'lecturas; 26 primera lectura +', n, 'activos');
}
