// Sin Slack ni red: envios, reloj y errores simulados.
// Contrato (decisión del usuario, 21-nov-2026: «que edite el mismo mensaje y vaya poniendo en él
// lo que va ocurriendo», porque la lista de activos quedaba muy larga): UN solo mensaje por
// recorrido; el primer cierre de activo lo publica y los siguientes lo editan, como mucho cada
// 5 s; meses y aviso de activo no tocan Slack. El reporte nunca frena el motor: dentro de la
// ventana solo se acumula en memoria; una edición fallida no pausa y la entrega siguiente lleva
// lo último. Errores y aviso final salen garantizados como mensajes propios, dejando antes el
// progreso al día. Una línea para cada cosa, sin verbosidad.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {crearAvisador} from '../app/modulos/reporte.mjs';
import {crearMotor,leerEstado} from '../app/modulos/registro-motor.mjs';
function simulado(){let reloj=0;const calls=[];let falla=false,fallaEd=false;const client={chat:{postMessage:async m=>{if(falla&&String(m.text).startsWith('Activo '))throw Error('Slack simulado');const ts='msg'+(calls.length+1);calls.push({tipo:'post',reloj,tsEmitido:ts,...m});return{ts};},update:async m=>{if(fallaEd)throw Error('Edicion simulada');calls.push({tipo:'update',reloj,...m});return{ts:m.ts};}}};const crear=()=>crearAvisador({client,token:'simulado',ahora:()=>reloj,esperar:async ms=>{reloj+=ms;}});return{calls,crear,fallar:v=>falla=v,fallarEdicion:v=>fallaEd=v,avanzar:ms=>reloj+=ms};}
const trabajo=()=>({version:2,indice:0,codigos:['AA','BB','CC'],channel:'canal',thread_ts:'hilo',hasta:Date.UTC(2026,10,16)});
test('un solo mensaje por recorrido: el primer cierre lo publica y los siguientes lo editan, como mucho cada 5 s y sin frenar el motor',async()=>{
 const s=simulado(),avisar=s.crear(),j=trabajo();
 await avisar(j,'Activo AA',{tipo:'activo'});await avisar(j,'Consulto',{tipo:'consulta'});
 await avisar(j,'mes',{tipo:'mes',mes:1,linea:'octubre:31'});await avisar(j,'mes',{tipo:'mes',mes:2,linea:'septiembre:30'});
 assert.equal(s.calls.length,0,'ni activo ni meses ni consultas tocan Slack');
 const r1=await avisar(j,'fin',{tipo:'fin-activo',linea:'terminado AA'});
 assert.equal(r1,'publicado');
 const posts=()=>s.calls.filter(x=>x.tipo==='post'),edits=()=>s.calls.filter(x=>x.tipo==='update');
 assert.equal(posts().length,1,'el primer cierre publica el mensaje del recorrido');
 assert.ok(posts()[0].text.includes('Activo AA'));assert.ok(posts()[0].text.includes('octubre:31\nseptiembre:30\nterminado AA'));
 j.indice++;await avisar(j,'Activo BB',{tipo:'activo'});
 const r2=await avisar(j,'fin',{tipo:'fin-activo',linea:'terminado BB'});
 assert.equal(r2,'acumulado','dentro de la ventana solo se acumula: el motor sigue sin esperar');
 assert.equal(s.calls.length,1,'ni post ni edición dentro de los 5 s');
 s.avanzar(5100);j.indice++;await avisar(j,'Activo CC',{tipo:'activo'});
 const r3=await avisar(j,'fin',{tipo:'fin-activo',linea:'terminado CC'});
 assert.equal(r3,'editado');
 assert.equal(posts().length,1,'sigue siendo un solo mensaje');
 assert.equal(edits().length,1);assert.equal(edits()[0].ts,posts()[0].tsEmitido,'la edición cae sobre el mismo mensaje');
 assert.ok(edits()[0].text.includes('Activo CC')&&edits()[0].text.includes('terminado CC'),'el mensaje muestra lo último');
 assert.ok(!edits()[0].text.includes('Activo BB'),'los estados intermedios no alargan el mensaje');
});
test('un aviso garantizado deja el progreso al día y sale como mensaje propio',async()=>{
 const s=simulado(),avisar=s.crear(),j=trabajo();
 await avisar(j,'Activo AA',{tipo:'activo'});await avisar(j,'fin',{tipo:'fin-activo',linea:'listo AA'});
 j.indice++;await avisar(j,'Activo BB',{tipo:'activo'});await avisar(j,'fin',{tipo:'fin-activo',linea:'listo BB'});
 assert.equal(s.calls.length,1,'BB quedó acumulado sin salir');
 await avisar(j,'Ojo: algo importante');
 const tipos=s.calls.map(x=>x.tipo);
 assert.deepEqual(tipos,['post','update','post'],'primero la edición con lo último, luego el aviso');
 assert.ok(s.calls[1].text.includes('Activo BB')&&s.calls[1].text.includes('listo BB'),'el progreso queda al día antes del aviso');
 assert.ok(s.calls[2].text.includes('Ojo'));
});
test('una edición fallida no frena el motor y la entrega siguiente lleva lo último',async()=>{
 const s=simulado(),avisar=s.crear(),j=trabajo();
 await avisar(j,'Activo AA',{tipo:'activo'});await avisar(j,'fin',{tipo:'fin-activo',linea:'listo AA'});
 s.avanzar(5100);s.fallarEdicion(true);
 j.indice++;await avisar(j,'Activo BB',{tipo:'activo'});
 const r1=await avisar(j,'fin',{tipo:'fin-activo',linea:'listo BB'});
 assert.equal(r1,'acumulado','la edición fallida deja el cierre como pendiente, sin lanzar');
 s.fallarEdicion(false);s.avanzar(5100);j.indice++;await avisar(j,'Activo CC',{tipo:'activo'});
 const r2=await avisar(j,'fin',{tipo:'fin-activo',linea:'listo CC'});
 assert.equal(r2,'editado');
 const edits=s.calls.filter(x=>x.tipo==='update');
 assert.equal(edits.length,1);assert.ok(edits[0].text.includes('Activo CC'),'lo último llega en la siguiente entrega');
 assert.equal(s.calls.filter(x=>x.tipo==='post').length,1,'nunca hubo otro mensaje');
});
test('al reconstruir avisador conserva meses acumulados en el avance y deduplica por mes',async()=>{
 const s=simulado(),j=trabajo();await s.crear()(j,'Activo AA',{tipo:'activo'});await s.crear()(j,'mes',{tipo:'mes',mes:1,linea:'octubre:31'});
 const restaurado=JSON.parse(JSON.stringify(j));await s.crear()(restaurado,'Activo AA',{tipo:'activo'});await s.crear()(restaurado,'mes',{tipo:'mes',mes:1,linea:'octubre:31'});
 assert.equal(Object.keys(restaurado.reporte.meses).length,1,'el mes repetido no se duplica');
 assert.equal(s.calls.length,0);
 await s.crear()(restaurado,'fin',{tipo:'fin-activo',linea:'terminado'});
 assert.equal(s.calls.filter(x=>x.tipo==='post').length,1,'un avisador sin referencia publica el mensaje del recorrido');
 assert.equal(s.calls[0].text.match(/octubre:31/g).length,1);
});
test('240 meses caben en el único mensaje del activo, sin posts intermedios',async()=>{
 const s=simulado(),j=trabajo(),a=s.crear();await a(j,'Activo AA',{tipo:'activo'});
 for(let i=0;i<240;i++)await a(j,'mes',{tipo:'mes',mes:i,linea:`2610:31velas; comprobado completo; consulta 0.24 s, disco 0.20 s. ${i}`});
 assert.equal(Object.keys(j.reporte.meses).length,240);assert.equal(s.calls.length,0);
 await a(j,'fin',{tipo:'fin-activo',linea:'terminado'});
 assert.equal(s.calls.filter(x=>x.tipo==='post').length,1);assert.ok(s.calls[0].text.length<35000);
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

test('el cierre entregado no se repite al arrancar: avisoPendiente queda limpio tras el aviso final', async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-cierre-')), s = simulado(), estado = path.join(root, 'estado'), mes = Date.UTC(2026, 10, 1);
 const opciones = { base: () => path.join(root, 'velas'), archivoEstado: () => estado, ahora: () => mes + 2 * 86400000, resolver: async () => ({ ok: true, simbolo: 'AA' }), fetchImpl: async (u) => { const t = Number(new URL(u).searchParams.get('startTime')); return { ok: true, status: 200, text: async () => JSON.stringify(t === mes ? [[mes, '1', '2', '1', '2', '10', mes + 86400000 - 1, '10', 3, '1', '2', '0']] : []) }; } };
 const resumenes = () => s.calls.filter((x) => x.tipo === 'post' && String(x.text).startsWith('Registro terminado')).length;
 try {
  await crearMotor({ ...opciones, avisar: s.crear() }).iniciar({ clase: 'stock', codigos: ['AA'], event: { channel: 'canal', ts: 'hilo' } });
  const j = leerEstado(estado);
  assert.equal(j.estado, 'terminado');
  assert.equal(j.avisoPendiente, undefined, 'el cierre exitoso limpia el aviso pendiente del ultimo activo');
  assert.equal(resumenes(), 1);
  await crearMotor({ ...opciones, avisar: s.crear() }).iniciar({ arranque: true });
  assert.equal(resumenes(), 1, 'el siguiente arranque no reenvia el cierre');
 } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
