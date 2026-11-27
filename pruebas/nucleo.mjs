// node --test pruebas/nucleo.mjs. VIP núcleo 54 campañas, de 7 a 60 días: umbral 41 de 54, sin suavizado, bordes y errores visibles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aparicionesActivo, esVipVentana, calcularNucleo, escribirNucleo, leerNucleo, MINIMO, TOTAL, DIA } from '../app/modulos/nucleo.mjs';

const CIERRE = Date.parse('2026-11-26');
const serie = (f, n = 80) => new Map(Array.from({ length: n }, (_, i) => [CIERRE - i * DIA, f(i)]));

test('constantes: 54 duraciones y mínimo 41', () => { assert.equal(TOTAL, 54); assert.equal(MINIMO, 41); });
test('alza y baja iguales alternadas: Campaña 1, VIP en las 54', () => {
  const r = aparicionesActivo(serie((i) => (i % 2 ? -1 : 1)), CIERRE); // ventanas pares exactas; las impares dan Campaña >= 1 o < 1 según el borde
  assert.ok(r.apariciones >= 27 && r.evaluables === 54);
});
test('siempre a la baja: 0 apariciones', () => assert.equal(aparicionesActivo(serie(() => -1), CIERRE).apariciones, 0));
test('mayoría de alzas con bajas: 54 apariciones', () => assert.equal(aparicionesActivo(serie((i) => (i % 5 === 0 ? -1 : 1)), CIERRE).apariciones, 54));
test('sin días a la baja: cuenta como VIP y se anota', () => {
  const r = aparicionesActivo(serie(() => 1), CIERRE); assert.equal(r.apariciones, 54); assert.equal(r.sinBajas, 54);
});
test('todo plano: indefinido, no cuenta', () => {
  const r = aparicionesActivo(serie(() => 0), CIERRE); assert.equal(r.apariciones, 0); assert.equal(r.indefinidas, 54);
  assert.equal(esVipVentana({ pos: 0, neg: 0, dp: 0, dn: 0 }), null);
});
test('historia corta: el denominador sigue en 54 (duraciones no disputadas no se descuentan)', () => {
  const r = aparicionesActivo(serie(() => 1, 30), CIERRE); assert.equal(r.apariciones, 24); assert.equal(r.evaluables, 24);
});
test('un hueco corta las duraciones mayores', () => {
  const m = serie(() => 1); m.delete(CIERRE - 20 * DIA);
  assert.equal(aparicionesActivo(m, CIERRE).evaluables, 14); // duraciones 7 a 20
});

function raizFalsa() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'nuc-'));
  const w = (r, c) => { fs.mkdirSync(path.dirname(path.join(raiz, r)), { recursive: true }); fs.writeFileSync(path.join(raiz, r), typeof c === 'string' ? c : JSON.stringify(c)); };
  w('catalogo/stock', { mercado: 'stock', activos: [{ codigo: 'UPP', meses: ['2610', '2611'] }, { codigo: 'DWN', meses: ['2610', '2611'] }] });
  for (const [c, f] of [['UPP', (i) => (i % 5 === 0 ? 0.9 : 1.01)], ['DWN', () => 0.99]]) {
    const filas = Array.from({ length: 60 }, (_, i) => { const t = CIERRE - i * DIA; const o = 100; return [t, String(o), '0', '0', String(o * f(i)), '0']; });
    const mes = (t) => new Date(t).toISOString().slice(2, 7).replace('-', '');
    for (const m of ['2610', '2611']) w(`velas-24h/stock/${c}/${m}_${c}`, filas.filter((x) => mes(x[0]) === m));
  }
  return { raiz, w };
}

test('calcularNucleo/escribirNucleo/leerNucleo: entra el que pasa 41, queda fuera el otro; vigencia por ahora', () => {
  const { raiz } = raizFalsa();
  const j = calcularNucleo({ raiz, mercado: 'stock', cierre: CIERRE });
  assert.deepEqual(j.nucleo, ['UPP']); assert.equal(j.activos.length, 1);
  const e = escribirNucleo({ raiz, mercado: 'stock', cierre: CIERRE });
  assert.deepEqual(e.nucleo, ['UPP']);
  assert.deepEqual(leerNucleo(raiz, 'stock', { ahora: CIERRE + DIA + 3600000 }).nucleo, ['UPP']);
});

test('leerNucleo lanza si falta, está vacío o atrasado', () => {
  const { raiz, w } = raizFalsa();
  assert.throws(() => leerNucleo(raiz, 'stock'), /No hay núcleo/);
  const base = { version: 1, mercado: 'stock', cierre: '2026-11-26', generado: 'x', regla: { minimo: 41, total: 54 }, activos: [] };
  w('nucleo/stock/actual_nucleo', { ...base, nucleo: [] });
  assert.throws(() => leerNucleo(raiz, 'stock', { ahora: Date.parse('2026-11-27T01:00:00Z') }), /vacío/);
  w('nucleo/stock/actual_nucleo', { ...base, nucleo: ['A'], activos: [{ codigo: 'A', apariciones: 54 }] });
  assert.equal(leerNucleo(raiz, 'stock', { ahora: Date.parse('2026-11-27T01:00:00Z') }).nucleo[0], 'A');
  assert.throws(() => leerNucleo(raiz, 'stock', { ahora: Date.parse('2026-11-29T01:00:00Z') }), /atrasado/);
  w('nucleo/stock/actual_nucleo', { ...base, nucleo: ['A'], activos: [{ codigo: 'A', apariciones: 40 }] });
  assert.throws(() => leerNucleo(raiz, 'stock', { ahora: Date.parse('2026-11-27T01:00:00Z') }), /no alcanza/);
});
