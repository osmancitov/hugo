import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const funcion = html.slice(html.indexOf('function vistaCapitalizacion(lista) {'), html.indexOf('\nasync function ruta()'));

test('Capitalización actualiza filas sin desconectar el buscador tras cada letra', () => {
  let foco = null;
  class Elemento {
    constructor() { this.children = []; this.value = ''; }
    append(...nodos) { this.children.push(...nodos); }
    replaceChildren(...nodos) {
      if (this.children.includes(foco)) foco = null;
      this.children = nodos;
    }
  }
  const app = new Elemento(), elBuscar = new Elemento();
  const contexto = vm.createContext({
    app, elBuscar,
    document: { createElement: () => new Elemento() },
    cabCaps: () => ({ cabecera: true }),
    filaActivo: e => e,
  });
  vm.runInContext('let actualizarCapitalizacion = () => {};\n' + funcion, contexto);
  vm.runInContext("vistaCapitalizacion([{codigo:'NVDA',nombre:'NVIDIA',cap:3},{codigo:'NU',nombre:'Nubank',cap:1},{codigo:'AAPL',nombre:'Apple',cap:2}]);", contexto);
  assert.equal(app.children[0], elBuscar);
  const cuerpo = app.children[1];
  foco = elBuscar;
  for (const q of ['n', 'nv', 'nvd', 'nvda', 'nv', 'sin coincidencias', '']) {
    elBuscar.value = q;
    vm.runInContext('actualizarCapitalizacion()', contexto);
    assert.equal(foco, elBuscar, 'se conserva el foco con ' + q);
    assert.equal(app.children[0], elBuscar);
    assert.equal(app.children[1], cuerpo);
    assert.ok(cuerpo.children.slice(1).every(e => (e.codigo + ' ' + e.nombre).toLowerCase().includes(q)));
    if (q === 'nvda') assert.deepEqual(cuerpo.children.slice(1).map(e => e.codigo), ['NVDA']);
    if (q === '') assert.deepEqual(cuerpo.children.slice(1).map(e => e.codigo), ['NVDA', 'AAPL', 'NU']);
  }
});

test('el evento input usa la actualización local de Capitalización y no ruta()', () => {
  const evento = html.slice(html.indexOf("elBuscar.addEventListener('input'"), html.indexOf('// Volver al inicio desde el título'));
  assert.match(evento, /if \(location.hash.endsWith\('\/capitalizacion'\)\) \{ actualizarCapitalizacion\(\); return; \}/);
  assert.match(evento, /actualizarRachas\(\)/);
  assert.doesNotMatch(evento, /actualizarPersistencia/);
});
