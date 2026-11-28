// node --test pruebas/barra-movil.mjs. Guardia de la barra móvil 24 h de los stocks
// (decisión del usuario, 20-nov-2026): dos tandas equilibradas estables, ventana móvil de
// Binance (no el día cerrado del iceberg), plano cuenta como sube (la regla del iceberg:
// «solo es pérdida o no»), instantánea desechable que se pisa atómica, un dato por línea,
// y el bloque del visor solo en el iceberg de stocks y ausente si el archivo falta.
import { catalogoDeCarpetas } from './_catalogo.mjs';
import { COLORES_LECTURA, separarConteos, cifrasConteos } from '../app/modulos/colores-lectura.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {
  universoBarra, particionar, consultarTanda, calcularBarra, calcularMovimiento,
  cierreVelaDiaAnterior, calcularDia,
  formatearBarra, leerBarra, generarBarra,
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
    const velas = path.join(dir, 'velas-24h');
    const stock = path.join(velas, 'stock');
    fs.mkdirSync(path.join(stock, 'ZZZ'), { recursive: true });
    fs.mkdirSync(path.join(stock, 'AAA'), { recursive: true });
    fs.writeFileSync(path.join(stock, 'SUELTO'), '{}'); // un archivo no es un activo
    fs.mkdirSync(path.join(velas, 'cripto', 'BTC'), { recursive: true }); // otra clase no entra
    catalogoDeCarpetas(dir);
    assert.deepEqual(universoBarra(velas), ['AAA', 'ZZZ']);
    assert.throws(() => universoBarra(path.join(dir, 'no-existe', 'velas-24h')), /catálogo de stock ausente/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('consultarTanda pide la lista codificada al host dado y rechaza tandas de más de 100', async () => {
  let url = null;
  const fetchFalso = async (u) => { url = u; return { ok: true, text: async () => '[]' }; };
  await consultarTanda(['AAPL', 'MSFT'], { fetchImpl: fetchFalso, host: 'https://data-api.binance.vision' });
  assert.equal(url, 'https://data-api.binance.vision/api/v3/ticker?symbols=' + encodeURIComponent('["AAPLBUSDT","MSFTBUSDT"]') + '&windowSize=1d');
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

test('generarBarra: universo del registro, dos tandas, barra e instantánea en disco', async () => {
  const dir = tmp('hugo-barra-g-');
  try {
    const velas = path.join(dir, 'velas-24h');
    for (const c of ['AAA', 'BBB', 'CCC']) fs.mkdirSync(path.join(velas, 'stock', c), { recursive: true });
    catalogoDeCarpetas(dir);
    const pedidas = [];
    const fetchFalso = async (u) => {
      pedidas.push(u);
      const simbolos = JSON.parse(new URL(u).searchParams.get('symbols'));
      const cuerpo = simbolos.map((s, i) => ticker(s, 10, i % 2 ? 9 : 11, 1000, 2000));
      return { ok: true, text: async () => JSON.stringify(cuerpo) };
    };
    const { barra, rel } = await generarBarra({ dirVelas: velas, fetchImpl: fetchFalso, host: 'https://data-api.binance.vision', ahora: 5000 });
    assert.equal(pedidas.length, 2); // dos tandas equilibradas: 2 + 1
    assert.equal(barra.consultados, 3);
    assert.equal(barra.suben, 2);
    assert.equal(barra.bajan, 1);
    assert.equal(rel, undefined);
    assert.ok(!fs.existsSync(path.join(dir, 'pre-calculado', 'stock', 'barra-24h', 'actual_barra')));
    await assert.rejects(() => generarBarra({ dirVelas: path.join(dir, 'vacio'), fetchImpl: fetchFalso }), /no invento/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('calcularMovimiento: sube, baja, cero cuenta verde, sin cierre nuevo y sin previa, todo por símbolo', () => {
  const actuales = [
    { codigo: 'SUB', ultimo: 11, ultimoTexto: '11', cierre: 2000 },  // subió con cierre nuevo
    { codigo: 'BAJ', ultimo: 9, ultimoTexto: '9', cierre: 2000 },    // bajó
    { codigo: 'PLA', ultimo: 10, ultimoTexto: '10', cierre: 2000 },  // cero con cierre nuevo: verde («solo es pérdida o no»)
    { codigo: 'QUI', ultimo: 10, ultimoTexto: '10', cierre: 1500 },  // cierre sin avanzar: sin cierre nuevo, fuera de la frontera
    { codigo: 'NUE', ultimo: 5, ultimoTexto: '5', cierre: 2000 },    // sin previa: no se inventa
  ];
  const previos = new Map([
    ['SUB', { ultimo: 10, cierre: 1500 }],
    ['BAJ', { ultimo: 10, cierre: 1500 }],
    ['PLA', { ultimo: 10, cierre: 1500 }],
    ['QUI', { ultimo: 10, cierre: 1500 }],
  ]);
  const m = calcularMovimiento(actuales, previos);
  const { detalle, ...conteos } = m;
  assert.deepEqual(conteos, { suben: 2, bajan: 1, iguales: 1, sinCierreNuevo: 1, sinPrevia: 1 });
  assert.deepEqual(detalle.get('SUB'), { previoTexto: '10', resultado: 'sube' });
  assert.deepEqual(detalle.get('PLA'), { previoTexto: '10', resultado: 'igual' });
  assert.deepEqual(detalle.get('BAJ'), { previoTexto: '10', resultado: 'baja' });
  assert.deepEqual(detalle.get('QUI'), { previoTexto: '10', resultado: 'sin_cierre_nuevo' });
  assert.deepEqual(detalle.get('NUE'), { previoTexto: 'sin dato', resultado: 'sin_previa' });
  assert.equal(calcularMovimiento(actuales, null), null);       // sin archivo previo: no hay bloque
  assert.equal(calcularMovimiento(actuales, new Map()), null);  // previa sin detalle por activo: tampoco
});

test('cierreVelaDiaAnterior: lee el CIERRE de la vela del día dado en el registro local, sin buscar velas más viejas', () => {
  const dir = tmp('hugo-barra-d-');
  try {
    const velas = path.join(dir, 'velas-24h');
    fs.mkdirSync(path.join(velas, 'stock', 'AAA'), { recursive: true });
    catalogoDeCarpetas(dir);
    const ref = Date.UTC(2026, 9, 31); // 31-oct-2026: mes distinto del de la consulta (1-nov)
    const otra = Date.UTC(2026, 9, 30);
    const vela = (t, open, close) => [t, String(open), '1', '1', String(close), '1', t + 86399999, '1', 1, '1', '1', '0'];
    fs.writeFileSync(path.join(velas, 'stock', 'AAA', '2610_AAA'), JSON.stringify([vela(otra, 5, 6), vela(ref, 10, 12)]));
    assert.equal(cierreVelaDiaAnterior(velas, 'AAA', ref), '12', 'toma k[4], el cierre, no la apertura, tal cual vino escrito');
    assert.equal(cierreVelaDiaAnterior(velas, 'AAA', Date.UTC(2026, 9, 29)), null, 'sin vela de ese día no usa una más vieja');
    assert.equal(cierreVelaDiaAnterior(velas, 'BBB', ref), null, 'sin archivo, sin dato');
    fs.writeFileSync(path.join(velas, 'stock', 'AAA', '2611_AAA'), 'no es json');
    assert.equal(cierreVelaDiaAnterior(velas, 'AAA', Date.UTC(2026, 10, 1)), null, 'archivo ilegible, sin dato');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('calcularDia: frontera contra el cierre del día anterior, cero verde con iguales aparte, sin vela o sin ticker fuera', () => {
  const dir = tmp('hugo-barra-cd-');
  try {
    const velas = path.join(dir, 'velas-24h');
    const ref = Date.UTC(2026, 10, 20);
    const vela = (t, close) => [[t, '1', '1', '1', String(close), '1', t + 86399999, '1', 1, '1', '1', '0']];
    for (const [c, close] of [['AAA', 10], ['BBB', 10], ['CCC', 10]]) {
      fs.mkdirSync(path.join(velas, 'stock', c), { recursive: true });
      if (c !== 'CCC') fs.writeFileSync(path.join(velas, 'stock', c, `2611_${c}`), JSON.stringify(vela(ref, close)));
    }
    const activos = [
      { codigo: 'AAA', ultimo: 11, ultimoTexto: '11', cierre: 1 }, // sube
      { codigo: 'BBB', ultimo: 10, ultimoTexto: '10', cierre: 1 }, // igual: verde, contado aparte
      // CCC: con ticker pero sin vela local del día anterior
    ];
    const d = calcularDia(activos, velas, ['AAA', 'BBB', 'CCC', 'DDD'], ref); // DDD: sin ticker
    assert.deepEqual(d, { ref: '2026-11-20', suben: 2, bajan: 0, iguales: 1, sinDato: 2 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('formatearBarra y leerBarra con el bloque del día: ida y vuelta y validaciones', () => {
  const b = { inicio: 1000, cierreMin: 1500, fin: 2000, dispersionMs: 5, consultados: 4, respondieron: 4, conDato: 4, sinDato: 0, suben: 1, bajan: 3,
    dia: { ref: '2026-11-20', suben: 2, bajan: 1, iguales: 1, sinDato: 1 } };
  const texto = formatearBarra(b, 3000);
  const q = leerBarra(texto);
  assert.deepEqual(q.dia, b.dia);
  assert.throws(() => leerBarra(texto.replace('dia_suben: 2', 'dia_suben: 3')), /el dia anterior no cierra/);
  assert.throws(() => leerBarra(texto.replace('dia_iguales: 1', 'dia_iguales: 3')), /los iguales del dia no caben/);
  assert.throws(() => leerBarra(texto.replace('dia_ref: 2026-11-20', 'dia_ref: ayer')), /dia_ref ilegible/);
  assert.equal(leerBarra(formatearBarra({ ...b, dia: undefined }, 3000)).dia, undefined, 'instantáneas viejas sin el bloque siguen siendo válidas');
});

test('formatearBarra y leerBarra con movimiento y detalle por activo: ida y vuelta y validaciones', () => {
  const b = {
    inicio: 1000, cierreMin: 2000, fin: 3000, dispersionMs: 1000,
    consultados: 3, respondieron: 3, conDato: 3, sinDato: 0, suben: 2, bajan: 1,
    comparadaCon: 1763814880000,
    movimiento: { suben: 1, bajan: 1, iguales: 1, sinCierreNuevo: 1, sinPrevia: 0 },
    activos: [
      { codigo: 'BBB', ultimo: 9, ultimoTexto: '9.00', aperturaTexto: '9.50', cierre: 3000, previoTexto: '10.00', movResultado: 'baja' },
      { codigo: 'AAA', ultimo: 11, ultimoTexto: '11.00', aperturaTexto: '10.50', cierre: 2000, previoTexto: '10.00', movResultado: 'sube' },
      { codigo: 'CCC', ultimo: 10, ultimoTexto: '10.00', aperturaTexto: '10.00', cierre: 2000, previoTexto: '10.00', movResultado: 'igual' },
    ],
  };
  const texto = formatearBarra(b, 4000);
  const q = leerBarra(texto);
  assert.deepEqual(q.movimiento, { comparadaCon: 1763814880000, suben: 1, bajan: 1, iguales: 1, sinCierreNuevo: 1, sinPrevia: 0 });
  assert.equal(q.activos.size, 3);
  assert.deepEqual(q.activos.get('AAA'), { apertura: '10.50', ultimo: 11, ultimoTexto: '11.00', cierre: 2000, previo: '10.00', mov: 'sube' });
  assert.match(texto, /\nAAA apertura: 10\.50\nAAA ultimo: 11\.00\nAAA cierre: /); // un dato por línea, texto tal cual vino
  assert.match(texto, /\nAAA previo: 10\.00\nAAA mov: sube\n/); // el precio comparado y el resultado medido, por activo
  assert.ok(texto.indexOf('AAA ultimo') < texto.indexOf('BBB ultimo')); // detalle ordenado por código
  // el movimiento debe cerrar contra los con dato
  assert.throws(() => leerBarra(texto.replace('mov_suben: 1', 'mov_suben: 2')), /movimiento no cierra/);
  assert.throws(() => leerBarra(texto.replace('mov_iguales: 1', 'mov_iguales: 2')), /los iguales no caben/);
  // resultado desconocido o previo ilegible: instantánea incoherente
  assert.throws(() => leerBarra(texto.replace('AAA mov: sube', 'AAA mov: vuelo')), /mov desconocido/);
  assert.throws(() => leerBarra(texto.replace('AAA previo: 10.00', 'AAA previo: mil')), /sin previo legible/);
  // una instantánea anterior al desglose (sin mov_iguales) sigue siendo válida: iguales desconocido, no cero
  assert.equal(leerBarra(texto.replace(/mov_iguales: 1\n/, '')).movimiento.iguales, null);
  // el detalle por activo, cuando está, cubre exactamente a los con dato
  const sinCCC = texto.split('\n').filter((l) => !l.startsWith('CCC ')).join('\n');
  assert.throws(() => leerBarra(sinCCC), /detalle por activo/);
  // sin líneas por activo la instantánea vieja sigue siendo válida (pero no sirve de previa)
  const vieja = formatearBarra({ inicio: 1000, cierreMin: 2000, fin: 3000, dispersionMs: 0, consultados: 1, respondieron: 1, conDato: 1, sinDato: 0, suben: 1, bajan: 0 }, 3000);
  assert.equal(leerBarra(vieja).activos.size, 0);
  assert.equal(leerBarra(vieja).movimiento, undefined);
});

test('generarBarra compara con la lectura anterior del propio archivo vivo; sin previa no escribe movimiento', async () => {
  const dir = tmp('hugo-barra-m-');
  try {
    const velas = path.join(dir, 'velas-24h');
    for (const c of ['AAA', 'BBB']) fs.mkdirSync(path.join(velas, 'stock', c), { recursive: true });
    catalogoDeCarpetas(dir);
    const responder = (precios, cierres) => async (u) => {
      const simbolos = JSON.parse(new URL(u).searchParams.get('symbols'));
      return { ok: true, text: async () => JSON.stringify(simbolos.map((s) => ticker(s, 10, precios[s], 1000, cierres[s]))) };
    };
    const p1 = { AAABUSDT: 10, BBBBUSDT: 20 };
    const c1 = { AAABUSDT: 2000, BBBBUSDT: 2000 };
    const r1 = await generarBarra({ dirVelas: velas, fetchImpl: responder(p1, c1), host: 'https://data-api.binance.vision', ahora: 5000 });
    assert.equal(r1.barra.movimiento.iguales, 2); // primera lectura contra sí misma, cero gris
    assert.ok(r1.texto.includes('mov_iguales: 2'));
    const p2 = { AAABUSDT: 12, BBBBUSDT: 20 }; // AAA subió con cierre nuevo; BBB sin cierre nuevo
    const c2 = { AAABUSDT: 2500, BBBBUSDT: 2000 };
    const r2 = await generarBarra({ dirVelas: velas, fetchImpl: responder(p2, c2), host: 'https://data-api.binance.vision', ahora: 9000, anteriorTexto: r1.texto });
    const { detalle, ...conteos } = r2.barra.movimiento;
    assert.deepEqual(conteos, { suben: 1, bajan: 0, iguales: 0, sinCierreNuevo: 1, sinPrevia: 0 });
    assert.deepEqual(detalle.get('AAA'), { previoTexto: '10', resultado: 'sube' }); // el previo viaja con el texto exacto de la lectura anterior
    assert.deepEqual(detalle.get('BBB'), { previoTexto: '20', resultado: 'sin_cierre_nuevo' });
    assert.equal(r2.barra.comparadaCon, 5000);
    assert.match(r2.texto, /comparada_con: 1970-01-01T00:00:05\.000Z/);
    assert.match(r2.texto, /\nAAA previo: 10\nAAA mov: sube\n/);
    assert.equal(leerBarra(r2.texto).movimiento.suben, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('guardia del visor: las barras solo en la Superficie del día, colores de la casa, ausentes si el archivo falta', () => {
  const visor = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(visor, /actual_barra/);
  assert.match(visor, /vistaBarra\(b, \{ historica: true, compacta: true, mercado(, sinFuente: Boolean\(en\))? \}\)/); // solo dentro de la Superficie del día (decisión del usuario, 21-nov-2026)
  assert.doesNotMatch(visor, /cargarBarra\(\)\.then/); // fuera del Iceberg: las vistas no se enlazan
  assert.match(visor, /return null; \/\/ Sin historial/); // sin archivo publicado, sin bloque
  assert.match(visor, /ventana móvil/);
  assert.match(visor, /Movimiento entre las dos últimas consultas/); // segunda barra: movimiento medido entre lecturas
  assert.match(visor, /comparada_con/); // solo se dibuja si la instantánea trae el bloque y cierra

  assert.match(visor, /sin cierre nuevo/);
  assert.match(visor, /cifrasConteos/); // el verde no afirma aumento: incluye la igualdad, explícito
  assert.match(visor, /dia_ref/); // tercera barra: solo se dibuja si la instantánea trae el bloque y cierra
  assert.match(visor, /'24 horas'/);
  assert.match(visor, /Fuente: Binance/);
  assert.match(visor, /periodoBarra\(m.comparadaCon, b.generada/); // instante anterior en Desde
  assert.match(visor, /UTC/);
  assert.doesNotMatch(visor, /UTC-4|No bajan|`Suben/);
  for (const ruta of ['barra-dia', 'barra-24h', 'barra-movimiento']) assert.ok(visor.includes(ruta));
  assert.match(visor, /barra-movil-sec/);
  assert.match(visor, /'Ver tabla'/); assert.doesNotMatch(visor, /Ver la tabla/);
  assert.match(visor, /igual: 'Igual'/);
  assert.match(visor, /return py - px/); // de mayor a menor porcentaje, sin comparación al final (decisión del usuario, 21-nov-2026)
  assert.match(visor, /f\.verde === null \|\| f\.refN == null/); // la excepción no entra al orden aunque tenga previo
  assert.match(visor, /pctTabla\(f\.ultimoN, f\.refN\)/); // el resultado de la tabla es el porcentaje, coloreado (decisión del usuario, 21-nov-2026)
  assert.doesNotMatch(visor, /<th>Porcentaje<\/th>/); // sin columna extra: se conserva el ancho // el formato del usuario en los dos instantes
});

test('la copia retirada no participa en la sincronización ni el visor', () => {
  const sync = fs.readFileSync(new URL('../app/modulos/sincronizar-registros.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(sync, /esRutaBarra|actual_barra/);
  const visor = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(visor, /actual_barra|RUTA_BARRA/);
});

// Executes the real browser parser and table classifiers, not copies of their logic.
test('tablas del visor: miembros, precios, iguales y exclusiones coinciden con cada barra', async () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const cargar = html.slice(html.indexOf('async function cargarBarra()'), html.indexOf('function fechaPeriodoBarra('));
  const defs = html.slice(html.indexOf('const BARRAS_TABLA ='), html.indexOf('const precioTabla ='));
  const base = {
    inicio: 1000, cierreMin: 2000, fin: 3000, dispersionMs: 1000,
    consultados: 3, conDato: 3, sinDato: 0, suben: 2, bajan: 1,
    dia: { ref: '2026-11-20', suben: 1, bajan: 1, iguales: 1, sinDato: 1 },
    comparadaCon: 1000, movimiento: { suben: 1, bajan: 1, iguales: 1, sinCierreNuevo: 1, sinPrevia: 0 },
    activos: [
      { codigo: 'AAA', aperturaTexto: '10.00', ultimoTexto: '10.00', cierre: 3000, diaCierreTexto: '10.00', previoTexto: '10.00', movResultado: 'igual' },
      { codigo: 'BBB', aperturaTexto: '10.00', ultimoTexto: '9.00', cierre: 3000, diaCierreTexto: '10.00', previoTexto: '10.00', movResultado: 'baja' },
      { codigo: 'CCC', aperturaTexto: '8.00', ultimoTexto: '9.00', cierre: 2000, previoTexto: '9.00', movResultado: 'sin_cierre_nuevo' },
    ],
  };
  const texto = formatearBarra(base, 4000);
  const ctx = vm.createContext({ cargarDiaObservatorio: async () => ({ dia: { lecturas: [{ texto }] } }), barraContextual: (r)=>ctx.parsearBarraVisor(r.dia.lecturas[0].texto), RUTA_BARRA: 'fixture', fetch: async () => ({ ok: true, text: async () => texto }) });
  vm.runInContext(cargar + defs + html.slice(html.indexOf('const precioTabla ='), html.indexOf('async function vistaTablaBarra(')) + ';globalThis.defs = BARRAS_TABLA;globalThis.pctTabla = pctTabla;', ctx);
  const b = await vm.runInContext('cargarBarra()', ctx);
  for (const [key, green, red, equal, out] of [['barra-dia',1,1,1,1], ['barra-24h',2,1,1,0], ['barra-movimiento',1,1,1,1]]) {
    const def = ctx.defs[key];
    assert.ok(def.apta(b));
    const rows = [...b.activos.values()].map(def.fila);
    assert.equal(rows.filter((r) => r.verde === true).length, green, key);
    assert.equal(rows.filter((r) => r.verde === false).length, red, key);
    assert.equal(rows.filter((r) => r.res === 'Igual').length, equal, key);
    assert.equal(rows.filter((r) => r.verde === null).length, out, key);
    for (const r of rows) assert.ok(r.refN !== undefined, key + ': referencia numérica para el porcentaje');
    assert.equal(rows[0].ref, '10.00', 'conserva el precio comparado exacto');
    assert.equal(ctx.pctTabla(10, 10), '+0%', key);
    assert.equal(ctx.pctTabla(9, 10), '-10%', key);
    assert.equal(ctx.pctTabla(11, 10), '+10%', key);
    assert.equal(ctx.pctTabla(9.9999, 10), '-0.001%', key); // un rojo minúsculo nunca se disfraza de 0 % verde
    assert.equal(ctx.pctTabla(9, null), 'sin dato', key);
  }
  assert.equal(b.activos.get('AAA').ultimo, '10.00');
  const filaSinCierre = ctx.defs['barra-movimiento'].fila(b.activos.get('CCC'));
  assert.equal(filaSinCierre.res, 'Sin cierre nuevo'); // sin comparación: se muestra la causa, no un porcentaje
  delete b.activos.get('AAA').apertura;
  assert.ok(!ctx.defs['barra-24h'].apta(b), 'sin detalle completo no inventa tabla');
});


test('duración de títulos: horas/minutos reales, no frecuencia nominal', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const codigo = html.slice(html.indexOf('function duracionBarra('), html.indexOf('function fechaPeriodoBarra('));
  const f = vm.runInNewContext(codigo + ';duracionBarra');
  const inicio = Date.parse('2026-11-21T00:00:00Z');
  assert.equal(f(inicio, inicio + 14 * 3600000 + 55 * 60000), '14 h 55 min');
  assert.equal(f(inicio, inicio + 300000), '5 min');
  assert.equal(f(inicio, inicio + 300043), '5 min');
  assert.equal(f(inicio, inicio + 3600000), '1 h');
  assert.equal(f(inicio, inicio + 11000), '<1 min');
  assert.equal(f(inicio, inicio + 47 * 60000), '47 min');
  assert.equal(f(inicio, inicio - 1), 'duración no disponible');
  assert.equal(f(NaN, inicio), 'duración no disponible');
  assert.match(html, /duracionBarra\(d.base/);
  assert.match(html, /duracionBarra\(m.comparadaCon, b.generada\)/);
});


test('periodos unificados con meses legibles y reloj de24horasUTC', () => {
 const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
 const codigo=html.slice(html.indexOf('function fechaPeriodoBarra('),html.indexOf('function vistaBarra('));
 const f=vm.runInNewContext(codigo+';periodoBarra',{diaUTC:ms=>new Date(ms).toISOString().slice(0,10)});
 assert.equal(f(Date.parse('2026-11-20T23:59:59.999Z'),Date.parse('2026-11-21T15:00:00Z'),'15 h'),'nov 20 · 23:59-nov 21 · 15:00 UTC');
 assert.equal(f(Date.parse('2026-11-21T00:00:00Z'),NaN,'sin dato').split('\n')[0],'nov 21 · 00:00-sin dato UTC');
 assert.equal(f(Date.parse('2026-11-20T23:59:59.999Z'),Date.parse('2026-11-21T16:00:00Z'),'dia'),'23:59-16:00 UTC');
 assert.equal(f(Date.parse('2026-11-21T15:00:00Z'),Date.parse('2026-11-21T16:00:00Z'),'horas'),'15:00-16:00 UTC');
 assert.match(html,/24 h por activo/);
});

test('las barras comparten periodos y tablas, sin Lectura redundante ni enlaces entre las vistas', () => {
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const vista=html.slice(html.indexOf('function vistaBarra('),html.indexOf('const BARRAS_TABLA'));
 const tablas=html.slice(html.indexOf('const BARRAS_TABLA'),html.indexOf('const precioTabla'));
 assert.doesNotMatch(vista,/Lectura:/);
 assert.ok(!vista.includes('enlaceSuperficie')); // las vistas no se comunican (decisión del usuario, 21-nov-2026)
 assert.ok(!vista.includes('Ver iceberg 2D') && !vista.includes('Ver superficie 3D'));
 assert.equal((tablas.match(/nota: \(b\) => periodoBarra\(/g)||[]).length,3);
 assert.doesNotMatch(tablas,/Lectura:|Referencia fija:|toISOString/);
});


test('barras comunes separan igualdad gris de subidas verdes sin cambiar datos guardados', () => {
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const codigo=html.slice(html.indexOf('function vistaBarra('),html.indexOf('// Las tablas de las tres barras'));
 const crear=()=>({style:{},hijos:[],setAttribute(){},append(...xs){this.hijos.push(...xs);}});
 const vista=vm.runInNewContext(codigo+';vistaBarra',{document:{createElement:crear,createTextNode:t=>({textContent:t})},COLORES_LECTURA,separarConteos,cifrasConteos,RED_S:'rojo',GREEN_S:'verde',duracionBarra:()=> '1 h',periodoBarra:()=> 'periodo',urlIndicador:(c,q='')=>'/i/'+c+'/'+q});
 const b={generada:1000,inicio:0,fin:1000,suben:2,bajan:1,conDato:3,activos:new Map([['A',{aperturaN:10,ultimoN:10}],['B',{aperturaN:10,ultimoN:11}],['C',{aperturaN:10,ultimoN:9}]]),dia:{ref:'2026-11-20',suben:2,bajan:1,iguales:1},movimiento:{comparadaCon:0,suben:2,bajan:1,iguales:1}};
 const antes=JSON.stringify({...b,activos:[...b.activos]});
 for(const compacta of [true,false]){
  const caja=vista(b,{compacta});
  const secs=caja.hijos.filter(x=>x.className==='barra-movil-sec');
  assert.equal(secs.length,3);
  for(const sec of secs){
   assert.equal(sec.hijos[2].hijos.map(x=>x.textContent).join(''),'1 · 1 · 1');
   const cifras=sec.hijos[2].hijos.filter(x=>x.style);
   assert.deepEqual(sec.hijos[1].hijos.map(x=>x.style.background),[COLORES_LECTURA.rojo,COLORES_LECTURA.gris,COLORES_LECTURA.verde]);
   assert.deepEqual(cifras.map(x=>x.style.color),cifrasConteos(2,1,1).map(x=>x.color));
   const colores=sec.hijos[1].hijos;
   assert.deepEqual(Array.from(colores,x=>x.style.background),[COLORES_LECTURA.rojo,COLORES_LECTURA.gris,COLORES_LECTURA.verde]);
   for(const x of colores)assert.ok(Math.abs(parseFloat(x.style.width)-100/3)<1e-8);
  }
 }
 assert.equal(JSON.stringify({...b,activos:[...b.activos]}),antes);
});

// El rótulo conserva extremos devueltos por la consulta, sin corregirlos artificialmente.
test('rolling 1d conserva minuto real y separación entre tandas en rango y precios', () => {
 const inicio=Date.parse('2026-11-20T16:00:00Z');
 const fin=Date.parse('2026-11-21T16:00:00.625Z');
 const b=calcularBarra([[ticker('IWMBUSDT',265.09,259.12,inicio,fin)],[ticker('TQQQBUSDT',45.29,43.19,inicio,fin+626)]],['IWM','TQQQ']);
 assert.equal(b.inicio,inicio);assert.equal(b.fin,fin+626);
 assert.equal(b.dispersionMs,626);assert.equal(b.bajan,2);
 assert.equal(b.activos[0].ultimoTexto,'259.12');
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const f=vm.runInNewContext(html.slice(html.indexOf('function fechaPeriodoBarra('),html.indexOf('function vistaBarra('))+';periodoBarra');
 assert.equal(f(b.inicio,b.fin),'nov 20 · 16:00-nov 21 · 16:00 UTC');
});
