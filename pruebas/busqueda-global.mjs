import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('function coincidenciasGlobales('), html.indexOf('\nfunction pintarBusquedaGlobal('));
const catalogo = [
  {codigo:'NU', nombre:'Nubank',clase:'stock',tipo:'empresa'},
  {codigo:'SPY',nombre:'SPDR S&P 500 ETF',clase:'stock',tipo:'fondo ETF'},
  {codigo:'BTC',nombre:'Bitcoin',clase:'cripto'},
  {codigo:'WBTC',nombre:'Wrapped Bitcoin',clase:'cripto'},
  {codigo:'N',nombre:'Crédito Núcleo',clase:'stock',tipo:'empresa'},
];
const ctx = vm.createContext({TODOS:catalogo});
vm.runInContext(source,ctx);
const buscar = q => Array.from(vm.runInContext('coincidenciasGlobales('+JSON.stringify(q)+')',ctx),e=>e.codigo);
test('busca todo el catálogo sin conocer mercado ni categoría',()=>{
  assert.deepEqual(buscar('nu'),['NU','N']);
  assert.deepEqual(buscar('SPY'),['SPY']);
  assert.deepEqual(buscar('btc'),['BTC','WBTC']);
  assert.deepEqual(buscar('credito'),['N']);
  assert.deepEqual(buscar('  '),[]);
  assert.deepEqual(buscar('inexistente'),[]);
});
test('código exacto primero y catálogo original sin mutaciones',()=>{
  assert.deepEqual(buscar('n'),['N','BTC','NU','WBTC']);
  assert.deepEqual(catalogo.map(e=>e.codigo),['NU','SPY','BTC','WBTC','N']);
});
test('localizador separado de filtros y rankings, tras la navegación',()=>{
  assert.ok(html.indexOf('<section id="busqueda-global"') > html.indexOf('<nav class="mercados"'));
  assert.ok(html.includes("const esBusqueda=hash==='#/buscar'"));
  assert.match(html, /<section id="busqueda-global" hidden/);
  assert.match(html, /const esBusqueda=hash==='#\/buscar'/);
  assert.match(html, /!m&&!mi&&!r&&!esBusqueda/);
  assert.match(html, /getElementById\('busqueda-global'\).hidden=!esBusqueda/);
  assert.match(html,/id="buscar"[^>]+placeholder="Filtrar esta lista/);
  assert.match(html,/elBuscarGlobal.addEventListener\('input', pintarBusquedaGlobal\)/);
  const pintar = html.slice(html.indexOf('function pintarBusquedaGlobal('),html.indexOf("elBuscarGlobal.addEventListener"));
  assert.doesNotMatch(pintar,/ruta\(|location.hash\s*=|elBuscar.value\s*=/);
  assert.match(pintar,/filasGlobal.replaceChildren\(\)/);
  assert.match(pintar,/'Criptos'.*'Empresas'.*'Fondos'/);
});
test('abrir ficha conserva consulta y origen para volver',()=>{
  const abrir = html.slice(html.indexOf("filasGlobal.addEventListener('click'"),html.indexOf('/* ---------- datos'));
  assert.match(abrir,/origenLista = location.hash \|\| '#\/'/);
  assert.match(abrir,/y: window.scrollY/);
  assert.doesNotMatch(abrir,/\.value\s*=/);
});
