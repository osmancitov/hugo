import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crearReporteSync} from '../app/modulos/reporte.mjs';
test('un post inmediato, progreso editado no mas de cada5s y resultado mismo mensaje',async()=>{
 let reloj=0;const calls=[];const client={chat:{postMessage:async m=>{calls.push({tipo:'post',reloj,...m});return{ts:'reporte'};},update:async m=>calls.push({tipo:'update',reloj,...m})}};
 const r=await crearReporteSync({client,token:'simulado',event:{channel:'canal',thread_ts:'hilo'},ahora:()=>reloj,esperar:async ms=>{reloj+=ms;}});
 assert.equal(calls.length,1);assert.equal(calls[0].thread_ts,'hilo');
 for(let i=1;i<=20;i++){reloj+=500;await r.progreso(`Subida ${i}/20; sin publicar commit`);}
 await r.final('Confirmado commit;20subidos');assert.equal(calls.filter(c=>c.tipo==='post').length,1);assert.equal(calls.at(-1).ts,'reporte');assert.equal(calls.at(-1).text,'Confirmado commit;20subidos');
 for(let i=1;i<calls.length;i++)assert.ok(calls[i].reloj-calls[i-1].reloj>=5000);
});
test('fallo de edicion se propaga, sin crear reporte duplicado ni afirmar exito',async()=>{
 let posts=0;const r=await crearReporteSync({client:{chat:{postMessage:async()=>{posts++;return{ts:'r'};},update:async()=>{throw Error('Slackfallo');}}},event:{channel:'c',ts:'h'},ahora:()=>10000,esperar:async()=>{}});
 await assert.rejects(r.final('Resultado'),/Slackfallo/);assert.equal(posts,1);
});
