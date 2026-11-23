import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {registrar as confirmar,_prueba} from '../app/modulos/confirmacion.mjs';
import {conectarCaja} from './caja.mjs';
const fuente=fs.readFileSync(new URL('../app/modulos/actualizar.mjs',import.meta.url),'utf8');
for(const modo of ['exito','lanzamiento','red','disco','otro','normal'])test('solicitud hasta cierre: '+modo,async()=>{
 const anterior=process.env.HOME,home=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-solicitud-'));process.env.HOME=home;
 const posts=[],updates=[],deletes=[],orden=[];let reaccion,lanzamientos=0;
 const ctx=conectarCaja({usuario:'DUENO',botToken:'falso',activas:new Map(),comando:()=>{},alIniciar:()=>{},guardarAprobacion:()=>{orden.push('evidencia');if(modo==='disco')throw Error('disco');},app:{event:(_,f)=>reaccion=f,client:{chat:{postMessage:async m=>{posts.push(m);return{ts:'1795463000.000001'};},update:async m=>{updates.push(m);orden.push('edicion');if(modo==='red')throw Error('sin red');},delete:async m=>deletes.push(m)}}}});
 globalThis.__hugoEx=async(cmd)=>{assert.equal(cmd,'systemd-run');lanzamientos++;orden.push('lanzar');const p=JSON.parse(fs.readFileSync(path.join(home,'.local/share/hugo-respaldo/pendiente.json')));assert.equal(p.mensajeTs,'1795463000.000001');if(modo==='lanzamiento')throw Error('simulado');fs.writeFileSync(p.log,'Instalado');fs.writeFileSync(p.rc,'0');return{stdout:''};};
 try{
  const mod=await import('data:text/javascript;base64,'+Buffer.from(fuente.replace('const ex = promisify(execFile);','const ex = (...args)=>globalThis.__hugoEx(...args);')+'\n//'+home).toString('base64'));mod.registrar(ctx);confirmar(ctx);
  const ruta=path.join(home,'simulado.sh');fs.writeFileSync(ruta,'# sin ejecucion');
  await ctx.confirmar({channel:'C',thread_ts:'H',user:'DUENO',texto:'Solicitud',conservar:modo!=='normal',alNo:()=>{},alSi:async({ts})=>{if(modo==='normal')return;await ctx.lanzarInstalacion({channel:'C',hilo:'H',ruta,mensajeTs:ts,etiqueta:'commit simulado'});}});
  await reaccion({event:{user:modo==='otro'?'OTRO':'DUENO',reaction:'+1',item:{type:'message',channel:'C',ts:'1795463000.000001'}}});
  await new Promise(r=>setTimeout(r,30));
  assert.equal(posts.length,1);assert.equal(deletes.length,Number(modo==='normal'));assert(updates.every(m=>m.ts==='1795463000.000001'));
  if(['otro','disco','normal','red'].includes(modo))assert.equal(lanzamientos,0);else{assert.equal(lanzamientos,1);assert.deepEqual(orden.slice(0,3),['evidencia','edicion','lanzar']);assert.match(updates.at(-1).text,modo==='exito'?/Hugo actualizado/:/fall/);}
 }finally{for(const p of _prueba.pendientes.values())clearTimeout(p.timer);_prueba.pendientes.clear();process.env.HOME=anterior;fs.rmSync(home,{recursive:true,force:true});}
});
test('GitHub conserva solicitud y entrega su referencia al instalador',()=>{const s=fs.readFileSync(new URL('../app/modulos/github.mjs',import.meta.url),'utf8');assert.match(s,/conservar: true/);assert.match(s,/alSi: async \(\{ ts \}\)/);assert.match(s,/lanzarInstalacion\(\{ channel, hilo, mensajeTs: ts/);});
