// node --test pruebas/registra-directo.mjs. Sin red ni cuentas: Binance y Slack simulados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { crearMotor, leerEstado, guardarEstado, CERO } from '../app/modulos/registro-motor.mjs';
import { conectarCaja } from './caja.mjs';
const event={channel:'canal-prueba',ts:'raiz-prueba'};
const octubre=Date.UTC(2026,9,1), septiembre=Date.UTC(2026,8,1);
const vela=t=>[t,'1','2','1','2','10',t+86400000-1,'10',3,'1','2','0'];
function setup(opts={}) {
 const root=opts.root||fs.mkdtempSync(path.join(os.tmpdir(),'hugo-registra-'));
 const msgs=[],consultas=[],resoluciones=[],activas=new Map();
 const base=path.join(root,'velas'),estado=path.join(root,'privado/estado.json');
 const m=crearMotor({ahora:()=>Date.UTC(2026,10,1),base:()=>base,archivoEstado:()=>estado,activas,
  resolver:async(clase,codigo)=>{resoluciones.push([clase,codigo]);return opts.resolver?opts.resolver(clase,codigo):{ok:true,simbolo:codigo+'USDT',nombre:codigo};},
  fetchImpl:async u=>{const q=new URL(u).searchParams;const t=Number(q.get('startTime')),codigo=q.get('symbol');consultas.push([codigo,t]);const d=opts.datos?await opts.datos(codigo,t):t===octubre?[vela(t)]:[];return {ok:true,status:200,text:async()=>typeof d==='string'?d:JSON.stringify(d)};},
  avisar:async(j,t)=>{msgs.push({j:structuredClone(j),text:t});if(opts.aviso)await opts.aviso(j,t);},
 });
 return {root,base,estado,msgs,consultas,resoluciones,activas,m,run:(codigos=['AA'],clase='stock')=>m.iniciar({codigos,clase,event}),close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
async function caso(fn,opts){const s=setup(opts);try{await fn(s);}finally{s.close();}}
test('uno o varios activos: recorre meses y cola en orden, sin confirmacion',async()=>caso(async s=>{
 await s.run(['AA','BB']);assert.deepEqual(s.consultas,[['AAUSDT',octubre],['AAUSDT',septiembre],['BBUSDT',octubre],['BBUSDT',septiembre]]);
 const j=leerEstado(s.estado);assert.equal(j.estado,'terminado');assert.deepEqual(j.conteo,{guardados:2,existentes:0,activos:2,ampliados:0});assert.equal(j.notificado,true);assert.equal(s.activas.size,0);
 assert.equal(fs.readFileSync(path.join(s.base,'stock/AA/2610_AA'),'utf8'),JSON.stringify([vela(octubre)]));
 assert.ok(s.msgs.some(m=>m.text.includes('Activo 2/2')));assert.ok(s.msgs.some(m=>m.text.includes('Mes parcial')));assert.ok(s.msgs.at(-1).text.includes('Registro terminado'));
}));
test('misma regla para cripto, conserva su carpeta',async()=>caso(async s=>{await s.run(['BTC'],'cripto');assert.ok(fs.existsSync(path.join(s.base,'cripto/BTC/2610_BTC')));}));
test('existente igual se comprueba y no se reescribe',async()=>caso(async s=>{
 const p=path.join(s.base,'stock/AA/2610_AA');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify([vela(octubre)]));const ino=fs.statSync(p).ino;
 await s.run();assert.equal(fs.statSync(p).ino,ino);assert.equal(leerEstado(s.estado).conteo.existentes,1);
}));
test('archivo truncado pausa sin pisar ni avanzar activo',async()=>caso(async s=>{
 const p=path.join(s.base,'stock/AA/2610_AA');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'[[');
 await s.run(['AA','BB']);assert.equal(fs.readFileSync(p,'utf8'),'[[');assert.equal(leerEstado(s.estado).estado,'pausado');assert.equal(s.consultas.length,1);assert.equal(leerEstado(s.estado).indice,0);
}));
test('JSON valido pero diferente tambien es conflicto',async()=>caso(async s=>{
 const p=path.join(s.base,'stock/AA/2610_AA');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'[]');await s.run();assert.equal(leerEstado(s.estado).estado,'pausado');assert.equal(fs.readFileSync(p,'utf8'),'[]');
}));
test('error de red no equivale a mes vacio ni pasa al siguiente activo; continuar reintenta',async()=>{
 let falla=true;await caso(async s=>{await s.run(['AA','BB']);let j=leerEstado(s.estado);assert.equal(j.estado,'pausado');assert.equal(j.indice,0);assert.equal(j.mes,octubre);
 falla=false;await s.m.iniciar({continuar:true,event});j=leerEstado(s.estado);assert.equal(j.estado,'terminado');assert.equal(j.conteo.activos,2);
 },{datos:(_,t)=>{if(falla)throw Error('red simulada');return t===octubre?[vela(t)]:[];}});
});
test('respuesta objeto, no JSON o velas invalidas se pausa',async()=>{
 for(const datos of [{code:-1000,msg:'Error'},'<html>error</html>',[[octubre]], [vela(octubre),vela(octubre)], [vela(septiembre)]]) {
  await caso(async s=>{await s.run();assert.equal(leerEstado(s.estado).estado,'pausado');assert.equal(fs.existsSync(s.base),false);},{datos:()=>datos});
 }
});
test('HTTP fallido con cuerpo [] no termina el activo',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-http-'));const archivo=path.join(root,'estado');const m=crearMotor({ahora:()=>Date.UTC(2026,10,1),base:()=>path.join(root,'velas'),archivoEstado:()=>archivo,resolver:async()=>({ok:true,simbolo:'AA'}),avisar:async()=>{},ahora:()=>Date.UTC(2026,10,1),fetchImpl:async()=>({ok:false,status:429,text:async()=>'[]'})});
 try{await m.iniciar({clase:'stock',codigos:['AA'],event});assert.equal(leerEstado(archivo).estado,'pausado');assert.equal(leerEstado(archivo).indice,0);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('una orden distinta no sustituye cola pausada',async()=>caso(async s=>{await s.run(['AA','BB']);const antes=fs.readFileSync(s.estado,'utf8');await s.run(['CC']);assert.equal(fs.readFileSync(s.estado,'utf8'),antes);assert.ok(s.msgs.at(-1).text.includes('No lo sustituyo'));},{resolver:()=>({ok:false,motivo:'no existe'})}));
test('inicio automatico no reintenta un error pausado',async()=>caso(async s=>{await s.run();const n=s.resoluciones.length;const nuevo=setup({root:s.root});await nuevo.m.iniciar({arranque:true});assert.equal(nuevo.resoluciones.length,0);assert.equal(n,1);},{resolver:()=>({ok:false,motivo:'no existe'})}));
test('concurrencia bloqueada incluso mientras valida',async()=>{
 let soltar;const espera=new Promise(r=>soltar=r);await caso(async s=>{const a=s.run();await new Promise(r=>setImmediate(r));await s.run(['BB']);soltar();await a;assert.deepEqual(s.resoluciones.map(x=>x[1]),['AA']);assert.ok(s.msgs.some(x=>x.text.includes('Ya estoy')));},{resolver:async()=>{await espera;return {ok:true,simbolo:'AAUSDT'};}});
});
test('avance corrupto se conserva, no se lanza otro trabajo',async()=>caso(async s=>{fs.mkdirSync(path.dirname(s.estado),{recursive:true});fs.writeFileSync(s.estado,'{');await s.run();assert.equal(fs.readFileSync(s.estado,'utf8'),'{');assert.equal(s.consultas.length,0);}));
test('fichero temporal sin definitivo no cuenta como mes guardado',async()=>caso(async s=>{const p=path.join(s.base,'stock/AA/2610_AA.serie-tmp');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'incompleto');await s.run();assert.equal(leerEstado(s.estado).estado,'terminado');assert.equal(fs.existsSync(p),false);}));
test('reanudacion tras SIGKILL antes/despues de enlace y avance, sin perder ni pisar',async()=>{
 const helper=new URL('./registro-corte.mjs',import.meta.url);
 for(const punto of ['antes-guardar','despues-enlace','despues-avance','entre-activos','antes-aviso-final']) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-corte-'));
  try{
   const a=spawnSync(process.execPath,[helper.pathname,root,punto],{encoding:'utf8'});assert.equal(a.signal,'SIGKILL',a.stderr);
   const b=spawnSync(process.execPath,[helper.pathname,root,'reanudar'],{encoding:'utf8'});assert.equal(b.status,0,b.stderr);
   const j=leerEstado(path.join(root,'estado.json'));assert.equal(j.estado,'terminado');assert.equal(j.conteo.activos,2);
   assert.equal(j.conteo.guardados+j.conteo.existentes,2);
   assert.equal(fs.readFileSync(path.join(root,'velas/stock/AA/2610_AA'),'utf8'),JSON.stringify([vela(octubre)]));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 }
});
test('el avance se guarda antes de la primera consulta y el progreso conserva hilo de origen',async()=>{
 let s; s=setup({aviso:async(j,t)=>{const a=leerEstado(s.estado);assert.ok(a);assert.equal(j.channel,event.channel);assert.equal(j.thread_ts,event.ts);}});
 try{await s.run();assert.equal(leerEstado(s.estado).estado,'terminado');}finally{s.close();}
});
test('avance viejo por debajo del piso fijo: frena en el piso sin consultar',async()=>caso(async s=>{
 const j={version:1,estado:'en-curso',clase:'stock',codigos:['AA'],indice:0,mes:Date.UTC(2006,9,1),channel:'prueba',thread_ts:'prueba',conteo:{guardados:0,existentes:0,activos:0}};
 guardarEstado(s.estado,j);await s.m.iniciar({continuar:true,event});assert.equal(s.consultas.length,0);assert.equal(leerEstado(s.estado).estado,'terminado');assert.equal(leerEstado(s.estado).conteo.activos,1);
}));
test('fallo de aviso pausa tras guardar avance sin repetir el mes al continuar',async()=>{
 let falla=true;await caso(async s=>{await s.run();assert.equal(leerEstado(s.estado).mes,septiembre);assert.equal(leerEstado(s.estado).estado,'pausado');
 falla=false;await s.m.iniciar({continuar:true,event});assert.equal(leerEstado(s.estado).estado,'terminado');assert.equal(s.consultas.filter(x=>x[1]===octubre).length,1);
 },{aviso:async(_,t)=>{if(falla&&t.includes('guardé'))throw Error('Slack simulado');}});
});
test('poda: lista de activos sueltos se rechaza con guia clara, sin consultar ni iniciar nada',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-comando-'));const original=globalThis.fetch;let handler;const msgs=[];let llamadas=0;
 globalThis.fetch=async u=>{llamadas++;let j;const url=new URL(u);
  if(u.includes('exchangeInfo')) {const symbol=url.searchParams.get('symbol');j={symbols:[{symbol,status:'TRADING',quoteAsset:'USDT',baseAsset:symbol.slice(0,-4)}]};}
  else if(u.includes('get-products'))j={data:[{s:'NVDABUSDT',tags:['bStocks'],an:'NVIDIA (bStocks)'},{s:'SPCXBUSDT',tags:['bStocks'],an:'SpaceX (bStocks)'},...Array.from({length:100},(_,i)=>({s:'PRUEBA'+i}))]};
  else {const t=Number(url.searchParams.get('startTime'));const now=new Date();const m=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1);j=t===m?[vela(t)]:[];}
  return{ok:true,status:200,text:async()=>JSON.stringify(j)};
 };
 try{
  const {registrar}=await import('../app/modulos/velas.mjs');
  registrar(conectarCaja({conf:{HUGO_VELAS_DIR:path.join(root,'velas'),HUGO_REGISTRO_ESTADO:path.join(root,'estado.json')},app:{client:{chat:{postMessage:async m=>{msgs.push(m);return {ts:'simulada'};},update:async m=>{msgs.push({...m,thread_ts:event.ts});return {ts:m.ts};}}}},activas:new Map(),alIniciar:()=>{},confirmar:()=>{throw Error('No debe pedir pulgar');},comando:(p,f)=>{if(String(p).includes('registr')&&!String(p).includes('descarta'))handler=f;}}));
  await handler(event,'registra stock nvda, spcx');
  assert.equal(msgs.length,1);assert.ok(msgs[0].text.includes('Ya no registro activos sueltos a mano'),'rechazo claro');assert.ok(msgs[0].text.includes('registra stock todos'),'guia a la via vigente');assert.equal(msgs[0].channel,event.channel);
  assert.equal(llamadas,0,'cero consultas al podar');assert.ok(!leerEstado(path.join(root,'estado.json')),'sin registro iniciado');
 }finally{globalThis.fetch=original;fs.rmSync(root,{recursive:true,force:true});}
});
test('registra cripto EUR se detiene: poda rechaza activos sueltos antes de consultar (EUR como fiat sigue cubierto en el cotejo del universo)',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-fiat-'));const original=globalThis.fetch;let handler;const msgs=[];let llamadas=0;
 globalThis.fetch=async u=>{llamadas++;let j;const url=new URL(u);
  if(u.includes('exchangeInfo')) {const symbol=url.searchParams.get('symbol');j={symbols:[{symbol,status:'TRADING',quoteAsset:'USDT',baseAsset:symbol.slice(0,-4)}]};}
  else if(u.includes('get-products'))j={data:Array.from({length:101},(_,i)=>({s:'PRUEBA'+i}))};
  else j=[];
  return{ok:true,status:200,text:async()=>JSON.stringify(j)};
 };
 try{
  const {registrar}=await import('../app/modulos/velas.mjs');
  registrar(conectarCaja({conf:{HUGO_VELAS_DIR:path.join(root,'velas'),HUGO_REGISTRO_ESTADO:path.join(root,'estado.json')},app:{client:{chat:{postMessage:async m=>{msgs.push(m);return {ts:'simulada'};},update:async m=>{msgs.push({...m,thread_ts:event.ts});return {ts:m.ts};}}}},activas:new Map(),alIniciar:()=>{},confirmar:()=>{throw Error('No debe pedir pulgar');},comando:(p,f)=>{if(String(p).includes('registr')&&!String(p).includes('descarta'))handler=f;}}));
  await handler(event,'registra cripto EUR');
  assert.equal(msgs.length,1);assert.ok(msgs[0].text.includes('Ya no registro activos sueltos a mano'));assert.equal(llamadas,0);
  assert.ok(!fs.existsSync(path.join(root,'velas')));assert.ok(!leerEstado(path.join(root,'estado.json')));
 }finally{globalThis.fetch=original;fs.rmSync(root,{recursive:true,force:true});}
});
