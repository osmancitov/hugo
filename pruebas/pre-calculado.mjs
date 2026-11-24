// node --test pruebas/pre-calculado.mjs. Guardia de los pre-cálculos diarios (decisión del
// usuario, 20-nov-2026): ventana por duración con corte común, un archivo por día y mercado que
// no se pisa, cero = verde en barra y ranking, y las métricas de la vista Variación dentro de la
// ventana para la Lectura del día.
import { catalogoDeCarpetas } from './_catalogo.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ventana, calcularLectura, calcularRanking, calcularIcebergVentana, actualizarPreCalculos,
  leerLectura, leerRanking, validarPre, localesPre, esRutaPre, preCalculosFrescos,
} from '../app/modulos/pre-calculado.mjs';

const DIA = 86400000;
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
// Vela mínima: [aperturaMs, apertura, máximo, mínimo, cierre]. Precios en texto, como en el registro.
const vela = (t, a, c) => [t, String(a), String(Math.max(a, c)), String(Math.min(a, c)), String(c), '1', t + DIA - 1, '1', 1, '1', '1', '0'];
const FIN = Date.UTC(2026, 10, 19); // 19-nov-2026
const AHORA = FIN + DIA + 12 * 3600 * 1000; // mediodía del 20-nov: el 19 es la última vela cerrada
const INICIO = Date.UTC(2026, 7, 22); // 22-ago-2026: 19-nov menos 89 días

// Banco de velas en disco: tmpdir/velas-24h/<clase>/<COD>/<AAMM>_<COD>.
function banco(activos) {
  const dirRaiz = tmp('hugo-pre-');
  for (const [clase, cod, meses] of activos) {
    const dir = path.join(dirRaiz, 'velas-24h', clase, cod);
    fs.mkdirSync(dir, { recursive: true });
    for (const [aamm, filas] of Object.entries(meses)) fs.writeFileSync(path.join(dir, `${aamm}_${cod}`), JSON.stringify(filas));
  }
  catalogoDeCarpetas(dirRaiz);
  return dirRaiz;
}
const mapaDe = (obj) => new Map(Object.entries(obj));

test('ventana: corte común en la última vela cerrada e inicio = corte − duración (19-nov → 22-ago)', () => {
  assert.deepEqual(ventana(AHORA, 90, 'd'), { inicio: INICIO, fin: FIN });
  // La misma hora del día no mueve el corte: a las 00:30 del 20 el fin sigue siendo el 19.
  assert.deepEqual(ventana(FIN + DIA + 30 * 60000, 90, 'd'), { inicio: INICIO, fin: FIN });
  assert.throws(() => ventana(AHORA, 90, 'h'), /no válida/); // la escala horaria queda solo prevista
});

test('ventana: el piso del registro recorta el inicio, sin desplazarlo', () => {
  const ahora = Date.UTC(2026, 7, 10) + 12 * 3600 * 1000; // 10-ago: la ventana pediría mayo
  const v = ventana(ahora, 90, 'd');
  assert.equal(v.inicio, Date.UTC(2026, 7, 1)); // piso 1-ago-2026
  assert.equal(v.fin, Date.UTC(2026, 7, 9));
});

test('calcularIcebergVentana: el cero cuenta como verde y los huecos quedan sin fila (decisión del usuario, 20-nov-2026)', () => {
  const d1 = INICIO, d2 = INICIO + DIA, d4 = INICIO + 3 * DIA; // d3 hueco
  const mercado = mapaDe({
    AAA: [vela(d1, 1, 2), vela(d2, 2, 2), vela(d4, 1, 1)], // sube, plana, plana
    BBB: [vela(d1, 2, 1), vela(d2, 1, 1), vela(d4, 2, 1)], // baja, plana, baja
    CCC: [vela(INICIO - DIA, 1, 2), vela(FIN + DIA, 1, 2)], // fuera de la ventana: no cuenta
  });
  const serie = calcularIcebergVentana(mercado, { inicio: INICIO, fin: FIN });
  assert.deepEqual(serie, [
    [d1, 1, 1],
    [d2, 2, 0], // las dos planas son verdes
    [d4, 1, 1], // la plana de AAA verde; d3 ausente, no rellenado
  ]);
});

