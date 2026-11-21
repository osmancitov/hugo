// Pruebas aisladas: las lecturas simuladas viven solo en temporales y nunca se publican.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { crearRemoto } from './git-remoto.mjs';
import { formatearBarra, leerBarra, RUTA_BARRA, escribirBarra } from '../app/modulos/barra-movil.mjs';
import { guardarLectura, recuperarIntradia, pendientesIntradia, confirmarIntradia, combinarArchivoIntradia, intervaloIntradia, registrar as registrarIntradia } from '../app/modulos/registro-intradia.mjs';
import { registrar as registrarSync } from '../app/modulos/sincronizar-registros.mjs';
import { diaUTC, rutaDia, RUTA_INDICE, leerDia, terrenoDia } from '../app/modulos/intradia-datos.mjs';

const T = Date.UTC(2026, 10, 21, 10), DIA = 86400000;
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-intradia-prueba-'));
const limpiar = (p) => fs.rmSync(p, { recursive: true, force: true });
const archivo = (r, rel) => path.join(r, rel.slice('registros/'.length));
function foto(t = T, ultimo = 100, anterior = null) {
  const b = { inicio: t - DIA, cierreMin: t, fin: t, dispersionMs: 0, consultados: 1, conDato: 1, sinDato: 0, suben: ultimo >= 100 ? 1 : 0, bajan: ultimo < 100 ? 1 : 0,
    dia: { ref: diaUTC(t - DIA), suben: ultimo >= 100 ? 1 : 0, bajan: ultimo < 100 ? 1 : 0, iguales: ultimo === 100 ? 1 : 0, sinDato: 0 },
    activos: [{ codigo: 'AAA', ultimo, ultimoTexto: String(ultimo), aperturaTexto: '100', diaCierreTexto: '100', cierre: t }] };
  if (anterior !== null) {
    b.comparadaCon = t - 60000;
    b.movimiento = { suben: ultimo >= anterior ? 1 : 0, bajan: ultimo < anterior ? 1 : 0, iguales: ultimo === anterior ? 1 : 0, sinCierreNuevo: 0, sinPrevia: 0 };
    b.activos[0].previoTexto = String(anterior); b.activos[0].movResultado = ultimo === anterior ? 'igual' : ultimo > anterior ? 'sube' : 'baja';
  }
  return formatearBarra(b, t);
}
function contexto(root, rem) {
  const comandos = [], inicios = [];
  return { conf: { HUGO_VELAS_DIR: path.join(root, 'registros', 'velas-24h'), HUGO_GITHUB: 'osman/prueba', HUGO_REPO_SYNC_URL: rem?.url, HUGO_REPO_SYNC_DIR: path.join(root, 'clon') },
    app: { client: { chat: { postMessage: async () => ({ ts: '1' }) } } }, botToken: 'prueba', canal: 'C', parada: { n: 0 }, activas: new Map(),
    leerClave: () => 'token-de-prueba', comando: (patron, fn, o) => comandos.push({ patron, fn, ...o }), alIniciar: (fn) => inicios.push(fn), comandos, inicios };
}

test('conserva la lectura exacta, no duplica al repetir y separa días UTC', () => {
  const p = temp(), raiz = path.join(p, 'registros');
  try {
    guardarLectura(raiz, foto()); guardarLectura(raiz, foto()); guardarLectura(raiz, foto(T + 60000, 90, 100));
    const hoy = leerDia(fs.readFileSync(archivo(raiz, rutaDia('2026-11-21')), 'utf8'), leerBarra);
    assert.equal(hoy.lecturas.length, 2); assert.equal(hoy.lecturas[0].texto, foto());
    guardarLectura(raiz, foto(T + DIA));
    const indice = JSON.parse(fs.readFileSync(archivo(raiz, RUTA_INDICE)));
    assert.deepEqual(indice.dias, ['2026-11-21', '2026-11-22']);
    assert.equal(indice.ultima, new Date(T + DIA).toISOString());
    assert.equal(hoy.lecturas.length, 2);
  } finally { limpiar(p); }
});

