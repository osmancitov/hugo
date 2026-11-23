import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {crearMotor,leerEstado} from '../app/modulos/registro-motor.mjs';
import {eventoDiaria} from '../.github/contexto-diaria.mjs';
test('motor termina con identidad de Actions y validador estricto puede leer el estado',async()=>{
 const raiz=fs.mkdtempSync(path.join(os.tmpdir(),'diaria-estado-test-'));
 const estado=path.join(raiz,'estado.json'),t=Date.UTC(2026,10,1),D=86400000;
 const vela=[t,'1','2','1','2','10',t+D-1,'10',3,'1','2','0'];
 const motor=crearMotor({base:()=>path.join(raiz,'velas'),archivoEstado:()=>estado,ahora:()=>t+D,
  resolver:async(_,c)=>({ok:true,simbolo:c+'USDT'}),avisar:async()=>{},
  fetchImpl:async u=>({ok:true,status:200,text:async()=>JSON.stringify(Number(new URL(u).searchParams.get('startTime'))===t?[vela]:[])})});
 try {
  const event=eventoDiaria({GITHUB_RUN_ID:'12345',GITHUB_RUN_ATTEMPT:'2'});
  await motor.iniciar({clase:'stock',codigos:['AA'],event,rapido:true,origen:'diaria'});
  const j=leerEstado(estado);assert.equal(j.estado,'terminado');assert.equal(j.channel,'github-actions');assert.equal(j.thread_ts,'diaria-12345-2');assert.equal(j.hasta,t+D);
 } finally {fs.rmSync(raiz,{recursive:true,force:true});}
});
test('entrada diaria usa contexto operativo sin canal ni timestamp vacíos',()=>{
 const src=fs.readFileSync(new URL('../.github/actualizacion-diaria.mjs',import.meta.url),'utf8');
 assert.match(src,/ponerAlDiaDiaria\(eventoDiaria\(\)\)/);
 assert.deepEqual(eventoDiaria({}),{channel:'github-actions',ts:'diaria-local-1'});
});