test('calcularRanking: orden por variación completa del día, planas como valor ordinario y puesto único (decisión del usuario, 20-nov-2026)', () => {
  const mercado = mapaDe({
    AAA: [vela(FIN - DIA, 1, 1), vela(FIN, 2, 1)], // −50 %
    BBB: [vela(FIN, 3, 3)], // plana: 0 %
    DDD: [vela(FIN, 7, 7)], // plana: 0 %, empate con BBB
    CCC: [vela(FIN, 1, 2)], // +100 %
    EEE: [vela(FIN - DIA, 1, 2)], // sin vela ese día: no entra
  });
  const ranking = calcularRanking(mercado, FIN);
  // Posición única, sin ambigüedad: el puesto es el lugar en la lista; el empate exacto (BBB y
  // DDD en 0 %) se ordena por código, no comparte puesto (decisión del usuario, 20-nov-2026).
  assert.deepEqual(ranking.map((f) => f[0]), ['AAA', 'BBB', 'DDD', 'CCC']);
  assert.equal(ranking[0][1], -50);
  assert.equal(ranking[1][1], 0);
  assert.equal(ranking[3][1], 100);
});

test('calcularLectura: las métricas de la vista Variación sobre la ventana; sin rojos, gp es null', () => {
  // AAA: sube, plana, baja. La plana NO rompe la definición de la vista: la racha la manda la baja.
  const AAA = [vela(FIN - 2 * DIA, 1, 2), vela(FIN - DIA, 2, 2), vela(FIN, 2, 1)];
  const BBB = [vela(FIN - DIA, 1, 2), vela(FIN, 2, 3)]; // solo verdes
  const CCC = [vela(INICIO - DIA, 1, 2)]; // sin velas en la ventana: no aparece
  const lectura = calcularLectura(mapaDe({ AAA, BBB, CCC }), { inicio: INICIO, fin: FIN }, 90, 'd');
  assert.deepEqual(Object.keys(lectura.activos).sort(), ['AAA', 'BBB']);
  assert.deepEqual(lectura.ventana, { cantidad: 90, unidad: 'd', inicio: INICIO, fin: FIN });
  assert.equal(lectura.corte, FIN);
  const a = lectura.activos.AAA;
  assert.equal(a.fecha, FIN);
  assert.equal(a.dias, 1);
  assert.equal(a.direccion, -1);
  assert.equal(a.acumulado, -50);
  assert.equal(a.limitada, false);
  assert.equal(a.gp, 2); // verde 100 %, roja 50 %
  assert.equal(a.cambios, 1); // sube → baja; la plana no suma cambio
  assert.equal(lectura.activos.BBB.gp, null); // sin días rojos: la razón no cabe en JSON
  // La racha no mira antes de la ventana: BBB abre la ventana ya en verde y queda limitada.
  assert.equal(lectura.activos.BBB.limitada, true);
});

