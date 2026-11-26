// Completa los cuartos de hora (UTC) que faltan de un dia vivo, de stock y cripto, con el primer precio negociado de la
// vela de 15 min de Binance (apertura de 24 h = vela de 24 h antes). Mismo metodo que .github/completar-hora-cripto.mjs.
// Activos = los de la primera lectura del dia. No toca lecturas existentes: solo agrega cuartos que no tienen lectura
// y que son anteriores a la ultima lectura del dia. Sin vela = el activo queda fuera (sin dato), no se rellena.
// Uso: node .github/completar-cuartos.mjs 2026-11-26 [--escribir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerBarra } from '../app/modulos/barra-movil.mjs';
import { leerDia } from '../app/modulos/intradia-datos.mjs';
import { crearTexto, simbolo } from '../app/modulos/completar-vip.mjs';
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'https://data-api.binance.vision', Q = 900000, D = 86400000;
const dia = process.argv[2];
if (!/^\d{4}-\d\d-\d\d$/.test(dia || '')) throw Error('Dia AAAA-MM-DD requerido.');
const t0 = Date.parse(dia);
const RECUPERADO = new Date().toISOString().slice(0, 19) + 'Z';
for (const mercado of ['cripto', 'stock']) {
  const fd = path.join(RAIZ, `registros/intradia/${mercado}/${dia}.json`);
  const j = JSON.parse(fs.readFileSync(fd, 'utf8'));
  const ult = Math.max(...j.lecturas.map((l) => Date.parse(l.generada)));
  const hay = new Set(j.lecturas.map((l) => Math.floor(Date.parse(l.generada) / Q) * Q));
  const faltan = []; for (let t = t0; t < ult; t += Q) if (!hay.has(t)) faltan.push(t);
  const prim = leerBarra(j.lecturas[0].texto), codigos = [...prim.activos.keys()].sort();
  const base = new Map(codigos.map((c) => [c, Number(prim.activos.get(c).ultimo)])); base.generada = prim.generada;
  const velas = new Map();
  for (const c of codigos) {
    const r = await fetch(`${HOST}/api/v3/klines?symbol=${encodeURIComponent(simbolo(mercado, c))}&interval=15m&startTime=${t0 - D}&endTime=${ult}&limit=1000`, { headers: { 'User-Agent': 'hugo' } });
    if (!r.ok) throw Error(`Binance ${c}: ${r.status}`);
    velas.set(c, new Map((await r.json()).map((k) => [k[0], String(k[1])])));
  }
  const nuevas = [];
  for (const t of faltan) {
    const act = [];
    for (const c of codigos) {
      const m = velas.get(c), u = m.get(t), ap = m.get(t - D);
      if (u === undefined || ap === undefined) continue;
      act.push({ codigo: c, ultimo: u, apertura: ap, diaCierre: prim.activos.get(c).dia_cierre });
    }
    const nota = `valores historicos de Binance klines 15m (primer precio negociado de la vela UTC; apertura de 24 h = vela de 24 h antes), recuperados el ${RECUPERADO}.`;
    const texto = crearTexto(mercado, dia, t, act, base, nota);
    nuevas.push({ generada: new Date(t).toISOString(), texto });
    console.log(mercado, new Date(t).toISOString(), 'activos', act.length, 'de', codigos.length);
  }
  if (process.argv.includes('--escribir') && nuevas.length) {
    j.lecturas.push(...nuevas);
    j.lecturas.sort((a, b) => Date.parse(a.generada) - Date.parse(b.generada));
    leerDia(JSON.stringify(j), (x) => leerBarra(x));
    fs.writeFileSync(fd, JSON.stringify(j) + '\n');
    console.log('escrito', fd, 'lecturas', j.lecturas.length);
  }
}
