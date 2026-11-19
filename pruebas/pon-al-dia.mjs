// node --test pruebas/pon-al-dia.mjs. «pon al día»: consulta solo lo pendiente, comprueba en
// disco lo guardado (sin supuestos de dias naturales), repara huecos sin esconderlos y fija el
// piso con una consulta de frontera cuando no hay marca. Binance y disco simulados, sin red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearMotor, leerEstado } from '../app/modulos/registro-motor.mjs';

const AHORA = Date.UTC(2026, 10, 18, 12, 0, 0); // corte: 2026-11-18T00:00Z; mes en curso 2611 (17 dias cerrados)
const DIA = 86400000;
const vela = (t) => [t, '1', '2', '1', '2', '10', t + DIA - 1, '10', 3, '1', '2', '0'];
const diasDe = (yymm, lista) => lista.map((d) => vela(Date.UTC(2000 + Number(yymm.slice(0, 2)), Number(yymm.slice(2)) - 1, d)));
function escribirMes(root, codigo, yymm, dias) {
 const dir = path.join(root, 'velas/cripto', codigo);
 fs.mkdirSync(dir, { recursive: true });
 fs.writeFileSync(path.join(dir, `${yymm}_${codigo}`), JSON.stringify(diasDe(yymm, dias)));
}
function banco(respuestas) {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-aldia-'));
 const llamadas = [], lineas = [];
 const motor = crearMotor({
  base: () => path.join(root, 'velas'), archivoEstado: () => path.join(root, 'estado.json'),
  resolver: async (clase, codigo) => ({ ok: true, clase, codigo, simbolo: codigo + 'USDT', nombre: codigo }),
  fetchImpl: async (u) => {
   const inicio = Number(new URL(u).searchParams.get('startTime'));
   const yymm = new Date(inicio).toISOString().slice(2, 7).replace('-', '');
   llamadas.push(yymm);
   const r = respuestas[yymm];
   const datos = Array.isArray(r) ? diasDe(yymm, r) : [];
   return { ok: true, status: 200, text: async () => JSON.stringify(datos) };
  },
  avisar: async (j, text, meta) => { if (meta?.linea) lineas.push(meta.linea); },
  ahora: () => AHORA,
 });
 return { root, motor, llamadas, lineas, fin: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const evento = { channel: 'c', ts: 'h' };
const corre = (b, opts = {}) => b.motor.iniciar({ clase: 'cripto', codigos: ['AAA'], event: evento, rapido: true, ...opts });
const TREINTA = Array.from({ length: 30 }, (_, i) => i + 1);
const TREINTAYUNO = Array.from({ length: 31 }, (_, i) => i + 1);
const DIECISIETE = Array.from({ length: 17 }, (_, i) => i + 1);

test('sin marca: valida en disco, fija el piso con una consulta de frontera y escribe la marca', async () => {
 const b = banco({ 2611: DIECISIETE, 2608: [] });
 try {
  escribirMes(b.root, 'AAA', '2610', TREINTAYUNO); escribirMes(b.root, 'AAA', '2609', TREINTA);
  await corre(b);
  assert.deepEqual(b.llamadas, ['2611', '2608']); // mes en curso + frontera; 2610 y 2609 en disco
  assert.ok(b.lineas.includes('2610: en disco.'));
  assert.ok(b.lineas.includes('2609: en disco.'));
  assert.equal(fs.readFileSync(path.join(b.root, 'velas/cripto/AAA/_primer-mes'), 'utf8').trim(), '2609');
  assert.equal(leerEstado(path.join(b.root, 'estado.json')).estado, 'terminado');
 } finally { b.fin(); }
});

test('con marca: solo consulta el mes en curso y para en el piso verificado', async () => {
 const b = banco({ 2611: DIECISIETE });
 try {
  escribirMes(b.root, 'AAA', '2610', TREINTAYUNO); escribirMes(b.root, 'AAA', '2609', TREINTA);
  fs.writeFileSync(path.join(b.root, 'velas/cripto/AAA/_primer-mes'), '2609\n');
  await corre(b);
  assert.deepEqual(b.llamadas, ['2611']);
  assert.ok(b.lineas.some((l) => l.startsWith('Verificado hasta septiembre de 2026.')));
  assert.equal(leerEstado(path.join(b.root, 'estado.json')).estado, 'terminado');
 } finally { b.fin(); }
});

test('mes que falta por encima del piso: lo consulta y lo repara, sin esconderlo', async () => {
 const b = banco({ 2611: DIECISIETE, 2610: TREINTAYUNO });
 try {
  escribirMes(b.root, 'AAA', '2609', TREINTA);
  fs.writeFileSync(path.join(b.root, 'velas/cripto/AAA/_primer-mes'), '2609\n');
  await corre(b);
  assert.deepEqual(b.llamadas, ['2611', '2610']);
  const reparado = JSON.parse(fs.readFileSync(path.join(b.root, 'velas/cripto/AAA/2610_AAA'), 'utf8'));
  assert.equal(reparado.length, 31);
 } finally { b.fin(); }
});

test('vacio inesperado sobre el piso: avisa el hueco y deja de confiar hacia abajo', async () => {
 const b = banco({ 2611: DIECISIETE, 2610: [], 2609: TREINTA, 2608: [] });
 try {
  escribirMes(b.root, 'AAA', '2609', TREINTA);
  fs.writeFileSync(path.join(b.root, 'velas/cripto/AAA/_primer-mes'), '2609\n');
  await corre(b);
  assert.deepEqual(b.llamadas, ['2611', '2610', '2609', '2608']); // tras el hueco, todo se re-consulta
  assert.ok(b.lineas.some((l) => /vacio inesperado sobre el piso/.test(l)));
  assert.ok(!fs.existsSync(path.join(b.root, 'velas/cripto/AAA/_verificado')), 'con hueco no se escribe la marca de verificado');
 } finally { b.fin(); }
});

test('mes con cola corta se re-consulta y amplia; sin todos los dias naturales no es requisito', async () => {
 const b = banco({ 2611: DIECISIETE, 2610: TREINTAYUNO, 2609: [] });
 try {
  escribirMes(b.root, 'AAA', '2610', TREINTA); // le falta el 31: termina antes de fin de mes
  await corre(b);
  assert.deepEqual(b.llamadas, ['2611', '2610', '2609']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(b.root, 'velas/cripto/AAA/2610_AAA'), 'utf8')).length, 31);
  assert.equal(fs.readFileSync(path.join(b.root, 'velas/cripto/AAA/_primer-mes'), 'utf8').trim(), '2610');
 } finally { b.fin(); }
});

