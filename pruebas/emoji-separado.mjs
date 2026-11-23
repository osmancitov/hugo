import {test} from 'node:test';
import assert from 'node:assert/strict';
import {horaArranque} from '../app/modulos/saludo.mjs';
import {registrarRetiro} from '../app/modulos/reporte.mjs';
for(const texto of [horaArranque(Date.parse('2026-11-23T17:00:00Z')),':robot_face:\n\nMon Nov 23 - 1:00 PM']) {
 for(const caso of ['propio','otro','conversacion','adjunto']) test(`saludo separado ${JSON.stringify(texto)}: ${caso}`,async()=>{
  const borrados=[];
  const m={ts:'1.2',user:caso==='otro'?'OTRO':'BOT',text:texto,...(caso==='adjunto'?{files:[{id:'F'}]}:{})};
  const ctx={usuario:'DUENO',botUserId:'BOT',activas:new Map(),app:{client:{conversations:{history:async()=>({messages:[m]}),replies:async()=>({messages:caso==='conversacion'?[m,{ts:'1.3',user:'DUENO'}]:[m]})},chat:{delete:async x=>borrados.push(x)}}}};
  registrarRetiro(ctx);
  await ctx.retirarHuerfano({user:'OTRO',item:{type:'message',channel:'C',ts:'1.2'}});
  assert.equal(borrados.length,0);
  await ctx.retirarHuerfano({user:'DUENO',item:{type:'message',channel:'C',ts:'1.2'}});
  assert.equal(borrados.length,Number(caso==='propio'));
 });
}