test('actualizarPreCalculos escribe los tres archivos del día por mercado con los nombres acordados y no pisa', () => {
  const dirRaiz = banco([
    ['stock', 'SSS', { '2611': [vela(FIN - DIA, 1, 2), vela(FIN, 2, 1)] }],
    ['cripto', 'AAA', { '2611': [vela(FIN - DIA, 1, 1), vela(FIN, 1, 3)] }],
  ]);
  try {
    const r = actualizarPreCalculos({ dirRaiz, ahora: AHORA });
    assert.equal(r.lineas.length, 6); // 2 cálculos + ranking, por mercado
    assert.ok(r.lineas.every((l) => l.estado === 'escrito'));
    const pStock = path.join(dirRaiz, 'pre-calculado', 'stock');
    const pCripto = path.join(dirRaiz, 'pre-calculado', 'cripto');
    assert.ok(fs.existsSync(path.join(pStock, 'lectura-dia-90d', '261119_lectura-dia')));
    assert.ok(fs.existsSync(path.join(pCripto, 'lectura-dia-90d', '261119_lectura-dia')));
    assert.ok(fs.existsSync(path.join(pStock, 'iceberg-90d', '260822-261119_iceberg')));
    assert.ok(fs.existsSync(path.join(dirRaiz, 'ranking-24h', 'stock', '261119_ranking-24h')));
    assert.ok(fs.existsSync(path.join(dirRaiz, 'ranking-24h', 'cripto', '261119_ranking-24h')));
    // Contenido: la lectura de stock trae solo SSS y las métricas acordadas.
    const lectura = leerLectura(fs.readFileSync(path.join(pStock, 'lectura-dia-90d', '261119_lectura-dia'), 'utf8'));
    assert.deepEqual(Object.keys(lectura.activos), ['SSS']);
    assert.equal(lectura.activos.SSS.acumulado, -50);
    // El iceberg por mercado: cada uno cuenta solo su clase.
    const iceStock = JSON.parse(fs.readFileSync(path.join(pStock, 'iceberg-90d', '260822-261119_iceberg'), 'utf8'));
    assert.deepEqual(iceStock, [[FIN - DIA, 1, 0], [FIN, 0, 1]]);
    // Segunda pasada el mismo día: todo igual, nada se reescribe.
    const r2 = actualizarPreCalculos({ dirRaiz, ahora: AHORA + 3600000 });
    assert.ok(r2.lineas.every((l) => l.estado === 'igual'));
    // Un archivo tocado a mano no se pisa: conflicto y contenido intacto.
    const archivo = path.join(dirRaiz, 'ranking-24h', 'stock', '261119_ranking-24h');
    fs.writeFileSync(archivo, 'modificado');
    const r3 = actualizarPreCalculos({ dirRaiz, ahora: AHORA + 3600000 });
    const linea = r3.lineas.find((l) => l.archivo === 'ranking-24h/stock/261119_ranking-24h');
    assert.equal(linea.estado, 'conflicto');
    assert.equal(fs.readFileSync(archivo, 'utf8'), 'modificado');
  } finally { fs.rmSync(dirRaiz, { recursive: true, force: true }); }
});

test('actualizarPreCalculos: un mercado sin velas queda "sin datos" y sin archivo vacío', () => {
  const dirRaiz = banco([['stock', 'SSS', { '2611': [vela(FIN, 1, 2)] }]]);
  try {
    const r = actualizarPreCalculos({ dirRaiz, ahora: AHORA });
    const cripto = r.lineas.filter((l) => l.mercado === 'cripto');
    assert.ok(cripto.every((l) => l.estado === 'sin datos'));
    assert.ok(!fs.existsSync(path.join(dirRaiz, 'pre-calculado', 'cripto')));
    assert.ok(!fs.existsSync(path.join(dirRaiz, 'ranking-24h', 'cripto')));
  } finally { fs.rmSync(dirRaiz, { recursive: true, force: true }); }
});

test('validadores: rechazan forma inesperada y validarPre exige nombre coherente con la carpeta', () => {
  const lectura = calcularLectura(mapaDe({ AAA: [vela(FIN, 1, 2)] }), { inicio: INICIO, fin: FIN }, 90, 'd');
  const buena = JSON.stringify(lectura);
  assert.equal(leerLectura(buena).corte, FIN);
  assert.throws(() => leerLectura('no json'), /ilegible/);
  assert.throws(() => leerLectura(JSON.stringify({ ...lectura, ventana: { cantidad: 90, unidad: 'h', inicio: INICIO, fin: FIN } })), /Ventana/);
  assert.deepEqual(leerRanking('[["AAA",-1.5]]'), [['AAA', -1.5]]);
  assert.throws(() => leerRanking('[["BBB",0],["AAA",0]]'), /desordenado/); // empates por código
  assert.throws(() => leerRanking('[["AAA",1],["BBB",0]]'), /desordenado/);
  const relLectura = 'registros/pre-calculado/stock/lectura-dia-90d/261119_lectura-dia';
  assert.ok(validarPre(Buffer.from(buena), relLectura) > 0);
  assert.throws(() => validarPre(Buffer.from(buena), 'registros/pre-calculado/stock/iceberg-90d/261119_lectura-dia'), /incoherente/);
  assert.throws(() => validarPre(Buffer.from('[["AAA",1]]'), 'registros/ranking-24h/stock/261119'), /no reconocida/);
  assert.ok(esRutaPre(relLectura));
  assert.ok(esRutaPre('registros/ranking-24h/cripto/261119_ranking-24h'));
  assert.ok(!esRutaPre('registros/velas-24h/stock/AAA/2611_AAA'));
});

