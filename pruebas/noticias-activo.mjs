import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ordenDe, normalizar, sumar, pagina, esGuruFocus } from '../app/generar-noticias.mjs';
const hoy = new Date('2026-11-26T20:00:00Z');
const f = (t, d, u) => ({ medio: 'M', 'fecha_local_utc-4': d, titular: t, url: u });
test('la fecha sin año toma la más reciente no futura y pasa de UTC-4 a UTC', () => {
  assert.equal(ordenDe('25 nov · 18:35', hoy), '2026-11-25T22:35:00.000Z');
  assert.equal(ordenDe('26 may · 10:19', hoy), '2026-05-26T14:19:00.000Z');
  assert.equal(ordenDe('23 dic · 04:00', hoy), '2025-12-23T08:00:00.000Z');
  assert.equal(ordenDe('', hoy), null);
});
test('descarta filas inválidas y repetidas, conserva lo anterior y ordena de reciente a antigua', () => {
  const a = sumar([], [f('Uno', '24 nov · 10:00', 'https://e.com/a'), f('', '', 'http://investing.com/'), f('Dos', '25 nov · 10:00', 'https://e.com/b')], hoy);
  assert.deepEqual(a.todas.map((n) => n.titular), ['Dos', 'Uno']); assert.equal(a.descartadas.invalidas, 1);
  const b = sumar(a.todas, [f('Uno', '24 nov · 10:00', 'https://e.com/otro'), f('Dos otra vez', '25 nov · 10:00', 'https://e.com/b'), f('Tres', '26 nov · 09:00', 'https://e.com/c')], hoy);
  assert.deepEqual(b.todas.map((n) => n.titular), ['Tres', 'Dos', 'Uno']); assert.equal(b.agregadas, 1); assert.equal(b.descartadas.repetidas, 2);
});
test('la página escapa el texto, rotula UTC-4 y enlaza al recuperado', () => {
  const n = normalizar(f('<b>x</b>', '25 nov · 18:35', 'https://e.com/a'), hoy);
  const h = pagina('GME', 'Fuente: x.', [n]);
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;') && h.includes('href="https://e.com/a"') && h.includes('UTC-4'));
});
test('GME: ficha enlazada y archivo sin duplicados ni filas inválidas', () => {
  assert.ok(/CON_NOTICIAS = new Set\(\['GME'\]\)/.test(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')));
  const d = JSON.parse(fs.readFileSync(new URL('../registros/noticias/GME.json', import.meta.url), 'utf8')).noticias;
  assert.equal(new Set(d.map((n) => n.enlace)).size, d.length);
  assert.ok(d.every((n) => n.titular && n.orden));
  assert.ok(d.every((n, i) => i === 0 || d[i - 1].orden >= n.orden));
});
test('las filas de GuruFocus se retienen salvo permiso expreso', () => {
  const g = [{ ...f('G1', '25 nov · 10:00', 'https://e.com/g1'), fuente: 'gurufocus' }, f('G2', '25 nov · 11:00', 'https://www.gurufocus.com/news/1/x')];
  assert.ok(g.every(esGuruFocus));
  const r = sumar([], g, hoy); assert.equal(r.agregadas, 0); assert.equal(r.descartadas.guruFocus, 2);
  assert.equal(sumar([], g, hoy, true).agregadas, 2);
});
