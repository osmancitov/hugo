import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ordenDe, normalizar, sumar, pagina, esGuruFocus, inicioVentana } from '../app/generar-noticias.mjs';
const hoy = new Date('2026-11-26T20:00:00Z');
const f = (t, d, u) => ({ medio: 'M', 'fecha_local_utc-4': d, titular: t, url: u });
test('la fecha sin año toma la más reciente no futura y pasa de UTC-4 a UTC', () => {
  assert.equal(ordenDe('25 nov · 18:35', hoy), '2026-11-25T22:35:00.000Z');
  assert.equal(ordenDe('26 may · 10:19', hoy), '2026-05-26T14:19:00.000Z');
  assert.equal(ordenDe('23 dic · 04:00', hoy), '2025-12-23T08:00:00.000Z');
  assert.equal(ordenDe('', hoy), null);
});
test('la ventana visible es la campaña de 30 días desde el 27-oct-2026 para hoy 26-nov', () => {
  assert.equal(inicioVentana(hoy).toISOString(), '2026-10-27T04:00:00.000Z');
});
test('descarta filas inválidas y repetidas, conserva lo anterior y ordena de reciente a antigua', () => {
  const a = sumar([], [f('Uno', '24 nov · 10:00', 'https://e.com/a'), f('', '', 'http://investing.com/'), f('Dos', '25 nov · 10:00', 'https://e.com/b')], hoy);
  assert.deepEqual(a.todas.map((n) => n.titular), ['Dos', 'Uno']); assert.equal(a.descartadas.invalidas, 1);
  const b = sumar(a.todas, [f('Uno', '24 nov · 10:00', 'https://e.com/otro'), f('Dos otra vez', '25 nov · 10:00', 'https://e.com/b'), f('Tres', '26 nov · 09:00', 'https://e.com/c')], hoy);
  assert.deepEqual(b.todas.map((n) => n.titular), ['Tres', 'Dos', 'Uno']); assert.equal(b.agregadas, 1); assert.equal(b.descartadas.repetidas, 2);
});
test('las filas nuevas quedan con año inferido', () => {
  const n = normalizar(f('X', '25 nov · 18:35', 'https://e.com/a'), hoy);
  assert.equal(n.anio, 2026); assert.equal(n.anio_estado, 'inferido');
});
test('la página escapa el texto, rotula UTC-4 y enlaza al recuperado', () => {
  const n = normalizar(f('<b>x</b>', '25 nov · 18:35', 'https://e.com/a'), hoy);
  const h = pagina('GME', 'Fuente: x.', [n], hoy);
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;') && h.includes('href="https://e.com/a"'));
});
test('la página solo muestra la ventana de 30 días y conserva el resto en el archivo', () => {
  const vieja = { fecha_texto: '28 ene · 04:00', orden: '2021-01-28T08:00:00.000Z', medio: 'BBC', titular: 'Vieja', enlace: 'https://e.com/v', lote: '', anio: 2021, anio_estado: 'verificado', anio_fuente: 'https://e.com/f' };
  const nueva = normalizar(f('Nueva', '25 nov · 10:00', 'https://e.com/n'), hoy);
  const h = pagina('GME', 'Fuente: x.', [vieja, nueva], hoy);
  assert.ok(!h.includes('>Vieja<') && h.includes('>Nueva<'));
  assert.equal((h.match(/<li>/g) || []).length, 1); assert.ok(!h.includes('class="nota"') && !h.includes('<footer'));
});
test('el año verificado se muestra y el inferido no; la nota queda en los datos y los enlaces extra aparecen', () => {
  const verif = { fecha_texto: '24 nov · 10:00', orden: '2026-11-24T14:00:00.000Z', medio: 'M', titular: 'Con año', enlace: 'https://e.com/a', lote: '', anio: 2026, anio_estado: 'verificado', anio_fuente: 'https://e.com/f', enlaces_extra: [{ etiqueta: 'GuruFocus', url: 'https://www.gurufocus.com/news/1/x' }] };
  const inf = normalizar(f('Sin año', '25 nov · 10:00', 'https://e.com/b'), hoy);
  const ever = { fecha_texto: '8 nov · 11:52', orden: '2026-11-08T15:52:00.000Z', medio: 'CNN', titular: 'Cotización', enlace: 'https://e.com/c', lote: '', anio_estado: 'sin_fecha', nota_fecha: 'Página de cotización sin fecha de publicación.' };
  const h = pagina('GME', 'Fuente: x.', [verif, inf, ever], hoy);
  assert.ok(h.includes('24 nov 2026 · 10:00'));
  assert.ok(h.includes('>25 nov · 10:00<') && !h.includes('25 nov 2026'));
  assert.ok(!h.includes('>8 nov 2026') && h.includes('>8 nov · 11:52<'));
  assert.ok(!h.includes('sin fecha de publicación'), 'la nota de fecha queda en los datos, no se muestra (ruido, 26-nov-2026)');
  assert.ok(h.includes('GuruFocus ↗') && h.includes('https://www.gurufocus.com/news/1/x'));
});
test('fichas enlazadas y archivos sin duplicados ni filas inválidas', () => {
  assert.ok(/CON_NOTICIAS = new Set\(\['GME', 'LLY', 'WDC'\]\)/.test(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')));
  for (const cod of ['GME', 'LLY', 'WDC']) {
    const d = JSON.parse(fs.readFileSync(new URL(`../registros/noticias/${cod}.json`, import.meta.url), 'utf8')).noticias;
    assert.equal(new Set(d.map((n) => n.enlace)).size, d.length, cod);
    assert.ok(d.every((n) => n.titular && n.orden), cod);
    assert.ok(d.every((n, i) => i === 0 || d[i - 1].orden >= n.orden), cod);
  }
});
test('las filas de GuruFocus se retienen salvo permiso expreso', () => {
  const g = [{ ...f('G1', '25 nov · 10:00', 'https://e.com/g1'), fuente: 'gurufocus' }, f('G2', '25 nov · 11:00', 'https://www.gurufocus.com/news/1/x')];
  assert.ok(g.every(esGuruFocus));
  const r = sumar([], g, hoy); assert.equal(r.agregadas, 0); assert.equal(r.descartadas.guruFocus, 2);
  assert.equal(sumar([], g, hoy, true).agregadas, 2);
});
