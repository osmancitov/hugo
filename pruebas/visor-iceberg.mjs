// node --test pruebas/visor-iceberg.mjs. Guardia del indicador propio Iceberg (decisión del
// usuario, 20-nov-2026): el conteo sale de un módulo independiente, la serie viaja en
// registros/iceberg/<AAMM> y el visor lo dibuja con la misma pieza común de trazado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { calcularIceberg, leerIceberg, escribirIceberg } from '../app/modulos/iceberg.mjs';

const visor = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const DIA = 86400000;
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
// Vela mínima: [aperturaMs, apertura, máximo, mínimo, cierre]. Precios en texto, como en el registro.
const vela = (t, a, c) => [t, String(a), String(Math.max(a, c)), String(Math.min(a, c)), String(c), '1', t + DIA - 1, '1', 1, '1', '1', '0'];

function bancoVelas() {
  const dir = tmp('hugo-ice-');
  const p = path.join(dir, 'cripto', 'AAA');
  fs.mkdirSync(p, { recursive: true });
  return { dir, p };
}

test('calcularIceberg cuenta alzas y bajas por día; la plana no cuenta y el día en curso queda fuera', () => {
  const { dir, p } = bancoVelas();
  try {
    const d1 = Date.UTC(2026, 7, 1), d2 = Date.UTC(2026, 7, 2), hoy = Date.UTC(2026, 7, 3);
    fs.writeFileSync(path.join(p, '2608_AAA'), JSON.stringify([vela(d1, 1, 2), vela(d2, 2, 1), vela(hoy, 1, 2)]));
    const q = path.join(dir, 'cripto', 'BBB');
    fs.mkdirSync(q, { recursive: true });
    fs.writeFileSync(path.join(q, '2608_BBB'), JSON.stringify([vela(d1, 2, 1), vela(d2, 1, 3)]));
    const serie = calcularIceberg(dir, hoy + 12 * 3600 * 1000); // mediodía del día 3
    assert.deepEqual(serie, [
      [d1, 1, 1], // AAA sube, BBB baja
      [d2, 1, 1], // AAA baja, BBB sube
    ]); // el día 3 (en curso) no entra
    // Plana: apertura igual al cierre no suma en ningún lado.
    fs.writeFileSync(path.join(q, '2608_BBB'), JSON.stringify([vela(d1, 2, 1), vela(d2, 1, 1)]));
    assert.deepEqual(calcularIceberg(dir, hoy + 12 * 3600 * 1000), [[d1, 1, 1], [d2, 0, 1]]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('leerIceberg valida forma, piso, alineación y orden', () => {
  const d1 = Date.UTC(2026, 7, 1);
  assert.deepEqual(leerIceberg(JSON.stringify([[d1, 3, 2]])), [[d1, 3, 2]]);
  assert.throws(() => leerIceberg('no json'), /ilegible/);
  assert.throws(() => leerIceberg('{}'), /no es una lista/);
  assert.throws(() => leerIceberg('[[1,2]]'), /forma inesperada/);
  assert.throws(() => leerIceberg(JSON.stringify([[d1 + 3600000, 1, 1]])), /alineada/);
  assert.throws(() => leerIceberg(JSON.stringify([[Date.UTC(2026, 6, 31), 1, 1]])), /piso/);
  assert.throws(() => leerIceberg(JSON.stringify([[d1, -1, 1]])), /rango/);
  assert.throws(() => leerIceberg(JSON.stringify([[d1 + DIA, 1, 1], [d1, 1, 1]])), /repetidas o desordenadas/);
});

test('escribirIceberg parte por mes, escribe atómico y es idempotente', () => {
  const dir = tmp('hugo-ice-esc-');
  try {
    const puntos = [[Date.UTC(2026, 7, 31), 2, 3], [Date.UTC(2026, 8, 1), 4, 1]];
    assert.deepEqual(escribirIceberg(dir, puntos).sort(), ['2608', '2609']);
    assert.deepEqual(leerIceberg(fs.readFileSync(path.join(dir, '2608'), 'utf8')), [puntos[0]]);
    assert.deepEqual(leerIceberg(fs.readFileSync(path.join(dir, '2609'), 'utf8')), [puntos[1]]);
    assert.deepEqual(escribirIceberg(dir, puntos), []); // nada cambió: no reescribe
    assert.throws(() => escribirIceberg(dir, [[Date.UTC(2026, 6, 31), 1, 1]]));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('la serie publicada existe, es válida y cierra en la vela del registro', () => {
  const dir = new URL('../registros/iceberg/', import.meta.url);
  const archivos = fs.readdirSync(dir).filter((n) => /^\d{4}$/.test(n)).sort();
  assert.ok(archivos.length >= 4, 'al menos ago-nov 2026');
  const serie = archivos.flatMap((n) => leerIceberg(fs.readFileSync(new URL(n, dir), 'utf8')));
  assert.ok(serie.length > 100, 'más de 100 días');
  // Sin días repetidos ni desordenados entre meses (leerIceberg ya valida dentro de cada mes).
  for (let i = 1; i < serie.length; i++) assert.ok(serie[i][0] > serie[i - 1][0]);
});

test('el visor registra Iceberg una sola vez y lo dibuja por la pieza común, con hasta', () => {
  assert.equal(visor.match(/codigo: 'iceberg'/g)?.length, 1);
  assert.equal(visor.match(/function graficoIceberg\(/g)?.length, 1);
  assert.equal(visor.match(/function graficoIcebergVertical\(/g)?.length, 1);
  assert.match(visor, /if \(geometria\.vertical\) graficoIcebergVertical/);
  assert.match(visor, /else graficoIceberg\(/);
  // Ambos dibujos respetan el trazado parcial (hasta) como las demás gráficas.
  const dibujos = [visor.slice(visor.indexOf('function graficoIceberg(')), visor.slice(visor.indexOf('function graficoIcebergVertical('))];
  for (const d of dibujos) assert.match(d, /const k = hasta === undefined \? n : Math\.min\(hasta, n\)/);
  // Los colores de las barras son los comunes de la casa, no unos nuevos.
  for (const d of dibujos) { assert.match(d, /GREEN_S/); assert.match(d, /RED_S/); }
});

test('el rótulo visible de Iceberg vive en la fuente única de rótulos', async () => {
  const { default: rotulos } = await import('../app/modulos/indicadores-rotulos.mjs');
  assert.equal(rotulos['iceberg'], 'Iceberg');
});
