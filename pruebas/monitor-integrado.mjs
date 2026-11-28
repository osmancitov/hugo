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
