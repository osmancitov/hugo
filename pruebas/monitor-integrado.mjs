import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mod = fs.readFileSync(new URL('../app/monitor.mjs', import.meta.url), 'utf8');
test('el Monitor se abre en el mismo shell: ruta /monitor/<grupo>/, botón encendido y módulo por import dinámico', () => {
  assert.ok(html.includes('id="monitor-enlace"'));
  assert.ok(html.includes("^monitor(?:\\/(empresas|fondos|cripto))?\\/?$"));
  assert.ok(html.includes("import(RAIZ+'app/monitor.mjs"));
  assert.ok(html.includes("monSalir();monSalir=()=>{};")); // al dejar el Monitor se cierra el WebSocket
  assert.ok(html.includes("u.pathname.startsWith(RAIZ + 'monitor')"));
  assert.ok(!html.includes("'#/monitor"));
});
test('el módulo conserva las fuentes y reglas del Monitor (en vivo e historial) sin duplicarlas', () => {
  for (const f of ['registros/nucleo/', 'registros/catalogo/', 'registros/intradia/', 'registros/historial-monitor/', 'wss://data-stream.binance.vision/stream']) assert.ok(mod.includes(f), f);
  assert.match(mod, /export function entrar\(/);
  assert.match(mod, /export function salir\(/);
  assert.ok(mod.includes('if (cerrado) return;')); // sin reconexión tras salir
  assert.ok(!fs.existsSync(new URL('../monitor/index.html', import.meta.url)) || !fs.readFileSync(new URL('../monitor/index.html', import.meta.url), 'utf8').includes('const REVISION_MS'));
});
test('el filtro de grupo vale también para el día cerrado y se conserva con el día', () => {
  assert.ok(mod.includes("if (grupoFiltro && grupo.toLowerCase() !== grupoFiltro) continue;")); // en vivo
  assert.ok(mod.includes("if (grupoFiltro && g.toLowerCase() !== grupoFiltro) continue;")); // día cerrado
  assert.ok(html.includes("RAIZ+'monitor/'+g[0]+'/'+location.search"));
  assert.ok(html.includes('enlazarGrupos()'));
});
test('con un grupo elegido, el resumen del día cerrado cuenta solo ese grupo y el título es Monitor de VIPs', () => {
  assert.ok(mod.includes('grupoFiltro ? resultadoGrupo()'));
  assert.ok(mod.includes('<h1>Monitor de VIPs</h1>'));
  assert.ok(!mod.includes('Monitor VIP'));
});
test('lectura en vivo: Mín / Máx de la jornada desde la vela diaria UTC, contra la misma base de la variación', () => {
  assert.ok(mod.includes('guardarExtremos(a, Number(d.k.h), Number(d.k.l))')); // máximo y mínimo acumulados desde 00:00 UTC
  assert.ok(mod.includes('<th>Mín / Máx</th>'));
  assert.ok(mod.includes('/ a.base - 1) * 100'));
  assert.ok(!mod.includes('a.altoSesion')); // no se acumula solo desde que se abre la página
});
test('Mercado: un activo del catálogo que no es VIP se dibuja resaltado en Horizontes y Variación diaria con su propia serie', () => {
  assert.ok(html.includes("cargarHorizontesCampana(u,g2,id)"));
  assert.ok(html.includes("if (extra && !ids.includes(extra)) ids.push(extra);"));
  assert.ok(html.includes("gruposVar[id]='fuera';gruposHor[id]='fuera'"));
  assert.ok(html.includes("if(sel===id){aplicarExtra();pintarVar();pintarHor();}")); // al cambiar de selección vuelve a los datos de solo VIP
});
test('Monitor sin grupo no muestra activos ni abre fuentes: espera la elección de Empresas, Fondos o Cripto', () => {
  assert.ok(html.includes("if(!grupo)return; // Monitor sin grupo"));
  assert.ok(!html.includes('monitor-elegir')); // sin título ni aviso: debajo de los botones no hay contenido
  assert.ok(html.indexOf('if(!grupo)return;') < html.indexOf("import(RAIZ+'app/monitor.mjs?v=1')")); // antes de cargar el módulo
});
test('sin compatibilidad con enlaces antiguos: ni redirecciones de rachas/persistencia ni conversión de # dentro de Mercado', () => {
  assert.ok(!html.includes("hash==='#/stock/rachas'"));
  assert.ok(!html.includes("hash==='#/cripto/rachas'"));
  assert.ok(!html.includes("replaceState(null,'',RAIZ+location.hash)"));
});
test('Mín / Máx: cero con presentación de no pérdida y ancho fijo por valor (alineación)', () => {
  assert.ok(mod.includes("s.textContent = '▲ +0.00 %'"));
  assert.ok(mod.includes('.monitor-vip .ext { display: inline-block; min-width: 9ch; text-align: right;'));
  assert.ok(mod.includes("extremo(f.minimo, 'baja')") && mod.includes("extremo(f.maximo, 'sube')"));
});
test('variación actual: el cero se presenta igual que en Mín / Máx (▲ +0.00 %, verde), sin cambiar los demás formatos', () => {
  const src = mod.slice(mod.indexOf('function fmtVariacion(v) {'), mod.indexOf('async function traerJSON'));
  const f = new Function(src + '; return fmtVariacion;')();
  assert.deepEqual(f(0), { texto: '▲ +0.00 %', clase: 'sube' });
  assert.deepEqual(f(-0.002), { texto: '▲ +0.00 %', clase: 'sube' });
  assert.deepEqual(f(0.04), { texto: '▲ +0.04 %', clase: 'sube' });
  assert.deepEqual(f(-1.14), { texto: '▼ -1.14 %', clase: 'baja' });
  assert.deepEqual(f(NaN), { texto: '—', clase: 'igual' });
});
