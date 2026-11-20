// Guardia del visor (20-nov-2026): la cobertura del catálogo sale del archivo publicado por
// la sincronización (registros/catalogo/<mercado>); el CATALOGO incrustado queda como capa de
// metadatos curados y como respaldo completo si el archivo no se puede leer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('el visor lee el catálogo publicado y mantiene el respaldo incrustado', () => {
  for (const marca of ['registros/catalogo', 'cargarCatalogoPublicado', 'CATALOGO_VIVO']) assert.ok(src.includes(marca), marca);
  // Respaldo: si el archivo publicado no se puede leer, la cobertura es la incrustada de siempre.
  assert.ok(/CATALOGO_VIVO\s*=\s*await cargarCatalogoPublicado\(\)\.catch\(\(\)\s*=>\s*null\)\s*\|\|\s*CATALOGO/.test(src), 'respaldo incrustado');
  // La capa curada aporta cap y la ficha EDGAR; el tipo nunca se inventa.
  assert.ok(/cap:\s*c\.cap/.test(src), 'capa curada');
  // La cobertura ya no sale del literal incrustado: sale del catálogo vivo.
  assert.ok(src.includes("CATALOGO_VIVO.cripto.map((e) => ({ ...e, clase: 'cripto' }))"), 'cobertura viva cripto');
  assert.ok(src.includes("CATALOGO_VIVO.stock.map((e) => ({ ...e, clase: 'stock' }))"), 'cobertura viva stock');
  assert.ok(!src.includes("CATALOGO.cripto.map((e) => ({ ...e, clase"), 'el literal ya no da cobertura');
  assert.ok(!src.includes("CATALOGO.stock.map((e) => ({ ...e, clase"), 'el literal ya no da cobertura');
});
