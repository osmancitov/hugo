import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { asegurarCierreDiario } from '../app/modulos/intradia-cierre.mjs';
import { cierreVelaDiaAnterior } from '../app/modulos/barra-movil.mjs';
const DIA=86400000,T=Date.UTC(2026,10,22),ref=T-DIA;
const vela=(t,precio='100')=>[t,precio,precio,precio,precio,'0',t+DIA-1,'0',0,'0','0','0'];
function caso(codigos=['AAA']){const p=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-cierre-test-')),dirVelas=path.join(p,'velas');for(const c of codigos)fs.mkdirSync(path.join(dirVelas,'stock',c),{recursive:true});return {p,dirVelas};}
const respuesta=j=>({ok:true,json:async()=>j});
test('comprueba disponibilidad real, espera un minuto y reintenta solo los pendientes',async()=>{
 const c=caso(['AAA','BBB']),urls=[],esperas=[];let ronda=0,tiempo=T;
 try{
  const r=await asegurarCierreDiario({...c,ahora:()=>tiempo,esperar:async ms=>{esperas.push(ms);tiempo+=ms;},fetchImpl:async url=>{urls.push(String(url));if(url.pathname.endsWith('/time')){ronda++;return respuesta({serverTime:tiempo});}return respuesta(url.searchParams.get('symbol')==='AAABUSDT'||ronda>1?[vela(ref)]:[]);}});
  assert.deepEqual(esperas,[60000]);assert.equal(r.rondas,2);assert.equal(cierreVelaDiaAnterior(c.dirVelas,'AAA',ref),'100');assert.equal(cierreVelaDiaAnterior(c.dirVelas,'BBB',ref),'100');
  assert.equal(urls.filter(u=>u.includes('AAABUSDT')).length,1);assert.equal(urls.filter(u=>u.includes('BBBBUSDT')).length,2);
  assert.ok(urls.filter(u=>u.includes('klines')).every(u=>new URL(u).searchParams.get('endTime')===String(T-1)));
 }finally{fs.rmSync(c.p,{recursive:true,force:true});}
});
test('referencias ya disponibles no añaden consultas ni esperas',async()=>{
 const c=caso();try{fs.writeFileSync(path.join(c.dirVelas,'stock/AAA/2611_AAA'),JSON.stringify([vela(ref)]));let consultas=0;const r=await asegurarCierreDiario({...c,ahora:()=>T,fetchImpl:async()=>{consultas++;throw Error('No consultar');}});assert.equal(consultas,0);assert.equal(r.rondas,0);}finally{fs.rmSync(c.p,{recursive:true,force:true});}
});
test('reloj servidor anterior al cierre no consulta vela ni inventa referencia',async()=>{
 const c=caso();let tiempo=T,rondas=0,velas=0;try{await asegurarCierreDiario({...c,ahora:()=>tiempo,esperar:async ms=>{tiempo+=ms;},fetchImpl:async u=>{if(u.pathname.endsWith('/time'))return respuesta({serverTime:++rondas===1?T-1:tiempo});velas++;return respuesta([vela(ref)]);}});assert.equal(rondas,2);assert.equal(velas,1);}finally{fs.rmSync(c.p,{recursive:true,force:true});}
});
test('rechaza vela abierta, fecha distinta y conflicto, sin reemplazar lo guardado',async()=>{
 for(const tipo of ['abierta','otrafecha','conflicto']){const c=caso();try{
  const p=path.join(c.dirVelas,'stock/AAA/2611_AAA'),antes=JSON.stringify([vela(ref-DIA)]);fs.writeFileSync(p,antes);
  await assert.rejects(()=>asegurarCierreDiario({...c,ahora:()=>T,esperar:async()=>{throw Error('espera sin referencia');},fetchImpl:async u=>respuesta(u.pathname.endsWith('/time')?{serverTime:T}:tipo==='abierta'?[vela(T)]:tipo==='otrafecha'?[vela(ref-DIA)]:[vela(ref-DIA,'99'),vela(ref)])}));assert.equal(fs.readFileSync(p,'utf8'),antes);
 }finally{fs.rmSync(c.p,{recursive:true,force:true});}}
});
test('stop y cambio de día interrumpen espera sin foto ni referencia falsa',async()=>{
 for(const modo of ['stop','dia']){const c=caso();let tiempo=T,parado=false;try{await assert.rejects(()=>asegurarCierreDiario({...c,ahora:()=>tiempo,comprobar:()=>{if(parado)throw Error('detenido');},esperar:async()=>{if(modo==='stop')parado=true;else tiempo+=DIA;},fetchImpl:async u=>respuesta(u.pathname.endsWith('/time')?{serverTime:tiempo}:[])}),modo==='stop'?/detenido/:/Cambió el día/);assert.equal(cierreVelaDiaAnterior(c.dirVelas,'AAA',ref),null);}finally{fs.rmSync(c.p,{recursive:true,force:true});}}
});
