import test from 'node:test';
import assert from 'node:assert/strict';
import { campana, ordenarCampana } from '../app/modulos/campana-orden.mjs';
const a = (id, puesto, potencia, constancia) => ({ id, puesto, potencia, constancia });
test('Campaña = raíz((P²+C²)/2): vale 1 en P=1,C=1 y con ambas bajo 1 queda bajo 1', () => {
  assert.equal(campana(a('q', 1, 1, 1)), 1);
  assert.ok(campana(a('q', 1, 0.8, 0.8)) < 1 && campana(a('q', 1, 0.99, 0.99)) < 1);
  assert.ok(campana(a('q', 1, 1.5, 0.9)) > 1);
});
test('ordena de mayor a menor Campaña, no por puesto', () => {
  assert.deepEqual(ordenarCampana([a('x', 1, 1, 1), a('y', 2, 2, 1.5), a('z', 3, 1.2, 1.1)]).map((e) => e.id), ['y', 'z', 'x']);
});
test('empate: puesto y luego id; no modifica la lista original', () => {
  assert.deepEqual(ordenarCampana([a('b', 2, 3, 4), a('a', 2, 4, 3), a('c', 1, 5, 0)]).map((e) => e.id), ['c', 'a', 'b']);
  const l = [a('x', 1, 1, 1), a('y', 2, 2, 2)]; ordenarCampana(l); assert.equal(l[0].id, 'x');
});
