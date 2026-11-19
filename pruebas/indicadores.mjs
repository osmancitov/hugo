// node --test pruebas/indicadores.mjs. Sin red: la fuente alternative.me se simula con un fetch
// falso. Cubre lectura/validacion, relacion remoto-local, la pasada de actualizacion (siembra,
// idempotencia, cambio de mes, errores) y la integracion con la sincronizacion (subida, aviso en
// el cierre, fallo de la fuente sin frenar las velas, bajada del remoto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SERIE, DIA, PISO_DIA, aammDe,
  leerIndicador, escribirIndicador, relacionIndicador, actualizarIndicador,
} from '../app/modulos/indicadores.mjs';
import { registrar, fijarPasoIndicador } from '../app/modulos/sincronizar-registros.mjs';
import { conectarCaja } from './caja.mjs';
import { crearRemoto } from './git-remoto.mjs';

const d = (dia, v) => [Date.UTC(2026, 7, dia), v]; // agosto 2026
const jsonDe = (puntos) => JSON.stringify(puntos) + '\n';
const tmp = (prefijo) => fs.mkdtempSync(path.join(os.tmpdir(), prefijo));

// fetch falso de alternative.me: data en su formato { timestamp: 'seg', value: 'n', ... }
const fetchFalso = (puntos, extra = {}) => async () => ({
  ok: extra.ok !== false,
  status: extra.status || 200,
  json: async () => {
    if (extra.jsonInvalido) throw new Error('json roto');
    return extra.cuerpo || { data: puntos.map(([ts, v]) => ({ timestamp: String(ts / 1000), value: String(v), value_classification: 'x', time_until_update: '1' })) };
  },
});

test('leerIndicador: acepta una serie valida y rechaza cada forma mala', () => {
  assert.deepEqual(leerIndicador(jsonDe([d(1, 10), d(2, 20)])), [d(1, 10), d(2, 20)]);
  assert.throws(() => leerIndicador('no json'), /ilegible/);
  assert.throws(() => leerIndicador('{}'), /no es una lista/);
  assert.throws(() => leerIndicador('[[1,2,3]]'), /forma inesperada/);
  assert.throws(() => leerIndicador(jsonDe([[Date.UTC(2026, 7, 1, 12), 10]])), /alineada/); // mediodia, no 00:00
  assert.throws(() => leerIndicador(jsonDe([[PISO_DIA - DIA, 10]])), /piso/); // antes de ago-2026
  assert.throws(() => leerIndicador(jsonDe([d(1, 101)])), /0-100/);
  assert.throws(() => leerIndicador(jsonDe([d(1, -1)])), /0-100/);
  assert.throws(() => leerIndicador(jsonDe([d(1, 3.5)])), /0-100/);
  assert.throws(() => leerIndicador(jsonDe([d(2, 20), d(2, 21)])), /repetidos o desordenados/);
  assert.throws(() => leerIndicador(jsonDe([d(2, 20), d(1, 10)])), /repetidos o desordenados/);
});