test('cola duradera materializa un corte sin volver a consultar la fuente', () => {
  const p = temp(), raiz = path.join(p, 'registros');
  try {
    guardarLectura(raiz, foto());
    const pendientes = pendientesIntradia(raiz);
    for (const r of Object.keys(pendientes)) fs.unlinkSync(archivo(raiz, r));
    recuperarIntradia(raiz);
    for (const [r, texto] of Object.entries(pendientes)) assert.equal(fs.readFileSync(archivo(raiz, r), 'utf8'), texto);
  } finally { limpiar(p); }
});

test('un conflicto nunca reemplaza un registro existente ni vacía su cola', () => {
  const p = temp(), raiz = path.join(p, 'registros');
  try {
    guardarLectura(raiz, foto());
    const antes = fs.readFileSync(archivo(raiz, rutaDia('2026-11-21')), 'utf8');
    assert.throws(() => guardarLectura(raiz, foto(T, 90)), /Conflicto/);
    assert.equal(fs.readFileSync(archivo(raiz, rutaDia('2026-11-21')), 'utf8'), antes);
    assert.equal(Object.keys(pendientesIntradia(raiz)).length, 3);
  } finally { limpiar(p); }
});

test('confirmar una versión enviada no pierde una lectura que llegó después', () => {
  const p = temp(), raiz = path.join(p, 'registros');
  try {
    guardarLectura(raiz, foto()); const enviados = pendientesIntradia(raiz);
    guardarLectura(raiz, foto(T + 60000, 90, 100));
    confirmarIntradia(raiz, enviados);
    assert.ok(Object.keys(pendientesIntradia(raiz)).length > 0);
    assert.equal(leerDia(fs.readFileSync(archivo(raiz, rutaDia('2026-11-21')), 'utf8')).lecturas.length, 2);
  } finally { limpiar(p); }
});

test('unión conserva ambas lecturas, la instantánea más nueva y rechaza rutas ajenas', () => {
  const p = temp(), raiz = path.join(p, 'registros');
  try {
    guardarLectura(raiz, foto()); const a = pendientesIntradia(raiz);
    guardarLectura(raiz, foto(T + 60000, 90, 100)); const b = pendientesIntradia(raiz);
    assert.equal(leerDia(combinarArchivoIntradia(rutaDia('2026-11-21'), a[rutaDia('2026-11-21')], b[rutaDia('2026-11-21')])).lecturas.length, 2);
    assert.equal(combinarArchivoIntradia(RUTA_BARRA, foto(), foto(T + 60000, 90, 100)), foto(T + 60000, 90, 100));
    assert.throws(() => combinarArchivoIntradia('../keys/clave', '{}', null), /ajena/);
    assert.throws(() => rutaDia('2026-02-31'), /inválido/);
  } finally { limpiar(p); }
});

test('100 → 90 → 100 vuelve a altura cero sin sumar porcentajes; movimiento independiente', () => {
  const lecturas = [foto(), foto(T + 60000, 90, 100), foto(T + 120000, 100, 90)].map((texto) => ({ texto }));
  const terreno = terrenoDia(lecturas, leerBarra);
  const alturas = terreno.puntos.map((f) => f[0].altura);
  assert.equal(alturas[0], 0); assert.ok(Math.abs(alturas[1] + 10) < 1e-10); assert.equal(alturas[2], 0);
  assert.ok(Math.abs(terreno.puntos[2][0].movimiento - 100 / 9) < 1e-10);
  const sinRef = foto().replace('AAA dia_cierre: 100', 'AAA dia_cierre: sin dato');
  assert.equal(terrenoDia([{ texto: sinRef }], leerBarra).puntos[0][0], null);
});

test('sin frecuencia no programa, no consulta y no borra registros', async () => {
  const p = temp();
  try {
    const ctx = contexto(p); registrarIntradia(ctx);
    for (const fn of ctx.inicios) await fn();
    assert.equal(ctx.intradiaInfo().minutos, null); assert.equal(ctx.intradiaInfo().proxima, null);
    assert.equal(fs.existsSync(path.join(p, 'registros')), false);
    assert.equal(intervaloIntradia('15'), 15); assert.throws(() => intervaloIntradia('basura'), /entero/);
    assert.throws(() => intervaloIntradia('1'), /5 a 1440/);
  } finally { limpiar(p); }
});

