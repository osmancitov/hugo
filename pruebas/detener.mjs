// node --test pruebas/detener.mjs. Sin red ni cuentas: Slack, Binance, GitHub y systemd simulados.
// Cubre la parada unica (ctx.parada): stop y restart la suben; borrado, registro y sincronizacion frenan limpio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearMotor, leerEstado } from '../app/modulos/registro-motor.mjs';
import { conectarCaja } from './caja.mjs';

const event = { channel: 'C', ts: '100', thread_ts: '100', user: 'U1' };

// ctx falso con lo que usan detener, reiniciar, borrar-hilo y sincronizar-registros.
function fakeCtx(over = {}) {
  const msgs = [];
  const ctx = {
    botToken: 'x', canal: 'C', conf: {}, parada: { n: 0 }, activas: new Map(),
    botUserId: 'UBOT', usuario: 'U1', delegado: '',
    leerClave: () => '',
    esperando: () => [],
    actualizacionEnCurso: async () => false,
    app: { client: {
      chat: {
        postMessage: async (m) => { msgs.push(m.text); return { ts: `m${msgs.length}` }; },
        update: async (m) => { msgs.push(m.text); return { ts: m.ts }; },
        delete: async () => ({}),
      },
      conversations: { replies: async () => ({ messages: [], response_metadata: {} }), join: async () => ({}) },
      auth: { test: async () => ({ user_id: 'UBOT' }) },
    } },
    comandos: [],
    comando(patron, fn, opciones = {}) { this.comandos.push({ patron, fn, opciones }); },
    porDefecto() {}, alMencionar() {}, alIniciar() {},
    confirmar: null,
    ...over,
  };
  return { ctx, msgs };
}
const handlerDe = (ctx, re) => ctx.comandos.find((c) => re.test(c.patron.source)).fn;

test('stop sin trabajo largo no hace nada y lo dice', async () => {
  const { ctx, msgs } = fakeCtx();
  const { registrar } = await import('../app/modulos/detener.mjs');
  registrar(ctx);
  await handlerDe(ctx, /stop/)(event, 'stop', {});
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /No estoy haciendo/);
});

test('stop con actualizacion en curso no detiene la actualizacion', async () => {
  const { ctx, msgs } = fakeCtx({ actualizacionEnCurso: async () => true });
  ctx.activas.set('x', { que: 'borrar un hilo', desde: Date.now(), largo: true });
  const { registrar } = await import('../app/modulos/detener.mjs');
  registrar(ctx);
  await handlerDe(ctx, /stop/)(event, 'stop', {});
  assert.match(msgs[0], /actualizaci\u00f3n en curso/i);
  assert.equal(ctx.parada.n, 0);
});

test('stop con trabajo largo pide pulgar y al aceptar sube la parada unica', async () => {
  const { ctx, msgs } = fakeCtx();
  ctx.activas.set('x', { que: 'registrar NVDA, noviembre (1/2)', desde: Date.now(), largo: true });
  let captura = null;
  ctx.confirmar = async (o) => { captura = o; await o.alSi({ ts: 'm1' }); };
  const { registrar } = await import('../app/modulos/detener.mjs');
  registrar(ctx);
  await handlerDe(ctx, /stop/)(event, 'stop', {});
  assert.ok(captura);
  assert.equal(captura.user, 'U1');
  assert.match(captura.texto, /registrar NVDA/);
  assert.equal(ctx.parada.n, 1);
  assert.ok(msgs.some((t) => /Detengo el trabajo en curso/.test(t)));
});

test('stop sin respuesta no detiene nada', async () => {
  const { ctx, msgs } = fakeCtx();
  ctx.activas.set('x', { que: 'borrar un hilo', desde: Date.now(), largo: true });
  let captura = null;
  ctx.confirmar = async (o) => { captura = o; await o.alNo({ motivo: 'sin-respuesta' }); };
  const { registrar } = await import('../app/modulos/detener.mjs');
  registrar(ctx);
  await handlerDe(ctx, /stop/)(event, 'stop', {});
  assert.equal(ctx.parada.n, 0);
  assert.ok(msgs.some((t) => /no detuve nada/.test(t)));
});

test('borrar hilo frena entre mensajes: parcial, raiz conservada y largo anunciado', async () => {
  process.env.HUGO_PAUSA_BORRADO_MS = '1';
  try {
    const borrados = [];
    const { ctx, msgs } = fakeCtx();
    const respuestas = Array.from({ length: 8 }, (_, i) => ({ ts: String(101 + i), user: 'UBOT' }));
    ctx.app.client.conversations.replies = async () => ({ messages: [{ ts: '100', user: 'U1' }, ...respuestas], response_metadata: {} });
    ctx.app.client.chat.delete = async (m) => { borrados.push(m.ts); if (borrados.length === 3) ctx.parada.n++; return {}; };
    let captura = null;
    ctx.confirmar = async (o) => { captura = o; await o.alSi({ ts: 'm1' }); };
    const { registrar } = await import('../app/modulos/borrar-hilo.mjs');
    registrar(ctx);
    await handlerDe(ctx, /borrar/)(event, 'borrar hilo', {});
    assert.equal(captura.largo, true);
    assert.equal(borrados.length, 3);
    assert.ok(!borrados.includes('100')); // la raiz no se toca al detener
    assert.ok(msgs.some((t) => /Borrado detenido a pedido: borr\u00e9 3 de 9/.test(t) && /primer mensaje se conserva/.test(t)));
  } finally { delete process.env.HUGO_PAUSA_BORRADO_MS; }
});

