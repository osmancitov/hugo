// Inventario de días registrados por activo: contador acumulado calculado de las velas guardadas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { esRutaInventario, validarInventario, generarInventario, actualizarInventarios, DESDE } from '../app/modulos/inventario-dias.mjs';
import { universoLocal } from '../app/modulos/catalogo.mjs';

const D = 86400000;
const vela = (t, o = '1', c = '1') => [t, o, '2', '1', c, '5', t + D - 1, '5', 1, '1', '1', '0'];
function armar(spec) { // spec: {clase:{COD:[índices de día con vela]}}
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-inv-'));
  for (const [clase, activos] of Object.entries(spec)) for (const [cod, idx] of Object.entries(activos)) {
    const porMes = {};
    for (const i of idx) { const t = DESDE + i * D; const d = new Date(t); const m = String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, '0'); (porMes[m] ||= []).push(vela(t)); }
    fs.mkdirSync(path.join(raiz, 'velas-24h', clase, cod), { recursive: true });
    for (const [m, v] of Object.entries(porMes)) fs.writeFileSync(path.join(raiz, 'velas-24h', clase, cod, `${m}_${cod}`), JSON.stringify(v));
  }
  return raiz;
}
const AHORA = DESDE + 5 * D + 3600000; // 6-ago 01:00 UTC: último día cerrado = 5-ago (índice 4)
const leer = (raiz, c) => JSON.parse(fs.readFileSync(path.join(raiz, 'inventario', c), 'utf8'));

test('ruta', () => {
  assert.ok(esRutaInventario('registros/inventario/stock'));
  assert.ok(esRutaInventario('registros/inventario/cripto'));
  assert.ok(!esRutaInventario('registros/inventario/otro'));
});

test('cuenta días guardados; un hueco repite el valor; entrada tardía parte de cero', async () => {
  const raiz = armar({ cripto: { BTC: [0, 1, 2, 3, 4], ETH: [0, 1, 3, 4], NUEVA: [3, 4] }, stock: { AAPL: [0, 1, 2, 3, 4] } });
  const r = await actualizarInventarios({ dirRaiz: raiz, ahora: AHORA });
  assert.deepEqual(r.lineas.map((l) => l.estado), ['escrito', 'escrito']);
  const c = leer(raiz, 'cripto');
  assert.equal(c.desde, '2026-08-01'); assert.equal(c.hasta, '2026-08-05');
  assert.deepEqual(c.activos.BTC, [1, 2, 3, 4, 5]);
  assert.deepEqual(c.activos.ETH, [1, 2, 2, 3, 4]);
  assert.deepEqual(c.activos.NUEVA, [0, 0, 0, 1, 2]);
  assert.deepEqual(leer(raiz, 'stock').activos.AAPL, [1, 2, 3, 4, 5]);
  assert.ok(validarInventario(fs.readFileSync(path.join(raiz, 'inventario', 'cripto'))));
});

test('reintento idempotente: sin doble conteo y sin reescribir', async () => {
  const raiz = armar({ cripto: { BTC: [0, 1, 2] }, stock: { AAPL: [0] } });
  await actualizarInventarios({ dirRaiz: raiz, ahora: AHORA });
  const antes = fs.readFileSync(path.join(raiz, 'inventario', 'cripto'), 'utf8');
  const r = await actualizarInventarios({ dirRaiz: raiz, ahora: AHORA });
  assert.deepEqual(r.lineas.map((l) => l.estado), ['igual', 'igual']);
  assert.equal(fs.readFileSync(path.join(raiz, 'inventario', 'cripto'), 'utf8'), antes);
});

test('día nuevo: suma uno solo a quien lo guardó; el día abierto no cuenta', async () => {
  const raiz = armar({ cripto: { BTC: [0, 1, 2, 3, 4, 5], ETH: [0, 1, 2, 3, 4] }, stock: {} });
  await actualizarInventarios({ dirRaiz: raiz, ahora: AHORA });
  assert.deepEqual(leer(raiz, 'cripto').activos.BTC, [1, 2, 3, 4, 5]); // el 6-ago aún abierto
  await actualizarInventarios({ dirRaiz: raiz, ahora: AHORA + D });
  const c = leer(raiz, 'cripto');
  assert.deepEqual(c.activos.BTC, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(c.activos.ETH, [1, 2, 3, 4, 5, 5]);
});

test('velas inválidas no cuentan (apertura o cierre en 0, fuera de día UTC)', async () => {
  const raiz = armar({ cripto: { BTC: [0] }, stock: {} });
  const f = path.join(raiz, 'velas-24h', 'cripto', 'BTC', '2608_BTC');
  fs.writeFileSync(f, JSON.stringify([vela(DESDE), vela(DESDE + D, '0', '1'), vela(DESDE + 2 * D, '1', '0'), vela(DESDE + 3 * D + 5)]));
  await actualizarInventarios({ dirRaiz: raiz, ahora: AHORA });
  assert.deepEqual(leer(raiz, 'cripto').activos.BTC, [1, 1, 1, 1, 1]);
});

test('validar rechaza saltos, largo distinto y mercado malo', () => {
  const ok = { mercado: 'cripto', desde: '2026-08-01', hasta: '2026-08-03', activos: { BTC: [1, 2, 3] } };
  assert.equal(validarInventario(JSON.stringify(ok)), 1);
  assert.equal(validarInventario(JSON.stringify({ ...ok, activos: { BTC: [1, 3, 3] } })), 0);
  assert.equal(validarInventario(JSON.stringify({ ...ok, activos: { BTC: [1, 2] } })), 0);
  assert.equal(validarInventario(JSON.stringify({ ...ok, mercado: 'x' })), 0);
  assert.equal(validarInventario('no json'), 0);
});

test('datos reales del repo: 467 con 90 días o más', { skip: !fs.existsSync(path.resolve('registros/velas-24h')) }, () => {
  const raiz = path.resolve('registros');
  const ahora = Date.UTC(2026, 10, 24, 1);
  const uni = universoLocal(raiz);
  const n = (cl) => Object.values(generarInventario(raiz, cl, uni, ahora).activos).filter((a) => a[a.length - 1] >= 90).length;
  assert.equal(generarInventario(raiz, 'cripto', uni, ahora).hasta, '2026-11-23');
  assert.equal(n('stock') + n('cripto'), 467);
});
