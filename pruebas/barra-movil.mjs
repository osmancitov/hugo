// node --test pruebas/barra-movil.mjs. Guardia de la barra móvil 24 h de los stocks
// (decisión del usuario, 20-nov-2026): dos tandas equilibradas estables, ventana móvil de
// Binance (no el día cerrado del iceberg), plano cuenta como sube (la regla del iceberg:
// «solo es pérdida o no»), instantánea desechable que se pisa atómica, un dato por línea,
// y el bloque del visor solo en el iceberg de stocks y ausente si el archivo falta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  universoBarra, particionar, consultarTanda, calcularBarra,
  formatearBarra, leerBarra, escribirBarra, generarBarra,
  simboloStock, RUTA_BARRA,
} from '../app/modulos/barra-movil.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const ticker = (symbol, openPrice, lastPrice, openTime, closeTime) => ({ symbol, openPrice: String(openPrice), lastPrice: String(lastPrice), openTime, closeTime });

test('particionar reparte en dos tandas equilibradas y estables: la primera se lleva el sobrante', () => {
  const u113 = Array.from({ length: 113 }, (_, i) => `S${String(i).padStart(3, '0')}`);
  const [a, b] = particionar(u113);
  assert.equal(a.length, 57);
  assert.equal(b.length, 56);
  assert.deepEqual([...a, ...b], u113); // sin perder ni repetir, en orden
  assert.deepEqual(particionar(u113)[0], a); // estable: mismo universo, misma partición
  assert.deepEqual(particionar([]), [[], []]);
  const [c, d] = particionar(['A', 'B']);
  assert.deepEqual(c, ['A']);
  assert.deepEqual(d, ['B']);
});

test('simboloStock aplica la regla del registro: CODIGO + B + USDT', () => {
  assert.equal(simboloStock('AAPL'), 'AAPLBUSDT');
});

