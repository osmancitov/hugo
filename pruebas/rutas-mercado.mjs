import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { partirIndice, reubicarImportaciones, entrada, generar, GRUPOS } from '../app/generar-rutas-mercado.mjs';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('index.html se parte en estilos, shell y script module', () => {
  const p = partirIndice(html);
  assert.ok(p.css.includes('.camp-dia'));
  assert.ok(p.js.includes('async function ruta()'));
  assert.ok(p.medio.includes('<main id="app">'));
});
test('las importaciones del script pasan a ser relativas a app/', () => {
  const j = reubicarImportaciones("import { a } from './app/modulos/x.mjs?v=1';\nimport { b } from './visor-rachas.mjs?v=10';\nconst r = import('./app/modulos/y.mjs');");
  assert.ok(j.includes("from './modulos/x.mjs?v=1'"));
  assert.ok(j.includes("from '../visor-rachas.mjs?v=10'"));
  assert.ok(j.includes("import('./modulos/y.mjs')"));
  assert.ok(!/['"]\.\/app\//.test(reubicarImportaciones(partirIndice(html).js)));
});
test('cada dirección tiene entrada mínima con base, og propio y los mismos archivos compartidos', () => {
  const { paginas, base } = generar(raiz, { escribir: false });
  assert.equal(base, '/hugo/');
  assert.ok(paginas.has('mercado/'));
  for (const g of GRUPOS) assert.ok(paginas.has(`mercado/${g}/`));
  const gme = paginas.get('mercado/stock/GME/');
  assert.ok(gme.includes('<base href="/hugo/">'));
  assert.ok(gme.includes('<title>GME · Mercado · Observatorio Bursátil</title>'));
  assert.ok(gme.includes('content="https://osmancitov.github.io/hugo/mercado/stock/GME/"'));
  assert.ok(/<script type="module" src="app\/observatorio\.mjs\?v=[0-9a-f]{10}"><\/script>/.test(gme));
  assert.ok(gme.length < 20000);
  assert.ok(!gme.includes('async function ruta()'));
});
test('el enrutador usa direcciones limpias de Mercado y no deja restos del formato antiguo', () => {
  assert.ok(!html.includes('unificada/30d'));
  assert.ok(!html.includes("'#/unificada"));
  assert.ok(html.includes("const urlMercado = "));
});
