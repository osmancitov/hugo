// Registro horario de cripto: universo de admitidos, símbolos, lecturas válidas y aislamiento de stocks.
import { cubeta, RITMO_MIN } from '../app/modulos/ritmo-vip.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generarBarra } from '../app/modulos/barra-movil.mjs';
import { admitidosCripto, estadoDiaCripto, guardarLecturaCripto, simboloCripto, rutaDiaCripto } from '../app/modulos/registro-cripto.mjs';
import { INICIO_CRIPTO } from '../app/modulos/registro-cripto.mjs';
import { leerDia } from '../app/modulos/intradia-datos.mjs';

function arbol() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cripto-'));
  const raiz = path.join(base, 'registros');
  const w = (r, t) => { fs.mkdirSync(path.dirname(path.join(raiz, r)), { recursive: true }); fs.writeFileSync(path.join(raiz, r), t); };
  w('catalogo/cripto', JSON.stringify({ mercado: 'cripto', activos: ['BNB', 'BTC', 'ETH', 'SOL', 'XRP', '牛来'].map((codigo) => ({ codigo })) }));
  for (const c of ['BNB', 'BTC', 'ETH', 'SOL', 'XRP', '牛来']) fs.mkdirSync(path.join(raiz, 'velas-24h', 'cripto', c), { recursive: true });
  const cl = (l) => JSON.stringify({ clasificados: l.map(([id, grupo]) => ({ id, grupo })) });
  w('categorias/261026-261124_carrera-30d', cl([['cripto:BNB', 'premium'], ['cripto:BTC', 'rezagados'], ['stock:AAPL', 'premium']]));
  w('categorias/261026-261124_carrera-60d', cl([['cripto:BNB', 'constantes'], ['cripto:ETH', 'potentes'], ['cripto:XRP', 'rezagados']]));
  w('categorias/261026-261124_carrera-90d', cl([['cripto:SOL', 'constantes'], ['cripto:牛来', 'premium'], ['cripto:BTC', 'rezagados']]));
  return raiz;
}
const t = (symbol, o, l, ot, ct) => ({ symbol, openPrice: String(o), lastPrice: String(l), openTime: ot, closeTime: ct });
const falso = (visto) => async (url) => {
  const sims = JSON.parse(decodeURIComponent(url.match(/symbols=([^&]+)/)[1])); visto.push(...sims);
  return { ok: true, status: 200, text: async () => JSON.stringify(sims.map((s, i) => t(s, 10, i % 2 ? 9 : 11, 1000, 2000))) };
};

test('admitidos: unión de no rezagados de las tres campañas, sin duplicados ni stocks', () => {
  assert.deepEqual(admitidosCripto(arbol()), ['BNB', 'ETH', 'SOL', '牛来']);
});

test('lectura de cripto: símbolo USDT, BNB conserva su código y la lectura valida y se acumula', async () => {
  const raiz = arbol(), visto = [];
  const ahora = Date.parse('2026-11-26T00:00:03Z');
  const universo = admitidosCripto(raiz);
  const r = await generarBarra({ dirVelas: path.join(raiz, 'velas-24h'), fetchImpl: falso(visto), host: 'https://x', universo, simbolo: simboloCripto, sufijo: 'USDT', ahora });
  assert.deepEqual(visto.sort(), ['BNBUSDT', 'ETHUSDT', 'SOLUSDT', '牛来USDT']);
  const reg = guardarLecturaCripto(raiz, r.texto);
  assert.equal(reg.lecturas, 1);
  const est = estadoDiaCripto(raiz, ahora);
  assert.ok(est.horas.has(cubeta(ahora)));
  const ahora2 = Date.parse('2026-11-26T01:00:02Z');
  const r2 = await generarBarra({ dirVelas: path.join(raiz, 'velas-24h'), fetchImpl: falso([]), host: 'https://x', universo, simbolo: simboloCripto, sufijo: 'USDT', anteriorTexto: est.anteriorTexto, inicialTexto: est.inicialTexto, ahora: ahora2 });
  assert.equal(guardarLecturaCripto(raiz, r2.texto).lecturas, 2);
  const dia = leerDia(fs.readFileSync(path.join(raiz, '..', rutaDiaCripto('2026-11-26')), 'utf8'));
  assert.equal(dia.lecturas.length, 2);
  assert.ok(dia.lecturas[0].texto.includes('BNB ultimo'));
  assert.ok(dia.lecturas[0].texto.includes('牛来 ultimo'), 'un código no ASCII sobrevive al formato');
  assert.ok(!fs.existsSync(path.join(raiz, 'intradia', 'stock')));
});

