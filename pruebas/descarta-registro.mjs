// node --test pruebas/descarta-registro.mjs. «descarta registro»: abandona el avance pendiente
// con el 👍 del usuario, sin tocar los datos guardados. Sin avance o con registro en curso, no actúa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearMotor, leerEstado, guardarEstado } from '../app/modulos/registro-motor.mjs';
import { registrar } from '../app/modulos/velas.mjs';

const HASTA = Date.UTC(2026, 10, 18); // corte alineado al dia
const INICIAL = Date.UTC(2026, 10, 1);
const avancePausado = () => ({
 version: 2, estado: 'pausado', rapido: false, clase: 'cripto', codigos: ['AAA', 'BBB'], siguientes: [],
 total: 2, piso: null, indice: 1, hasta: HASTA, inicial: INICIAL, mes: Date.UTC(2026, 8, 1),
 channel: 'c', thread_ts: 't', conteo: { guardados: 4, existentes: 112, activos: 40, ampliados: 37 }, notificado: false,
});
function banco() {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-descarta-'));
 const estado = path.join(root, 'privado/estado.json');
 const motor = crearMotor({
  base: () => path.join(root, 'velas'), archivoEstado: () => estado,
  resolver: async (clase, codigo) => ({ ok: true, clase, codigo, simbolo: codigo + 'USDT', nombre: codigo }),
  fetchImpl: async () => { throw new Error('sin red en esta prueba'); },
  avisar: async () => {}, activas: new Map(), parada: { n: 0 },
 });
 const dato = path.join(root, 'velas/cripto/AAA/2610_AAA');
 fs.mkdirSync(path.dirname(dato), { recursive: true });
 fs.writeFileSync(dato, '[[1]]');
 return { root, estado, motor, dato, fin: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('avance pausado: lo describe, lo descarta y conserva los datos', () => {
 const b = banco();
 try {
  guardarEstado(b.estado, avancePausado());
  const p = b.motor.pendienteDescarte();
  assert.ok(!p.error, p.error);
  assert.match(p.detalle, /BBB, septiembre de 2026 \(1\/2 activos\)/);
  const r = b.motor.descartar();
  assert.equal(r.ok, true);
  assert.match(r.detalle, /BBB, septiembre de 2026/);
  assert.ok(!fs.existsSync(b.estado), 'el avance queda borrado');
  assert.equal(fs.readFileSync(b.dato, 'utf8'), '[[1]]', 'los datos guardados no se tocan');
  assert.equal(leerEstado(b.estado), null, 'ya no hay avance');
  assert.ok(b.motor.pendienteDescarte().error);
 } finally { b.fin(); }
});

test('sin avance o terminado: no hay nada que descartar', () => {
 const b = banco();
 try {
  assert.match(b.motor.pendienteDescarte().error, /No hay un registro pendiente/);
  guardarEstado(b.estado, { ...avancePausado(), estado: 'terminado', indice: 2 });
  assert.match(b.motor.pendienteDescarte().error, /No hay un registro pendiente/);
  assert.match(b.motor.descartar().error, /No hay un registro pendiente/);
  assert.ok(fs.existsSync(b.estado), 'un avance terminado se conserva para su aviso');
 } finally { b.fin(); }
});
test('comando: cualquiera la pide, pregunta con el detalle y solo el 👍 del usuario descarta', async () => {
 const b = banco();
 const envV = process.env.HUGO_VELAS_DIR, envE = process.env.HUGO_REGISTRO_ESTADO;
 try {
  guardarEstado(b.estado, avancePausado());
  process.env.HUGO_VELAS_DIR = path.join(b.root, 'velas');
  process.env.HUGO_REGISTRO_ESTADO = b.estado;
  let handler, opciones, pregunta;
  const respuestas = [];
  const ctx = {
   conf: {}, usuario: 'U_USER', delegado: 'U_BOT', activas: new Map(), parada: { n: 0 },
   comando: (p, f, o = {}) => { if (String(p).includes('descarta')) { handler = f; opciones = o; } },
   confirmar: async (o) => { pregunta = o; await o.alSi(); },
   reporte: { avisador: () => async (event, texto) => { respuestas.push(texto); } },
   alIniciar: () => {},
  };
  registrar(ctx);
  assert.equal(opciones.delegable, undefined, 'ya no hay marca delegable: cualquiera la pide (decisión del usuario, 20-nov-2026)');
  await handler({ channel: 'c', ts: 'h' }, 'descarta registro');
  assert.equal(pregunta.user, 'U_USER', 'el 👍 que cuenta es el del usuario');
  assert.match(pregunta.texto, /BBB, septiembre de 2026/);
  assert.match(pregunta.texto, /los datos guardados no se borran/);
  assert.ok(respuestas.some((t) => /Avance del registro descartado/.test(t)));
  assert.ok(!fs.existsSync(b.estado));
  assert.equal(fs.readFileSync(b.dato, 'utf8'), '[[1]]');
  respuestas.length = 0;
  await handler({ channel: 'c', ts: 'h' }, 'descarta registro');
  assert.ok(respuestas.some((t) => /No hay un registro pendiente/.test(t)));
 } finally {
  if (envV === undefined) delete process.env.HUGO_VELAS_DIR; else process.env.HUGO_VELAS_DIR = envV;
  if (envE === undefined) delete process.env.HUGO_REGISTRO_ESTADO; else process.env.HUGO_REGISTRO_ESTADO = envE;
  b.fin();
 }
});
