// node --test pruebas/ciclo-diario.mjs. La corrida diaria (decisión del usuario, 20-nov-2026):
// una vez al día tras el cierre UTC; solo si la marca no cubre el último día cerrado; ingesta
// antes que publicación; sin marca si el registro no terminó o la publicación falló, así la
// próxima corrida o el arranque reintenta (cortes de luz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registrar, ultimoCerrado, proximaCorrida } from '../app/modulos/ciclo-diario.mjs';

const DIA = 86400000;
const AHORA = Date.UTC(2026, 10, 21, 0, 10); // 00:10 UTC del 21-nov: el 20-nov ya cerró
const OBJETIVO = Date.UTC(2026, 10, 20);

const estadoTerminado = (hasta) => ({
  version: 2, estado: 'terminado', rapido: true, origen: 'diaria', clase: 'stock', codigos: ['AA'], nombres: null,
  siguientes: [], total: 1, piso: null, indice: 1, hasta, inicial: Date.UTC(2026, 10, 1), mes: Date.UTC(2026, 10, 1),
  channel: 'C', thread_ts: 'x', conteo: { guardados: 0, existentes: 1, activos: 1, ampliados: 0 }, notificado: true,
});

function banco({ estado = estadoTerminado(Date.UTC(2026, 10, 21)), marca = null, ocupado = [false], pasada = { texto: 'Registros al día: 5 archivos iguales, sin cambios.' }, estadoTrasIngesta = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-ciclo-'));
  if (estado) fs.writeFileSync(path.join(root, 'estado.json'), JSON.stringify(estado) + '\n');
  if (marca != null) fs.writeFileSync(path.join(root, 'ciclo-diario.json'), JSON.stringify({ ultimo: marca }) + '\n');
  const postes = [];
  const llamadas = [];
  const arranques = [];
  let reloj = AHORA;
  const ctx = {
    canal: 'C', botToken: 'x',
    app: { client: { chat: { postMessage: async (m) => { postes.push(m); return { ts: `t${postes.length}` }; } } } },
    reporte: {
      hilo: async ({ texto }) => { postes.push({ channel: 'C', text: texto }); return 'hilo1'; },
      crearSync: async () => ({ progreso: async () => {}, final: async (t) => { postes.push({ text: `FINAL: ${t}` }); } }),
    },
    registroArchivoEstado: () => path.join(root, 'estado.json'),
    // reloj mutable: la ingesta gasta 90 s y la pasada 35 s, para medir la duración reportada

    ponerAlDiaDiaria: async () => {
      llamadas.push('ingesta');
      reloj += 90000;
      if (estadoTrasIngesta) fs.writeFileSync(path.join(root, 'estado.json'), JSON.stringify(estadoTrasIngesta) + '\n');
    },
    registroOcupado: () => (ocupado.length > 1 ? ocupado.shift() : ocupado[0]),
    correrPasada: async () => { llamadas.push('pasada'); reloj += 35000; return typeof pasada === 'function' ? pasada() : pasada; },
    ahora: () => reloj,
    esperar: async () => {},
    alIniciar: (fn) => arranques.push(fn),
  };
  registrar(ctx);
  const marcaEscrita = () => { try { return JSON.parse(fs.readFileSync(path.join(root, 'ciclo-diario.json'), 'utf8')).ultimo; } catch { return null; } };
  return { ctx, postes, llamadas, arranques, root, marcaEscrita };
}

test('marca atrasada: ingesta, luego publicación, marca al día y reporte en un hilo', async () => {
  const b = banco();
  try {
    await b.ctx.cicloDiario('programada');
    assert.deepEqual(b.llamadas, ['ingesta', 'pasada'], 'ingesta antes que publicación');
    assert.equal(b.marcaEscrita(), OBJETIVO);
    assert.match(b.postes[0].text, /Puesta al día diaria \(programada\): registros hasta el 2026-11-20/);
    assert.ok(b.postes.some((p) => /FINAL: Publicación diaria\. Registros al día/.test(p.text)), 'cierre con el resumen de la pasada');
    assert.ok(b.postes.some((p) => /\nDuración: 2 min 5 s\.$/.test(p.text)), 'el cierre reporta cuánto gastó (pedido del usuario, 20-nov-2026)');
  } finally { fs.rmSync(b.root, { recursive: true, force: true }); }
});

test('marca al día: no corre ni avisa', async () => {
  const b = banco({ marca: OBJETIVO });
  try {
    await b.ctx.cicloDiario('programada');
    assert.deepEqual(b.llamadas, []);
    assert.equal(b.postes.length, 0);
  } finally { fs.rmSync(b.root, { recursive: true, force: true }); }
});

test('registro pausado: no publica, no marca y el aviso dice cómo retomar', async () => {
  const pausado = { ...estadoTerminado(Date.UTC(2026, 10, 21)), estado: 'pausado', indice: 0, error: 'sin internet' };
  const b = banco({ estado: pausado });
  try {
    await b.ctx.cicloDiario('de arranque');
    assert.deepEqual(b.llamadas, ['ingesta'], 'no publica');
    assert.equal(b.marcaEscrita(), null);
    assert.ok(b.postes.some((p) => /quedó pausado: sin internet/.test(p.text) && /registra continuar/.test(p.text)), JSON.stringify(b.postes.map((p) => p.text)));
  } finally { fs.rmSync(b.root, { recursive: true, force: true }); }
});

test('corte entre ingesta y publicación: se reporta, no se marca y la próxima corrida publica', async () => {
  let falla = true;
  const b = banco({ pasada: () => (falla ? { error: 'No pude comparar con GitHub (sin red).' } : { texto: 'Sincronización lista en 3,2 s: subí 2 archivo(s) en el commit abc1234.' }) });
  try {
    await b.ctx.cicloDiario('programada');
    assert.deepEqual(b.llamadas, ['ingesta', 'pasada']);
    assert.equal(b.marcaEscrita(), null, 'publicación incompleta: sin marca, así se reintenta');
    assert.ok(b.postes.some((p) => /FINAL: Publicación diaria\. No pude comparar/.test(p.text)));
    falla = false; // vuelve la luz / la red
    await b.ctx.cicloDiario('de arranque');
    assert.deepEqual(b.llamadas, ['ingesta', 'pasada', 'ingesta', 'pasada'], 'la marca ausente no frena el reintento');
    assert.equal(b.marcaEscrita(), OBJETIVO, 'tras publicar, la marca queda al día');
  } finally { fs.rmSync(b.root, { recursive: true, force: true }); }
});

test('cobertura parcial (corte a mitad de la ingesta): aviso propio, sin publicación ni marca', async () => {
  const b = banco({ estado: estadoTerminado(Date.UTC(2026, 10, 19)) }); // terminó pero solo llega al 18
  try {
    await b.ctx.cicloDiario('de arranque');
    assert.deepEqual(b.llamadas, ['ingesta'], 'no publica con el registro corto');
    assert.equal(b.marcaEscrita(), null);
    assert.ok(b.postes.some((p) => /llega solo al 2026-11-18 y falta hasta el 2026-11-20 \(parcial\)/.test(p.text)), JSON.stringify(b.postes.map((p) => p.text)));
    assert.ok(b.postes.some((p) => /\nDuración: 1 min 30 s\.$/.test(p.text)), 'el aviso de parcial también mide');
  } finally { fs.rmSync(b.root, { recursive: true, force: true }); }
});

test('días pendientes múltiples: una corrida los cubre y marca el último cerrado', async () => {
  // La marca quedó tres días atrás (apagón largo); la ingesta retoma y alcanza el objetivo.
  const b = banco({
    marca: OBJETIVO - 3 * DIA,
    estado: estadoTerminado(Date.UTC(2026, 10, 18)),
    estadoTrasIngesta: estadoTerminado(OBJETIVO + DIA),
  });
  try {
    await b.ctx.cicloDiario('de arranque');
    assert.deepEqual(b.llamadas, ['ingesta', 'pasada']);
    assert.equal(b.marcaEscrita(), OBJETIVO, 'marca el último día cerrado, no los días intermedios');
    await b.ctx.cicloDiario('de arranque');
    assert.equal(b.llamadas.length, 2, 'ya al día: no repite');
  } finally { fs.rmSync(b.root, { recursive: true, force: true }); }
});

test('espera un registro en curso sin interrumpirlo y sigue', async () => {
  const b = banco({ ocupado: [true, false] });
  try {
    await b.ctx.cicloDiario('programada');
    assert.deepEqual(b.llamadas, ['ingesta', 'pasada']);
    assert.equal(b.marcaEscrita(), OBJETIVO);
  } finally { fs.rmSync(b.root, { recursive: true, force: true }); }
});

test('horario: último cerrado y próxima corrida alrededor del cierre UTC', () => {
  assert.equal(ultimoCerrado(Date.UTC(2026, 10, 21, 0, 4)), Date.UTC(2026, 10, 19), 'antes del margen, el 20 aún no cuenta');
  assert.equal(ultimoCerrado(Date.UTC(2026, 10, 21, 0, 5)), OBJETIVO);
  assert.equal(ultimoCerrado(Date.UTC(2026, 10, 21, 23, 59)), OBJETIVO);
  assert.equal(proximaCorrida(Date.UTC(2026, 10, 21, 0, 4)), Date.UTC(2026, 10, 21, 0, 5));
  assert.equal(proximaCorrida(Date.UTC(2026, 10, 21, 0, 5)), Date.UTC(2026, 10, 22, 0, 5), 'en el borde, la siguiente');
  assert.equal(proximaCorrida(Date.UTC(2026, 10, 21, 20, 0)), Date.UTC(2026, 10, 22, 0, 5));
});
