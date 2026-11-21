import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('el título de página y Open Graph coinciden con el nombre aprobado', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>Hugo · Observatorio Bursátil<\/title>/);
  assert.match(html, /<meta property="og:title" content="Hugo · Observatorio Bursátil">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/osmancitov.github.io\/hugo\/hugo3.jpg">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/osmancitov.github.io\/hugo\/">/);
});