test('toma reutiliza dos tandas, conserva la única foto heredada y publica solo la cola', async () => {
  const p = temp(), ctx = contexto(p), raiz = path.join(p, 'registros');
  try {
    fs.mkdirSync(path.join(ctx.conf.HUGO_VELAS_DIR, 'stock', 'AAA'), { recursive: true });
    // Vela cerrada mínima para la referencia fija del generador existente.
    fs.writeFileSync(path.join(ctx.conf.HUGO_VELAS_DIR, 'stock', 'AAA', '2611_AAA'), JSON.stringify([[Date.UTC(2026, 10, 20), '100', '100', '100', '100']]));
    escribirBarra(raiz, foto());
    let peticiones = 0, subidas = 0;
    ctx.publicarIntradia = async (archivos) => { subidas++; return { commit: 'abcdef0', archivos }; };
    registrarIntradia(ctx);
    const r = await ctx.tomarBarra({ ahora: T + 60000, fetchImpl: async () => { peticiones++; return { ok: true, text: async () => JSON.stringify([{ symbol: 'AAABUSDT', openPrice: '100', lastPrice: '90', openTime: T - DIA, closeTime: T + 60000 }]) }; } });
    assert.equal(peticiones, 1); // un solo activo: la segunda tanda vacía no consulta
    assert.equal(subidas, 1); assert.equal(r.registro.lecturas, 2); assert.equal(r.publicacion.commit, 'abcdef0');
    assert.deepEqual(pendientesIntradia(raiz), {});
    assert.equal(leerDia(fs.readFileSync(archivo(raiz, rutaDia('2026-11-21')), 'utf8')).lecturas.length, 2);
  } finally { limpiar(p); }
});

test('fallo de publicación conserva cola y reintenta sin consultar Binance otra vez', async () => {
  const p = temp(), ctx = contexto(p), raiz = path.join(p, 'registros');
  try {
    guardarLectura(raiz, foto()); registrarIntradia(ctx);
    ctx.publicarIntradia = async () => { throw Error('sin conexión'); };
    await assert.rejects(() => ctx.reintentarIntradia(), /sin conexión/);
    assert.equal(Object.keys(pendientesIntradia(raiz)).length, 3);
    ctx.publicarIntradia = async (archivos) => ({ archivos, commit: 'abcdef0' });
    await ctx.reintentarIntradia(); assert.deepEqual(pendientesIntradia(raiz), {});
  } finally { limpiar(p); }
});

test('git publica las tres rutas exactas en un commit y no abre ni recorre el histórico local', async () => {
  const p = temp(), rem = crearRemoto({ 'ajeno.txt': 'intacto' }), ctx = contexto(p, rem), raiz = path.join(p, 'registros');
  try {
    guardarLectura(raiz, foto()); registrarSync(ctx);
    // Si la vía directa llamara a locales() o planear(), intentaría recorrer velas y fallaría.
    const readdir = fs.readdirSync;
    fs.readdirSync = () => { throw Error('Prohibido recorrer archivos históricos'); };
    let r;
    try { r = await ctx.publicarIntradia(pendientesIntradia(raiz)); } finally { fs.readdirSync = readdir; }
    assert.equal(r.subidos.length, 3); assert.ok(r.commit);
    const arbol = rem.arbol(); assert.equal(arbol['ajeno.txt'], 'intacto');
    assert.equal(Object.keys(arbol).length, 5); // README, ajeno y las tres rutas
    assert.match(rem.commits()[0], /Osmancito <osmanvielma@gmail.com>/);
    const segundo = await ctx.publicarIntradia(pendientesIntradia(raiz)); assert.equal(segundo.commit, null);
  } finally { rem.destruir(); limpiar(p); }
});