test('listado a mitad de mes: su primer mes empieza tarde y se acepta; el piso queda en el', async () => {
 const b = banco({ 2611: DIECISIETE, 2609: [] });
 try {
  escribirMes(b.root, 'AAA', '2610', Array.from({ length: 20 }, (_, i) => i + 12)); // 12..31
  await corre(b);
  assert.deepEqual(b.llamadas, ['2611', '2609']);
  assert.ok(b.lineas.includes('2610: en disco.'));
  assert.equal(fs.readFileSync(path.join(b.root, 'velas/cripto/AAA/_primer-mes'), 'utf8').trim(), '2610');
 } finally { b.fin(); }
});

test('primera corrida escribe _verificado; la segunda confia y no recorre meses viejos', async () => {
 const b = banco({ 2611: DIECISIETE, 2608: [] });
 try {
  escribirMes(b.root, 'AAA', '2610', TREINTAYUNO); escribirMes(b.root, 'AAA', '2609', TREINTA);
  await corre(b);
  assert.equal(fs.readFileSync(path.join(b.root, 'velas/cripto/AAA/_verificado'), 'utf8').trim(), '2610');
  assert.equal(fs.readFileSync(path.join(b.root, 'velas/cripto/AAA/_cobertura'), 'utf8').trim(), '2026-11-17', 'la corrida deja el inventario al corte');
  // Un mes viejo se daña entre corridas: la puesta al día confía y no lo toca; lo repara «registra todo».
  const viejo = path.join(b.root, 'velas/cripto/AAA/2609_AAA');
  fs.writeFileSync(viejo, '[["roto"]]');
  b.llamadas.length = 0; b.lineas.length = 0;
  await corre(b);
  assert.deepEqual(b.llamadas, [], 'segunda corrida: el inventario cubre el corte, cero consultas');
  assert.equal(fs.readFileSync(viejo, 'utf8'), '[["roto"]]', 'no re-valida ni repara lo ya verificado');
  assert.ok(!b.lineas.some((l) => /en disco/.test(l)), 'no recorre meses confiables');
  assert.ok(b.lineas.some((l) => l.startsWith('Completo hasta 2026-11-17; sin consultas.')));
 } finally { b.fin(); }
});

