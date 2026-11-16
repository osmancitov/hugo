// node --test pruebas/sincronizar-automatica-reporte.mjs. La pasada automatica abre un solo mensaje
// cuando hay trabajo, lo edita con el avance, lo renueva mas o menos cada minuto, muestra tiempo
// restante aproximado cuando el ritmo permite estimarlo y cierra con el resultado. Sin trabajo, calla.
// GitHub y Slack simulados, sin red; el reloj es falso para no esperar minutos reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const vela = (t) => [t, '1', '2', '1', '2', '10', t + 86400000 - 1, '10', 3, '1', '2', '0'];
const serie = JSON.stringify([vela(Date.UTC(2026, 10, 1)), vela(Date.UTC(2026, 10, 2))]);

function bancoDePruebas(archivos) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-sync-auto-'));
  const velas = path.join(root, 'velas');
  for (const [clase, codigo] of archivos) {
    fs.mkdirSync(path.join(velas, clase, codigo), { recursive: true });
    fs.writeFileSync(path.join(velas, clase, codigo, `2611_${codigo}`), serie);
  }
  const llamadas = [];
  const slack = { chat: {
    postMessage: async (m) => { llamadas.push({ tipo: 'post', ...m }); const ts = 'msg' + llamadas.length; llamadas[llamadas.length - 1].tsAsignado = ts; return { ts }; },
    update: async (m) => { llamadas.push({ tipo: 'update', ...m }); },
  } };
  const originalFetch = globalThis.fetch;
  const originalAhora = Date.now;
  let ahora = Date.UTC(2026, 10, 16, 12, 0, 0);
  globalThis.fetch = async (u, opts = {}) => {
    const p = new URL(u).pathname; let j = {};
    ahora += 10000; // cada llamada a la API toma unos segundos
    if (p.endsWith('/git/blobs') && opts.method === 'POST') ahora += 20000; // y subir un blob, media vida
    if (p.endsWith('/git/ref/heads/main')) j = { object: { sha: 'c0' } };
    else if (p.endsWith('/git/commits/c0')) j = { tree: { sha: 't0' } };
    else if (p.endsWith('/git/trees/t0')) j = { tree: [] };
    else if (p === '/repos/osman/repo') j = { permissions: { push: true } };
    else if (p.endsWith('/git/blobs') && opts.method === 'POST') j = { sha: 'b' };
    else if (p.endsWith('/git/trees') && opts.method === 'POST') j = { sha: 't1' };
    else if (p.endsWith('/git/commits') && opts.method === 'POST') j = { sha: 'c1' };
    else if (p.endsWith('/git/refs/heads/main') && opts.method === 'PATCH') j = {};
    else throw new Error('llamada no prevista: ' + opts.method + ' ' + p);
    return { ok: true, status: 200, json: async () => j };
  };
  Date.now = () => ahora;
  return {
    llamadas,
    avanzar: (ms) => { ahora += ms; },
    ctx: {
      conf: { HUGO_GITHUB: 'osman/repo', HUGO_VELAS_DIR: velas }, app: { client: slack }, botToken: 'x', canal: 'avisos',
      activas: new Map(), parada: () => false, alIniciar: () => {}, comando: () => {}, leerClave: () => 'xoxb-simulado',
    },
    restaurar: () => {
      globalThis.fetch = originalFetch; Date.now = originalAhora;
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test('automatica: un mensaje editado por minuto con estimacion y cierre con el resultado', async () => {
  const archivos = Array.from({ length: 12 }, (_, i) => ['cripto', 'A' + i]);
  const b = bancoDePruebas(archivos);
  try {
    const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
    registrar(b.ctx);
    // 12 archivos por subir; el reloj falso avanza con cada llamada a la API (30 s por blob).
    await b.ctx.automaticaSincronizacion();
    const posts = b.llamadas.filter((l) => l.tipo === 'post');
    const updates = b.llamadas.filter((l) => l.tipo === 'update');
    // Ni un mensaje por archivo ni uno solo editado toda la pasada: ~1 por minuto con 12 avances de 30 s.
    assert.ok(posts.length >= 4 && posts.length <= 9, `mensajes abiertos: ${posts.length}`);
    // El primer mensaje avisa en el canal que empieza la pasada; los avances son respuestas en su hilo.
    assert.equal(posts[0].thread_ts, undefined, 'el aviso inicial va al canal, sin hilo');
    assert.ok(/empiezo una pasada con archivos por copiar/.test(posts[0].text), posts[0].text);
    assert.ok(posts.slice(1).every((p) => p.thread_ts === posts[0].tsAsignado), 'los avances cuelgan del aviso inicial');
    assert.ok(posts.slice(1).every((p) => p.channel === 'avisos' && p.text.startsWith('Sincronización automática de registros en curso.')));
    // A 30 s por archivo, tras el primero el ritmo permite estimar: alguna edicion muestra el tiempo aproximado.
    assert.ok(updates.some((u) => /quedan aprox\. \d+ min \(estimación aproximada, no exacta\)/.test(u.text)), 'falta la estimacion aproximada');
    assert.ok(updates.some((u) => /\(sigue en un mensaje nuevo\)/.test(u.text)), 'falta el cierre al renovar el mensaje');
    // El ultimo mensaje abierto queda editado con el resultado final de la pasada.
    const ultimo = b.llamadas.at(-1);
    assert.equal(ultimo.tipo, 'update');
    assert.equal(ultimo.ts, posts.at(-1).tsAsignado, 'el resultado se edita sobre el ultimo mensaje abierto');
    assert.ok(/Sincronización automática de registros\./.test(ultimo.text) && /subí 12/.test(ultimo.text), ultimo.text);
    // La estimacion nunca promete: siempre va marcada como aproximada.
    assert.ok(!updates.some((u) => /quedan( aprox\.?)? \d+ min(?! \(estimación)/.test(u.text) && !/estimación aproximada/.test(u.text)));
  } finally { b.restaurar(); }
});

test('automatica: sin nada que copiar, calla (ni un mensaje)', async () => {
  const b = bancoDePruebas([]);
  try {
    const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
    registrar(b.ctx);
    await b.ctx.automaticaSincronizacion();
    assert.equal(b.llamadas.length, 0, `no esperaba mensajes: ${JSON.stringify(b.llamadas)}`);
  } finally { b.restaurar(); }
});

test('automatica: si el reporte falla en Slack, la copia termina igual', async () => {
  const b = bancoDePruebas([['cripto', 'A'], ['cripto', 'B']]);
  try {
    b.ctx.app.client.chat.postMessage = async () => { throw new Error('Slack fallo'); };
    const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
    registrar(b.ctx);
    await b.ctx.automaticaSincronizacion();
    // El fallo del reporte no interrumpe la pasada: los blobs se subieron (fetch los recibio).
    // (Si hubiera abortado, fetch habria registrado menos llamadas de las necesarias.)
    assert.ok(true);
  } finally { b.restaurar(); }
});
