// node --test pruebas/registro-piso.mjs. Piso «desde AAMM»: motor, avance y parseo. Sin red ni cuentas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearMotor, leerEstado, guardarEstado } from '../app/modulos/registro-motor.mjs';
const event = { channel: 'canal-prueba', ts: 'raiz-prueba' };
const octubre = Date.UTC(2026, 9, 1), septiembre = Date.UTC(2026, 8, 1), agosto = Date.UTC(2026, 7, 1), julio = Date.UTC(2026, 6, 1), noviembre = Date.UTC(2026, 10, 1);
const vela = (t) => [t, '1', '2', '1', '2', '10', t + 86400000 - 1, '10', 3, '1', '2', '0'];
function setup(opts = {}) {
  const root = opts.root || fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-piso-'));
  const msgs = [], consultas = [], resoluciones = [];
  const base = path.join(root, 'velas'), estado = path.join(root, 'privado/estado.json');
  const m = crearMotor({
    ahora: () => Date.UTC(2026, 10, 1), base: () => base, archivoEstado: () => estado, activas: new Map(),
    resolver: async (clase, codigo) => { resoluciones.push([clase, codigo]); return opts.resolver ? opts.resolver(clase, codigo) : { ok: true, simbolo: codigo + 'USDT', nombre: codigo }; },
    fetchImpl: async (u) => { const q = new URL(u).searchParams; const t = Number(q.get('startTime')); consultas.push([q.get('symbol'), t]); const d = opts.datos ? await opts.datos(t) : [vela(t)]; return { ok: true, status: 200, text: async () => JSON.stringify(d) }; },
    avisar: async (j, t) => { msgs.push(t); },
  });
  return { root, base, estado, msgs, consultas, resoluciones, m, close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
async function caso(fn, opts) { const s = setup(opts); try { await fn(s); } finally { s.close(); } }

test('piso: frena al completar el mes pedido, no consulta meses anteriores', async () => caso(async (s) => {
  await s.m.iniciar({ clase: 'cripto', codigos: ['AA'], event, piso: julio });
  assert.deepEqual(s.consultas.map((x) => x[1]), [octubre, septiembre, agosto, julio]);
  const j = leerEstado(s.estado);
  assert.equal(j.estado, 'terminado'); assert.equal(j.piso, julio);
  assert.deepEqual(j.conteo, { guardados: 4, existentes: 0, activos: 1, ampliados: 0 });
  for (const aamm of ['2610', '2609', '2608', '2607']) assert.ok(fs.existsSync(path.join(s.base, 'cripto/AA', `${aamm}_AA`)), aamm);
  assert.ok(!fs.existsSync(path.join(s.base, 'cripto/AA/2606_AA')));
  assert.ok(s.msgs.some((m) => m.includes('Tramo: no bajo de')));
  assert.ok(s.msgs.some((m) => m.includes('tramo desde') && m.includes('cubierto') && m.includes('1/1 activos')));
  assert.equal(s.msgs.at(-1).includes('Registro terminado'), true);
}));

test('piso: activo que empezo despues termina por mes vacio, no por el piso', async () => caso(async (s) => {
  await s.m.iniciar({ clase: 'cripto', codigos: ['AA'], event, piso: julio });
  assert.deepEqual(s.consultas.map((x) => x[1]), [octubre, septiembre]);
  const j = leerEstado(s.estado);
  assert.equal(j.estado, 'terminado'); assert.equal(j.conteo.guardados, 1);
  assert.ok(s.msgs.some((m) => m.includes('sin velas. Historial terminado')));
  assert.ok(!s.msgs.some((m) => m.includes('tramo desde')));
}, { datos: (t) => (t === octubre ? [vela(t)] : []) }));

test('piso igual al mes inicial: solo el mes en curso del corte', async () => caso(async (s) => {
  await s.m.iniciar({ clase: 'cripto', codigos: ['AA'], event, piso: octubre });
  assert.deepEqual(s.consultas.map((x) => x[1]), [octubre]);
  assert.equal(leerEstado(s.estado).estado, 'terminado');
  assert.ok(s.msgs.some((m) => m.includes('tramo desde') && m.includes('cubierto')));
}));

test('piso posterior al mes inicial se rechaza sin iniciar', async () => caso(async (s) => {
  await s.m.iniciar({ clase: 'cripto', codigos: ['AA'], event, piso: noviembre });
  assert.ok(s.msgs.some((m) => m.includes('posterior al mes en curso')));
  assert.equal(leerEstado(s.estado), null); assert.equal(s.consultas.length, 0);
}));

test('misma lista con otro piso no desplaza el trabajo pendiente; con el mismo lo retoma', async () => caso(async (s) => {
  await s.m.iniciar({ clase: 'cripto', codigos: ['AA'], event, piso: julio });
  assert.equal(leerEstado(s.estado).estado, 'pausado');
  const antes = fs.readFileSync(s.estado, 'utf8');
  await s.m.iniciar({ clase: 'cripto', codigos: ['AA'], event, piso: agosto });
  assert.equal(fs.readFileSync(s.estado, 'utf8'), antes);
  assert.equal(s.msgs.filter((m) => m.includes('No lo sustituyo')).length, 1);
  await s.m.iniciar({ clase: 'cripto', codigos: ['AA'], event, piso: julio });
  assert.equal(s.msgs.filter((m) => m.includes('No lo sustituyo')).length, 1);
  assert.equal(s.resoluciones.length, 2); // lo retomo: volvio a resolver
}, { resolver: () => ({ ok: false, motivo: 'no existe' }) }));

test('avance con piso mal alineado se conserva; avance viejo sin piso sigue cargando', async () => {
  await caso(async (s) => {
    guardarEstado(s.estado, { version: 2, estado: 'en-curso', clase: 'cripto', codigos: ['AA'], piso: Date.UTC(2026, 9, 2), indice: 0, hasta: Date.UTC(2026, 10, 1), inicial: octubre, mes: octubre, channel: 'c', thread_ts: 't', conteo: { guardados: 0, existentes: 0, activos: 0, ampliados: 0 }, notificado: false });
    const antes = fs.readFileSync(s.estado, 'utf8');
    await s.m.iniciar({ continuar: true, event });
    assert.ok(s.msgs.some((m) => m.includes('No puedo leer el avance')));
    assert.equal(fs.readFileSync(s.estado, 'utf8'), antes);
  });
  await caso(async (s) => {
    guardarEstado(s.estado, { version: 2, estado: 'en-curso', clase: 'cripto', codigos: ['AA'], indice: 0, hasta: Date.UTC(2026, 10, 1), inicial: octubre, mes: octubre, channel: 'c', thread_ts: 't', conteo: { guardados: 0, existentes: 0, activos: 0, ampliados: 0 }, notificado: false });
    await s.m.iniciar({ continuar: true, event });
    const j = leerEstado(s.estado);
    assert.equal(j.estado, 'terminado'); assert.equal(j.piso ?? null, null);
  }, { datos: (t) => (t === octubre ? [vela(t)] : []) });
});

test('parseo de la orden: desde AAMM, codigos de 1 letra y Unicode; errores claros', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-piso-cmd-'));
  const original = globalThis.fetch;
  const ahoraReal = new Date();
  const mesActual = Date.UTC(ahoraReal.getUTCFullYear(), ahoraReal.getUTCMonth(), 1);
  const aammActual = String(ahoraReal.getUTCFullYear()).slice(2) + String(ahoraReal.getUTCMonth() + 1).padStart(2, '0');
  const aammSiguiente = new Date(mesActual).getUTCMonth() === 11
    ? String(ahoraReal.getUTCFullYear() + 1).slice(2) + '01'
    : String(ahoraReal.getUTCFullYear()).slice(2) + String(ahoraReal.getUTCMonth() + 2).padStart(2, '0');
  globalThis.fetch = async (u) => {
    let j; const url = new URL(u);
    if (u.includes('exchangeInfo')) { const symbol = url.searchParams.get('symbol'); j = { symbols: [{ symbol, status: 'TRADING', quoteAsset: 'USDT', baseAsset: symbol.slice(0, -4) }] }; }
    else if (u.includes('get-products')) j = { data: [{ s: 'AUSDT', an: 'Vaulta' }, { s: '牛来USDT', an: '牛来' }, ...Array.from({ length: 100 }, (_, i) => ({ s: 'RELLENO' + i }))] };
    else { const t = Number(url.searchParams.get('startTime')); j = t === mesActual ? [vela(t)] : []; }
    return { ok: true, status: 200, text: async () => JSON.stringify(j) };
  };
  const msgs = [];
  try {
    const { registrar } = await import('../app/modulos/velas.mjs');
    let handler;
    registrar({
      conf: { HUGO_VELAS_DIR: path.join(root, 'velas'), HUGO_REGISTRO_ESTADO: path.join(root, 'estado.json') },
      app: { client: { chat: { postMessage: async (m) => { msgs.push(m.text); return { ts: 'simulada' }; }, update: async (m) => { msgs.push(m.text); return { ts: m.ts }; } } } },
      activas: new Map(), alIniciar: () => {}, comando: (_, f) => (handler = f),
    });
    await handler(event, `registra cripto desde ${aammActual} a, 牛来`);
    const j = leerEstado(path.join(root, 'estado.json'));
    assert.equal(j.estado, 'terminado'); assert.deepEqual(j.codigos, ['A', '牛来']); assert.equal(j.piso, mesActual);
    assert.ok(fs.existsSync(path.join(root, `velas/cripto/A/${aammActual}_A`)));
    assert.ok(fs.existsSync(path.join(root, `velas/cripto/牛来/${aammActual}_牛来`)));
    msgs.length = 0;
    await handler(event, 'registra cripto desde');
    await handler(event, 'registra cripto desde 2613 BTC');
    await handler(event, 'registra cripto BTC desde 2607');
    await handler(event, `registra cripto desde ${aammSiguiente} BTC`);
    assert.ok(msgs.some((m) => m.includes('Tras «desde»')));
    assert.ok(msgs.some((m) => m.includes('solo va al principio')));
    assert.ok(msgs.some((m) => m.includes('posterior al mes en curso')));
    assert.equal(msgs.filter((m) => m.includes('Tras «desde»')).length, 2); // sin mes y mes invalido
    assert.ok(!fs.existsSync(path.join(root, 'velas/cripto/BTC')));
  } finally { globalThis.fetch = original; fs.rmSync(root, { recursive: true, force: true }); }
});
