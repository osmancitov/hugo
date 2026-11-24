// La vigencia viene del catálogo: fuera del catálogo = fuera de vistas y cálculos, con la historia
// intacta. Un catálogo que falta o no sirve detiene el cálculo y no cambia resultados válidos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vigentes, esVigente, exigirCatalogos } from '../app/modulos/vigencia.mjs';
import { universoBarra } from '../app/modulos/barra-movil.mjs';
import { calcularIceberg } from '../app/modulos/iceberg.mjs';
import { actualizarPreCalculos, preCalculosFrescos } from '../app/modulos/pre-calculado.mjs';

const DIA = 86400000;
const AHORA = Date.parse('2026-10-20T12:00:00Z');

function armar(catalogos = { stock: ['AAA', 'BBB', 'CCC'], cripto: ['XXX'] }) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'vig-'));
  const velas = path.join(raiz, 'velas-24h');
  const fin = Date.parse('2026-10-19T00:00:00Z');
  for (const [clase, codigos] of [['stock', ['AAA', 'BBB', 'CCC']], ['cripto', ['XXX']]]) {
    for (const c of codigos) {
      const d = path.join(velas, clase, c); fs.mkdirSync(d, { recursive: true });
      const filas = [0, 1, 2].map((i) => [fin - (2 - i) * DIA, '10', '11', '9', c === 'CCC' ? '9' : '12', '1', fin - (2 - i) * DIA + DIA - 1, '1', 1, '1', '1', '0']);
      fs.writeFileSync(path.join(d, `2610_${c}`), JSON.stringify(filas));
    }
  }
  fs.mkdirSync(path.join(raiz, 'catalogo'));
  for (const [clase, codigos] of Object.entries(catalogos)) {
    if (codigos === null) continue;
    fs.writeFileSync(path.join(raiz, 'catalogo', clase), typeof codigos === 'string' ? codigos
      : JSON.stringify({ mercado: clase, generado: 'x', activos: codigos.map((codigo) => ({ codigo, nombre: codigo, meses: ['2610'] })) }));
  }
  return { raiz, velas };
}
const arbol = (dir) => {
  const r = {};
  const ir = (d) => { for (const n of fs.existsSync(d) ? fs.readdirSync(d) : []) { const p = path.join(d, n); fs.statSync(p).isDirectory() ? ir(p) : (r[p.slice(dir.length)] = fs.readFileSync(p, 'utf8')); } };
  ir(dir); return r;
};

test('un activo fuera del catálogo sale de la barra y del iceberg, y su carpeta queda intacta', () => {
  const { velas } = armar({ stock: ['AAA', 'BBB'], cripto: ['XXX'] });
  assert.deepEqual([...vigentes(velas, 'stock')].sort(), ['AAA', 'BBB']);
  assert.deepEqual(universoBarra(velas), ['AAA', 'BBB']);
  assert.equal(esVigente(velas, 'stock')('CCC'), false);
  const con = calcularIceberg(velas, AHORA, 'stock');
  const todos = armar();
  const sin = calcularIceberg(todos.velas, AHORA, 'stock');
  assert.notDeepEqual(con, sin, 'CCC bajaba y cuenta solo si está en el catálogo');
  assert.ok(fs.existsSync(path.join(velas, 'stock', 'CCC', '2610_CCC')), 'la historia no se borra');
});

test('catálogo ausente, ilegible, vacío, de otro mercado o con códigos inválidos: error, sin filtrar con carpetas', () => {
  const casos = {
    ausente: null, ilegible: '{ roto', vacio: [],
    otroMercado: JSON.stringify({ mercado: 'cripto', generado: 'x', activos: [{ codigo: 'AAA' }] }),
    codigoInvalido: JSON.stringify({ mercado: 'stock', generado: 'x', activos: [{ codigo: '../AAA' }] }),
  };
  for (const [caso, stock] of Object.entries(casos)) {
    const { velas } = armar({ stock, cripto: ['XXX'] });
    assert.throws(() => vigentes(velas, 'stock'), /catálogo de stock/, caso);
    assert.throws(() => universoBarra(velas), /catálogo de stock/, caso);
    assert.throws(() => calcularIceberg(velas, AHORA, 'stock'), /catálogo de stock/, caso);
  }
});

test('con un mercado dañado ningún mercado se recalcula y los resultados válidos quedan como estaban', () => {
  for (const dano of ['cripto', 'stock']) {
    const ok = armar();
    actualizarPreCalculos({ dirRaiz: ok.raiz, ahora: AHORA });
    const antes = arbol(path.join(ok.raiz, 'pre-calculado')), antesR = arbol(path.join(ok.raiz, 'ranking-24h'));
    assert.ok(Object.keys(antes).length && Object.keys(antesR).length, 'había resultados válidos');
    fs.writeFileSync(path.join(ok.raiz, 'catalogo', dano), '{ roto');
    // El otro mercado cambia de verdad: si se recalculara, sus archivos cambiarían.
    const otro = dano === 'cripto' ? 'stock' : 'cripto';
    const sub = path.join(ok.raiz, 'velas-24h', otro, otro === 'stock' ? 'AAA' : 'XXX', otro === 'stock' ? '2610_AAA' : '2610_XXX');
    fs.writeFileSync(sub, JSON.stringify([[Date.parse('2026-10-19T00:00:00Z'), '10', '11', '9', '1', '1', 0, '1', 1, '1', '1', '0']]));
    assert.throws(() => actualizarPreCalculos({ dirRaiz: ok.raiz, ahora: AHORA }), new RegExp(`catálogo de ${dano}`));
    assert.deepEqual(arbol(path.join(ok.raiz, 'pre-calculado')), antes, `pre-calculado intacto (${dano} dañado)`);
    assert.deepEqual(arbol(path.join(ok.raiz, 'ranking-24h')), antesR, `ranking intacto (${dano} dañado)`);
    const f = preCalculosFrescos({ dirRaiz: ok.raiz, ahora: AHORA });
    assert.equal(f.frescos, false);
    assert.match(f.motivo, /catálogo de/);
  }
});

test('exigirCatalogos comprueba todos los mercados antes de calcular nada', () => {
  const { velas } = armar({ stock: ['AAA'], cripto: null });
  assert.throws(() => exigirCatalogos(velas, ['stock', 'cripto']), /catálogo de cripto ausente/);
});

test('la pasada genera el catálogo antes de los pre-cálculos, para que un alta cuente en la misma pasada', () => {
  const src = fs.readFileSync(new URL('../app/modulos/sincronizar-registros.mjs', import.meta.url), 'utf8');
  const cat = src.indexOf('const rCat = await cat()');
  const pre = src.indexOf('const rPre = await pre()');
  assert.ok(cat > 0 && pre > 0 && cat < pre, 'catálogo antes que pre-cálculos');
});