test('git reintenta un avance ajeno y conserva ambos registros sin pisar código', async () => {
  const p = temp(), rem = crearRemoto(), ctx = contexto(p, rem), raiz = path.join(p, 'registros');
  try {
    guardarLectura(raiz, foto()); registrarSync(ctx);
    // Hook local provoca un avance después del commit y antes del primer push.
    await ctx.publicarIntradia(pendientesIntradia(raiz));
    const antiguos = pendientesIntradia(raiz);
    guardarLectura(raiz, foto(T + 60000, 90, 100));
    rem.avanceAjeno('codigo-ajeno.mjs', 'export const intacto = true;\n');
    const r = await ctx.publicarIntradia(pendientesIntradia(raiz));
    assert.ok(r.commit); assert.equal(rem.arbol()['codigo-ajeno.mjs'], 'export const intacto = true;\n');
    const viejo = await ctx.publicarIntradia(antiguos); assert.equal(viejo.commit, null);
    assert.equal(leerDia(rem.arbol()[rutaDia('2026-11-21')]).lecturas.length, 2);
  } finally { rem.destruir(); limpiar(p); }
});

test('rechaza publicación sin credencial, conflictos remotos y otro trabajo en curso', async () => {
  const p = temp(), rem = crearRemoto({ [RUTA_BARRA]: foto(T, 90) }), ctx = contexto(p, rem), raiz = path.join(p, 'registros');
  try {
    guardarLectura(raiz, foto()); registrarSync(ctx);
    await assert.rejects(() => ctx.publicarIntradia(pendientesIntradia(raiz)), /Conflicto/);
    assert.equal(rem.arbol()[RUTA_BARRA], foto(T, 90));
    ctx.leerClave = () => ''; await assert.rejects(() => ctx.publicarIntradia(pendientesIntradia(raiz)), /Falta/);
    assert.equal(Object.keys(pendientesIntradia(raiz)).length, 3);
  } finally { rem.destruir(); limpiar(p); }
});

test('rechaza cambios de cierre fijo dentro del día y una referencia de otro día', () => {
  const p = temp(), raiz = path.join(p, 'registros');
  try {
    guardarLectura(raiz, foto());
    assert.throws(() => guardarLectura(raiz, foto(T + 60000, 90, 100).replace('AAA dia_cierre: 100', 'AAA dia_cierre: 99')), /referencia fija/);
    assert.throws(() => guardarLectura(raiz, foto(T + 60000, 90, 100).replace('dia_ref: 2026-11-20', 'dia_ref: 2026-11-19')), /Referencia diaria/);
    assert.equal(leerDia(fs.readFileSync(archivo(raiz, rutaDia('2026-11-21')), 'utf8')).lecturas.length, 1);
  } finally { limpiar(p); }
});

test('reloj explícito espera el intervalo y conserva un único reporte sin activar nada por defecto', async () => {
  const p = temp(), ctx = contexto(p), temporizadores = [], mensajes = [];
  ctx.conf.HUGO_INTRADIA_MINUTOS = '15'; ctx.ahora = () => T;
  ctx.reporte = { crear: async (o) => { mensajes.push(o.inicio); return { final: async (t) => mensajes.push(t) }; } };
  const timeout = global.setTimeout, consola = console.error;
  global.setTimeout = (fn, ms) => { temporizadores.push({ fn, ms }); return { unref() {} }; };
  console.error = () => {};
  try {
    registrarIntradia(ctx); for (const fn of ctx.inicios) await fn();
    assert.equal(temporizadores.length, 1); assert.equal(temporizadores[0].ms, 15 * 60000);
    assert.equal(mensajes.length, 0); assert.equal(ctx.intradiaInfo().proxima, T + 15 * 60000);
    await temporizadores[0].fn(); // Sin universo local: falla antes de cualquier consulta de red.
    assert.equal(mensajes.length, 2); assert.match(mensajes[1], /No completé/);
    assert.equal(temporizadores.length, 2); assert.equal(ctx.intradiaInfo().minutos, 15);
  } finally { global.setTimeout = timeout; console.error = consola; limpiar(p); }
});

test('dos publicaciones simultáneas respetan la guardia incluso durante comprobar git', async () => {
  const p = temp(), rem = crearRemoto(), ctx = contexto(p, rem), raiz = path.join(p, 'registros');
  try {
    guardarLectura(raiz, foto()); registrarSync(ctx);
    const primera = ctx.publicarIntradia(pendientesIntradia(raiz));
    await assert.rejects(() => ctx.publicarIntradia(pendientesIntradia(raiz)), /en curso/);
    assert.ok((await primera).commit);
  } finally { rem.destruir(); limpiar(p); }
});

