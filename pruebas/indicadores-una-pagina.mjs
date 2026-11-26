import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sup = fs.readFileSync(new URL('../visor-superficie.mjs', import.meta.url), 'utf8');
const unif = () => html.slice(html.indexOf('function vistaUnificada'), html.indexOf('async function ruta()'));
test('la vista Mercado mantiene el orden de componentes, con el Relieve tras las barras y la ficha del activo al final (26-nov-2026)', () => {
  const f = unif();
  const orden = ["cLista=sec('mercado-lista')", "tituloVIP=Object.assign", 'vistaBalanceGrupo(sec()', 'cajaBarras=sec', 'cSup=sec()', "cCamp=sec('mercado-camp')", "cFicha=sec('ficha-unificada')"].map((t) => f.indexOf(t));
  assert.ok(orden.every((i) => i >= 0), String(orden));
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  assert.ok(!f.includes('app.append(cSup,aviso2)'));
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
test('en la vista unificada no hay título del activo junto a la superficie: el punto elegido se identifica dentro de la gráfica (26-nov-2026)', () => {
  assert.match(sup, /tituloArriba \? \[controles, canvas\] : \[controles, canvas, detalle\]/);
});

test('la superficie elige acciones; la Campaña también puede elegir cripto (sin lectura horaria se avisa); botones sin opción previa', () => {
  assert.match(unif(), /alElegir:\(id\)=>elegido\(id,'camp'\)/);
  assert.match(unif(), /let sel=inicial,ventana=dias/);
  assert.match(html, /\[30, '30 días'\], \[60, '60 días'\], \[90, '90 días'\]/);
  assert.match(html, /'Campaña'/);
});

test('la función Fear & Greed conserva Bolsa y Cripto identificados, pero Mercado ya no la muestra', () => {
  const f = unif();
  const j = html.slice(html.indexOf('function vistaFearGreedJunto'), html.indexOf('function vistaUnificada'));
  assert.ok(j.includes("cargarIndicador('feargreedchart-bolsa')") && j.includes("cargarIndicador('alternative-fear-greed')") && j.includes("'Bolsa'") && j.includes("'Cripto'"));
  assert.ok(!f.includes('vistaFearGreedJunto(sec()')); // retirado de Mercado (26-nov-2026)
});
test('las crestas 3D solo se activan en la vista unificada; la superficie original conserva su dibujo', () => {
  assert.match(sup, /crestas = false/);
  assert.equal(html.match(/crestas: Boolean\(en\)/g)?.length, 1);
  assert.match(sup, /if \(crestas\) \{/);
});
test('el Relieve flota sin planos de referencia ni regla; una sola etiqueta de hora, la de la lectura elegida, en la zona del eje del tiempo (26-nov-2026)', () => {
  assert.doesNotMatch(sup, /pared/);
  assert.match(sup, /proyectar\(1\.04, py\(ultima\), -1\)/);
});
test('Mercado: dos pares de flechas azules (activo en horizontal, tiempo en vertical), sin selectores a la vista (26-nov-2026)', () => {
  assert.match(sup, /crestas \? \{ clase: 'pasos-activo', simbolos: \['‹', '›'\], ocultarSelector: true \}/);
  assert.match(sup, /crestas \? \{ simbolos: \['‹', '›'\], clase: 'pasos-tiempo', ocultarSelector: true, vertical: true \}/);
  assert.match(html, /\.superficie-compacta \.superficie-pasos \.superficie-flecha \{ color: #7fb2e5/);
  assert.match(html, /flecha-girada \{ display: inline-block; transform: rotate\(90deg\); \}/);
});
test('cada gráfica de Mercado tiene su título breve en el mismo estilo, sin repetir lo que ya muestran sus datos (26-nov-2026)', () => {
  for (const t of ["'Evolución'", "'Potencia y constancia'", "'Campaña'", "'Variación diaria'", "'Balance diario'", "'Relieve del día'"]) assert.ok(html.includes(t), t);
  assert.ok(!html.includes('Variación diaria · ${N}'));
  assert.ok(!html.includes("'El campo'"));
});
test('la ficha del activo no repite el tipo y su línea amarilla queda bajo código y nombre (26-nov-2026)', () => {
  assert.ok(!html.includes('tipo-activo'));
  assert.match(html, /\.ficha-unificada \.ficha h2 \{ font-size: 2rem; border-bottom: 1px solid var\(--oro\)/);
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

test('Mercado: grupo VIP y período fijo de 30 días', () => {
  assert.ok(html.includes("const muG=muA?null:hash.match(/^#\\/unificada(?:\\/(90|60|30)d)?(?:\\/(empresas|fondos|cripto))?\\/?$/)"));
  assert.ok(html.includes("'#/unificada/30d/'+g[0]"));
  assert.ok(html.includes("vistaUnificada(muA?muA[3]+':'+decodeURIComponent(muA[4]):null,30,g2Ruta)"));
  assert.ok(html.includes("if(muG&&muG[1]&&muG[1]!=='30')"));
});
test('Mercado siempre reserva las cuatro barras: la que falta queda marcada «sin datos» (26-nov-2026)', () => {
  assert.ok(html.includes("barra-movil-vacia") && html.includes("'sin datos'"));
  assert.equal(html.match(/else if \(sinFuente\) caja\.append\(vacia\(/g)?.length, 3);
});
