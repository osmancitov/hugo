// Guardia del catálogo publicado por mercado (20-nov-2026): la pasada lo genera desde el
// registro local, con nombre de la capa curada (ACTIVOS_INFO o el CATALOGO incrustado del
// visor) o del cotejo, y tipo solo curado. Un alta sin información curada se anota en ambos
// mercados tras comprobar la capa efectiva; un fallo de la lista de productos no oculta
// altas y se informa en la línea del reporte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { esRutaCatalogo, dirCatalogo, capaCuradaDesdeJson, universoLocal, generarCatalogo, faltantes, escribirCatalogo, actualizarCatalogos } from '../app/modulos/catalogo.mjs';

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

function armarIndex(dir) {
  // La capa curada del visor: BTC revisado aunque la API no dé nombre; 0G revisado con nombre
  // igual al código (caso real: no es faltante).
  const ruta = path.join(dir, 'activos-curados.json');
  fs.writeFileSync(ruta, JSON.stringify({ stock: [{ codigo: 'AAPL', nombre: 'Apple', tipo: 'empresa', edgar: 'https://www.sec.gov/x', web: 'https://www.apple.com', ficha: true, cap: 5 }], cripto: [{ codigo: 'BTC', nombre: 'Bitcoin', cap: 9 }, { codigo: '0G', nombre: '0G' }] }));
  return ruta;
}

test('ruta y carpeta del catálogo', () => {
  assert.ok(esRutaCatalogo('registros/catalogo/stock'));
  assert.ok(esRutaCatalogo('registros/catalogo/cripto'));
  assert.ok(!esRutaCatalogo('registros/catalogo/otro'));
  assert.ok(!esRutaCatalogo('registros/velas-24h/stock/ANT/2611_ANT'));
  assert.equal(dirCatalogo('/r/registros'), path.join('/r/registros', 'catalogo'));
});