test('piso fijo ago-2026: no consulta debajo aunque Binance tenga datos, cierra con tramo cubierto, siembra marcas y limpia archivos viejos', async () => {
 const b = banco({ 2611: DIECISIETE, 2607: TREINTAYUNO, 2606: TREINTA }); // Binance TIENE meses anteriores al piso
 try {
  escribirMes(b.root, 'AAA', '2610', TREINTAYUNO); escribirMes(b.root, 'AAA', '2609', TREINTA); escribirMes(b.root, 'AAA', '2608', TREINTAYUNO);
  escribirMes(b.root, 'AAA', '2607', TREINTAYUNO); // archivo local anterior al piso: la limpieza lo borra
  await corre(b);
  assert.deepEqual(b.llamadas, ['2611'], 'no consulta por debajo del piso');
  assert.ok(!fs.existsSync(path.join(b.root, 'velas/cripto/AAA/2607_AAA')), 'borra el archivo anterior al piso');
  assert.ok(fs.existsSync(path.join(b.root, 'velas/cripto/AAA/2608_AAA')), 'conserva desde el piso');
  assert.equal(fs.readFileSync(path.join(b.root, 'velas/cripto/AAA/_verificado'), 'utf8').trim(), '2610');
  assert.equal(fs.readFileSync(path.join(b.root, 'velas/cripto/AAA/_primer-mes'), 'utf8').trim(), '2608');
  assert.ok(b.lineas.some((l) => l.startsWith('Tramo desde agosto de 2026 cubierto.')));
 } finally { b.fin(); }
});