test('non-fast-forward real entre commit y push: reintenta sin perder el avance ajeno', async () => {
  const p = temp(), rem = crearRemoto(), ctx = contexto(p, rem), raiz = path.join(p, 'registros');
  const rutaAntes = process.env.PATH;
  try {
    guardarLectura(raiz, foto()); registrarSync(ctx);
    const bin = path.join(p, 'bin'); fs.mkdirSync(bin);
    const marca = path.join(p, 'avanzo'), log = path.join(p, 'pushes');
    const programa = `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const args=process.argv.slice(2),clon=${JSON.stringify(ctx.conf.HUGO_REPO_SYNC_DIR)},trabajo=${JSON.stringify(path.join(rem.root, 'trabajo'))};
const marca=${JSON.stringify(marca)},log=${JSON.stringify(log)};
const env={...process.env,GIT_AUTHOR_NAME:'Otro',GIT_AUTHOR_EMAIL:'otro@example.invalid',GIT_COMMITTER_NAME:'Otro',GIT_COMMITTER_EMAIL:'otro@example.invalid'};
const git=(a,cwd)=>cp.execFileSync('/usr/bin/git',a,{cwd,env,stdio:'pipe'});
if(args[0]==='push'&&process.cwd()===clon){
 fs.appendFileSync(log,'push\\n');
 if(!fs.existsSync(marca)){
  fs.writeFileSync(marca,'1'); fs.writeFileSync(path.join(trabajo,'codigo-ajeno.mjs'),'export const intacto = true;\\n');
  git(['add','--','codigo-ajeno.mjs'],trabajo);git(['commit','--quiet','-m','avance durante publicación'],trabajo);git(['push','--quiet','origin','HEAD:main'],trabajo);
 }
}
const r=cp.spawnSync('/usr/bin/git',args,{cwd:process.cwd(),env:process.env,stdio:'inherit'});process.exit(r.status??1);
`;
    fs.writeFileSync(path.join(bin, 'git'), programa, { mode: 0o700 }); process.env.PATH = `${bin}:${rutaAntes}`;
    const r = await ctx.publicarIntradia(pendientesIntradia(raiz));
    assert.ok(r.commit); assert.equal(fs.readFileSync(log, 'utf8').trim().split('\n').length, 2);
    const arbol = rem.arbol(); assert.equal(arbol['codigo-ajeno.mjs'], 'export const intacto = true;\n');
    assert.equal(leerDia(arbol[rutaDia('2026-11-21')]).lecturas.length, 1);
  } finally { process.env.PATH = rutaAntes; rem.destruir(); limpiar(p); }
});

test('arranque con frecuencia recupera cola sin consultar Binance ni esperar otra foto', async () => {
  const p = temp(), raiz = path.join(p, 'registros'), ctx = contexto(p), temporizadores = [];
  const timeout = global.setTimeout; let publicadas = 0;
  global.setTimeout = (fn, ms) => { temporizadores.push({ fn, ms }); return { unref() {} }; };
  try {
    guardarLectura(raiz, foto()); const pendientes = pendientesIntradia(raiz);
    for (const r of Object.keys(pendientes)) fs.unlinkSync(archivo(raiz, r));
    ctx.conf.HUGO_INTRADIA_MINUTOS = '5';
    ctx.publicarIntradia = async (archivos) => { publicadas++; return { archivos, commit: 'abcdef0' }; };
    registrarIntradia(ctx); for (const fn of ctx.inicios) await fn();
    assert.equal(publicadas, 1); assert.deepEqual(pendientesIntradia(raiz), {});
    assert.equal(leerDia(fs.readFileSync(archivo(raiz, rutaDia('2026-11-21')), 'utf8')).lecturas.length, 1);
    assert.equal(temporizadores.length, 1); assert.equal(temporizadores[0].ms, 300000);
  } finally { global.setTimeout = timeout; limpiar(p); }
});

