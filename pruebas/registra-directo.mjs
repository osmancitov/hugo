// Ejecutar: node --test pruebas/registra-directo.mjs. Solo datos simulados y directorios temporales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const event = { channel: 'canal-prueba', ts: '1', thread_ts: 'hilo-prueba' };
const vela = [Date.UTC(2026, 9, 1), '1', '2', '1', '2', '100', Date.UTC(2026, 9, 2)-1, '100', 5, '1', '2', '0'];
async function escenario(fn, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-prueba-'));
  const original = globalThis.fetch;
  const msgs = [], urls = [];
  let handler, llamadasConfirmar = 0;
  globalThis.fetch = async (url) => {
    urls.push(url);
    if (opts.fetch) await opts.fetch(url);
    let data;
    if (url.includes('exchangeInfo')) {
      const symbol = new URL(url).searchParams.get('symbol');
      data = opts.invalido ? { code: -1121 } : { symbols: [{ symbol, status: 'TRADING', quoteAsset: 'USDT', baseAsset: symbol.slice(0,-4) }] };
    } else if (url.includes('get-products')) {
      data = { data: [ {s:'NVDABUSDT', tags: opts.sinEtiqueta ? [] : ['bStocks'], an: 'NVIDIA (bStocks)'}, {s:'BTCUSDT', tags:[], an:'Bitcoin'}, ...Array.from({length:100}, (_,i)=>({s:`PRUEBA${i}`})) ] };
    } else {
      if (opts.errorVelas) throw new Error('fallo simulado');
      data = opts.vacio ? [] : [vela];
    }
    return { status: 200, text: async () => JSON.stringify(data) };
  };
  const modules = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-modulos-'));
  for (const f of ['velas.mjs','activos.mjs']) fs.copyFileSync(new URL('../app/modulos/'+f,import.meta.url),path.join(modules,f));
  const { registrar } = await import('file://'+path.join(modules,'velas.mjs'));
  const ctx = {
    app: { client: { chat: { postMessage: async (m) => { msgs.push(m); return {ts:'2'}; } } } },
    botToken: 'simulado', conf: { HUGO_VELAS_DIR: root },
    confirmar: async () => { llamadasConfirmar++; throw new Error('No debe pedir confirmacion'); },
    comando: (p, f, o) => { handler = f; assert.equal(o.delegable, true); },
  };
  registrar(ctx);
  const run = (text) => handler(event, text);
  try { await fn({root,msgs,urls,run,ctx}); assert.equal(llamadasConfirmar,0); }
  finally { globalThis.fetch = original; fs.rmSync(root,{recursive:true,force:true}); fs.rmSync(modules,{recursive:true,force:true}); }
}

test('stock directo: un mes, cuerpo crudo, nombre y destino, sin confirmacion', async () => escenario(async ({root,msgs,run}) => {
  await run('registra stock NVDA');
  assert.equal(fs.readFileSync(path.join(root,'stock/NVDA/2610_NVDA'),'utf8'),JSON.stringify([vela]));
  assert.equal(msgs.length,2); assert.match(msgs[0].text,/NVIDIA/); assert.match(msgs[0].text,/corte UTC/); assert.match(msgs[0].text,/2610_NVDA/);
  assert.match(msgs[1].text,/faltan los/);
}));
test('cripto directo conserva carpeta propia', async () => escenario(async ({root,run}) => {
  await run('registra cripto BTC'); assert.ok(fs.existsSync(path.join(root,'cripto/BTC/2610_BTC')));
}));
test('clase faltante pregunta datos, no consulta ni registra', async () => escenario(async ({urls,msgs,run}) => {
  await run('registra NVDA');assert.equal(urls.length,0);assert.match(msgs[0].text,/clase/);
}));
test('activo inexistente no guarda', async () => escenario(async ({root,msgs,run}) => {
  await run('registra stock NVDA');assert.deepEqual(fs.readdirSync(root),[]);assert.match(msgs[0].text,/No guard/);
},{invalido:true}));
test('stock sin etiqueta se rechaza', async () => escenario(async ({root,msgs,run}) => {
  await run('registra stock NVDA');assert.deepEqual(fs.readdirSync(root),[]);assert.match(msgs[0].text,/no lo etiqueta/);
},{sinEtiqueta:true}));
test('clase incorrecta de bStock se rechaza como cripto', async () => escenario(async ({root,msgs,run}) => {
  await run('registra cripto NVDAB');assert.deepEqual(fs.readdirSync(root),[]);assert.match(msgs[0].text,/no un cripto/);
}));
test('mes existente no se pisa, siguiente orden toma septiembre', async () => escenario(async ({root,urls,run}) => {
  await run('registra stock NVDA');const p=path.join(root,'stock/NVDA/2610_NVDA');const previo=fs.readFileSync(p,'utf8');
  await run('registra stock NVDA');assert.equal(fs.readFileSync(p,'utf8'),previo);assert.ok(fs.existsSync(path.join(root,'stock/NVDA/2609_NVDA')));
  assert.match(urls.filter(u=>u.includes('/klines'))[1],/startTime=1788220800000/);
}));
test('mes vacio no guarda ni recorre mas meses', async () => escenario(async ({root,urls,msgs,run}) => {
  await run('registra stock NVDA');assert.deepEqual(fs.readdirSync(root),[]);assert.equal(urls.filter(u=>u.includes('/klines')).length,1);assert.match(msgs.at(-1).text,/Me detengo/);
},{vacio:true}));
test('error de velas libera bloqueo para reintento', async () => escenario(async ({msgs,run}) => {
  await run('registra stock NVDA');await run('registra stock NVDA');assert.equal(msgs.filter(m=>m.text.includes('se detuvo')).length,2);
},{errorVelas:true}));
test('dos ordenes concurrentes: bloqueo desde validacion, un mes', async () => {
  let release; const gate = new Promise(r=>release=r); let first=true;
  await escenario(async ({root,msgs,run}) => {
    const a=run('registra stock NVDA');await new Promise(r=>setImmediate(r));await run('registra stock NVDA');release();await a;
    assert.ok(msgs.some(m=>m.text.includes('Ya estoy')));assert.deepEqual(fs.readdirSync(path.join(root,'stock/NVDA')),['2610_NVDA']);
  },{fetch: async u=>{if(first && u.includes('exchangeInfo')) {first=false;await gate;} }});
});
test('seguridad del despachador y confirmaciones ajenas sin cambios funcionales', () => {
  const app=fs.readFileSync(new URL('../app/app.mjs',import.meta.url),'utf8');
  assert.match(app,/event.user !== USUARIO && !delegado/);
  for(const f of ['github.mjs','actualizar.mjs','archivos.mjs','borrar-hilo.mjs']) {
    assert.match(fs.readFileSync(new URL('../app/modulos/'+f,import.meta.url),'utf8'),/ctx.confirmar/);
  }
});
