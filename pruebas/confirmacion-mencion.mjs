import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrar, _prueba } from '../app/modulos/confirmacion.mjs';

test('la solicitud no menciona y solo el aprobador confirma', async () => {
  const posts=[]; let reaccion, si=0;
  const ctx={guardarAprobacion:()=>{},botToken:'prueba',activas:new Map(),app:{client:{chat:{postMessage:async m=>{posts.push(m);return {ts:'1.2'};}}},event:(_nombre,fn)=>{reaccion=fn;}}};
  registrar(ctx);
  try {
    await ctx.confirmar({channel:'C1',thread_ts:'1.0',user:'UDUENO',texto:'Solicitud. ¿Aplico?',alSi:async()=>{si++;},alNo:async()=>{}});
    assert.equal(posts.length,1);
    assert.equal(posts[0].thread_ts,'1.0');
    assert.match(posts[0].text,/^🔶\nSolicitud\n¿Aplico/);
    assert.equal((posts[0].text.match(/Solicitud/g)||[]).length,1);
    assert.equal((posts[0].text.match(/<@UDUENO>/g)||[]).length,0);
    await reaccion({event:{item:{type:'message',channel:'C1',ts:'1.2'},reaction:'+1',user:'UASISTENTE'}});
    assert.equal(si,0); assert.equal(ctx.esperando().length,1);
    await reaccion({event:{item:{type:'message',channel:'C1',ts:'1.2'},reaction:'+1',user:'UDUENO'}});
    assert.equal(si,1);assert.equal(ctx.esperando().length,0);
  } finally {for(const p of _prueba.pendientes.values())clearTimeout(p.timer);_prueba.pendientes.clear();}
});
