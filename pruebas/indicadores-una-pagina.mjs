import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sup = fs.readFileSync(new URL('../visor-superficie.mjs', import.meta.url), 'utf8');
const unif = () => html.slice(html.indexOf('function vistaMercado'), html.indexOf('async function ruta()'));
test('la vista Mercado mantiene el orden de componentes, con el Relieve tras las barras y la ficha del activo al final (26-nov-2026)', () => {
  const f = unif();
  const orden = ["cLista=sec('mercado-lista')", "tituloVIP=Object.assign", 'vistaBalanceGrupo(sec()', 'cajaBarras=sec', 'cSup=sec()', "cCamp=sec('mercado-camp')", "cFicha=sec('ficha-mercado')"].map((t) => f.indexOf(t));
  assert.ok(orden.every((i) => i >= 0), String(orden));
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  assert.ok(!f.includes('app.append(cSup,aviso2)'));
});
test('la vista de Mercado no sustituye páginas: la superficie, el Iceberg y la Campaña conservan sus rutas', () => {
  assert.match(html, /if\(hash==='#\/i\/iceberg-stock\/superficie'\)\{vistaSuperficie\(\);return;\}/);
  assert.match(html, /\^mercado\\\/\(cripto\|stock\)/);
});
test('las tres barras van en orden: 24 horas, desde la referencia, contra la lectura anterior', () => {
  const a = html.indexOf("urlIndicador('iceberg-stock/barra-24h'"), b = html.indexOf("urlIndicador('iceberg-stock/barra-dia'"), c = html.indexOf("urlIndicador('iceberg-stock/barra-movimiento'");
  assert.ok(a > 0 && a < b && b < c);
});
test('el activo elegido se refleja entre superficie, Campaña y ficha', () => {
  const f = unif();
  assert.match(f, /puente\.elegirSup\(/); assert.match(f, /puente\.elegirCamp\(/); assert.match(f, /pintarFicha\(\)/);
  assert.match(sup, /elegirActivo: elegirDesdeFuera/);
});
test('en la vista de Mercado no hay título del activo junto a la superficie: el punto elegido se identifica dentro de la gráfica (26-nov-2026)', () => {
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
  const j = html.slice(html.indexOf('function vistaFearGreedJunto'), html.indexOf('function vistaMercado'));
  assert.ok(j.includes("cargarIndicador('feargreedchart-bolsa')") && j.includes("cargarIndicador('alternative-fear-greed')") && j.includes("'Bolsa'") && j.includes("'Cripto'"));
  assert.ok(!f.includes('vistaFearGreedJunto(sec()')); // retirado de Mercado (26-nov-2026)
});
test('las crestas 3D solo se activan en la vista de Mercado; la superficie original conserva su dibujo', () => {
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
  for (const t of ["'Evolución de campaña'", "'Potencia y constancia'", "'Campaña'", "'Variación diaria'", "'Balance del día'", "'Relieve del día'"]) assert.ok(html.includes(t), t);
  assert.ok(!html.includes('Variación diaria · ${N}'));
  assert.ok(!html.includes("'El campo'"));
});
test('la ficha del activo no repite el tipo y su línea amarilla queda bajo código y nombre (26-nov-2026)', () => {
  assert.ok(!html.includes('tipo-activo'));
  assert.match(html, /\.ficha-mercado \.ficha h2 \{ font-size: 2rem; border-bottom: 1px solid var\(--oro\)/);
});
test('la escala de altura de las crestas es simétrica y relativa al mayor valor absoluto (por defecto ±15 %)', async () => {
  const { colorAltura, ESCALA_ALTURA } = await import('../visor-superficie.mjs');
  assert.equal(ESCALA_ALTURA.length, 11);
  assert.equal(colorAltura(15.01), colorAltura(80));
  assert.equal(colorAltura(-15), colorAltura(-60));
  assert.notEqual(colorAltura(5), colorAltura(-5));
  assert.equal(colorAltura(0), '#00' + '00' + '00');
  assert.equal(colorAltura(15), '#00ff00');
  assert.equal(colorAltura(-15), '#ff0000');
  const { topeAltura } = await import('../visor-superficie.mjs');
  { const t = topeAltura([3, -1, 0.5]); assert.equal(t, 3); assert.equal(colorAltura(3, t), '#00ff00'); assert.notEqual(colorAltura(-1, t), '#ff0000'); }
  { const t = topeAltura([2, -8, 1]); assert.equal(t, 8); assert.equal(colorAltura(-8, t), '#ff0000'); assert.notEqual(colorAltura(2, t), '#00ff00'); }
  { const t = topeAltura([0.1, -0.04, 0.02]); assert.equal(t, 0.1); assert.equal(colorAltura(0.1, t), '#00ff00'); assert.ok(colorAltura(-0.04, t) !== colorAltura(0, t)); }
  { const t = topeAltura([0, 0]); assert.equal(colorAltura(0, t), '#000000'); }
  assert.equal(colorAltura(4, 4), '#00ff00');
  assert.equal(colorAltura(-4, 4), '#ff0000');
  assert.equal(colorAltura(-2, 4), colorAltura(-2, 4));
  assert.notEqual(colorAltura(2, 4), colorAltura(2, 15));
});

test('Mercado: grupo VIP y período fijo de 30 días', () => {
  assert.ok(html.includes("const muG=muA?null:ph.match(/^mercado(?:\\/(empresas|fondos|cripto))?\\/?$/)"));
  assert.ok(html.includes("urlMercado(g[0])"));
  assert.ok(html.includes("vistaMercado(muA?muA[1]+':'+decodeURIComponent(muA[2]):null,30,g2Ruta)"));
  assert.ok(!html.includes('unificada/30d'));
});
test('Mercado siempre reserva las cuatro barras: la que falta queda marcada «sin datos» (26-nov-2026)', () => {
  assert.ok(html.includes("barra-movil-vacia") && html.includes("'sin datos'"));
  assert.equal(html.match(/else if \(sinFuente\) caja\.append\(vacia\(/g)?.length, 3);
});
test('Balance del día traza al entrar en pantalla y el Relieve de Mercado abre con zoom máximo (audio 26-nov-2026 12:35)', () => {
  assert.match(html, /alEntrar: Boolean\(limpio && e\.iceberg\)/);
  assert.match(html, /alEntrar: true,\n/);
  assert.match(html, /cfg\.alEntrar && !movimientoReducido\(\)/);
  assert.match(sup, /zoom = crestas \? 2 : 1/);
  assert.match(sup, /acercar\.value = crestas \? '2' : '1'/);
});
test('Toda gráfica con trazado lo muestra al entrar en pantalla: graficador común y las tres de líneas SVG (audio 26-nov-2026 12:52)', () => {
  assert.match(html, /cfg\.alEntrar && !movimientoReducido\(\)/);
  assert.match(html, /function trazadoAlEntrar\(caja,svg,selector\)/);
  assert.equal(html.match(/trazadoAlEntrar\(caja,svg,'\./g)?.length, 5); // Evolución, Horizontes, Horizontes P/C, Potencia y constancia y la del activo
  for (const sel of ['.camp-lin', '.camp-curva']) assert.ok(html.includes(`trazadoAlEntrar(caja,svg,'${sel}')`));
});
test('Elegir en la lista no mueve la vista y el batazo de Campaña espera a que el campo entre en pantalla (audio 26-nov-2026 12:54)', () => {
  assert.ok(!/if\(sel&&irA\)/.test(html));
  assert.ok(!/window\.scrollTo\(0,Math\.max\(0,scrollY\+r\.top/.test(html));
  assert.match(html, /caja\._ioBola=io;io\.observe\(svg\)/);
  assert.match(html, /campoUltimaBola=seleccion;if\(caja\.isConnected\)traza\.trazar\(\)/);
});
