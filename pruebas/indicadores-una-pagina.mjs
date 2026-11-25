import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sup = fs.readFileSync(new URL('../visor-superficie.mjs', import.meta.url), 'utf8');
const unif = () => html.slice(html.indexOf('function vistaUnificada'), html.indexOf('async function ruta()'));
test('vista unificada de prueba: Fear & Greed, Iceberg 2D, barras, superficie, ficha y Campaña de 30 días, en ese orden', () => {
  const f = unif();
  const orden = ["'feargreedchart-bolsa'", "'iceberg-stock'", 'cajaBarras=sec', 'cSup=sec()', 'cFicha=sec'].map((t) => f.indexOf(t));
  assert.ok(orden.every((i) => i >= 0), String(orden));
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
});
test('la vista unificada no sustituye páginas: la superficie, el Iceberg y la Campaña conservan sus rutas', () => {
  assert.match(html, /if\(hash==='#\/i\/iceberg-stock\/superficie'\)\{vistaSuperficie\(\);return;\}/);
  assert.match(html, /\^#\\\/unificada/);
});
test('las tres barras van en orden: 24 horas, desde la referencia, contra la lectura anterior', () => {
  const a = html.indexOf("'#/i/iceberg-stock/barra-24h'"), b = html.indexOf("'#/i/iceberg-stock/barra-dia'"), c = html.indexOf("'#/i/iceberg-stock/barra-movimiento'");
  assert.ok(a > 0 && a < b && b < c);
});
test('el activo elegido se refleja entre superficie, Campaña y ficha', () => {
  const f = unif();
  assert.match(f, /puente\.elegirSup\(/); assert.match(f, /puente\.elegirCamp\(/); assert.match(f, /pintarFicha\(\)/);
  assert.match(sup, /elegirActivo: elegirDesdeFuera/);
});
test('en la vista unificada el nombre del activo va encima de la superficie; en la página de siempre queda debajo', () => {
  assert.match(sup, /tituloArriba \? \[controles, detalle, canvas\] : \[controles, canvas, detalle\]/);
});

test('la superficie elige acciones; la Campaña también puede elegir cripto (sin lectura horaria se avisa); botones sin opción previa', () => {
  assert.match(unif(), /alElegir:\(id\)=>elegido\(id,'camp'\)/);
  assert.match(unif(), /let sel=inicial,ventana=null/);
  assert.match(html, /\[30, '30 días'\], \[60, '60 días'\], \[90, '90 días'\]/);
  assert.match(html, /'Campaña'/);
});

test('la vista unificada muestra al principio Fear & Greed de Bolsa y de Cripto, identificados', () => {
  const f = unif();
  assert.ok(f.indexOf("'feargreedchart-bolsa',sec(),'Bolsa'") > 0 && f.indexOf("'alternative-fear-greed',sec(),'Cripto'") > f.indexOf("'Bolsa'"));
  assert.ok(f.indexOf("'Cripto'") < f.indexOf("'iceberg-stock'"));
});
