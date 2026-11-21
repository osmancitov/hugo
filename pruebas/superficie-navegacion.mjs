import test from 'node:test';
import assert from 'node:assert/strict';
import { montarPasos } from '../visor-superficie.mjs';

class Elemento {
  constructor(tag) { this.tagName = tag; this.hijos = []; this.atributos = {}; }
  append(...hijos) { this.hijos.push(...hijos); }
  setAttribute(k, v) { this.atributos[k] = v; }
}
function banco(cantidad, inicial = 0) {
  const anterior = global.document;
  global.document = { createElement: (tag) => new Elemento(tag) };
  const selector = { selectedIndex: inicial, options: Array(cantidad) };
  let pasos;
  const llamados = [];
  try {
    pasos = montarPasos(selector, 'Activo', (i) => { selector.selectedIndex = i; llamados.push(i); pasos.actualizar(); });
  } finally { global.document = anterior; }
  const [previo, lista, siguiente] = pasos.grupo.hijos;
  return { selector, pasos, previo, lista, siguiente, llamados };
}
test('flechas y selector comparten posición; los extremos no se envuelven', () => {
  const b = banco(3);
  assert.equal(b.lista, b.selector);
  assert.equal(b.previo.disabled, true); assert.equal(b.siguiente.disabled, false);
  b.previo.onclick(); assert.deepEqual(b.llamados, []);
  b.siguiente.onclick(); assert.equal(b.selector.selectedIndex, 1);
  b.siguiente.onclick(); assert.equal(b.selector.selectedIndex, 2);
  assert.equal(b.siguiente.disabled, true);
  b.siguiente.onclick(); assert.deepEqual(b.llamados, [1, 2]);
  b.previo.onclick(); assert.equal(b.selector.selectedIndex, 1);
  assert.equal(b.previo.disabled, false); assert.equal(b.siguiente.disabled, false);
});
test('cambiar el desplegable actualiza los límites y continúa desde su nueva posición', () => {
  const b = banco(113);
  b.selector.selectedIndex = 75; b.pasos.actualizar(); b.previo.onclick();
  assert.equal(b.selector.selectedIndex, 74);
  b.selector.selectedIndex = 112; b.pasos.actualizar();
  assert.equal(b.siguiente.disabled, true); assert.equal(b.previo.disabled, false);
});
test('una sola lectura o una lista vacía desactiva ambas flechas', () => {
  for (const [n, i] of [[1, 0], [0, -1]]) {
    const b = banco(n, i);
    assert.equal(b.previo.disabled, true); assert.equal(b.siguiente.disabled, true);
    b.previo.onclick(); b.siguiente.onclick(); assert.deepEqual(b.llamados, []);
  }
});
test('cada flecha tiene nombre accesible y no envía formularios', () => {
  const b = banco(2);
  assert.equal(b.previo.atributos['aria-label'], 'Activo anterior');
  assert.equal(b.siguiente.atributos['aria-label'], 'Activo siguiente');
  assert.equal(b.previo.type, 'button'); assert.equal(b.siguiente.type, 'button');
});

test('superficie: porcentaje de un decimal y hora sin segundos son solo formato', async () => {
  const { porcentajeSuperficie, horaSuperficie } = await import('../visor-superficie.mjs');
  assert.equal(porcentajeSuperficie(1.234567), '+1,2 %');
  assert.equal(porcentajeSuperficie(-1.2711234), '-1,3 %');
  assert.equal(porcentajeSuperficie(0), '0,0 %');
  assert.equal(porcentajeSuperficie(-0.001), '0,0 %');
  assert.equal(porcentajeSuperficie(null), 'sin comparación');
  const n = 1.234567; porcentajeSuperficie(n); assert.equal(n, 1.234567);
  assert.equal(horaSuperficie(Date.parse('2026-11-21T09:45:52.736Z')), '09:45');
});

test('reloj del observatorio actualiza el minuto sin red y se desmonta sin dejar temporizador', async () => {
  const { montarRelojObservatorio } = await import('../visor-superficie.mjs');
  const anterior = global.document, contenedor = new Elemento('div'), pendientes = [], cancelados = [];
  let ms = Date.parse('2026-11-21T13:07:52.736Z');
  global.document = { createElement: (tag) => new Elemento(tag), createTextNode: (textContent) => ({ textContent }) };
  try {
    const reloj = montarRelojObservatorio(contenedor, { ahora: () => ms, programar: (fn, espera) => { pendientes.push({ fn, espera }); return pendientes.length; }, cancelar: (id) => cancelados.push(id) });
    const tiempo = contenedor.hijos[0].hijos[1].hijos[1];
    assert.equal(tiempo.textContent, '13:07'); assert.equal(tiempo.dateTime, '2026-11-21T13:07:52.736Z');
    assert.equal(pendientes[0].espera, 7264);
    ms = Date.parse('2026-11-21T13:08:00.000Z'); pendientes[0].fn();
    assert.equal(tiempo.textContent, '13:08'); assert.equal(pendientes[1].espera, 60000);
    reloj.desmontar(); assert.deepEqual(cancelados, [2]);
    ms += 60000; pendientes[1].fn(); assert.equal(tiempo.textContent, '13:08'); assert.equal(pendientes.length, 2);
  } finally { global.document = anterior; }
});
