import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { construirSerie } from '../app/modulos/campana-serie.mjs';

const dia = (fin, cl) => ({ carrera: { ventana: { fin } }, clasificados: cl, no_clasificados: [] });
const a = (id, puesto, p, c) => ({ id, puesto, potencia: p, constancia: c });

test('la serie ordena por fecha, deja null donde no hay punto y no inventa valores', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'camp-'));
  fs.writeFileSync(path.join(d, '260801-261029_carrera-90d'), JSON.stringify(dia('2026-10-29', [a('stock:A', 1, 1.5, 1.2)])));
  fs.writeFileSync(path.join(d, '260802-261030_carrera-90d'), JSON.stringify(dia('2026-10-30', [a('stock:A', 2, 1.4, 1.1), a('cripto:B', 1, 0.9, 1.3)])));
  fs.writeFileSync(path.join(d, 'serie_carrera-90d'), '{}'); // la serie previa no cuenta como día
  const s = construirSerie(d);
  assert.deepEqual(s.fechas, ['2026-10-29', '2026-10-30']);
  assert.deepEqual(s.activos['stock:A'], [[1, 1.5, 1.2], [2, 1.4, 1.1]]);
  assert.deepEqual(s.activos['cripto:B'], [null, [1, 0.9, 1.3]]);
  assert.equal(s.ultimo, '260802-261030_carrera-90d');
});
test('el visor tiene el botón Campaña y la ruta #/campana, sin selector de fecha', () => {
  const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(h, /id="mercado-campana">Campaña<\/a>/);
  assert.match(h, /\^#\\\/campana/);
  assert.doesNotMatch(h.slice(h.indexOf('async function vistaCampana'), h.indexOf('async function ruta()')), /<select|type="date"/);
});