test('la orden existe, es delegable y la ayuda la distingue de la revision completa', () => {
 const velas = fs.readFileSync(new URL('../app/modulos/velas.mjs', import.meta.url), 'utf8');
 assert.match(velas, /pon\\s\+al\\s\+d\[ií\]a/);
 assert.match(velas, /poner al dia los registros',delegable:true/);
 assert.match(velas, /rapido:true/);
 const ayuda = fs.readFileSync(new URL('../app/modulos/ayuda.mjs', import.meta.url), 'utf8');
 assert.match(ayuda, /pon al dia/);
 assert.match(ayuda, /registra todo.*revision completa/);
});

test('registra continuar retoma una puesta al dia pausada en el mismo modo', async () => {
 const b = banco({ 2611: DIECISIETE });
 try {
  escribirMes(b.root, 'AAA', '2610', TREINTAYUNO); escribirMes(b.root, 'AAA', '2609', TREINTA);
  fs.writeFileSync(path.join(b.root, 'velas/cripto/AAA/_primer-mes'), '2609\n');
  await corre(b);
  const j = leerEstado(path.join(b.root, 'estado.json'));
  assert.equal(j.rapido, true);
 } finally { b.fin(); }
});

test('inventario al dia: sin consultas aunque no haya marcas', async () => {
 const b = banco({ 2611: DIECISIETE });
 try {
  escribirMes(b.root, 'AAA', '2611', DIECISIETE);
  fs.writeFileSync(path.join(b.root, 'velas/cripto/AAA/_cobertura'), '2026-11-17\n');
  await corre(b);
  assert.deepEqual(b.llamadas, []);
  assert.ok(b.lineas.some((l) => l.startsWith('Completo hasta 2026-11-17; sin consultas.')));
 } finally { b.fin(); }
});

test('atraso de varios meses: pide solo los dias que faltan y la cobertura no salta huecos', async () => {
 const b = banco({ 2611: DIECISIETE, 2610: TREINTAYUNO });
 try {
  escribirMes(b.root, 'AAA', '2611', DIECISIETE);
  escribirMes(b.root, 'AAA', '2610', Array.from({ length: 20 }, (_, i) => i + 1)); // octubre solo hasta el 20
  fs.writeFileSync(path.join(b.root, 'velas/cripto/AAA/_cobertura'), '2026-10-20\n');
  fs.writeFileSync(path.join(b.root, 'velas/cripto/AAA/_verificado'), '2610\n');
  await corre(b);
  assert.deepEqual(b.llamadas, ['2611', '2610'], 'consulta el mes en curso y el mes atrasado; la marca no confia por encima del inventario');
  assert.equal(JSON.parse(fs.readFileSync(path.join(b.root, 'velas/cripto/AAA/2610_AAA'))).length, 31, 'octubre quedo completo');
  assert.equal(fs.readFileSync(path.join(b.root, 'velas/cripto/AAA/_cobertura'), 'utf8').trim(), '2026-11-17');
  assert.ok(b.lineas.some((l) => /inventario desde septiembre/.test(l)), b.lineas.join(' | '));
  b.llamadas.length = 0; b.lineas.length = 0;
  await corre(b);
  assert.deepEqual(b.llamadas, [], 'segunda corrida: todo cubierto');
 } finally { b.fin(); }
});

test('archivo del mes en curso ausente con inventario al dia: se reconstruye con una consulta', async () => {
 const b = banco({ 2611: DIECISIETE });
 try {
  fs.mkdirSync(path.join(b.root, 'velas/cripto/AAA'), { recursive: true });
  fs.writeFileSync(path.join(b.root, 'velas/cripto/AAA/_cobertura'), '2026-11-17\n');
  await corre(b);
  assert.deepEqual(b.llamadas, ['2611'], 'la ausencia real invalida el atajo y reconstruye');
  assert.ok(fs.existsSync(path.join(b.root, 'velas/cripto/AAA/2611_AAA')));
 } finally { b.fin(); }
});

test('alteracion con inventario al dia no provoca reconsulta: se detecta al usar (sync)', async () => {
 const b = banco({ 2611: DIECISIETE });
 try {
  escribirMes(b.root, 'AAA', '2611', DIECISIETE);
  fs.writeFileSync(path.join(b.root, 'velas/cripto/AAA/_cobertura'), '2026-11-17\n');
  const p = path.join(b.root, 'velas/cripto/AAA/2611_AAA');
  const datos = JSON.parse(fs.readFileSync(p)); datos[3][4] = '99';
  fs.writeFileSync(p, JSON.stringify(datos));
  await corre(b);
  assert.deepEqual(b.llamadas, [], 'confia: no reconsulta ni revalida; el conflicto lo detecta la sincronizacion al usar el dato');
 } finally { b.fin(); }
});

test('vacio inesperado sobre el piso apaga la confianza y la cobertura no avanza', async () => {
 const b = banco({ 2611: DIECISIETE, 2610: [], 2609: TREINTA, 2608: [] });
 try {
  escribirMes(b.root, 'AAA', '2611', DIECISIETE);
  fs.writeFileSync(path.join(b.root, 'velas/cripto/AAA/_primer-mes'), '2609\n');
  await corre(b);
  assert.deepEqual(b.llamadas, ['2611', '2610', '2609', '2608'], 'el hueco sigue consultando hasta el vacio real');
  assert.ok(!fs.existsSync(path.join(b.root, 'velas/cripto/AAA/_cobertura')), 'sin cobertura: el hueco impide avanzarla');
  assert.ok(!fs.existsSync(path.join(b.root, 'velas/cripto/AAA/_verificado')), 'sin marca de verificado');
 } finally { b.fin(); }
});

test('los nombres del cotejo evitan resolver activo por activo; sin ellos se resuelve como antes', async () => {
 const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-nombres-'));
 try {
  let resueltos = 0;
  const opciones = {
   base: () => path.join(raiz, 'velas'), archivoEstado: () => path.join(raiz, 'estado.json'),
   resolver: async (clase, codigo) => { resueltos++; return { ok: true, clase, codigo, simbolo: codigo + 'USDT', nombre: codigo }; },
   fetchImpl: async (u) => {
    const inicio = Number(new URL(u).searchParams.get('startTime'));
    const yymm = new Date(inicio).toISOString().slice(2, 7).replace('-', '');
    const datos = yymm === '2611' ? diasDe('2611', DIECISIETE) : [];
    return { ok: true, status: 200, text: async () => JSON.stringify(datos) };
   },
   avisar: async () => {}, ahora: () => AHORA,
  };
  await crearMotor(opciones).iniciar({ clase: 'cripto', codigos: ['AAA'], nombres: { AAA: 'AAA Token' }, event: evento, rapido: true });
  assert.equal(resueltos, 0, 'con nombres del cotejo no hay resolucion por activo');
  assert.equal(leerEstado(path.join(raiz, 'estado.json')).nombres.AAA, 'AAA Token');
  fs.rmSync(path.join(raiz, 'estado.json'));
  fs.rmSync(path.join(raiz, 'velas'), { recursive: true, force: true });
  await crearMotor(opciones).iniciar({ clase: 'cripto', codigos: ['AAA'], event: evento, rapido: true });
  assert.equal(resueltos, 1, 'un avance sin nombres resuelve activo por activo como antes');
 } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
});
