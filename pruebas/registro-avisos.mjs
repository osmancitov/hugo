// Sin Slack ni red: envios, reloj y errores simulados.
// Contrato (decisión del usuario, 18-nov-2026): UN mensaje por activo, publicado una vez al
// cerrarlo; meses y aviso de activo no tocan Slack. El reporte nunca frena el motor: los
// reportes se acumulan localmente y se vuelcan cada 5 s; errores y aviso final arrastran lo
// acumulado. Una línea para cada cosa, sin verbosidad.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {crearAvisador} from '../app/modulos/reporte.mjs';
import {crearMotor,leerEstado} from '../app/modulos/registro-motor.mjs';
function simulado(){let reloj=0;const calls=[];let falla=false;const client={chat:{postMessage:async m=>{if(falla&&String(m.text).startsWith('Activo '))throw Error('Slack simulado');calls.push({tipo:'post',reloj,...m});return{ts:String(calls.length)};},update:async m=>{calls.push({tipo:'update',reloj,...m});return{ts:m.ts};}}};const crear=()=>crearAvisador({client,token:'simulado',ahora:()=>reloj,esperar:async ms=>{reloj+=ms;}});return{calls,crear,fallar:v=>falla=v,avanzar:ms=>reloj+=ms};}
const trabajo=()=>({version:2,indice:0,codigos:['AA','BB','CC'],channel:'canal',thread_ts:'hilo',hasta:Date.UTC(2026,10,16)});
test('un solo post por activo, al cerrarlo; acumulacion local y vuelco cada 5 s; errores arrastran lo acumulado',async()=>{
 const s=simulado(),avisar=s.crear(),j=trabajo();
 await avisar(j,'Activo AA',{tipo:'activo'});await avisar(j,'Consulto',{tipo:'consulta'});
 await avisar(j,'mes',{tipo:'mes',mes:1,linea:'octubre:31'});await avisar(j,'mes',{tipo:'mes',mes:2,linea:'septiembre:30'});
 assert.equal(s.calls.length,0,'ni activo ni meses ni consultas tocan Slack');
 await avisar(j,'fin',{tipo:'fin-activo',linea:'terminado'});
 assert.equal(s.calls.filter(x=>x.tipo==='post').length,1);
 assert.ok(s.calls[0].text.includes('Activo AA'));assert.ok(s.calls[0].text.includes('octubre:31\nseptiembre:30\nterminado'));
 assert.equal(s.calls.filter(x=>x.tipo==='update').length,0,'ya no se edita: se publica una vez');
 j.indice++;await avisar(j,'Activo BB',{tipo:'activo'});await avisar(j,'fin',{tipo:'fin-activo',linea:'terminado BB'});
 assert.equal(s.calls.filter(x=>x.tipo==='post').length,1,'sin 5 s desde el vuelco, acumula local y el motor sigue sin esperar');
 await avisar(j,'Ojo: algo importante');
 const posts=s.calls.filter(x=>x.tipo==='post');
 assert.equal(posts.length,3,'un aviso garantizado arrastra lo acumulado');
 assert.ok(posts[1].text.includes('Activo BB')&&posts[2].text.includes('Ojo'),'primero el reporte acumulado, luego el aviso');
 s.avanzar(5100);j.indice++;await avisar(j,'Activo CC',{tipo:'activo'});await avisar(j,'fin',{tipo:'fin-activo',linea:'terminado CC'});
 assert.equal(s.calls.filter(x=>x.tipo==='post').length,4,'cumplidos 5 s, el siguiente cierre vuelca');
});
test('al reconstruir avisador conserva meses acumulados en el avance y deduplica por mes',async()=>{
 const s=simulado(),j=trabajo();await s.crear()(j,'Activo AA',{tipo:'activo'});await s.crear()(j,'mes',{tipo:'mes',mes:1,linea:'octubre:31'});
 const restaurado=JSON.parse(JSON.stringify(j));await s.crear()(restaurado,'Activo AA',{tipo:'activo'});await s.crear()(restaurado,'mes',{tipo:'mes',mes:1,linea:'octubre:31'});
 assert.equal(Object.keys(restaurado.reporte.meses).length,1,'el mes repetido no se duplica');
 assert.equal(s.calls.length,0);
 await s.crear()(restaurado,'fin',{tipo:'fin-activo',linea:'terminado'});
 assert.equal(s.calls.filter(x=>x.tipo==='post').length,1);
 assert.equal(s.calls[0].text.match(/octubre:31/g).length,1);
});
test('240 meses caben en el único mensaje del activo, sin posts intermedios',async()=>{
 const s=simulado(),j=trabajo(),a=s.crear();await a(j,'Activo AA',{tipo:'activo'});
 for(let i=0;i<240;i++)await a(j,'mes',{tipo:'mes',mes:i,linea:`2610:31velas; comprobado completo; consulta 0.24 s, disco 0.20 s. ${i}`});
 assert.equal(Object.keys(j.reporte.meses).length,240);assert.equal(s.calls.length,0);
 await a(j,'fin',{tipo:'fin-activo',linea:'terminado'});
 assert.equal(s.calls.filter(x=>x.tipo==='post').length,1);assert.ok(s.calls[0].text.length<35000);
});
test('un volcado agrupa los activos acumulados en un solo mensaje, cada uno identificado y en orden',async()=>{
 const s=simulado(),avisar=s.crear(),j=trabajo();
 await avisar(j,'Activo AA',{tipo:'activo'});await avisar(j,'fin',{tipo:'fin-activo',linea:'listo AA'});
 assert.equal(s.calls.filter(x=>x.tipo==='post').length,1,'el primero sale en el vuelco inicial');
 j.indice++;await avisar(j,'Activo BB',{tipo:'activo'});await avisar(j,'mes',{tipo:'mes',mes:1,linea:'2611: 30 velas.'});await avisar(j,'fin',{tipo:'fin-activo',linea:'listo BB'});
 j.indice++;await avisar(j,'Activo CC',{tipo:'activo'});await avisar(j,'fin',{tipo:'fin-activo',linea:'listo CC'});
 assert.equal(s.calls.filter(x=>x.tipo==='post').length,1,'dentro de la ventana se acumula sin ráfaga');
 s.avanzar(5100);await avisar(j,'Ojo');
 const posts=s.calls.filter(x=>x.tipo==='post');
 assert.equal(posts.length,3,'un volcado = un envío, luego el aviso');
 assert.ok(posts[1].text.includes('Activo BB')&&posts[1].text.includes('Activo CC')&&posts[1].text.includes('2611: 30 velas.')&&posts[1].text.includes('listo BB')&&posts[1].text.includes('listo CC'),'ambos activos identificados con sus líneas');
 assert.ok(posts[1].text.indexOf('Activo BB')<posts[1].text.indexOf('Activo CC'),'orden conservado');
});
test('un lote que supera el tamano seguro se parte por activos completos',async()=>{
 const s=simulado(),avisar=s.crear(),j=trabajo();
 await avisar(j,'Activo AA',{tipo:'activo'});await avisar(j,'fin',{tipo:'fin-activo',linea:'x'});
 for(const [idx,cod] of [[1,'BB'],[2,'CC']]) {
  j.indice=idx;await avisar(j,`Activo ${cod}`,{tipo:'activo'});
  for(let i=0;i<700;i++)await avisar(j,'mes',{tipo:'mes',mes:i,linea:`2601: 31 velas; parcial....................${i}`});
  await avisar(j,'fin',{tipo:'fin-activo',linea:'listo'});
 }
 s.avanzar(5100);await avisar(j,'aviso');
 const posts=s.calls.filter(x=>x.tipo==='post');
 assert.equal(posts.length,4,'AA + dos paquetes + aviso');
 assert.ok(posts[1].text.includes('Activo BB')&&!posts[1].text.includes('Activo CC'),'corte por activos completos');
 assert.ok(posts[2].text.includes('Activo CC')&&!posts[2].text.includes('Activo BB'));
 posts.forEach(p=>assert.ok(p.text.length<35000,'ningún envío supera el tamano seguro'));
});
test('fallo del post de cierre pausa; reanudar entrega la línea pendiente sin repetir consulta',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-reporte-')),s=simulado(),estado=path.join(root,'estado'),mes=Date.UTC(2026,10,1),pedidos=[];
 const opciones={base:()=>path.join(root,'velas'),archivoEstado:()=>estado,ahora:()=>mes+2*86400000,resolver:async()=>({ok:true,simbolo:'AA'}),avisar:s.crear(),fetchImpl:async u=>{const t=Number(new URL(u).searchParams.get('startTime'));pedidos.push(t);return{ok:true,status:200,text:async()=>JSON.stringify(t===mes?[[mes,'1','2','1','2','10',mes+86400000-1,'10',3,'1','2','0']]:[])};}};
 try{
  s.fallar(true);await crearMotor(opciones).iniciar({clase:'stock',codigos:['AA'],event:{channel:'canal',ts:'hilo'}});
  let j=leerEstado(estado);assert.equal(j.estado,'terminado','el trabajo terminó; lo que falta es el aviso');assert.ok(j.avisoPendiente);assert.ok(j.reporte.meses);
  assert.equal(s.calls.filter(x=>x.tipo==='post'&&String(x.text).startsWith('Activo ')).length,0,'el reporte del activo no salio');
  s.fallar(false);await crearMotor({...opciones,avisar:s.crear()}).iniciar({continuar:true,event:{channel:'canal',ts:'hilo'}});
  j=leerEstado(estado);assert.equal(j.avisoPendiente,undefined);
  assert.equal(pedidos.filter(t=>t===mes).length,1,'no se repite la consulta');
  const posts=s.calls.filter(x=>x.tipo==='post'&&x.text.startsWith('Activo '));assert.equal(posts.length,1);assert.ok(posts[0].text.includes('2611: 1 velas'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
