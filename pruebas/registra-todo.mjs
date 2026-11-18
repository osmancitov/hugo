// node --test pruebas/registra-todo.mjs. Sin red ni cuentas: Binance y Slack simulados.
// «registra todo»: una orden recorre stock y luego cripto, con un solo corte UTC,
// el mismo reporte por activo y recuperacion entre clases con continuar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearMotor, leerEstado, guardarEstado } from '../app/modulos/registro-motor.mjs';
const event={channel:'canal-prueba',ts:'raiz-prueba'};
const octubre=Date.UTC(2026,9,1), septiembre=Date.UTC(2026,8,1), corte=Date.UTC(2026,10,1);
const vela=t=>[t,'1','2','1','2','10',t+86400000-1,'10',3,'1','2','0'];
function setup(opts={}) {
 const root=opts.root||fs.mkdtempSync(path.join(os.tmpdir(),'hugo-todo-'));
 const msgs=[],consultas=[],resoluciones=[],activas=new Map();
 const base=path.join(root,'velas'),estado=path.join(root,'privado/estado.json');
 const m=crearMotor({ahora:()=>corte,base:()=>base,archivoEstado:()=>estado,activas,
  resolver:async(clase,codigo)=>{resoluciones.push([clase,codigo]);return opts.resolver?opts.resolver(clase,codigo):{ok:true,simbolo:codigo+'USDT',nombre:codigo};},
  fetchImpl:async u=>{const q=new URL(u).searchParams;const t=Number(q.get('startTime')),sim=q.get('symbol');consultas.push([sim,t]);const d=opts.datos?await opts.datos(sim,t):t===octubre?[vela(t)]:[];return {ok:true,status:200,text:async()=>typeof d==='string'?d:JSON.stringify(d)};},
  avisar:async(j,t)=>{msgs.push({j:structuredClone(j),text:t});if(opts.aviso)await opts.aviso(j,t);},
 });
 const combinado=()=>m.iniciar({clase:'stock',codigos:['AA'],siguientes:[{clase:'cripto',codigos:['BTC']}],event});
 return {root,base,estado,msgs,consultas,resoluciones,activas,m,combinado,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
async function caso(fn,opts){const s=setup(opts);try{await fn(s);}finally{s.close();}}

test('una orden recorre stock y luego cripto, con un solo corte y un solo resumen final',async()=>caso(async s=>{
 await s.combinado();
 assert.deepEqual(s.resoluciones,[['stock','AA'],['cripto','BTC']]);
 assert.deepEqual(s.consultas,[['AAUSDT',octubre],['AAUSDT',septiembre],['BTCUSDT',octubre],['BTCUSDT',septiembre]]);
 const j=leerEstado(s.estado);
 assert.equal(j.estado,'terminado');assert.equal(j.clase,'cripto');assert.equal(j.total,2);
 assert.deepEqual(j.conteo,{guardados:2,existentes:0,activos:2,ampliados:0});assert.equal(j.notificado,true);
 assert.equal(fs.readFileSync(path.join(s.base,'stock/AA/2610_AA'),'utf8'),JSON.stringify([vela(octubre)]));
 assert.equal(fs.readFileSync(path.join(s.base,'cripto/BTC/2610_BTC'),'utf8'),JSON.stringify([vela(octubre)]));
 assert.ok(s.msgs.some(m=>m.text.includes('Registro en curso: stock, 1 activo(s), y luego cripto')));
 assert.ok(s.msgs.some(m=>m.text.includes('Termine stock (1 activos). Sigo con cripto')));
 assert.ok(s.msgs.at(-1).text.includes('Registro terminado'));
 assert.ok(s.msgs.at(-1).text.includes('2/2 activos terminados'));
 // Un solo aviso final y reportes por activo: nada de un mensaje por consulta.
 assert.equal(s.msgs.filter(m=>m.text.includes('Registro terminado')).length,1);
 assert.equal(s.activas.size,0);
}));

test('corte entre clases: continuar retoma la clase que sigue sin repetir stock',async()=>caso(async s=>{
 guardarEstado(s.estado,{version:2,estado:'en-curso',clase:'stock',codigos:['AA'],siguientes:[{clase:'cripto',codigos:['BTC']}],total:2,piso:null,indice:1,hasta:corte,inicial:octubre,mes:octubre,channel:event.channel,thread_ts:event.ts,conteo:{guardados:1,existentes:0,activos:1,ampliados:0},notificado:false});
 await s.m.iniciar({continuar:true,event});
 assert.ok(s.consultas.length>0);assert.ok(s.consultas.every(x=>x[0]==='BTCUSDT'));
 const j=leerEstado(s.estado);assert.equal(j.estado,'terminado');assert.equal(j.conteo.activos,2);
 assert.ok(fs.existsSync(path.join(s.base,'cripto/BTC/2610_BTC')));
}));

test('fallo en la segunda clase pausa ahi y continuar la retoma',async()=>{
 let falla=true;
 await caso(async s=>{
  await s.combinado();
  let j=leerEstado(s.estado);
  assert.equal(j.estado,'pausado');assert.equal(j.clase,'cripto');assert.equal(j.indice,0);
  assert.ok(j.siguientes.length===0);
  assert.ok(s.consultas.every(x=>x[0]==='AAUSDT'));
  falla=false;
  await s.m.iniciar({continuar:true,event});
  j=leerEstado(s.estado);assert.equal(j.estado,'terminado');assert.equal(j.conteo.activos,2);
  assert.ok(fs.existsSync(path.join(s.base,'cripto/BTC/2610_BTC')));
 },{resolver:(clase,codigo)=>{if(falla&&clase==='cripto')return {ok:false,motivo:'fallo simulado'};return {ok:true,simbolo:codigo+'USDT'};}});
});

test('avance de una sola clase sin el campo nuevo sigue valido',async()=>caso(async s=>{
 guardarEstado(s.estado,{version:2,estado:'pausado',clase:'stock',codigos:['AA'],piso:null,indice:0,hasta:corte,inicial:octubre,mes:octubre,channel:event.channel,thread_ts:event.ts,conteo:{guardados:0,existentes:0,activos:0,ampliados:0},error:'prueba',notificado:false});
 await s.m.iniciar({continuar:true,event});
 const j=leerEstado(s.estado);assert.equal(j.estado,'terminado');assert.deepEqual(j.siguientes,[]);
}));

test('repetir la misma orden combinada no duplica el trabajo pendiente',async()=>{
 await caso(async s=>{
  await s.combinado();
  const antes=fs.readFileSync(s.estado,'utf8');
  await s.m.iniciar({clase:'stock',codigos:['CC'],event});
  assert.equal(fs.readFileSync(s.estado,'utf8'),antes);
  assert.ok(s.msgs.at(-1).text.includes('No lo sustituyo'));
 },{resolver:(clase,codigo)=>clase==='cripto'?{ok:false,motivo:'pausa simulada'}:{ok:true,simbolo:codigo+'USDT'}});
});

test('integracion del comando: «registra todo» coteja ambas clases, avisa y registra en secuencia sin pulgar',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-todo-cmd-'));const original=globalThis.fetch;let handler;const msgs=[];
 globalThis.fetch=async u=>{let j;const url=new URL(u);
  if(u.includes('exchangeInfo?symbol')) {const symbol=url.searchParams.get('symbol');j={symbols:[{symbol,status:'TRADING',quoteAsset:'USDT',baseAsset:symbol.slice(0,-4)}]};}
  else if(u.includes('exchangeInfo')) j={symbols:[{symbol:'NVDABUSDT',status:'TRADING',quoteAsset:'USDT',baseAsset:'NVDAB'},{symbol:'BTCUSDT',status:'TRADING',quoteAsset:'USDT',baseAsset:'BTC'},...Array.from({length:100},(_,i)=>({symbol:'PAD'+i,status:'TRADING',quoteAsset:'BUSD',baseAsset:'PAD'+i}))]};
  else if(u.includes('get-products')) j={data:[{s:'NVDABUSDT',tags:['bStocks'],an:'NVIDIA (bStocks)'},{s:'BTCUSDT',an:'Bitcoin'},...Array.from({length:100},(_,i)=>({s:'PRUEBA'+i}))]};
  else {const t=Number(url.searchParams.get('startTime'));const now=new Date();const m=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1);j=t===m?[vela(t)]:[];}
  return{ok:true,status:200,text:async()=>JSON.stringify(j),json:async()=>j};
 };
 try{
  const {registrar}=await import('../app/modulos/velas.mjs');
  registrar({conf:{HUGO_VELAS_DIR:path.join(root,'velas'),HUGO_REGISTRO_ESTADO:path.join(root,'estado.json')},app:{client:{chat:{postMessage:async m=>{msgs.push(m);return {ts:'simulada-'+msgs.length};},update:async m=>{msgs.push({...m,thread_ts:event.ts});return {ts:m.ts};}}}},activas:new Map(),alIniciar:()=>{},confirmar:()=>{throw Error('No debe pedir pulgar');},comando:(_,f)=>handler=f});
  await handler(event,'registra todo BTC');
  assert.ok(msgs.some(m=>m.text.includes('no admite codigos')));
  msgs.length=0;
  await handler(event,'registra todo');
  const j=leerEstado(path.join(root,'estado.json'));
  assert.equal(j.estado,'terminado');assert.equal(j.total,2);assert.equal(j.clase,'cripto');
  assert.deepEqual(j.codigos,['BTC']);
  assert.ok(fs.existsSync(path.join(root,'velas','stock','NVDA')) && fs.existsSync(path.join(root,'velas','cripto','BTC')));
  assert.ok(msgs.some(m=>m.text.includes('Cotejo de stock')) && msgs.some(m=>m.text.includes('Cotejo de cripto')));
  assert.ok(msgs.some(m=>m.text.includes('Termine stock')));
  assert.ok(msgs.every(m=>m.channel===event.channel));
  // Con el trabajo terminado, repetir «registra todo» es una orden nueva; con uno pendiente, se niega.
  msgs.length=0;
  const {guardarEstado:ge}=await import('../app/modulos/registro-motor.mjs');
  ge(path.join(root,'estado.json'),{...j,estado:'pausado',indice:0,error:'prueba'});
  await handler(event,'registra todo');
  assert.ok(msgs.some(m=>m.text.includes('Hay un registro pendiente')));
 }finally{globalThis.fetch=original;fs.rmSync(root,{recursive:true,force:true});}
});
