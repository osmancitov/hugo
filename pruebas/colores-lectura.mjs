import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { separarConteos,textoConteos,separarSerieIceberg,colorMovimiento,claseMovimiento,cifrasConteos } from '../app/modulos/colores-lectura.mjs';
import { detalleIguales,generarDetalles } from '../app/generar-colores-iceberg.mjs';
test('criterio visual separa igualdad exacta, mantiene totales y distingue ausencia',()=>{
 assert.deepEqual(separarConteos(87,26,7),{verdes:80,rojos:26,grises:7,total:113});
 assert.equal(textoConteos(87,26,7),'Rojos 26 · Grises 7 · Verdes 80');
 assert.deepEqual(cifrasConteos(87,26,7).map(c=>c.valor),[26,80,7]);
 assert.deepEqual(cifrasConteos(45,68,9).map(c=>c.valor),[68,36,9]);
 assert.equal(claseMovimiento(0),'igual');
 assert.equal(claseMovimiento(.00000001),'positivo');
 assert.equal(claseMovimiento(-.00000001),'negativo');
 assert.equal(colorMovimiento(null),null);
 assert.throws(()=>separarConteos(1,2,3));
 const p=[[1000,2,1]];
 assert.deepEqual(separarSerieIceberg(p,{'1000':[2,1,1]}),[[1000,1,1,1]]);
 assert.deepEqual(p,[[1000,2,1]]);
 assert.throws(()=>separarSerieIceberg(p,{'1000':[3,1,1]}));
});
test('detalle diario nace de velas exactas sin reescribir los registros',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-colores-'));
 try{
  const ts=Date.UTC(2026,10,20), velas=path.join(dir,'registros/velas-24h');
  for(const clase of ['stock','cripto'])for(const [c,precio]of [['A',10],['B',11],['C',9]]){
   const p=path.join(velas,clase,c);fs.mkdirSync(p,{recursive:true});
   fs.writeFileSync(path.join(p,'2611_'+c),JSON.stringify([[ts,'10','11','9',String(precio)]]));
  }
  const p=path.join(dir,'registros/pre-calculado/stock/iceberg-90d');fs.mkdirSync(p,{recursive:true});
  const file=path.join(p,'261018-261120_iceberg'), original=JSON.stringify([[ts,2,1]]);
  fs.writeFileSync(file,original);
  assert.deepEqual(detalleIguales(velas,'stock',ts+86400000)[ts],[2,1,1]);
  assert.deepEqual(detalleIguales(velas,'stock',ts),{});
  const out=generarDetalles(dir);assert.deepEqual(out.stock[ts],[2,1,1]);
  assert.equal(fs.readFileSync(file,'utf8'),original);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('entradas comunes y leyendas no conservan reglas visuales viejas',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sup=fs.readFileSync(new URL('../visor-superficie.mjs',import.meta.url),'utf8');
 for(const texto of [html,sup])assert.doesNotMatch(texto,/cero cuenta como verde|no bajó entre lecturas|sin comparación nueva|Las caras unen|sin significado de proximidad|Altura: cambio porcentual/);
 for(const texto of [html,sup])assert.match(texto,/colores-lectura.mjs/);
 assert.match(html,/claseMovimiento\(f.ultimoN - f.refN\)/);
});
