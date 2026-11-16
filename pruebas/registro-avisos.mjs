// Sin Slack ni red: envios, ediciones, reloj y errores simulados.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {crearAvisador} from '../app/modulos/registro-avisos.mjs';
import {crearMotor,leerEstado} from '../app/modulos/registro-motor.mjs';
function simulado(){let reloj=0;const calls=[];let falla=false;const client={chat:{postMessage:async m=>{calls.push({tipo:'post',reloj,...m});return{ts:String(calls.length)};},update:async m=>{calls.push({tipo:'update',reloj,...m});if(falla)throw Error('Slack simulado');return{ts:m.ts};}}};const crear=()=>crearAvisador({client,token:'simulado',ahora:()=>reloj,esperar:async ms=>{reloj+=ms;}});return{calls,crear,fallar:v=>falla=v};}
const trabajo=()=>({version:2,indice:0,codigos:['AA','BB'],channel:'canal',thread_ts:'hilo',hasta:Date.UTC(2026,10,16)});
test('un post por activo, ediciones acumuladas y consultas silenciosas; ritmo <=40/min',async()=>{
 const s=simulado(),avisar=s.crear(),j=trabajo();await avisar(j,'Activo AA',{tipo:'activo'});await avisar(j,'Consulto',{tipo:'consulta'});
 await avisar(j,'mes',{tipo:'mes',mes:1,linea:'octubre:31'});await avisar(j,'mes',{tipo:'mes',mes:2,linea:'septiembre:30'});await avisar(j,'fin',{tipo:'fin-activo',linea:'terminado'});
 assert.equal(s.calls.filter(x=>x.tipo==='post').length,1);assert.ok(s.calls.at(-1).text.includes('octubre:31\nseptiembre:30\nterminado'));
 for(let i=1;i<s.calls.length;i++)assert.ok(s.calls[i].reloj-s.calls[i-1].reloj>=1500);
 j.indice++;await avisar(j,'Activo BB',{tipo:'activo'});assert.equal(s.calls.filter(x=>x.tipo==='post').length,2);
});
test('al reconstruir avisador reutiliza referencia durable y deduplica mes',async()=>{
 const s=simulado(),j=trabajo();await s.crear()(j,'Activo AA',{tipo:'activo'});await s.crear()(j,'mes',{tipo:'mes',mes:1,linea:'octubre:31'});
 const restaurado=JSON.parse(JSON.stringify(j));await s.crear()(restaurado,'Activo AA',{tipo:'activo'});await s.crear()(restaurado,'mes',{tipo:'mes',mes:1,linea:'octubre:31'});
 assert.equal(s.calls.filter(x=>x.tipo==='post').length,1);assert.equal(Object.keys(restaurado.reporte.meses).length,1);
});
test('240 meses caben sin truncamiento ni posts adicionales',async()=>{
 const s=simulado(),j=trabajo(),a=s.crear();await a(j,'Activo AA',{tipo:'activo'});
 for(let i=0;i<240;i++)await a(j,'mes',{tipo:'mes',mes:i,linea:`2610:31velas; comprobado completo; consulta 0.24 s, disco 0.20 s. ${i}`});
 assert.equal(Object.keys(j.reporte.meses).length,240);assert.ok(s.calls.at(-1).text.length<35000);assert.equal(s.calls.filter(x=>x.tipo==='post').length,1);
});
test('fallo edicion pausa; reanudar entrega linea pendiente sin repetir datos ni post del activo',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-reporte-')),s=simulado(),estado=path.join(root,'estado'),mes=Date.UTC(2026,10,1),pedidos=[];
 const opciones={base:()=>path.join(root,'velas'),archivoEstado:()=>estado,ahora:()=>mes+2*86400000,resolver:async()=>({ok:true,simbolo:'AA'}),avisar:s.crear(),fetchImpl:async u=>{const t=Number(new URL(u).searchParams.get('startTime'));pedidos.push(t);return{ok:true,status:200,text:async()=>JSON.stringify(t===mes?[[mes,'1','2','1','2','10',mes+86400000-1,'10',3,'1','2','0']]:[])};}};
 try{s.fallar(true);await crearMotor(opciones).iniciar({clase:'stock',codigos:['AA'],event:{channel:'canal',ts:'hilo'}});let j=leerEstado(estado);assert.equal(j.estado,'pausado');assert.ok(j.avisoPendiente);assert.ok(j.reporte.ts);
 s.fallar(false);await crearMotor({...opciones,avisar:s.crear()}).iniciar({continuar:true,event:{channel:'canal',ts:'hilo'}});j=leerEstado(estado);assert.equal(j.estado,'terminado');assert.equal(j.avisoPendiente,undefined);assert.equal(pedidos.filter(t=>t===mes).length,1);assert.equal(s.calls.filter(x=>x.tipo==='post'&&x.text.startsWith('Activo ')).length,1);assert.ok(s.calls.some(x=>x.tipo==='update'&&x.text.includes('2611: 1 velas')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