test('capaCuradaDesdeJson lee el archivo de curados', () => {
  const capa = capaCuradaDesdeJson(fs.readFileSync(armarIndex(fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-capa-'))), 'utf8'));
  assert.equal(capa.cripto.get('BTC').nombre, 'Bitcoin');
  assert.equal(capa.stock.get('AAPL').tipo, 'empresa');
  assert.throws(() => capaCuradaDesdeJson('<html></html>'));
  assert.throws(() => capaCuradaDesdeJson('{"stock":[]}'));
});

test('universoLocal lee códigos y meses del registro, con piso y excluidos', () => {
  const uni = universoLocal(armarRegistro());
  assert.deepEqual(uni.stock.get('ANT'), ['2611']);
  assert.deepEqual(uni.stock.get('AAPL'), ['2608', '2611']);
  assert.ok(!uni.stock.has('VIEJO'));
  assert.deepEqual(uni.cripto.get('BTC'), ['2608']);
  assert.ok(!uni.cripto.has('EUR'));
});

test('generarCatalogo: ACTIVOS_INFO > capa curada > cotejo > código; tipo solo curado', () => {
  const uni = universoLocal(armarRegistro());
  uni.stock.set('NUEVO', ['2611']);
  uni.cripto.set('APIONLY', ['2611']);
  const capa = capaCuradaDesdeJson(fs.readFileSync(armarIndex(fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-capa-'))), 'utf8'));
  const stock = new Map(generarCatalogo('stock', uni, { NUEVO: 'Nombre Del Cotejo' }, capa).map((e) => [e.codigo, e]));
  assert.deepEqual(stock.get('ANT'), { codigo: 'ANT', nombre: 'Anthropic', tipo: 'empresa', meses: ['2611'] });
  // Los datos curados (capitalización, Gobierno, web oficial, ficha) viajan al catálogo publicado.
  assert.deepEqual(stock.get('AAPL'), { codigo: 'AAPL', nombre: 'Apple', tipo: 'empresa', cap: 5, edgar: 'https://www.sec.gov/x', web: 'https://www.apple.com', ficha: true, meses: ['2608', '2611'] });
  assert.deepEqual(stock.get('NUEVO'), { codigo: 'NUEVO', nombre: 'Nombre Del Cotejo', meses: ['2611'] });
  const cripto = new Map(generarCatalogo('cripto', uni, { APIONLY: 'Nombre Api' }, capa).map((e) => [e.codigo, e]));
  assert.equal(cripto.get('BTC').nombre, 'Bitcoin'); // de la capa curada, no del código
  assert.equal(cripto.get('APIONLY').nombre, 'Nombre Api');
  assert.equal(cripto.get('APIONLY').tipo, undefined); // tipo nunca inventado
});

test('faltantes: solo lo que no está en ninguna capa curada; nombre igual al código ya revisado no falta', () => {
  const uni = universoLocal(armarRegistro());
  uni.cripto.set('0G', ['2611']);
  uni.cripto.set('NUEVACRIP', ['2611']);
  const capa = capaCuradaDesdeJson(fs.readFileSync(armarIndex(fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-capa-'))), 'utf8'));
  const cripto = generarCatalogo('cripto', uni, {}, capa);
  assert.deepEqual(faltantes('cripto', cripto, capa), ['NUEVACRIP']); // BTC y 0G están en la capa
  const stock = generarCatalogo('stock', uni, {}, capa);
  assert.deepEqual(faltantes('stock', stock, capa), []); // ANT y AAPL con tipo efectivo
});

test('escribirCatalogo escribe una vez y luego igual; conserva la fecha de generado', () => {
  const raiz = armarRegistro();
  const activos = [{ codigo: 'ANT', nombre: 'Anthropic', tipo: 'empresa', meses: ['2611'] }];
  assert.equal(escribirCatalogo(raiz, 'stock', activos, Date.UTC(2026, 10, 20)), 'escrito');
  const j = JSON.parse(fs.readFileSync(path.join(dirCatalogo(raiz), 'stock'), 'utf8'));
  assert.equal(j.mercado, 'stock');
  assert.equal(j.generado, '2026-11-20');
  assert.deepEqual(j.activos, activos);
  assert.equal(escribirCatalogo(raiz, 'stock', activos, Date.UTC(2026, 10, 21)), 'igual');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dirCatalogo(raiz), 'stock'), 'utf8')).generado, '2026-11-20');
  assert.throws(() => escribirCatalogo(raiz, 'stock', [{ codigo: 'ANT', nombre: '', meses: ['2611'] }]));
  assert.throws(() => escribirCatalogo(raiz, 'stock', [{ codigo: 'ANT', nombre: 'Anthropic', meses: [] }]));
  assert.throws(() => escribirCatalogo(raiz, 'otro', activos));
});

test('actualizarCatalogos genera ambos mercados; la capa curada evita avisos falsos', async () => {
  const raiz = armarRegistro();
  const rutaCurados = armarIndex(raiz);
  const r = await actualizarCatalogos({ dirRaiz: raiz, rutaCurados, listarUniversoImpl: async () => ({ nombres: { stock: {}, cripto: {} } }) });
  const stock = r.lineas.find((l) => l.mercado === 'stock');
  const cripto = r.lineas.find((l) => l.mercado === 'cripto');
  assert.equal(stock.estado, 'escrito');
  assert.equal(stock.periodo, '2 activos'); // AAPL y ANT; VIEJO queda fuera por el piso
  assert.deepEqual(stock.sinInfo, []);
  assert.equal(cripto.estado, 'escrito');
  assert.deepEqual(cripto.sinInfo, []); // BTC está en la capa curada aunque la API no dio nombre
  assert.ok(!stock.aviso && !cripto.aviso);
  const j = JSON.parse(fs.readFileSync(path.join(dirCatalogo(raiz), 'cripto'), 'utf8'));
  assert.equal(j.activos.find((e) => e.codigo === 'BTC').nombre, 'Bitcoin');
});

test('si la lista de productos falla, el alta no se oculta y la línea informa el fallo', async () => {
  const raiz = armarRegistro();
  const rutaCurados = armarIndex(raiz);
  const r = await actualizarCatalogos({ dirRaiz: raiz, rutaCurados, listarUniversoImpl: async () => { throw Error('red caída'); } });
  const stock = r.lineas.find((l) => l.mercado === 'stock');
  assert.equal(stock.estado, 'escrito'); // se genera igual, con lo curado
  assert.match(stock.aviso, /lista de productos sin consultar \(red caída\)/);
  const j = JSON.parse(fs.readFileSync(path.join(dirCatalogo(raiz), 'stock'), 'utf8'));
  assert.equal(j.activos.find((e) => e.codigo === 'ANT').nombre, 'Anthropic'); // nombre curado
});

test('alta sin información curada en ninguna capa: visible por su código y anotada', async () => {
  const raiz = armarRegistro();
  fs.mkdirSync(path.join(raiz, 'velas-24h', 'cripto', 'NUEVACRIP'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'velas-24h', 'cripto', 'NUEVACRIP', '2611_NUEVACRIP'), 'x');
  const rutaCurados = armarIndex(raiz);
  const r = await actualizarCatalogos({ dirRaiz: raiz, rutaCurados, listarUniversoImpl: async () => ({ nombres: { stock: {}, cripto: {} } }) });
  const cripto = r.lineas.find((l) => l.mercado === 'cripto');
  assert.deepEqual(cripto.sinInfo, ['NUEVACRIP']);
  const j = JSON.parse(fs.readFileSync(path.join(dirCatalogo(raiz), 'cripto'), 'utf8'));
  assert.equal(j.activos.find((e) => e.codigo === 'NUEVACRIP').nombre, 'NUEVACRIP'); // visible, sin inventar
});

test('si la capa curada no se puede leer, se genera igual y la línea lo avisa', async () => {
  const raiz = armarRegistro();
  const r = await actualizarCatalogos({ dirRaiz: raiz, rutaCurados: path.join(raiz, 'no-existe.json'), listarUniversoImpl: async () => ({ nombres: { stock: {}, cripto: { BTC: 'Bitcoin' } } }) });
  const stock = r.lineas.find((l) => l.mercado === 'stock');
  assert.equal(stock.estado, 'escrito');
  assert.match(stock.aviso, /capa curada sin leer/);
  assert.deepEqual(stock.sinInfo, []); // ANT y AAPL tienen tipo vía ACTIVOS_INFO
});

test('el catálogo publicado trae los campos curados y un cripto no hereda el nombre de un stock', async () => {
  const fs = await import('node:fs');
  const leer = (m) => JSON.parse(fs.readFileSync(new URL('../registros/catalogo/' + m, import.meta.url), 'utf8')).activos;
  const cripto = Object.fromEntries(leer('cripto').map((e) => [e.codigo, e]));
  assert.equal(cripto.BB.nombre, 'BounceBit');
  assert.equal(cripto.QNT.nombre, 'Quant');
  assert.equal(cripto.STX.nombre, 'Stacks');
  const aapl = leer('stock').find((e) => e.codigo === 'AAPL');
  assert.ok(aapl.web && aapl.edgar && aapl.ficha === true);
});

// Sector retirados (24-nov-2026): referencia histórica fuera de activos; la pasada lo conserva,
// no reincorpora por carpeta y falla visible si el catálogo previo no sirve.
const SIN_RED = async () => ({ nombres: { stock: {}, cripto: {} } });
const escribirPrevio = (raiz, clase, obj) => {
  fs.mkdirSync(dirCatalogo(raiz), { recursive: true });
  fs.writeFileSync(path.join(dirCatalogo(raiz), clase), typeof obj === 'string' ? obj : JSON.stringify(obj));
};
const leerCat = (raiz, clase) => JSON.parse(fs.readFileSync(path.join(dirCatalogo(raiz), clase), 'utf8'));

test('retirados: un activo retirado con su carpeta presente no vuelve a activos y se conserva igual', async () => {
  const raiz = armarRegistro();
  const rutaCurados = armarIndex(raiz);
  const ret = [{ codigo: 'ANT', nombre: 'Anthropic', retirado: '2026-11-20' }];
  escribirPrevio(raiz, 'stock', { mercado: 'stock', generado: '2026-11-20', activos: [], retirados: ret });
  const r = await actualizarCatalogos({ dirRaiz: raiz, rutaCurados, listarUniversoImpl: SIN_RED });
  const j = leerCat(raiz, 'stock');
  assert.deepEqual(j.activos.map((e) => e.codigo), ['AAPL']);
  assert.deepEqual(j.retirados, ret);
  assert.match(r.lineas.find((l) => l.mercado === 'stock').periodo, /1 activos, 1 retirados/);
  const r2 = await actualizarCatalogos({ dirRaiz: raiz, rutaCurados, listarUniversoImpl: SIN_RED }); // idempotente
  assert.equal(r2.lineas.find((l) => l.mercado === 'stock').estado, 'igual');
  assert.deepEqual(leerCat(raiz, 'stock').retirados, ret);
});

test('retirados: un alta nueva entra sola aunque haya retirados', async () => {
  const raiz = armarRegistro();
  const rutaCurados = armarIndex(raiz);
  escribirPrevio(raiz, 'cripto', { mercado: 'cripto', generado: '2026-11-20', activos: [], retirados: [{ codigo: 'BTC', nombre: 'Bitcoin', retirado: '2026-11-20' }] });
  fs.mkdirSync(path.join(raiz, 'velas-24h', 'cripto', 'NUEVA'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'velas-24h', 'cripto', 'NUEVA', '2611_NUEVA'), 'x');
  await actualizarCatalogos({ dirRaiz: raiz, rutaCurados, listarUniversoImpl: SIN_RED });
  assert.deepEqual(leerCat(raiz, 'cripto').activos.map((e) => e.codigo), ['NUEVA']);
});

test('retirados: sin la clave, el catálogo se escribe como siempre (sin campo nuevo)', async () => {
  const raiz = armarRegistro();
  await actualizarCatalogos({ dirRaiz: raiz, rutaCurados: armarIndex(raiz), listarUniversoImpl: SIN_RED });
  assert.equal('retirados' in leerCat(raiz, 'stock'), false);
});

test('retirados: catálogo previo ilegible o con retirados inválidos no se regenera (fail-closed)', async () => {
  for (const previo of ['{no es json', { mercado: 'stock', generado: 'x', activos: [], retirados: 'mal' }, { mercado: 'stock', generado: 'x', activos: [], retirados: [{ codigo: 'ANT', nombre: 'A', retirado: 'ayer' }] }]) {
    const raiz = armarRegistro();
    escribirPrevio(raiz, 'stock', previo);
    const antes = fs.readFileSync(path.join(dirCatalogo(raiz), 'stock'), 'utf8');
    const r = await actualizarCatalogos({ dirRaiz: raiz, rutaCurados: armarIndex(raiz), listarUniversoImpl: SIN_RED });
    const l = r.lineas.find((x) => x.mercado === 'stock');
    assert.equal(l.estado, 'error');
    assert.match(l.error, /no regenero/);
    assert.equal(fs.readFileSync(path.join(dirCatalogo(raiz), 'stock'), 'utf8'), antes); // intacto
    assert.equal(r.lineas.find((x) => x.mercado === 'cripto').estado, 'escrito'); // el otro mercado sigue
  }
});

test('retirados: validarCatalogo acepta retirados válidos y rechaza solape con activos', async () => {
  const { validarCatalogo } = await import('../app/modulos/catalogo.mjs');
  const base = { mercado: 'stock', generado: '2026-11-24', activos: [{ codigo: 'AAPL', nombre: 'Apple', meses: ['2611'] }] };
  assert.equal(validarCatalogo(JSON.stringify({ ...base, retirados: [{ codigo: 'ANT', nombre: 'Anthropic', retirado: '2026-11-20' }] })), 1);
  assert.throws(() => validarCatalogo(JSON.stringify({ ...base, retirados: [{ codigo: 'AAPL', nombre: 'Apple', retirado: '2026-11-20' }] })), /a la vez/);
  assert.throws(() => validarCatalogo(JSON.stringify({ ...base, retirados: [{ codigo: 'ANT', nombre: 'A', retirado: 'x' }] })), /retirados inválida/);
});

test('retirados: vigencia y el inventario ignoran a los retirados', async () => {
  const { vigentes } = await import('../app/modulos/vigencia.mjs');
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-ret-vig-'));
  fs.mkdirSync(path.join(raiz, 'velas-24h'), { recursive: true });
  escribirPrevio(raiz, 'stock', { mercado: 'stock', generado: 'x', activos: [{ codigo: 'AAPL', nombre: 'Apple', meses: ['2611'] }], retirados: [{ codigo: 'ANT', nombre: 'Anthropic', retirado: '2026-11-20' }] });
  assert.deepEqual([...vigentes(path.join(raiz, 'velas-24h'), 'stock')], ['AAPL']);
});
