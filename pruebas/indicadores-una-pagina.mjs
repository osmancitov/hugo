import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sup = fs.readFileSync(new URL('../visor-superficie.mjs', import.meta.url), 'utf8');
const unif = () => html.slice(html.indexOf('function vistaUnificada'), html.indexOf('async function ruta()'));
test('vista unificada de prueba: Fear & Greed, Iceberg 2D, barras, superficie, ficha y Campaña de 30 días, en ese orden', () => {
  const f = unif();
  const orden = ["vistaFearGreedJunto(sec(),dias)", "'iceberg-stock'", 'cajaBarras=sec', 'cSup=sec()', 'cFicha=sec'].map((t) => f.indexOf(t));
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
  assert.match(unif(), /let sel=inicial,ventana=dias/);
  assert.match(html, /\[30, '30 días'\], \[60, '60 días'\], \[90, '90 días'\]/);
  assert.match(html, /'Campaña'/);
});

test('la vista unificada muestra al principio Fear & Greed de Bolsa y de Cripto, identificados', () => {
  const f = unif();
  const j = html.slice(html.indexOf('function vistaFearGreedJunto'), html.indexOf('function vistaUnificada'));
  assert.ok(j.includes("cargarIndicador('feargreedchart-bolsa')") && j.includes("cargarIndicador('alternative-fear-greed')") && j.includes("'Bolsa'") && j.includes("'Cripto'"));
  assert.ok(f.indexOf('vistaFearGreedJunto(sec())') < f.indexOf("'iceberg-stock'"));
});
test('las crestas 3D solo se activan en la vista unificada; la superficie original conserva su dibujo', () => {
  assert.match(sup, /crestas = false/);
  assert.equal(html.match(/crestas: Boolean\(en\)/g)?.length, 1);
  assert.match(sup, /if \(crestas\) \{/);
  assert.match(sup, /pared\.f\(-1, v \/ maximo\)/);
});
test('la escala de altura de las crestas es fija (no depende del máximo de la pantalla) y satura en ±15 %', async () => {
  const { colorAltura, ESCALA_ALTURA } = await import('../visor-superficie.mjs');
  assert.equal(ESCALA_ALTURA.length, 11);
  assert.equal(colorAltura(15.01), colorAltura(80));
  assert.equal(colorAltura(-15), colorAltura(-60));
  assert.notEqual(colorAltura(5), colorAltura(-5));
  assert.equal(colorAltura(0), '#00' + '00' + '00');
  assert.equal(colorAltura(15), '#00ff00');
  assert.equal(colorAltura(-15), '#ff0000');
});

test('Mercado: el período 30/60/90 se elige primero y manda sobre F&G, Campaña y ficha; la superficie sigue diaria', () => {
  assert.ok(html.includes("const mu=hash.match(/^#\\/unificada(?:\\/(90|60|30)d)?"));
  assert.ok(html.includes('Number(mu[1])'));
  assert.ok(html.includes('cFicha,ventana||90'));
  assert.ok(html.includes('recortarSerie(s,n)'));
});
