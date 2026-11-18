// node --test pruebas/actualiza-aviso.mjs. «actualiza» avisa al empezar y cierra en el mismo
// mensaje, usando la caja unica de reportes. GitHub y Slack simulados, sin red; HOME temporal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { conectarCaja } from './caja.mjs';

const SHA = 'a'.repeat(40);
function paqueteRepo(root) {
 const src = path.join(root, 'repo-src');
 fs.mkdirSync(path.join(src, 'app/modulos'), { recursive: true });
 fs.mkdirSync(path.join(src, 'manual'), { recursive: true });
 fs.writeFileSync(path.join(src, 'app/app.mjs'), '// app\n');
 fs.writeFileSync(path.join(src, 'app/modulos/saludo.mjs'), '// saludo\n');
 fs.writeFileSync(path.join(src, 'manual/manual-hugo.md'), '# manual\n');
 const tgz = path.join(root, 'repo.tar.gz');
 execFileSync('tar', ['-czf', tgz, '-C', src, '.']);
 return fs.readFileSync(tgz);
}
function banco(t, { conCambios, fallaRed }) {
 const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-act-'));
 const homeViejo = process.env.HOME;
 process.env.HOME = home;
 const posts = [], updates = []; let confirmaciones = 0;
 const tar = paqueteRepo(home);
 if (!conCambios) { // lo instalado es identico a lo del repo
  fs.mkdirSync(path.join(home, 'Documents/hugo/app/modulos'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Documents/hugo/manual'), { recursive: true });
  fs.writeFileSync(path.join(home, 'Documents/hugo/app/app.mjs'), '// app\n');
  fs.writeFileSync(path.join(home, 'Documents/hugo/app/modulos/saludo.mjs'), '// saludo\n');
  fs.writeFileSync(path.join(home, 'Documents/hugo/manual/manual-hugo.md'), '# manual\n');
 }
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (u) => {
  if (fallaRed) throw new Error('timeout simulado');
  if (u.includes('api.github.com')) return { ok: true, status: 200, json: async () => ({ sha: SHA, commit: { message: 'Titulo del commit' } }) };
  return { ok: true, status: 200, arrayBuffer: async () => tar.buffer.slice(tar.byteOffset, tar.byteOffset + tar.byteLength) };
 };
 let handler;
 const ctx = {
  conf: { HUGO_GITHUB: 'osman/repo' }, actualizacionEnCurso: async () => false,
  app: { client: { chat: {
   postMessage: async m => { posts.push(m); return { ts: '9000.1' }; },
   update: async m => { updates.push(m); return { ok: true }; },
  } } },
  confirmar: async () => { confirmaciones++; },
  comando: (p, f) => { handler = f; },
  alIniciar: () => {},
 };
 return { home, posts, updates, ctx, esT: () => confirmaciones, run: async () => {
  const { registrar } = await import('../app/modulos/github.mjs');
  registrar(conectarCaja(ctx));
  await handler({ channel: 'canal', ts: '1.0', thread_ts: 'hilo' }, 'actualiza');
 }, close: () => { globalThis.fetch = originalFetch; process.env.HOME = homeViejo; fs.rmSync(home, { recursive: true, force: true }); } };
}

test('con cambios: aviso inmediato, cierre editado en el mismo mensaje y la pregunta va aparte', async (t) => {
 const s = banco(t, { conCambios: true });
 try {
  await s.run();
  assert.equal(s.posts.length, 1);
  assert.match(s.posts[0].text, /Compruebo osman\/repo en GitHub/);
  assert.match(s.posts[0].text, /a.n no instalo nada/);
  assert.ok(s.updates.length >= 1);
  assert.ok(s.updates.every(u => u.ts === '9000.1'));
  assert.match(s.updates.at(-1).text, /Hay cambios en GitHub: commit aaaaaaa/);
  assert.match(s.updates.at(-1).text, /no instalo nada sin tu/);
  assert.equal(s.esT(), 1); // la pregunta con 👍 sigue intacta y va aparte
 } finally { s.close(); }
});

test('al dia: cierra el mismo mensaje y no pregunta nada', async (t) => {
 const s = banco(t, { conCambios: false });
 try {
  await s.run();
  assert.equal(s.posts.length, 1);
  assert.match(s.updates.at(-1).text, /Comprobado: Hugo ya est. al d.a/);
  assert.equal(s.esT(), 0);
 } finally { s.close(); }
});

test('con ojitos: el 👀 de la mencion se convierte en el reporte de actualiza', async (t) => {
 const s = banco(t, { conCambios: false });
 try {
  const { crearOjos } = await import('../app/modulos/reporte.mjs');
  const ojos = crearOjos({ client: s.ctx.app.client, token: 'x' });
  await ojos.anunciar({ channel: 'canal', ts: '1.0', thread_ts: 'hilo' });
  assert.equal(s.posts.length, 1);
  assert.equal(s.posts[0].text, '👀');
  await s.run();
  assert.equal(s.posts.length, 1); // ni un mensaje mas: el reporte edito los ojitos
  assert.ok(s.updates.length >= 1);
  assert.ok(s.updates.every(u => u.ts === '9000.1'));
  assert.match(s.updates.at(-1).text, /Comprobado: Hugo ya est. al d.a/);
 } finally { s.close(); }
});

test('fallo de red: el mismo mensaje dice que no pudo comprobar y que nada cambio', async (t) => {
 const s = banco(t, { fallaRed: true });
 try {
  await s.run();
  assert.equal(s.posts.length, 1);
  assert.match(s.updates.at(-1).text, /No pude comprobar GitHub \(timeout simulado\)\. No cambi. nada\./);
  assert.equal(s.esT(), 0);
 } finally { s.close(); }
});
