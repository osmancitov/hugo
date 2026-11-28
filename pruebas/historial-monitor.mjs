// Historial del Monitor: la lista de la jornada D sale del cierre D-1 (sin mirar a futuro), el rendimiento es la vela de D,
// las procedencias van separadas y lo ya guardado no se reescribe.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { calcularJornadas, actualizarHistorial, leerMes, diaMs, isoDia, PRIMERA_JORNADA } from '../app/modulos/historial-monitor.mjs';
import { escribirNucleo, DIA } from '../app/modulos/nucleo.mjs';

const INICIO = Date.parse('2026-08-01T00:00:00Z');
// Activo UP: sube cada día 1 % hasta el día `rompe` y cae 30 % ese día. FLAT: alterna +0,5/-1 %. NUEVO: entra el 20-sep.
function armar({ rompe = null } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-'));
  const dias = 120;
  const defs = { UP: (i) => (rompe !== null && i === rompe ? -30 : 1), FLAT: (i) => (i % 2 ? 0.5 : -1), NUEVO: (i) => 1 };
  const filas = {};
  for (const [c, f] of Object.entries(defs)) {
    filas[c] = [];
    for (let i = c === 'NUEVO' ? 50 : 0; i < dias; i++) {
      const t = INICIO + i * DIA, o = 100, cl = o * (1 + f(i) / 100);
      filas[c].push([t, String(o), String(Math.max(o, cl)), String(Math.min(o, cl)), String(cl), '1', t + DIA - 1, '1', 1, '1', '1', '0']);
    }
    const d = path.join(raiz, 'velas-24h', 'stock', c); fs.mkdirSync(d, { recursive: true });
    const porMes = {};
    for (const v of filas[c]) (porMes[new Date(v[0]).toISOString().slice(2, 4) + new Date(v[0]).toISOString().slice(5, 7)] ||= []).push(v);
    for (const [m, vs] of Object.entries(porMes)) fs.writeFileSync(path.join(d, `${m}_${c}`), JSON.stringify(vs));
  }
  fs.mkdirSync(path.join(raiz, 'catalogo'));
  const meses = ['2608', '2609', '2610', '2611'];
  fs.writeFileSync(path.join(raiz, 'catalogo', 'stock'), JSON.stringify({ mercado: 'stock', generado: 'x', activos: Object.keys(defs).map((codigo) => ({ codigo, nombre: codigo, meses })) }));
  return raiz;
}

test('la primera jornada es el 30-sep y usa el cierre del 29-sep', () => {
  const raiz = armar();
  const j = calcularJornadas({ raiz, mercado: 'stock', desde: PRIMERA_JORNADA, hasta: PRIMERA_JORNADA });
  assert.deepEqual(Object.keys(j), ['2026-09-30']);
  assert.equal(j['2026-09-30'].lista.cierre, '2026-09-29');
  assert.equal(j['2026-09-30'].lista.origen, 'reconstruido');
  const cods = j['2026-09-30'].activos.map((a) => a[0]);
  assert.ok(cods.includes('UP'));
  assert.ok(!cods.includes('FLAT'));
});

test('sin mirar a futuro: cambiar la vela de D o posteriores no cambia la lista de D', () => {
  const a = calcularJornadas({ raiz: armar(), mercado: 'stock', desde: '2026-10-10', hasta: '2026-10-10' });
  // UP se desploma justo el 10-oct (día 70): la lista del 10-oct sigue incluyéndolo, el rendimiento de ese día lo refleja.
  const b = calcularJornadas({ raiz: armar({ rompe: 70 }), mercado: 'stock', desde: '2026-10-10', hasta: '2026-10-10' });
  const A = a['2026-10-10'], B = b['2026-10-10'];
  assert.deepEqual(A.activos.map((x) => x[0]), B.activos.map((x) => x[0]));
  assert.equal(B.lista.cierre, '2026-10-09');
  const up = B.activos.find((x) => x[0] === 'UP');
  assert.ok(up[4] < -29 && up[4] > -31);
  assert.ok(A.activos.find((x) => x[0] === 'UP')[4] > 0);
});

