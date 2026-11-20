// node --test pruebas/actualiza-aviso.mjs. «actualiza» responde una sola vez: sin burbuja previa de
// comprobacion cuando hay cambios; la solicitud de aprobacion es la unica respuesta (decision del
// usuario, 19-nov-2026). Los ojitos de la mencion se convierten en esa unica respuesta.
// GitHub y Slack simulados, sin red; HOME temporal.
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

test('con cambios: ni una burbuja previa; la solicitud es la única respuesta y el único lugar del 👍', async (t) => {
 const s = banco(t, { conCambios: true });
 try {
  await s.run();
  // Decisión del usuario, 19-nov-2026: nada de «comprobando/hay cambios» antes de la solicitud.
  assert.equal(s.posts.length, 0);
  assert.equal(s.updates.length, 0);
  assert.equal(s.esT(), 1); // la pregunta con 👍 sigue intacta, con commit y archivos
 } finally { s.close(); }
});

test('al dia: un solo mensaje con el resultado y no pregunta nada', async (t) => {
 const s = banco(t, { conCambios: false });
 try {
  await s.run();
  assert.equal(s.posts.length, 1);
  assert.match(s.posts[0].text, /Comprobado: Hugo ya est. al d.a/);
  assert.equal(s.esT(), 0);
 } finally { s.close(); }
});

test('con ojitos: el 👀 de la mencion se convierte en la unica respuesta de actualiza', async (t) => {
 const s = banco(t, { conCambios: false });
 try {
  const { crearOjos } = await import('../app/modulos/reporte.mjs');
  const ojos = crearOjos({ client: s.ctx.app.client, token: 'x' });
  await ojos.anunciar({ channel: 'canal', ts: '1.0', thread_ts: 'hilo' });
  assert.equal(s.posts.length, 1);
  assert.equal(s.posts[0].text, '👀');
  await s.run();
  assert.equal(s.posts.length, 1); // ni un mensaje mas: la respuesta edito los ojitos
  assert.ok(s.updates.length >= 1);
  assert.ok(s.updates.every(u => u.ts === '9000.1'));
  assert.match(s.updates.at(-1).text, /Comprobado: Hugo ya est. al d.a/);
 } finally { s.close(); }
});

test('fallo de red: un solo mensaje dice que no pudo comprobar y que nada cambio', async (t) => {
 const s = banco(t, { fallaRed: true });
 try {
  await s.run();
  assert.equal(s.posts.length, 1);
  assert.match(s.posts[0].text, /No pude comprobar GitHub \(timeout simulado\)\. No cambi. nada\./);
  assert.equal(s.esT(), 0);
 } finally { s.close(); }
});

// Detección al arrancar (decisión del usuario, 20-nov-2026): con cambios, la solicitud de
// aprobación sale directa en el canal — detectar → proponer → 👍, sin tener que escribir
// «actualiza»— y caduca en silencio. Al día: silencio. El 👍 sigue siendo el del usuario.
function bancoArranque(t, { conCambios }) {
 const s = banco(t, { conCambios });
 const inicios = [];
 s.ctx.alIniciar = (f) => inicios.push(f);
 s.ctx.canal = 'canal-aviso';
 const propuestas = [];
 s.ctx.confirmar = async (o) => { propuestas.push(o); };
 return { ...s, inicios, propuestas, arrancar: async () => {
  process.env.HUGO_RETRASO_GITHUB_MS = '0';
  const { registrar } = await import('../app/modulos/github.mjs');
  registrar(conectarCaja(s.ctx));
  for (const f of inicios) await f();
  await new Promise((r) => setTimeout(r, 60));
  delete process.env.HUGO_RETRASO_GITHUB_MS;
 } };
}

test('al arrancar con cambios: propone directo en el canal, sin aviso aparte ni paso «actualiza»', async (t) => {
 const s = bancoArranque(t, { conCambios: true });
 try {
  await s.arrancar();
  assert.equal(s.propuestas.length, 1);
  assert.match(s.propuestas[0].texto, /Solicitud/);
  assert.match(s.propuestas[0].texto, /aaaaaaa/); // el commit abreviado
  assert.match(s.propuestas[0].texto, /Cambia:/); // el resumen de archivos
  assert.equal(s.propuestas[0].channel, 'canal-aviso');
  assert.equal(s.propuestas[0].user, s.ctx.usuario); // el 👍 que cuenta es el del usuario
  assert.equal(s.posts.length, 0); // ninguna burbuja aparte de la solicitud
 } finally { s.close(); }
});

test('al arrancar al día o la propuesta espontánea caducada: silencio', async (t) => {
 const alDia = bancoArranque(t, { conCambios: false });
 try {
  await alDia.arrancar();
  assert.equal(alDia.propuestas.length, 0);
  assert.equal(alDia.posts.length, 0); // al día no dice nada
 } finally { alDia.close(); }
 const s = bancoArranque(t, { conCambios: true });
 try {
  await s.arrancar();
  await s.propuestas[0].alNo({ motivo: 'sin-respuesta' }); // caduca: limpia y calla
  assert.equal(s.posts.length, 0);
 } finally { s.close(); }
 // La solicitada con «actualiza» conserva su «Sin respuesta: no apliqué nada.»
 const pedida = banco(t, { conCambios: true });
 let prop;
 pedida.ctx.confirmar = async (o) => { prop = o; };
 try {
  await pedida.run();
  await prop.alNo({ motivo: 'sin-respuesta' });
  assert.equal(pedida.posts.length, 1);
  assert.match(pedida.posts[0].text, /Sin respuesta: no apliqu. nada/);
 } finally { pedida.close(); }
});
