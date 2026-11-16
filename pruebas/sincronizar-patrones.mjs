// node --test pruebas/sincronizar-patrones.mjs. La sincronizacion acepta codigos de 1 letra y
// Unicode en las rutas del registro (la misma forma que CODIGO_OK). GitHub simulado, sin red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const vela = (t) => [t, '1', '2', '1', '2', '10', t + 86400000 - 1, '10', 3, '1', '2', '0'];
const serie = JSON.stringify([vela(Date.UTC(2026, 10, 1)), vela(Date.UTC(2026, 10, 2))]);

test('pasada sube cripto/A, cripto/牛来 y stock/AA en un solo commit; nombres ajenos no entran', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-sync-'));
  const velas = path.join(root, 'velas');
  for (const [clase, codigo] of [['cripto', 'A'], ['cripto', '牛来'], ['stock', 'AA']]) {
    fs.mkdirSync(path.join(velas, clase, codigo), { recursive: true });
    fs.writeFileSync(path.join(velas, clase, codigo, `2611_${codigo}`), serie);
  }
  fs.writeFileSync(path.join(velas, 'cripto', 'A', 'nota.txt'), 'ajeno'); // no es archivo mensual: no entra
  const envAntes = process.env.HUGO_VELAS_DIR;
  process.env.HUGO_VELAS_DIR = velas;
  const original = globalThis.fetch;
  const arboles = [], commits = [], refs = [];
  let blobs = 0;
  globalThis.fetch = async (u, opts = {}) => {
    const url = new URL(u); const p = url.pathname; let j = {};
    if (p.endsWith('/git/ref/heads/main')) j = { object: { sha: 'c0' } };
    else if (p.endsWith('/git/commits/c0')) j = { tree: { sha: 't0' } };
    else if (p.endsWith('/git/trees/t0')) j = { tree: [] };
    else if (p === '/repos/osman/repo') j = { permissions: { push: true } };
    else if (p.endsWith('/git/blobs') && opts.method === 'POST') j = { sha: 'b' + ++blobs };
    else if (p.endsWith('/git/trees') && opts.method === 'POST') { arboles.push(JSON.parse(opts.body).tree.map((e) => e.path)); j = { sha: 't1' }; }
    else if (p.endsWith('/git/commits') && opts.method === 'POST') { commits.push(JSON.parse(opts.body)); j = { sha: 'c1' }; }
    else if (p.endsWith('/git/refs/heads/main') && opts.method === 'PATCH') { refs.push(JSON.parse(opts.body)); j = {}; }
    else throw new Error('llamada no prevista: ' + opts.method + ' ' + p);
    return { ok: true, status: 200, json: async () => j };
  };
  try {
    const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
    const ctx = {
      conf: { HUGO_GITHUB: 'osman/repo' }, app: { client: {} }, botToken: 'x', canal: 'C',
      parada: { n: 0 }, activas: new Map(), leerClave: () => 'token-simulado',
      comando: () => {}, alIniciar: () => {},
    };
    registrar(ctx);
    const r = await ctx.pasadaSincronizacion();
    assert.ok(r.texto.includes('subí 3'), r.texto);
    assert.equal(arboles.length, 1);
    const rutas = arboles[0].sort();
    assert.deepEqual(rutas, ['registros/velas-24h/cripto/A/2611_A', 'registros/velas-24h/cripto/牛来/2611_牛来', 'registros/velas-24h/stock/AA/2611_AA'].sort());
    assert.equal(commits.length, 1);
    assert.equal(commits[0].author.email, 'osmanvielma@gmail.com');
    assert.equal(commits[0].committer.email, 'osmanvielma@gmail.com');
    assert.deepEqual(refs, [{ sha: 'c1' }]);
  } finally {
    globalThis.fetch = original;
    if (envAntes === undefined) delete process.env.HUGO_VELAS_DIR; else process.env.HUGO_VELAS_DIR = envAntes;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