test('escribirIndicador escribe atomico y leible; no escribe lo que el mismo no valida', () => {
  const dir = tmp('hugo-ind-esc-');
  try {
    const destino = path.join(dir, '2608');
    escribirIndicador(destino, [d(1, 10), d(2, 20)]);
    assert.deepEqual(leerIndicador(fs.readFileSync(destino)), [d(1, 10), d(2, 20)]);
    assert.ok(!fs.existsSync(destino + '.tmp'));
    assert.throws(() => escribirIndicador(path.join(dir, '2609'), [[PISO_DIA - DIA, 1]]));
    assert.ok(!fs.existsSync(path.join(dir, '2609')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('relacionIndicador: iguales, ampliar, conservar; conflicto en dia compartido avisa', () => {
  const base = [d(1, 10), d(2, 20)];
  assert.equal(relacionIndicador(base, [...base]), 'iguales');
  assert.equal(relacionIndicador(base, [...base, d(3, 30)]), 'ampliar');
  assert.equal(relacionIndicador([...base, d(3, 30)], base), 'conservar');
  assert.throws(() => relacionIndicador(base, [d(1, 10), d(2, 99)]), /conflicto/);
  assert.equal(relacionIndicador([], base), 'ampliar');
  assert.equal(relacionIndicador(base, []), 'conservar');
});

test('actualizarIndicador: siembra desde el piso, corta en el dia de hoy y queda idempotente', async () => {
  const dir = tmp('hugo-ind-act-');
  try {
    const puntos = [d(1, 10), d(2, 20), d(3, 30)];
    const ahora = () => Date.UTC(2026, 7, 3, 9, 0, 0); // 3-ago 09:00: el dia 3 ya cerro a las 00:00
    const r1 = await actualizarIndicador({ dir, fetchImpl: fetchFalso(puntos), ahora });
    assert.equal(r1.nuevos, 3);
    assert.deepEqual(r1.archivos, ['2608']);
    assert.equal(r1.dias.at(-1).fecha, '2026-08-03');
    assert.deepEqual(leerIndicador(fs.readFileSync(path.join(dir, '2608'))), puntos);
    // Segunda pasada la misma hora: nada nuevo, no escribe ni pide de mas.
    let llamadas = 0;
    const r2 = await actualizarIndicador({ dir, fetchImpl: async (...a) => { llamadas++; return fetchFalso(puntos)(...a); }, ahora });
    assert.equal(r2.nuevos, 0);
    assert.equal(llamadas, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('actualizarIndicador: filtra lo anterior al piso y lo posterior al corte de hoy', async () => {
  const dir = tmp('hugo-ind-piso-');
  try {
    const puntos = [d(1, 10), [PISO_DIA - DIA, 5], d(2, 20), [Date.UTC(2026, 7, 4), 40]]; // jul y 4-ago fuera
    const r = await actualizarIndicador({ dir, fetchImpl: fetchFalso(puntos), ahora: () => Date.UTC(2026, 7, 3, 9) });
    assert.equal(r.nuevos, 2); // solo 1 y 2 de agosto
    assert.deepEqual(leerIndicador(fs.readFileSync(path.join(dir, '2608'))), [d(1, 10), d(2, 20)]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('actualizarIndicador: retoma desde el ultimo dia guardado y abre archivo al cambiar de mes', async () => {
  const dir = tmp('hugo-ind-mes-');
  try {
    escribirIndicador(path.join(dir, '2608'), [d(30, 50), d(31, 55)]);
    const sept1 = [Date.UTC(2026, 8, 1), 60];
    const r = await actualizarIndicador({ dir, fetchImpl: fetchFalso([sept1]), ahora: () => Date.UTC(2026, 8, 1, 12) });
    assert.equal(r.nuevos, 1);
    assert.deepEqual(r.archivos, ['2609']);
    assert.deepEqual(leerIndicador(fs.readFileSync(path.join(dir, '2608'))), [d(30, 50), d(31, 55)]); // agosto intacto
    assert.deepEqual(leerIndicador(fs.readFileSync(path.join(dir, '2609'))), [sept1]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('actualizarIndicador: errores de la fuente son honestos y no escriben nada', async () => {
  const dir = tmp('hugo-ind-err-');
  try {
    await assert.rejects(actualizarIndicador({ dir, fetchImpl: fetchFalso([], { ok: false, status: 503 }), ahora: () => Date.UTC(2026, 7, 3, 9) }), /HTTP 503/);
    await assert.rejects(actualizarIndicador({ dir, fetchImpl: fetchFalso([], { jsonInvalido: true }), ahora: () => Date.UTC(2026, 7, 3, 9) }), /no devolvió JSON/);
    await assert.rejects(actualizarIndicador({ dir, fetchImpl: fetchFalso([], { cuerpo: { nombre: 'raro' } }), ahora: () => Date.UTC(2026, 7, 3, 9) }), /no trae la lista/);
    await assert.rejects(actualizarIndicador({ dir, fetchImpl: async () => { throw new Error('caida de red'); }, ahora: () => Date.UTC(2026, 7, 3, 9) }), /no pude hablar/);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// --- Integracion con la sincronizacion (caja + remoto git simulados, como las demas pruebas) ---

const vela = (t) => [t, '1', '2', '1', '2', '10', t + DIA - 1, '10', 3, '1', '2', '0'];

function bancoInd() {
  const root = tmp('hugo-ind-int-');
  const velas = path.join(root, 'velas');
  fs.mkdirSync(path.join(velas, 'cripto', 'AAA'), { recursive: true });
  fs.writeFileSync(path.join(velas, 'cripto', 'AAA', '2611_AAA'), JSON.stringify([vela(Date.UTC(2026, 10, 1))]));
  const rem = crearRemoto();
  const textos = [];
  const slack = { chat: {
    postMessage: async (m) => { textos.push(m.text || ''); return { ts: 't' + textos.length }; },
    update: async (m) => { if (m.text) textos[textos.length - 1] = m.text; },
  } };
  const ctx = conectarCaja({
    conf: { HUGO_GITHUB: 'osman/repo', HUGO_VELAS_DIR: velas, HUGO_REPO_SYNC_URL: rem.url, HUGO_REPO_SYNC_DIR: path.join(root, 'clon') },
    app: { client: slack }, botToken: 'x', canal: 'aviso',
    activas: new Map(), parada: () => false, alIniciar: () => {}, comando: () => {}, leerClave: () => 'xoxb-simulado',
  });
  registrar(ctx);
  return {
    root, velas, rem, ctx, textos,
    dirInd: path.join(root, SERIE),
    restaurar: () => { rem.destruir(); fs.rmSync(root, { recursive: true, force: true }); },
  };
}

test('sincronizacion: la pasada actualiza el indicador, lo sube en el mismo commit y lo anota en el cierre', async () => {
  const b = bancoInd();
  try {
    const puntos = [[Date.UTC(2026, 10, 18), 12]];
    fijarPasoIndicador(async ({ dir }) => actualizarIndicador({ dir, fetchImpl: fetchFalso(puntos), ahora: () => Date.UTC(2026, 10, 19, 8) }));
    await b.ctx.automaticaSincronizacion();
    const arbol = b.rem.arbol();
    assert.ok(arbol[`registros/${SERIE}/2611`], 'subio el archivo del indicador');
    assert.deepEqual(JSON.parse(arbol[`registros/${SERIE}/2611`]), puntos);
    assert.ok(arbol['registros/velas-24h/cripto/AAA/2611_AAA'], 'las velas subieron igual');
    const cierre = b.textos.join('\n');
    assert.match(cierre, /Fear & Greed cripto: 1 día\(s\) nuevo\(s\)/);
    assert.match(cierre, /último 2026-11-18 con valor 12/);
    assert.ok(b.rem.commits().some((c) => c.includes(`Indicadores ${SERIE}`)), 'el commit menciona la familia');
  } finally { b.restaurar(); }
});

test('sincronizacion: si la fuente del indicador falla, la pasada sigue con las velas y lo dice', async () => {
  const b = bancoInd();
  try {
    fijarPasoIndicador(async () => { throw new Error('alternative.me respondió HTTP 503; no guardo nada.'); });
    await b.ctx.automaticaSincronizacion();
    const arbol = b.rem.arbol();
    assert.ok(arbol['registros/velas-24h/cripto/AAA/2611_AAA'], 'las velas subieron pese al fallo');
    assert.ok(!arbol[`registros/${SERIE}/2611`], 'no se invento indicador');
    assert.match(b.textos.join('\n'), /Fear & Greed cripto sin actualizar \(.*HTTP 503.*\); sigo con las velas/);
  } finally { b.restaurar(); }
});

test('sincronizacion: un archivo de indicador nuevo en el remoto baja a la Debian', async () => {
  const root = tmp('hugo-ind-baja-');
  const velas = path.join(root, 'velas');
  const puntos = [[Date.UTC(2026, 10, 17), 30], [Date.UTC(2026, 10, 18), 12]];
  const rem = crearRemoto({ [`registros/${SERIE}/2611`]: jsonDe(puntos) });
  const slack = { chat: { postMessage: async () => ({ ts: 't' }), update: async () => {} } };
  try {
    const ctx = conectarCaja({
      conf: { HUGO_GITHUB: 'osman/repo', HUGO_VELAS_DIR: velas, HUGO_REPO_SYNC_URL: rem.url, HUGO_REPO_SYNC_DIR: path.join(root, 'clon') },
      app: { client: slack }, botToken: 'x', canal: 'aviso',
      activas: new Map(), parada: () => false, alIniciar: () => {}, comando: () => {}, leerClave: () => 'xoxb-simulado',
    });
    registrar(ctx);
    fijarPasoIndicador(async () => ({ nuevos: 0, dias: [], archivos: [] }));
    const r = await ctx.pasadaSincronizacion(async () => {});
    assert.ok(!r.error, r.error || '');
    const bajado = path.join(root, SERIE, '2611');
    assert.deepEqual(leerIndicador(fs.readFileSync(bajado)), puntos);
  } finally { rem.destruir(); fs.rmSync(root, { recursive: true, force: true }); }
});
