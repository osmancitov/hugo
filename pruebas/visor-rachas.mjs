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
test('rango diario usa máximo menos mínimo relativo a apertura, no a cierre',()=>{
 const v=vela(0,100,110); v[2]='130';v[3]='80';
 const r=resumir([v]);assert.equal(r.rango,50);assert.ok(Math.abs(r.variacion-10)<1e-10);
 const plana=vela(0,100,100);assert.equal(resumir([plana]).rango,0);
});
test('velas negativas pueden tener cambio de precio de racha positivo',()=>{
 const r=resumir([vela(-1,100,101),vela(0,100,90),vela(1,110,105)]);
 assert.equal(r.dias,2); assert.equal(r.limitada,false); assert.ok(Math.abs(r.acumulado-5)<1e-10);
});
test('vela plana deja racha 0; una vela positiva abre racha al alza y corta la baja anterior',()=>{
 const p=resumir([vela(0,100,90),vela(1,100,100)]); assert.equal(p.dias,0); assert.equal(p.direccion,0); assert.equal(p.acumulado,0); assert.equal(p.limitada,false);
 const u=resumir([vela(0,100,90),vela(1,100,101)]); assert.equal(u.dias,1); assert.equal(u.direccion,1); assert.ok(Math.abs(u.acumulado-1)<1e-10);
});
test('racha al alza cuenta días seguidos y su total incluye los saltos entre velas',()=>{
 const r=resumir([vela(0,100,90),vela(1,90,100),vela(2,95,105),vela(3,110,121)]);
 assert.equal(r.dias,3); assert.equal(r.direccion,1); assert.equal(r.limitada,false); assert.ok(Math.abs(r.acumulado-(121/90-1)*100)<1e-10);
});
test('la última vela fija la dirección y una vela plana corta la racha al alza',()=>{
 const r=resumir([vela(0,100,110),vela(1,100,100),vela(2,100,110)]); assert.equal(r.dias,1); assert.equal(r.direccion,1);
 const n=resumir([vela(0,100,110),vela(1,110,100)]); assert.equal(n.dias,1); assert.equal(n.direccion,-1);
});
test('con un día de racha el total coincide con la variación del día',()=>{
 for(const c of [90,110]) { const r=resumir([vela(0,100,c)]); assert.equal(r.dias,1); assert.ok(Math.abs(r.acumulado-r.variacion)<1e-10); }
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
   const dirOf=f=>Math.sign(Number(f[4])-Number(f[1]));
   const sentido=dirOf(filas.at(-1));
   let k=filas.length-1, n=0, primera=null;
   while(sentido!==0&&k>=0&&dirOf(filas[k])===sentido) {
     if(k<filas.length-1&&filas[k+1][0]-filas[k][0]!==DIA) break;
     n++; primera=filas[k]; k--;
   }
   const esperado=n?(Number(filas.at(-1)[4])/Number(primera[1])-1)*100:0;
   assert.equal(r.direccion,sentido,e.codigo);
   assert.equal(r.dias,n,e.codigo); assert.ok(Math.abs(r.acumulado-esperado)<1e-8,e.codigo);
   assert.ok(Math.abs(r.rango-(Number(filas.at(-1)[2])-Number(filas.at(-1)[3]))/Number(filas.at(-1)[1])*100)<1e-8,e.codigo);
   resultados.push({activo:e,datos:r});
 }
 assert.equal(resultados.length,catalogo.stock.length+catalogo.cripto.length); assert.ok(separar(resultados).comparables.length>0);
});
