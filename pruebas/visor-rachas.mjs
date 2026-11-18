import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DIA, validarMes, resumir, separar, corteUTC } from '../visor-rachas-datos.mjs';
const t = Date.UTC(2026,10,1), corte = Date.UTC(2026,10,18);
const vela = (i,o,c) => [t+i*DIA,String(o),String(Math.max(o,c)),String(Math.min(o,c)),String(c),'1',t+(i+1)*DIA-1,'1',1,'1','1','0'];
test('racha usa apertura/cierre; su cambio real incluye cambios entre velas, sin sumar porcentajes',()=>{
 const r=resumir([vela(0,100,101),vela(1,200,180),vela(2,190,171)]);
 assert.equal(r.dias,2); assert.equal(r.limitada,false); assert.ok(Math.abs(r.acumulado+14.5)<1e-10); assert.ok(Math.abs(r.variacion+10)<1e-10);
});
test('velas negativas pueden tener cambio de precio de racha positivo',()=>{
 const r=resumir([vela(-1,100,101),vela(0,100,90),vela(1,110,105)]);
 assert.equal(r.dias,2); assert.equal(r.limitada,false); assert.ok(Math.abs(r.acumulado-5)<1e-10);
});
test('vela plana y positiva cortan racha y no incluyen rachas antiguas',()=>{
 for(const c of [100,101]) { const r=resumir([vela(0,100,90),vela(1,100,c)]); assert.equal(r.dias,0); assert.equal(r.acumulado,0); assert.equal(r.limitada,false); }
});
test('huecos no se rellenan, no se conectan rachas a través de días ausentes',()=>{
 const r=resumir([vela(0,100,90),vela(2,100,80)]); assert.equal(r.dias,1); assert.equal(r.limitada,true); assert.match(r.motivo,/hueco/);
});
test('una racha al inicio disponible es un mínimo observado, no un total certificado',()=>{
 const r=resumir([vela(0,100,90)],true); assert.equal(r.limitada,true); assert.match(r.motivo,/inicio/);
});
test('cruce de mes sin huecos',()=>{
 const prev=vela(-1,100,101), a=vela(0,100,90), b=vela(1,100,80);
 assert.equal(resumir([prev,a,b]).dias,2); assert.equal(resumir([prev,a,b]).limitada,false);
});
test('valida cierre UTC, precios y orden de los registros',()=>{
 assert.equal(validarMes([vela(0,100,90)],'2611',corte).length,1);
 for(const datos of [[vela(17,100,90)],[vela(0,100,90),vela(0,100,90)],[vela(-1,100,90)],[]]) assert.throws(()=>validarMes(datos,'2611',corte));
 const mala=vela(0,100,90); mala[1]=''; assert.throws(()=>validarMes([mala],'2611',corte));
 const mala2=vela(0,100,90); mala2[4]='Infinity'; assert.throws(()=>validarMes([mala2],'2611',corte));
});
test('rechaza duplicados entre meses y filas desordenadas',()=>{
 assert.throws(()=>resumir([vela(0,100,90),vela(0,100,90)]));
 assert.throws(()=>resumir([vela(1,100,90),vela(0,100,90)]));
});
test('separa atrasados y errores, sin tratarlos como última jornada común',()=>{
 const s=separar([{datos:{fecha:t}},{datos:{fecha:t+DIA}},{error:'red'}]);
 assert.equal(s.fecha,t+DIA); assert.equal(s.comparables.length,1); assert.equal(s.atrasados.length,1); assert.equal(s.errores.length,1);
 assert.equal(separar([{error:'red'}]).fecha,null);
});
test('todos los registros del catálogo real se validan y resumen sin alterar archivos',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const catalogo=JSON.parse(html.match(/const CATALOGO = (.*);/)[1]);
 const resultados=[];
 for(const clase of ['stock','cripto']) for(const e of catalogo[clase]) {
   const dir=new URL('../registros/velas-24h/'+clase+'/'+e.codigo+'/',import.meta.url);
   const meses=fs.readdirSync(dir).sort(); let filas=[];
   for(const m of meses) filas.push(...validarMes(JSON.parse(fs.readFileSync(new URL(m,dir))),m.slice(0,4),corteUTC()));
   const r=resumir(filas,true);
   // Oráculo independiente por cocientes y diferencia de fechas.
   let k=filas.length-1, n=0, primera=null;
   while(k>=0&&Number(filas[k][4])<Number(filas[k][1])) {
     if(k<filas.length-1&&filas[k+1][0]-filas[k][0]!==DIA) break;
     n++; primera=filas[k]; k--;
   }
   const esperado=n?(Number(filas.at(-1)[4])/Number(primera[1])-1)*100:0;
   assert.equal(r.dias,n,e.codigo); assert.ok(Math.abs(r.acumulado-esperado)<1e-8,e.codigo);
   resultados.push({activo:e,datos:r});
 }
 assert.equal(resultados.length,catalogo.stock.length+catalogo.cripto.length); assert.ok(separar(resultados).comparables.length>0);
});
