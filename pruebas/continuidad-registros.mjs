// node --test pruebas/continuidad-registros.mjs. Un activo que ya venía registrando no puede
// perder un día UTC: se señala activo y fecha. Datos simulados, sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditarContinuidad, textoHuecos } from '../app/modulos/continuidad-registros.mjs';

const DIA = 86400000;
const D = (m, d) => Date.UTC(2026, m - 1, d);
const vela = (t) => [t, '1', '1', '1', '1', '1', t + DIA - 1, '1', 1, '1', '1', '0'];
function banco(series) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-cont-'));
  for (const [clase, codigo, dias] of series) {
    const porMes = {};
    for (const t of dias) { const f = new Date(t); const m = `${String(f.getUTCFullYear() % 100)}${String(f.getUTCMonth() + 1).padStart(2, '0')}`; (porMes[m] ||= []).push(vela(t)); }
    const dir = path.join(raiz, clase, codigo); fs.mkdirSync(dir, { recursive: true });
    for (const [m, v] of Object.entries(porMes)) fs.writeFileSync(path.join(dir, `${m}_${codigo}`), JSON.stringify(v));
  }
  return raiz;
}
const rango = (a, b) => { const r = []; for (let t = a; t <= b; t += DIA) r.push(t); return r; };

test('sin huecos: activos completos y uno que entró después no dan alarma', () => {
  const r = banco([['cripto', 'AAA', rango(D(10, 25), D(11, 23))], ['stock', 'BBB', rango(D(11, 18), D(11, 23))]]);
  assert.deepEqual(auditarContinuidad(r, D(11, 23)), []);
});
test('día intermedio perdido, cruzando meses: se nombra activo y fecha', () => {
  const dias = rango(D(10, 25), D(11, 23)).filter((t) => t !== D(10, 31) && t !== D(11, 2));
  const r = banco([['cripto', 'AAA', dias], ['stock', 'BBB', rango(D(11, 1), D(11, 23))]]);
  const h = auditarContinuidad(r, D(11, 23));
  assert.equal(h.length, 1);
  assert.equal(h[0].codigo, 'AAA');
  assert.deepEqual(h[0].faltan, ['2026-10-31', '2026-11-02']);
  assert.match(textoHuecos(h, D(11, 23)), /cripto:AAA .*falta 2026-10-31, 2026-11-02/);
});
test('un activo que dejó de registrar antes del último cierre también se señala', () => {
  const r = banco([['cripto', 'AAA', rango(D(11, 1), D(11, 21))]]);
  assert.deepEqual(auditarContinuidad(r, D(11, 23))[0].faltan, ['2026-11-22', '2026-11-23']);
});
test('el último día cerrado debe ser medianoche UTC', () => {
  const r = banco([['cripto', 'AAA', rango(D(11, 1), D(11, 3))]]);
  assert.throws(() => auditarContinuidad(r, D(11, 3) + 1), /medianoche UTC/);
});
test('la corrida diaria falla antes de publicar si hay huecos', () => {
  const s = fs.readFileSync(new URL('../.github/actualizacion-diaria.mjs', import.meta.url), 'utf8');
  assert.ok(s.indexOf('auditarContinuidad(process.env.HUGO_VELAS_DIR') > s.indexOf('est.hasta < objetivo + DIA'));
  assert.ok(s.indexOf('auditarContinuidad(process.env.HUGO_VELAS_DIR') < s.indexOf('ctx.correrPasada'));
  assert.match(s, /process\.exit\(1\)/);
});