test('GitHub recuperado publica cola aunque falle la toma; con reloj apagado no publica al arrancar', async () => {
  const p = temp(), raiz = path.join(p, 'registros'), ctx = contexto(p), temporizadores = [];
  const timeout = global.setTimeout, consola = console.error; let publicadas = 0, disponible = false;
  global.setTimeout = (fn, ms) => { temporizadores.push({ fn, ms }); return { unref() {} }; }; console.error = () => {};
  try {
    guardarLectura(raiz, foto());
    ctx.publicarIntradia = async (archivos) => { publicadas++; if (!disponible) throw Error('GitHub sin red'); return { archivos, commit: 'abcdef0' }; };
    registrarIntradia(ctx); for (const fn of ctx.inicios) await fn(); assert.equal(publicadas, 0); assert.equal(temporizadores.length, 0);
    ctx.conf.HUGO_INTRADIA_MINUTOS = '5'; ctx.inicios.length = 0;
    registrarIntradia(ctx); for (const fn of ctx.inicios) await fn(); assert.equal(publicadas, 1); assert.equal(temporizadores.length, 1);
    disponible = true;
    await temporizadores[0].fn(); // Sin universo: la toma falla sin consultar red.
    assert.equal(publicadas, 2); assert.deepEqual(pendientesIntradia(raiz), {});
    assert.match(ctx.intradiaInfo().error, /No hay carpetas/);
    assert.equal(temporizadores.length, 2); assert.equal(temporizadores[1].ms, 300000);
  } finally { global.setTimeout = timeout; console.error = consola; limpiar(p); }
});

test('funcionamiento continuo: conserva huecos por 429, recupera cola y sigue programado', async () => {
  const p = temp(), raiz = path.join(p, 'registros'), ctx = contexto(p), temporizadores = [];
  const timeout = global.setTimeout, fuente = global.fetch, consola = console.error;
  let ahora = T, peticiones = 0, intentosSubida = 0;
  global.setTimeout = (fn, ms) => { temporizadores.push({ fn, ms }); return { unref() {} }; }; console.error = () => {};
  try {
    fs.mkdirSync(path.join(ctx.conf.HUGO_VELAS_DIR, 'stock', 'AAA'), { recursive: true });
    fs.writeFileSync(path.join(ctx.conf.HUGO_VELAS_DIR, 'stock', 'AAA', '2611_AAA'), JSON.stringify([[T - 10 * 3600000 - DIA, '100', '100', '100', '100']]));
    ctx.ahora = () => ahora; ctx.conf.HUGO_INTRADIA_MINUTOS = '5';
    ctx.publicarIntradia = async (archivos) => { intentosSubida++; if (ahora < T + 20 * 60000) throw Error('GitHub sin conexión'); return { archivos, commit: 'abcdef0' }; };
    global.fetch = async () => {
      peticiones++;
      if (ahora === T + 15 * 60000) return { status: 429, headers: { get: () => '900' } };
      return { ok: true, status: 200, text: async () => JSON.stringify([{ symbol: 'AAABUSDT', openPrice: '100', lastPrice: '101', openTime: ahora - DIA, closeTime: ahora }]) };
    };
    registrarIntradia(ctx); for (const fn of ctx.inicios) await fn();
    for (let i = 0; i < 24; i++) { const t = temporizadores[i]; ahora += t.ms; await t.fn(); }
    assert.equal(ahora, T + 120 * 60000); assert.equal(ctx.intradiaInfo().proxima, T + 125 * 60000); assert.equal(temporizadores.length, 25);
    const lecturas = leerDia(fs.readFileSync(archivo(raiz, rutaDia('2026-11-21')), 'utf8'), leerBarra).lecturas;
    // 24 ciclos, menos 3 fotos por bloqueo en 15, 20 y 25 minutos.
    assert.equal(lecturas.length, 21); assert.equal(peticiones, 22);
    assert.ok(lecturas.some((l) => Date.parse(l.generada) === T + 10 * 60000));
    assert.ok(!lecturas.some((l) => [15,20,25].map((m) => T + m * 60000).includes(Date.parse(l.generada))));
    assert.ok(lecturas.some((l) => Date.parse(l.generada) === T + 30 * 60000));
    assert.deepEqual(pendientesIntradia(raiz), {}); assert.ok(intentosSubida >= 20);
  } finally { global.setTimeout = timeout; global.fetch = fuente; console.error = consola; limpiar(p); }
});