test('stocks sigue igual: sin universo propio usa su símbolo BUSDT', async () => {
  const raiz = arbol(); const visto = [];
  fs.mkdirSync(path.join(raiz, 'velas-24h', 'stock', 'AAPL'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'catalogo', 'stock'), JSON.stringify({ mercado: 'stock', activos: [{ codigo: 'AAPL' }] }));
  await generarBarra({ dirVelas: path.join(raiz, 'velas-24h'), fetchImpl: falso(visto), host: 'https://x', ahora: 5000 });
  assert.deepEqual(visto, ['AAPLBUSDT']);
});

test('el registro de cripto empieza el 26-nov 00:00 UTC y la corrida anterior no escribe', async () => {
  assert.equal(new Date(INICIO_CRIPTO).toISOString(), '2026-11-26T00:00:00.000Z');
  const { spawnSync } = await import('node:child_process');
  if (Date.now() < INICIO_CRIPTO - 20 * 60000) { const r = spawnSync('node', ['.github/lectura-horaria-cripto.mjs'], { encoding: 'utf8', timeout: 30000 }); assert.match(r.stdout + r.stderr, /empieza el 2026-11-26|Ninguna fuente/); }
});

test('las tablas de las barras de cripto enlazan a cripto y leen su registro', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes("&mercado=cripto"));
  assert.ok(html.includes("'#/a/' + mercadoTabla + '/'"));
  assert.ok(html.includes('cargarDiaObservatorio(parametros.get(\'dia\')??diaUTC(ms), mercadoTabla)'));
});

test('ritmo VIP: 15 min, cubeta por intervalo (00:00 y 00:14 comparten, 00:15 no)', () => {
  assert.equal(RITMO_MIN, 15);
  const t = Date.parse('2026-11-26T00:00:00Z');
  assert.equal(cubeta(t), cubeta(t + 14 * 60000));
  assert.notEqual(cubeta(t), cubeta(t + 15 * 60000));
  assert.equal(cubeta(t + 60 * 60000) - cubeta(t), 3600000);
});

test('referencia fija: si la primera lectura del día trae un dia_cierre distinto de su último, la lectura siguiente lo conserva y se guarda', async () => {
  const raiz = arbol(), universo = admitidosCripto(raiz);
  const opts = { dirVelas: path.join(raiz, 'velas-24h'), host: 'https://x', universo, simbolo: simboloCripto, sufijo: 'USDT' };
  const r1 = await generarBarra({ ...opts, fetchImpl: falso([]), ahora: Date.parse('2026-11-26T00:00:03Z') });
  const texto1 = r1.texto.replace(/^BNB dia_cierre: .*$/m, 'BNB dia_cierre: 1.00000000');
  assert.notEqual(texto1, r1.texto);
  guardarLecturaCripto(raiz, texto1);
  const est = estadoDiaCripto(raiz, Date.parse('2026-11-26T02:00:03Z'));
  const r2 = await generarBarra({ ...opts, fetchImpl: falso([]), anteriorTexto: est.anteriorTexto, inicialTexto: est.inicialTexto, ahora: Date.parse('2026-11-26T02:00:03Z') });
  assert.match(r2.texto, /^BNB dia_cierre: 1\.00000000$/m);
  assert.equal(guardarLecturaCripto(raiz, r2.texto).lecturas, 2);
});