const octubre = Date.UTC(2026, 9, 1);
const vela = (t) => [t, '1', '2', '1', '2', '10', t + 86400000 - 1, '10', 3, '1', '2', '0'];

test('registro: stop lo pausa limpio (sin culpar a un fallo) y registra continuar lo retoma', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-stop-'));
  try {
    const parada = { n: 0 };
    const msgs = [], activas = new Map();
    let consultas = 0;
    const m = crearMotor({
      ahora: () => Date.UTC(2026, 10, 1),
      base: () => path.join(root, 'velas'), archivoEstado: () => path.join(root, 'privado/estado.json'),
      activas, parada,
      resolver: async (clase, codigo) => ({ ok: true, simbolo: `${codigo}USDT`, nombre: codigo }),
      fetchImpl: async (u) => {
        consultas++;
        if (consultas === 2) parada.n++; // la parada llega a mitad del recorrido
        const t = Number(new URL(u).searchParams.get('startTime'));
        return { ok: true, status: 200, text: async () => JSON.stringify(t === octubre ? [vela(t)] : []) };
      },
      avisar: async (j, t) => { msgs.push(t); },
    });
    await m.iniciar({ clase: 'stock', codigos: ['AA', 'BB'], event });
    let j = leerEstado(path.join(root, 'privado/estado.json'));
    assert.equal(j.estado, 'pausado');
    assert.match(j.error, /Detenido a pedido/);
    assert.equal(j.conteo.guardados, 1); // octubre de AA ya quedo guardado
    const aviso = msgs.find((t) => /detenido a pedido/i.test(t));
    assert.ok(aviso);
    assert.match(aviso, /registra continuar/);
    assert.ok(!/Corrige la causa/.test(aviso)); // una parada pedida no es un error a corregir
    assert.equal(activas.size, 0);
    // Y se retoma donde quedo, aunque la parada vieja siga en el contador.
    await m.iniciar({ event, continuar: true });
    j = leerEstado(path.join(root, 'privado/estado.json'));
    assert.equal(j.estado, 'terminado');
    assert.equal(j.conteo.activos, 2);
    assert.ok(msgs.some((t) => /Registro terminado/.test(t)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('restart siempre pide pulgar; con trabajo largo ademas interrumpe', async () => {
  const { registrar } = await import('../app/modulos/reiniciar.mjs');
  // Sin trabajo largo: pide pulgar y al aceptar reinicia directo (systemd-run simulado falla en la prueba).
  {
    const { ctx, msgs } = fakeCtx();
    let captura = null;
    ctx.confirmar = async (o) => { captura = o; await o.alSi({ ts: 'm1' }); };
    registrar(ctx);
    await handlerDe(ctx, /restart/)(event, 'restart', {});
    assert.ok(captura);
    assert.match(captura.texto, /Reinicio a Hugo/);
    assert.ok(msgs.some((t) => /^Reiniciando\./.test(t)));
    assert.equal(ctx.parada.n, 0);
  }
  // Sin respuesta no reinicia.
  {
    const { ctx, msgs } = fakeCtx();
    ctx.confirmar = async (o) => { await o.alNo({ motivo: 'sin-respuesta' }); };
    registrar(ctx);
    await handlerDe(ctx, /restart/)(event, 'restart', {});
    assert.ok(msgs.some((t) => /no reinicio/.test(t)));
    assert.equal(ctx.parada.n, 0);
  }
  // Con trabajo largo: pregunta, y con pulgar sube la parada y luego reinicia.
  {
    const { ctx, msgs } = fakeCtx();
    ctx.activas.set('x', { que: 'borrar un hilo', desde: Date.now(), largo: true });
    setTimeout(() => ctx.activas.delete('x'), 50); // el trabajo frena limpio y sale
    let captura = null;
    ctx.confirmar = async (o) => { captura = o; await o.alSi({ ts: 'm1' }); };
    registrar(ctx);
    await handlerDe(ctx, /restart/)({ ...event, user: 'U1' }, 'reiniciar', {});
    assert.ok(captura);
    assert.match(captura.texto, /borrar un hilo/);
    assert.equal(ctx.parada.n, 1);
    assert.ok(msgs.some((t) => /Trabajo detenido\. Reiniciando\./.test(t)));
  }
  // Con actualizacion en curso: se niega, como antes.
  {
    const { ctx, msgs } = fakeCtx({ actualizacionEnCurso: async () => true });
    ctx.confirmar = async () => { throw new Error('no debe pedir pulgar'); };
    registrar(ctx);
    await handlerDe(ctx, /restart/)(event, 'restart', {});
    assert.match(msgs[0], /actualizaci\u00f3n en curso/i);
  }
});

// Sincronizacion: GitHub simulado; la parada frena la pasada sin publicar nada.
function ctxSync(root, alLlamar) {
  const { ctx, msgs } = fakeCtx({ conf: { HUGO_GITHUB: 'a/b' }, leerClave: () => 'tok' });
  conectarCaja(ctx);
  const llamadas = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (u, opts = {}) => {
    const url = String(u), metodo = opts.method || 'GET';
    llamadas.push(`${metodo} ${url}`);
    if (alLlamar) alLlamar(metodo, url);
    const json = (j) => ({ ok: true, status: 200, json: async () => j });
    if (/\/git\/ref\//.test(url)) return json({ object: { sha: 'ref1' } });
    if (/\/git\/commits\/ref1/.test(url)) return json({ tree: { sha: 'tree0' } });
    if (/\/git\/trees\/tree0/.test(url)) return json({ tree: [] });
    if (metodo === 'POST' && /\/git\/blobs$/.test(url)) return json({ sha: `blob${llamadas.length}` });
    if (metodo === 'POST' && /\/git\/trees$/.test(url)) return json({ sha: 'tree1' });
    if (metodo === 'POST' && /\/git\/commits$/.test(url)) return json({ sha: 'commit1' });
    if (metodo === 'PATCH') return json({});
    return json({ permissions: { push: true } }); // GET del repo: puedeSubir
  };
  return { ctx, msgs, llamadas, restaurar: () => { globalThis.fetch = original; } };
}
function velasLocal(root, lista) {
  for (const [activo, yymm, t] of lista) {
    const p = path.join(root, 'velas/stock', activo, `${yymm}_${activo}`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify([vela(t)]));
  }
}
const nov1 = Date.UTC(2026, 10, 1);

test('sincronizacion: una pasada normal sigue igual (regresion) y se anota como larga', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-sync-'));
  process.env.HUGO_VELAS_DIR = path.join(root, 'velas');
  process.env.HUGO_SYNC_MINUTOS = '0';
  try {
    velasLocal(root, [['AA', '2611', nov1]]);
    let vistoLargo = false;
    const { ctx, restaurar, llamadas } = ctxSync(root, () => {
      const e = ctx.activas.get('sincronizacion');
      if (e && e.largo) vistoLargo = true;
    });
    const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
    registrar(ctx);
    const h = handlerDe(ctx, /sincroniz/);
    await h(event, 'sincroniza registros', {});
    restaurar();
    assert.ok(llamadas.some((l) => l.startsWith('PATCH'))); // publico la rama
    assert.ok(vistoLargo);
    assert.equal(ctx.activas.size, 0);
  } finally {
    delete process.env.HUGO_VELAS_DIR; delete process.env.HUGO_SYNC_MINUTOS;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sincronizacion: stop durante la subida frena antes de publicar el commit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-sync-stop-'));
  process.env.HUGO_VELAS_DIR = path.join(root, 'velas');
  process.env.HUGO_SYNC_MINUTOS = '0';
  try {
    velasLocal(root, [['AA', '2611', nov1], ['BB', '2611', nov1]]);
    const { ctx, msgs, restaurar, llamadas } = ctxSync(root, (metodo, url) => {
      if (metodo === 'POST' && /\/git\/blobs$/.test(url)) ctx.parada.n++; // stop a mitad de la subida
    });
    const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
    registrar(ctx);
    const h = handlerDe(ctx, /sincroniz/);
    await h(event, 'sincroniza registros', {});
    restaurar();
    assert.ok(!llamadas.some((l) => l.startsWith('PATCH'))); // nunca publico la rama
    assert.ok(!llamadas.some((l) => /\/git\/commits$/.test(l)));
    assert.ok(msgs.some((t) => /detenida a pedido/i.test(t) && /nada se pis/.test(t)));
    assert.equal(ctx.activas.size, 0);
  } finally {
    delete process.env.HUGO_VELAS_DIR; delete process.env.HUGO_SYNC_MINUTOS;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sincronizacion: stop durante la comparacion no cambia nada', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-sync-stop2-'));
  process.env.HUGO_VELAS_DIR = path.join(root, 'velas');
  process.env.HUGO_SYNC_MINUTOS = '0';
  try {
    velasLocal(root, [['AA', '2611', nov1]]);
    const { ctx, restaurar, llamadas } = ctxSync(root, (metodo, url) => {
      if (/\/git\/trees\/tree0/.test(url)) ctx.parada.n++; // stop mientras compara
    });
    const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
    registrar(ctx);
    const r = await ctx.pasadaSincronizacion();
    restaurar();
    assert.equal(r.detenida, true);
    assert.ok(!llamadas.some((l) => l.startsWith('POST') || l.startsWith('PATCH')));
  } finally {
    delete process.env.HUGO_VELAS_DIR; delete process.env.HUGO_SYNC_MINUTOS;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
