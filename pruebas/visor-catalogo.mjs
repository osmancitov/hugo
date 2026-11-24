// Guardia del visor (20-nov-2026): la cobertura del catálogo sale del archivo publicado por
// la sincronización (registros/catalogo/<mercado>); el CATALOGO incrustado queda como capa de
// metadatos curados y como respaldo completo si el archivo no se puede leer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('el visor lee el catálogo publicado, sin listas propias incrustadas', () => {
  for (const marca of ['registros/catalogo', 'cargarCatalogoPublicado', 'CATALOGO_VIVO']) assert.ok(src.includes(marca), marca);
  // El catálogo es el único origen: ya no hay literales incrustados con cobertura, fichas o webs.
  for (const literal of ['const CATALOGO =', 'const FICHAS_VERIFICADAS', 'const WEB_OFICIAL']) assert.ok(!src.includes(literal), literal);
  // Los enlaces salen de los campos del catálogo.
  assert.ok(src.includes('e.ficha') && src.includes('e.web'), 'enlaces desde el catálogo');
  assert.ok(src.includes("CATALOGO_VIVO.cripto.map((e) => ({ ...e, clase: 'cripto' }))"), 'cobertura viva cripto');
  assert.ok(src.includes("CATALOGO_VIVO.stock.map((e) => ({ ...e, clase: 'stock' }))"), 'cobertura viva stock');
});

test('guardia del árbol: los indicadores van primero en stocks y cripto', () => {
  // Decisión del usuario (21-nov-2026): «Indicadores» debería ir de primero en la lista.
  const inds = src.indexOf("nodoArbol('Indicadores'");
  const emp = src.indexOf("nodoArbol('Empresas'");
  const tok = src.indexOf("nodoArbol('Token'");
  assert.ok(inds !== -1 && emp !== -1 && tok !== -1);
  assert.ok(inds < emp && inds < tok, 'los indicadores abren la lista del árbol');
  assert.match(src, /Indicadores primero en la lista, en stocks y en cripto/);
});

test('guardia de la búsqueda: teclear no roba el foco ni brinca la vista', () => {
  // Fallo del usuario (21-nov-2026): la primera letra sacaba la casilla de la vista y no
  // dejaba seguir escribiendo. La vista se redibuja bajo la casilla, que conserva foco y
  // selección, y ya no hay salto a la primera coincidencia.
  assert.match(src, /devolverFocoBuscar/);
  assert.match(src, /elBuscar\.focus\(\{ preventScroll: true \}\)/);
  assert.ok(!src.includes('scrollIntoView'), 'la búsqueda ya no mueve la vista');
});

test('volver conserva búsqueda sin autoenfoque ni desplazamiento a coincidencia', () => {
 const entrada=src.slice(src.indexOf("app.addEventListener('click'"),src.indexOf('/* ---------- catálogo'));
 assert.doesNotMatch(entrada,/elBuscar.value = ''/);
 assert.match(src,/origenLista = location.hash;/);
 assert.match(src,/if\(guardado\)requestAnimationFrame\(\(\)=>window.scrollTo\(0,guardado.y\)\)/);
 assert.doesNotMatch(src,/scrollIntoView/);
});
test('tablas de barras enlazan al histórico de stock existente y conservan origen', () => {
 assert.match(src,/enlaceActivo.href = '#\/a\/stock\/' \+ encodeURIComponent\(f.codigo\)/);
 assert.match(src,/desdeTabla\) \{ origenLista = location.hash/);
 assert.match(src,/tdA.append\(enlaceActivo\)/);
});
