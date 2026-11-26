// Completa UNA hora de cripto que no quedo guardada, con el precio historico de la vela de 1 h de Binance
// (primer precio negociado de H:00:00 UTC; apertura de 24 h = vela de 24 h antes). Mismo metodo que
// .github/reconstruir-cripto.mjs. Activos = los de la primera lectura del dia. No toca lecturas existentes:
// si ya hay una de esa hora, se detiene. Uso: node .github/completar-hora-cripto.mjs 2026-11-26T01:00:00Z [--escribir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatearBarra, leerBarra } from '../app/modulos/barra-movil.mjs';
import { leerDia } from '../app/modulos/intradia-datos.mjs';
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'https://data-api.binance.vision', H = 3600000, D = 24 * H;
const t = Date.parse(process.argv[2]);
if (!Number.isFinite(t) || t % H) throw Error('Hora UTC exacta requerida.');
const dia = new Date(t).toISOString().slice(0, 10);
const fd = path.join(RAIZ, `registros/intradia/cripto/${dia}.json`), fi = path.join(RAIZ, 'registros/intradia/cripto/indice.json');
const j = JSON.parse(fs.readFileSync(fd, 'utf8'));
if (j.lecturas.some((l) => Math.floor(Date.parse(l.generada) / H) * H === t)) throw Error('Ya hay lectura de esa hora; no la toco.');
const prim = leerBarra(j.lecturas[0].texto), codigos = [...prim.activos.keys()].sort();
const act = [];
for (const c of codigos) {
  const r = await fetch(`${HOST}/api/v3/klines?symbol=${c}USDT&interval=1h&startTime=${t - D}&endTime=${t}&limit=100`, { headers: { 'User-Agent': 'hugo' } });
  if (!r.ok) throw Error(`Binance ${c}: ${r.status}`);
  const m = new Map((await r.json()).map((k) => [k[0], k[1]]));
  const u = m.get(t), ap = m.get(t - D);
  if (u === undefined || ap === undefined) continue; // sin vela: sin dato, no se rellena
  act.push({ codigo: c, ultimoTexto: u, aperturaTexto: ap, cierre: t, diaCierreTexto: prim.activos.get(c).dia_cierre });
}
let suben = 0, bajan = 0, ds = 0, db = 0, di = 0;
for (const a of act) {
  if (Number(a.ultimoTexto) >= Number(a.aperturaTexto)) suben++; else bajan++;
  const r = Number(prim.activos.get(a.codigo).ultimo), p = Number(a.ultimoTexto);
  if (p >= r) { ds++; if (p === r) di++; } else db++;
}
const RECUPERADO = new Date().toISOString().slice(0, 19) + 'Z';
const barra = { inicio: t - D, cierreMin: t, fin: t, dispersionMs: null, consultados: act.length, conDato: act.length, sinDato: 0, suben, bajan, activos: act,
  dia: { ref: new Date(Date.parse(dia) - D).toISOString().slice(0, 10), base: prim.generada, suben: ds, bajan: db, iguales: di, sinDato: 0 } };
const texto = formatearBarra(barra, t).replace(/^# Barra movil.*\n# Foto real.*\n/, `# Origen tecnico: valores historicos de Binance klines 1h (primer precio negociado de H:00:00 UTC; apertura de 24 h = vela de 24 h antes), recuperados el ${RECUPERADO}.\n`);
leerBarra(texto);
console.log('hora', new Date(t).toISOString(), 'activos', act.length, 'de', codigos.length, 'suben', suben, 'bajan', bajan);
if (process.argv.includes('--escribir')) {
  j.lecturas.push({ generada: new Date(t).toISOString(), texto });
  j.lecturas.sort((a, b) => Date.parse(a.generada) - Date.parse(b.generada));
  leerDia(JSON.stringify(j), (x) => leerBarra(x));
  const idx = JSON.parse(fs.readFileSync(fi, 'utf8'));
  if (Date.parse(j.lecturas.at(-1).generada) > Date.parse(idx.ultima)) idx.ultima = j.lecturas.at(-1).generada;
  fs.writeFileSync(fd, JSON.stringify(j) + '\n'); fs.writeFileSync(fi, JSON.stringify(idx) + '\n');
  console.log('escrito', fd);
}
