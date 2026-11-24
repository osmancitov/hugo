// La vigencia viene del catálogo: fuera del catálogo = fuera de vistas y cálculos, con la historia intacta.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vigentes, esVigente } from '../app/modulos/vigencia.mjs';
import { universoBarra } from '../app/modulos/barra-movil.mjs';
import { calcularIceberg } from '../app/modulos/iceberg.mjs';

function armar(catalogo) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'vig-'));
  const velas = path.join(raiz, 'velas-24h');
  for (const c of ['AAA', 'BBB', 'CCC']) {
    const d = path.join(velas, 'stock', c); fs.mkdirSync(d, { recursive: true });
    const dia = Date.parse('2026-10-01T00:00:00Z');
    const filas = [0, 1, 2].map((i) => [dia + i * 86400000, '10', '11', '9', c === 'CCC' ? '9' : '12', '1', 0, 0, 0, 0, 0, 0]);
    fs.writeFileSync(path.join(d, `2610_${c}`), JSON.stringify(filas));
  }
  if (catalogo) {
    fs.mkdirSync(path.join(raiz, 'catalogo'));
    fs.writeFileSync(path.join(raiz, 'catalogo', 'stock'), JSON.stringify({ mercado: 'stock', generado: 'x', activos: catalogo.map((codigo) => ({ codigo, nombre: codigo, meses: ['2610'] })) }));
  }
  return { raiz, velas };
}

test('sin catálogo legible cuentan todos los activos (comportamiento de antes)', () => {
  const { velas } = armar(null);
  assert.equal(vigentes(velas, 'stock'), null);
  assert.deepEqual(universoBarra(velas), ['AAA', 'BBB', 'CCC']);
});

test('un activo fuera del catálogo sale de la barra y del iceberg, y su carpeta queda intacta', () => {
  const { velas } = armar(['AAA', 'BBB']);
  assert.deepEqual([...vigentes(velas, 'stock')].sort(), ['AAA', 'BBB']);
  assert.deepEqual(universoBarra(velas), ['AAA', 'BBB']);
  assert.equal(esVigente(velas, 'stock')('CCC'), false);
  const con = calcularIceberg(velas, Date.parse('2026-10-05T00:00:00Z'), 'stock');
  const todos = armar(['AAA', 'BBB', 'CCC']);
  const sin = calcularIceberg(todos.velas, Date.parse('2026-10-05T00:00:00Z'), 'stock');
  assert.notDeepEqual(con, sin, 'CCC bajaba y cuenta solo si está en el catálogo');
  assert.ok(fs.existsSync(path.join(velas, 'stock', 'CCC', '2610_CCC')), 'la historia no se borra');
});

test('catálogo vacío o de otro mercado no vacía los cálculos', () => {
  const { raiz, velas } = armar(['AAA']);
  fs.writeFileSync(path.join(raiz, 'catalogo', 'stock'), JSON.stringify({ mercado: 'cripto', generado: 'x', activos: [{ codigo: 'AAA' }] }));
  assert.equal(vigentes(velas, 'stock'), null);
  fs.writeFileSync(path.join(raiz, 'catalogo', 'stock'), '{ roto');
  assert.equal(vigentes(velas, 'stock'), null);
});

test('la pasada genera el catálogo antes de los pre-cálculos, para que un alta cuente en la misma pasada', () => {
  const src = fs.readFileSync(new URL('../app/modulos/sincronizar-registros.mjs', import.meta.url), 'utf8');
  const cat = src.indexOf('const rCat = await cat()');
  const pre = src.indexOf('const rPre = await pre()');
  assert.ok(cat > 0 && pre > 0 && cat < pre, 'catálogo antes que pre-cálculos');
});
