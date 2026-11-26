import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { leerRss, unir, pagina } from '../app/generar-noticias.mjs';
const xml = `<rss><channel><item><title>A &amp; B</title><link>https://example.com/articles/a?utm_source=x</link><pubDate>Wed, 25 Nov 2026 10:00:00 +0000</pubDate></item><item><title>Nueva</title><link>https://example.com/articles/b</link><pubDate>Thu, 26 Nov 2026 10:00:00 +0000</pubDate></item></channel></rss>`;
test('lee, limpia enlaces y ordena de reciente a antiguo', () => {
  const n = unir([], leerRss(xml, 'M'));
  assert.equal(n[0].titulo, 'Nueva'); assert.equal(n[1].titulo, 'A & B');
  assert.equal(n[1].enlace, 'https://example.com/articles/a');
  assert.equal(unir(n, n).length, 2);
});
test('la página escapa y enlaza al original', () => {
  const h = pagina('GME', [{ titulo: '<b>x</b>', enlace: 'https://e.com/a', medio: 'M', fecha: '2026-11-26T10:00:00Z' }], '2026-11-26T10:00:00Z');
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;') && h.includes('href="https://e.com/a"'));
});
test('la ficha de GME enlaza su página de noticias y el archivo existe', () => {
  assert.ok(/CON_NOTICIAS = new Set\(\['GME'\]\)/.test(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')));
  assert.ok(fs.existsSync(new URL('../noticias/GME.html', import.meta.url)));
});
