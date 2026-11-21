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

test('mantener activo avanza cada 100ms, suelta sin paso duplicado y se detiene en extremo', () => {
  const anterior = global.document, tiempos = [], cancelados = new Set(); let llamados = 0;
  global.document = { createElement: (tag) => new Elemento(tag) };
  try {
    const selector = { selectedIndex: 0, options: Array(15) }; let pasos;
    pasos = montarPasos(selector, 'Activo', (i) => { selector.selectedIndex = i; llamados++; pasos.actualizar(); }, {
      repetir: true, programar: (fn, ms) => { tiempos.push({ fn, ms }); return tiempos.length; }, cancelar: (id) => cancelados.add(id),
    });
    const [previo,, siguiente] = pasos.grupo.hijos;
    siguiente.onpointerdown({ button: 0, pointerId: 1 });
    assert.equal(selector.selectedIndex, 1); assert.equal(tiempos[0].ms, 100);
    for (let i = 0; i < 9; i++) tiempos[i].fn();
    assert.equal(selector.selectedIndex, 10); assert.equal(llamados, 10);
    siguiente.onpointerup(); assert.ok(cancelados.has(10));
    siguiente.onclick({ detail: 1 }); assert.equal(llamados, 10);
    tiempos[9].fn(); assert.equal(llamados, 10); // callback ya encolado no revive
    siguiente.onclick({ detail: 0 }); assert.equal(llamados, 11); // teclado
    siguiente.onpointerdown({ button: 0 });
    for (let i = 10; i < tiempos.length && i < 40; i++) tiempos[i].fn();
    assert.equal(selector.selectedIndex, 14); assert.equal(siguiente.disabled, true);
    const antes = llamados; siguiente.onpointerdown({ button: 0 }); assert.equal(llamados, antes);
    previo.onpointerdown({ button: 0 }); assert.equal(selector.selectedIndex, 13);
    pasos.desmontar(); tiempos.at(-1).fn(); assert.equal(selector.selectedIndex, 13);
  } finally { global.document = anterior; }
});

test('cancelar puntero detiene recorrido; modo sin repetición conserva un paso por clic', () => {
  const anterior = global.document, tiempos = []; global.document = { createElement: (tag) => new Elemento(tag) };
  try {
    const selector = { selectedIndex: 5, options: Array(20) }; let pasos;
    pasos = montarPasos(selector, 'Activo', (i) => { selector.selectedIndex = i; pasos.actualizar(); }, { repetir: true, programar: (fn) => { tiempos.push(fn); return 1; }, cancelar: () => {} });
    const previo = pasos.grupo.hijos[0]; previo.onpointerdown({ button: 2 }); assert.equal(selector.selectedIndex, 5);
    previo.onpointerdown({ button: 0 }); assert.equal(selector.selectedIndex, 4);
    previo.onpointercancel(); tiempos[0](); assert.equal(selector.selectedIndex, 4);
    const lecturas = montarPasos(selector, 'Lectura', (i) => { selector.selectedIndex = i; });
    assert.equal(lecturas.grupo.hijos[0].onpointerdown, undefined);
    lecturas.grupo.hijos[0].onclick({ detail: 1 }); assert.equal(selector.selectedIndex, 3);
    pasos.desmontar(); lecturas.desmontar();
  } finally { global.document = anterior; }
});


for (const nombre of ['Activo', 'Lectura']) test(`${nombre}: ciclo bidireccional y pulsación sostenida comparten diez pasos por segundo`, () => {
 const antes=global.document, tiempos=[];global.document={createElement:tag=>new Elemento(tag)};
 try{
  const selector={selectedIndex:0,options:Array(3)};let pasos;
  pasos=montarPasos(selector,nombre,i=>{selector.selectedIndex=i;pasos.actualizar();},{repetir:true,ciclar:true,programar:(fn,ms)=>{tiempos.push({fn,ms});return tiempos.length;},cancelar:()=>{}});
  const previo=pasos.grupo.hijos[0], siguiente=pasos.grupo.hijos[2];
  assert.equal(previo.disabled,false);previo.onpointerdown({button:0,pointerId:1});assert.equal(selector.selectedIndex,2);
  assert.equal(tiempos[0].ms,100);tiempos[0].fn();assert.equal(selector.selectedIndex,1);
  previo.onpointerup();tiempos[1].fn();assert.equal(selector.selectedIndex,1);
  selector.selectedIndex=2;pasos.actualizar();siguiente.onpointerdown({button:0,pointerId:2});assert.equal(selector.selectedIndex,0);
  siguiente.onpointercancel();tiempos.at(-1).fn();assert.equal(selector.selectedIndex,0);
  selector.options=Array(1);selector.selectedIndex=0;pasos.actualizar();assert.equal(previo.disabled,true);assert.equal(siguiente.disabled,true);
  pasos.desmontar();
 }finally{global.document=antes;}
});


test('gris representa igualdad exacta y no comparación ausente ni redondeo', async () => {
 const {colorMovimiento}=await import('../visor-superficie.mjs');
 assert.equal(colorMovimiento(0),'#9aa0ac');
 assert.equal(colorMovimiento(null),null);
 assert.equal(colorMovimiento(.000001),'#25855c');
 assert.equal(colorMovimiento(-.000001),'#b73d40');
});


test('flechas permiten elegir explícitamente desde un selector sin selección inicial', () => {
 const b=banco(113,-1);
 assert.equal(b.selector.selectedIndex,-1);
 b.siguiente.onclick();assert.equal(b.selector.selectedIndex,0);
 const c=banco(113,-1);c.previo.onclick();assert.equal(c.selector.selectedIndex,112);
});