test('universoBarra lista solo carpetas de stocks, ordenadas', () => {
  const dir = tmp('hugo-barra-u-');
  try {
    const stock = path.join(dir, 'stock');
    fs.mkdirSync(path.join(stock, 'ZZZ'), { recursive: true });
    fs.mkdirSync(path.join(stock, 'AAA'), { recursive: true });
    fs.writeFileSync(path.join(stock, 'SUELTO'), '{}'); // un archivo no es un activo
    fs.mkdirSync(path.join(dir, 'cripto', 'BTC'), { recursive: true }); // otra clase no entra
    assert.deepEqual(universoBarra(dir), ['AAA', 'ZZZ']);
    assert.deepEqual(universoBarra(path.join(dir, 'no-existe')), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('consultarTanda pide la lista codificada al host dado y rechaza tandas de más de 100', async () => {
  let url = null;
  const fetchFalso = async (u) => { url = u; return { ok: true, text: async () => '[]' }; };
  await consultarTanda(['AAPL', 'MSFT'], { fetchImpl: fetchFalso, host: 'https://data-api.binance.vision' });
  assert.equal(url, 'https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' + encodeURIComponent('["AAPLBUSDT","MSFTBUSDT"]'));
  await assert.rejects(() => consultarTanda(Array.from({ length: 101 }, (_, i) => `S${i}`), { fetchImpl: fetchFalso }), /100/);
  assert.deepEqual(await consultarTanda([], { fetchImpl: fetchFalso }), []);
  const errorHttp = async () => ({ ok: false, status: 451, text: async () => '{}' });
  await assert.rejects(() => consultarTanda(['AAPL'], { fetchImpl: errorHttp }), /HTTP 451/);
  const noJson = async () => ({ ok: true, text: async () => '<html>' });
  await assert.rejects(() => consultarTanda(['AAPL'], { fetchImpl: noJson }), /JSON/);
});

test('calcularBarra: frontera suben/bajan, plano cuenta como sube, sin dato aparte y dispersión medida', () => {
  const universo = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'];
  const tandas = [[
    ticker('AAAABUSDT', 10, 11, 1000, 2000), // sube
    ticker('BBBBUSDT', 10, 9, 1000, 2500),  // baja
    ticker('CCCCUSDT', 10, 10, 1000, 1500), // plana: cuenta como sube (regla del iceberg)
    { symbol: 'DDDDUSDT', openPrice: 'x', lastPrice: '1', openTime: 1000, closeTime: 1800 }, // ilegible: sin dato
  ]];
  // EEE no respondió: también cuenta como sin dato, nunca se inventa.
  const b = calcularBarra(tandas, universo);
  assert.equal(b.suben, 2);
  assert.equal(b.bajan, 1);
  assert.equal(b.conDato, 3);
  assert.equal(b.sinDato, 2);
  assert.equal(b.consultados, 5);
  assert.equal(b.respondieron, 4);
  assert.equal(b.inicio, 1000);
  assert.equal(b.fin, 2500);
  assert.equal(b.cierreMin, 1500);
  assert.equal(b.dispersionMs, 1000); // max cierre 2500 - min cierre 1500
});

test('formatearBarra y leerBarra: ida y vuelta, un dato por línea, y el validador rechaza cuentas que no cierran', () => {
  const b = { inicio: 1763726077718, cierreMin: 1763812477718, fin: 1763814879711, dispersionMs: 2401993, consultados: 113, respondieron: 113, conDato: 113, sinDato: 0, suben: 11, bajan: 102 };
  const texto = formatearBarra(b, 1763814880000);
  const q = leerBarra(texto);
  assert.equal(q.suben, 11);
  assert.equal(q.bajan, 102);
  assert.equal(q.conDato, 113);
  assert.equal(q.consultados, 113);
  assert.equal(q.dispersionMs, 2401993);
  assert.equal(q.inicio, b.inicio);
  assert.equal(q.cierreMin, b.cierreMin);
  assert.equal(q.fin, b.fin);
  assert.throws(() => leerBarra(texto.replace('suben: 11', 'suben: 12')), /no cierran/);
  assert.throws(() => leerBarra('suben: 1\nbajan: 1\n'), /Instantanea|Fecha|NaN|undefined/);
});

test('escribirBarra escribe atómico en la ruta publicada y pisa la instantánea anterior', () => {
  const dir = tmp('hugo-barra-e-');
  try {
    const b = { inicio: 1000, cierreMin: 1500, fin: 2000, dispersionMs: 5, consultados: 2, respondieron: 2, conDato: 2, sinDato: 0, suben: 1, bajan: 1 };
    const rel1 = escribirBarra(dir, formatearBarra(b, 3000));
    assert.equal(rel1, RUTA_BARRA);
    assert.equal(rel1, 'registros/pre-calculado/stock/barra-24h/actual_barra');
    const rel2 = escribirBarra(dir, formatearBarra({ ...b, suben: 2, bajan: 0 }, 4000));
    assert.equal(rel2, rel1); // archivo vivo: mismo sitio, contenido nuevo
    assert.equal(leerBarra(fs.readFileSync(path.join(dir, 'pre-calculado', 'stock', 'barra-24h', 'actual_barra'), 'utf8')).suben, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('generarBarra: universo del registro, dos tandas, barra e instantánea en disco', async () => {
  const dir = tmp('hugo-barra-g-');
  try {
    const velas = path.join(dir, 'velas-24h');
    for (const c of ['AAA', 'BBB', 'CCC']) fs.mkdirSync(path.join(velas, 'stock', c), { recursive: true });
    const pedidas = [];
    const fetchFalso = async (u) => {
      pedidas.push(u);
      const simbolos = JSON.parse(decodeURIComponent(u.split('symbols=')[1]));
      const cuerpo = simbolos.map((s, i) => ticker(s, 10, i % 2 ? 9 : 11, 1000, 2000));
      return { ok: true, text: async () => JSON.stringify(cuerpo) };
    };
    const { barra, rel } = await generarBarra({ dirVelas: velas, fetchImpl: fetchFalso, host: 'https://data-api.binance.vision', ahora: 5000 });
    assert.equal(pedidas.length, 2); // dos tandas equilibradas: 2 + 1
    assert.equal(barra.consultados, 3);
    assert.equal(barra.suben, 2);
    assert.equal(barra.bajan, 1);
    assert.equal(rel, RUTA_BARRA);
    assert.ok(fs.existsSync(path.join(dir, 'pre-calculado', 'stock', 'barra-24h', 'actual_barra')));
    await assert.rejects(() => generarBarra({ dirVelas: path.join(dir, 'vacio'), fetchImpl: fetchFalso }), /no invento/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('guardia del visor: la barra solo en el iceberg de stocks, colores de la casa, ausente si el archivo falta', () => {
  const visor = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(visor, /registros\/pre-calculado\/stock\/barra-24h\/actual_barra/);
  assert.match(visor, /e\.codigo === 'iceberg-stock'/); // ni cripto ni otras vistas
  assert.match(visor, /if \(!r\.ok\) return null/); // sin archivo publicado, sin bloque
  assert.match(visor, /ventana móvil/);
});

test('guardia de la casa: la orden está registrada en la app y documentada en el manual', () => {
  const app = fs.readFileSync(new URL('../app/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /barra-movil\.mjs/);
  assert.match(app, /barraMovil/);
  const manual = fs.readFileSync(new URL('../manual/manual-hugo.md', import.meta.url), 'utf8');
  assert.match(manual, /`barra`/);
  assert.match(manual, /barra-24h\/actual_barra/);
});

test('guardia de la sincronización: la instantánea es archivo vivo (el local gana), nunca pre-cálculo de un día', async () => {
  const { esRutaPre } = await import('../app/modulos/pre-calculado.mjs');
  const { esRutaBarra, validarBarra } = await import('../app/modulos/barra-movil.mjs');
  assert.equal(esRutaPre(RUTA_BARRA), false); // si entrara como pre-cálculo, cada actualización sería conflicto eterno
  assert.equal(esRutaBarra(RUTA_BARRA), true);
  assert.equal(esRutaBarra('registros/pre-calculado/stock/iceberg-90d/260822-261119_iceberg'), false);
  const texto = formatearBarra({ inicio: 1000, cierreMin: 2000, fin: 2000, dispersionMs: 0, consultados: 1, respondieron: 1, conDato: 1, sinDato: 0, suben: 1, bajan: 0 }, 3000);
  assert.equal(validarBarra(Buffer.from(texto)), 1);
  assert.throws(() => validarBarra(Buffer.from('suben: 3\n')));
  const sync = fs.readFileSync(new URL('../app/modulos/sincronizar-registros.mjs', import.meta.url), 'utf8');
  assert.match(sync, /esRutaBarra/);
  assert.match(sync, /el local gana/);
});