test('localesPre lista solo nombres con la forma acordada', () => {
  const dirRaiz = banco([['stock', 'SSS', { '2611': [vela(FIN, 1, 2)] }]]);
  try {
    actualizarPreCalculos({ dirRaiz, ahora: AHORA });
    fs.writeFileSync(path.join(dirRaiz, 'pre-calculado', 'stock', 'lectura-dia-90d', 'borrador.txt'), 'x');
    const lista = localesPre(dirRaiz).map((f) => f.rel).sort();
    assert.deepEqual(lista, [
      'registros/pre-calculado/stock/iceberg-90d/260822-261119_iceberg',
      'registros/pre-calculado/stock/lectura-dia-90d/261119_lectura-dia',
      'registros/ranking-24h/stock/261119_ranking-24h',
    ]);
  } finally { fs.rmSync(dirRaiz, { recursive: true, force: true }); }
});

test('lectura limitada a la ventana: un mes completo anterior no se lee aunque traiga filas dentro', () => {
  const dirRaiz = banco([
    ['stock', 'SSS', { '2611': [vela(FIN, 1, 2)] }],
    ['stock', 'VIEJO', { '2607': [vela(FIN, 1, 9)] }], // archivo de julio con una fila de noviembre: fuera de la ventana
  ]);
  try {
    const r = actualizarPreCalculos({ dirRaiz, ahora: AHORA });
    const lectura = leerLectura(fs.readFileSync(path.join(dirRaiz, 'pre-calculado', 'stock', 'lectura-dia-90d', '261119_lectura-dia'), 'utf8'));
    assert.deepEqual(Object.keys(lectura.activos), ['SSS'], 'el mes fuera de la ventana no se lee');
  } finally { fs.rmSync(dirRaiz, { recursive: true, force: true }); }
});

test('preCalculosFrescos: hechos y sin velas nuevas no se rehacen; vela nueva en la ventana manda rehacer', () => {
  const dirRaiz = banco([
    ['stock', 'SSS', { '2611': [vela(FIN, 1, 2)] }],
    ['cripto', 'AAA', { '2611': [vela(FIN, 1, 3)] }],
  ]);
  try {
    assert.equal(preCalculosFrescos({ dirRaiz, ahora: AHORA }).frescos, false, 'sin salidas todavía: se hacen');
    actualizarPreCalculos({ dirRaiz, ahora: AHORA });
    assert.equal(preCalculosFrescos({ dirRaiz, ahora: AHORA + 3600000 }).frescos, true, 'salidas del día y velas quietas: no se rehacen');
    // Una vela de la ventana escrita después (ingesta o corrección): rehacer.
    const p = path.join(dirRaiz, 'velas-24h', 'stock', 'SSS', '2611_SSS');
    fs.writeFileSync(p, JSON.stringify([vela(FIN - DIA, 1, 2), vela(FIN, 2, 1)]));
    fs.utimesSync(p, new Date(), new Date());
    const r = preCalculosFrescos({ dirRaiz, ahora: AHORA + 3600000 });
    assert.equal(r.frescos, false, 'vela nueva en la ventana: se rehacen');
    assert.match(r.motivo, /velas nuevas/);
  } finally { fs.rmSync(dirRaiz, { recursive: true, force: true }); }
});

test('preCalculosFrescos: un mes fuera de la ventana escrito ahora NO ensucia la frescura', () => {
  const dirRaiz = banco([
    ['stock', 'SSS', { '2611': [vela(FIN, 1, 2)] }],
    ['cripto', 'AAA', { '2611': [vela(FIN, 1, 3)] }],
  ]);
  try {
    actualizarPreCalculos({ dirRaiz, ahora: AHORA });
    const p = path.join(dirRaiz, 'velas-24h', 'stock', 'SSS', '2606_SSS'); // junio: fuera de la ventana de 90 días
    fs.writeFileSync(p, JSON.stringify([vela(Date.UTC(2026, 5, 3), 1, 2)]));
    fs.utimesSync(p, new Date(), new Date());
    assert.equal(preCalculosFrescos({ dirRaiz, ahora: AHORA + 3600000 }).frescos, true, 'fuera de la ventana no afecta a la salida');
  } finally { fs.rmSync(dirRaiz, { recursive: true, force: true }); }
});