test('un activo que entra tarde no cuenta antes de tener velas y no se inventan duraciones', () => {
  const j = calcularJornadas({ raiz: armar(), mercado: 'stock', desde: '2026-09-30', hasta: '2026-09-30' });
  assert.ok(!j['2026-09-30'].activos.some((a) => a[0] === 'NUEVO')); // 10 velas hasta el 29-sep: ninguna duración llega a 41 apariciones
  const k = calcularJornadas({ raiz: armar(), mercado: 'stock', desde: '2026-11-20', hasta: '2026-11-20' });
  assert.ok(k['2026-11-20'].activos.some((a) => a[0] === 'NUEVO'));
});

test('procedencia: núcleo guardado se marca guardado, el resto reconstruido; si no coinciden, falla', () => {
  const raiz = armar();
  escribirNucleo({ raiz, mercado: 'stock', cierre: Date.parse('2026-10-09T00:00:00Z'), generado: 'x' });
  const j = calcularJornadas({ raiz, mercado: 'stock', desde: '2026-10-09', hasta: '2026-10-11' });
  assert.equal(j['2026-10-10'].lista.origen, 'guardado');
  assert.equal(j['2026-10-09'].lista.origen, 'reconstruido');
  assert.equal(j['2026-10-11'].lista.origen, 'reconstruido');
  const f = path.join(raiz, 'nucleo', 'stock', '261009_nucleo');
  const n = JSON.parse(fs.readFileSync(f, 'utf8')); n.nucleo = n.nucleo.filter((c) => c !== 'UP'); n.activos = n.activos.filter((c) => c.codigo !== 'UP');
  fs.writeFileSync(f, JSON.stringify(n));
  assert.throws(() => calcularJornadas({ raiz, mercado: 'stock', desde: '2026-10-10', hasta: '2026-10-10' }), /no coincide/);
});

test('actualizar es idempotente, completa lo que falta y no reescribe días guardados', () => {
  const raiz = armar();
  const n1 = actualizarHistorial({ raiz, mercado: 'stock', hasta: '2026-10-05' });
  assert.equal(n1.length, 6);
  const f = path.join(raiz, 'historial-monitor', 'stock', '2610');
  const antes = fs.readFileSync(f, 'utf8');
  assert.deepEqual(actualizarHistorial({ raiz, mercado: 'stock', hasta: '2026-10-05' }), []);
  assert.equal(fs.readFileSync(f, 'utf8'), antes);
  const mes = leerMes(raiz, 'stock', '2026-10-01'); mes.dias['2026-10-01'].resumen.media = 999;
  fs.writeFileSync(f, JSON.stringify(mes) + '\n');
  const n2 = actualizarHistorial({ raiz, mercado: 'stock', hasta: '2026-10-07' });
  assert.deepEqual(n2, ['2026-10-06', '2026-10-07']);
  assert.equal(leerMes(raiz, 'stock', '2026-10-01').dias['2026-10-01'].resumen.media, 999);
  const idx = JSON.parse(fs.readFileSync(path.join(raiz, 'historial-monitor', 'stock', 'indice'), 'utf8'));
  assert.deepEqual([idx.desde, idx.hasta, idx.meses], ['2026-09-30', '2026-10-07', ['2609', '2610']]);
});

test('resumen coherente con las filas', () => {
  const j = calcularJornadas({ raiz: armar(), mercado: 'stock', desde: '2026-11-20', hasta: '2026-11-20' })['2026-11-20'];
  const s = j.activos.reduce((a, x) => ({ n: a.n + 1, sum: a.sum + x[4] }), { n: 0, sum: 0 });
  assert.equal(j.resumen.suben + j.resumen.bajan + j.resumen.iguales + j.resumen.sin_vela, j.lista.total);
  assert.ok(Math.abs(j.resumen.media - s.sum / s.n) < 1e-3);
  assert.equal(isoDia(diaMs('2026-11-20')), '2026-11-20');
});
