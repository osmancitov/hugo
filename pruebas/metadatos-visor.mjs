import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('el título de página y Open Graph coinciden con el nombre aprobado', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>Observatorio Bursátil<\/title>/);
  assert.match(html, /<meta property="og:title" content="Observatorio Bursátil">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/osmancitov.github.io\/hugo\/identidad\/tarjeta.jpg">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/osmancitov.github.io\/hugo\/">/);
});


test('superficie tiene entrada estática con metadatos propios antes de ejecutar JS', async () => {
 const { paginaSuperficie } = await import('../app/generar-pagina-superficie.mjs');
 const original = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
 const html = paginaSuperficie(original), head = html.slice(0, html.indexOf('</head>'));
 assert.match(head, /og:title" content="Superficie 3D · Observatorio Bursátil/);
 assert.match(head, /og:image" content="https:\/\/osmancitov.github.io\/hugo\/superficie-og.jpg/);
 assert.match(head, /og:url" content="https:\/\/osmancitov.github.io\/hugo\/superficie.html/);
 assert.match(html, /if \(!location.hash\) history.replaceState/);
 assert.match(html, /href="\.\/"/);
 assert.match(html, /href: 'index.html#\/stock'/);
 assert.ok(!html.includes('enlaceSuperficie')); // sin enlaces entre las vistas (decisión del usuario, 21-nov-2026)
 assert.doesNotMatch(head, /twitter:/);
 assert.equal((html.match(/function vistaSuperficie\(/g) || []).length, 1);
 assert.ok(!original.includes('enlaceSuperficie'));
});
