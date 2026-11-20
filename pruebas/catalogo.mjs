// Guardia del catálogo publicado por mercado (20-nov-2026): la pasada lo genera desde el
// registro local, con nombre del cotejo y tipo curado; un alta sin información curada se
// anota en el reporte y nunca se oculta ni se inventa su tipo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { esRutaCatalogo, dirCatalogo, universoLocal, generarCatalogo, escribirCatalogo, actualizarCatalogos } from '../app/modulos/catalogo.mjs';

function armarRegistro() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-catalogo-'));
  const v = (clase, cod, mes) => {
    fs.mkdirSync(path.join(raiz, 'velas-24h', clase, cod), { recursive: true });
    fs.writeFileSync(path.join(raiz, 'velas-24h', clase, cod, `${mes}_${cod}`), 'x');
  };
  v('stock', 'ANT', '2611');
  v('stock', 'AAPL', '2608'); v('stock', 'AAPL', '2611');
  v('stock', 'VIEJO', '2607'); // bajo el piso: no participa
  v('cripto', 'BTC', '2608');
  v('cripto', 'EUR', '2611'); // excluido: no participa
  fs.writeFileSync(path.join(raiz, 'velas-24h', 'stock', 'AAPL', 'notas.txt'), 'x'); // forma inválida
  return raiz;
}

test('ruta y carpeta del catálogo', () => {
  assert.ok(esRutaCatalogo('registros/catalogo/stock'));
  assert.ok(esRutaCatalogo('registros/catalogo/cripto'));
  assert.ok(!esRutaCatalogo('registros/catalogo/otro'));
  assert.ok(!esRutaCatalogo('registros/velas-24h/stock/ANT/2611_ANT'));
  assert.equal(dirCatalogo('/r/registros'), path.join('/r/registros', 'catalogo'));
});

test('universoLocal lee códigos y meses del registro, con piso y excluidos', () => {
  const uni = universoLocal(armarRegistro());
  assert.deepEqual(uni.stock.get('ANT'), ['2611']);
  assert.deepEqual(uni.stock.get('AAPL'), ['2608', '2611']);
  assert.ok(!uni.stock.has('VIEJO'));
  assert.deepEqual(uni.cripto.get('BTC'), ['2608']);
  assert.ok(!uni.cripto.has('EUR'));
});

test('generarCatalogo: nombre curado > cotejo > código; tipo solo curado', () => {
  const uni = universoLocal(armarRegistro());
  uni.stock.set('NUEVO', ['2611']);
  uni.stock.set('MUDO', ['2611']);
  const entradas = generarCatalogo('stock', uni, { NUEVO: 'Nombre Del Cotejo' });
  const porCodigo = new Map(entradas.map((e) => [e.codigo, e]));
  assert.deepEqual(porCodigo.get('ANT'), { codigo: 'ANT', nombre: 'Anthropic', tipo: 'empresa', meses: ['2611'] });
  assert.deepEqual(porCodigo.get('NUEVO'), { codigo: 'NUEVO', nombre: 'Nombre Del Cotejo', meses: ['2611'] });
  assert.deepEqual(porCodigo.get('MUDO'), { codigo: 'MUDO', nombre: 'MUDO', meses: ['2611'] });
  assert.deepEqual([...entradas.map((e) => e.codigo)], [...entradas.map((e) => e.codigo)].sort((a, b) => a.localeCompare(b)));
});

test('escribirCatalogo escribe una vez y luego igual; valida la forma', () => {
  const raiz = armarRegistro();
  const activos = [{ codigo: 'ANT', nombre: 'Anthropic', tipo: 'empresa', meses: ['2611'] }];
  assert.equal(escribirCatalogo(raiz, 'stock', activos), 'escrito');
  const j = JSON.parse(fs.readFileSync(path.join(dirCatalogo(raiz), 'stock'), 'utf8'));
  assert.equal(j.mercado, 'stock');
  assert.deepEqual(j.activos, activos);
  assert.equal(escribirCatalogo(raiz, 'stock', activos), 'igual');
  assert.throws(() => escribirCatalogo(raiz, 'stock', [{ codigo: 'ANT', nombre: '', meses: ['2611'] }]));
  assert.throws(() => escribirCatalogo(raiz, 'stock', [{ codigo: 'ANT', nombre: 'Anthropic', meses: [] }]));
  assert.throws(() => escribirCatalogo(raiz, 'otro', activos));
});

test('actualizarCatalogos genera ambos mercados y anota la información curada pendiente', async () => {
  const raiz = armarRegistro();
  const r = await actualizarCatalogos({ dirRaiz: raiz, listarUniversoImpl: async () => ({ nombres: { stock: { ANT: 'Anthropic (del cotejo)' }, cripto: { BTC: 'Bitcoin' } } }) });
  const stock = r.lineas.find((l) => l.mercado === 'stock');
  const cripto = r.lineas.find((l) => l.mercado === 'cripto');
  assert.equal(stock.estado, 'escrito');
  assert.equal(stock.periodo, '2 activos'); // AAPL y ANT; VIEJO queda fuera por el piso
  assert.deepEqual(stock.sinInfo, []); // ANT ya tiene tipo curado; AAPL también
  assert.equal(cripto.estado, 'escrito');
  assert.deepEqual(cripto.sinInfo, []); // BTC tiene nombre del cotejo
  // El nombre curado gana sobre el del cotejo.
  const j = JSON.parse(fs.readFileSync(path.join(dirCatalogo(raiz), 'stock'), 'utf8'));
  assert.equal(j.activos.find((e) => e.codigo === 'ANT').nombre, 'Anthropic');
});

test('actualizarCatalogos sin la lista de productos se anota y no pisa lo publicado', async () => {
  const raiz = armarRegistro();
  escribirCatalogo(raiz, 'stock', [{ codigo: 'ANT', nombre: 'Anthropic', tipo: 'empresa', meses: ['2611'] }]);
  const antes = fs.readFileSync(path.join(dirCatalogo(raiz), 'stock'), 'utf8');
  const r = await actualizarCatalogos({ dirRaiz: raiz, listarUniversoImpl: async () => { throw Error('red caída'); } });
  assert.equal(r.lineas.length, 2);
  assert.ok(r.lineas.every((l) => l.estado === 'error' && /red caída/.test(l.error)));
  assert.equal(fs.readFileSync(path.join(dirCatalogo(raiz), 'stock'), 'utf8'), antes);
  assert.ok(!fs.existsSync(path.join(dirCatalogo(raiz), 'cripto')));
});

test('actualizarCatalogos anota un alta sin información curada', async () => {
  const raiz = armarRegistro();
  fs.mkdirSync(path.join(raiz, 'velas-24h', 'stock', 'NUEVO'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'velas-24h', 'stock', 'NUEVO', '2611_NUEVO'), 'x');
  const r = await actualizarCatalogos({ dirRaiz: raiz, listarUniversoImpl: async () => ({ nombres: { stock: {}, cripto: { BTC: 'Bitcoin' } } }) });
  const stock = r.lineas.find((l) => l.mercado === 'stock');
  assert.deepEqual(stock.sinInfo, ['NUEVO']); // sin ACTIVOS_INFO no hay tipo; el cotejo no trajo nombre
  const j = JSON.parse(fs.readFileSync(path.join(dirCatalogo(raiz), 'stock'), 'utf8'));
  assert.equal(j.activos.find((e) => e.codigo === 'NUEVO').nombre, 'NUEVO'); // visible por su código, sin inventar
});
