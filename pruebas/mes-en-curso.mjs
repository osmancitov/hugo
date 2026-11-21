// node --test pruebas/mes-en-curso.mjs: todo simulado, sin cuentas ni red.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {crearMotor,leerEstado} from '../app/modulos/registro-motor.mjs';
import {compararSeries,validarSerie,DIA} from '../app/modulos/registro-serie.mjs';
import {registrar, fijarPasoCatalogo} from '../app/modulos/sincronizar-registros.mjs';
fijarPasoCatalogo(async () => ({ lineas: [] })); // el paso de catálogo consulta la red; aquí se anula
import { conectarCaja } from './caja.mjs';
import { crearRemoto } from './git-remoto.mjs';
const noviembre=Date.UTC(2026,10,1),octubre=Date.UTC(2026,9,1);
const v=t=>[t,'1','2','1','2','10',t+DIA-1,'10',3,'1','2','0'];
const evento={channel:'simulado',ts:'raiz'};
const serie=n=>Array.from({length:n},(_,i)=>v(noviembre+i*DIA));
const sha=b=>crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');
test('mes abierto solo hasta ultimo cierre; segunda orden amplia, anteriores intactos',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-abierto-'));const base=path.join(root,'velas'),estado=path.join(root,'estado');let hoy=noviembre+3*DIA+1000;const urls=[],msgs=[];
 const motor=crearMotor({base:()=>base,archivoEstado:()=>estado,ahora:()=>hoy,resolver:async()=>({ok:true,simbolo:'AABUSDT'}),avisar:async(_,m)=>msgs.push(m),fetchImpl:async u=>{
  const q=new URL(u).searchParams;urls.push(q);const mes=Number(q.get('startTime')),hasta=Number(q.get('endTime'))+1;
  return{ok:true,status:200,text:async()=>JSON.stringify(mes===noviembre?serie((hasta-noviembre)/DIA):[])};
 }});
 try {
  await motor.iniciar({clase:'stock',codigos:['AA'],event:evento});
  const p=path.join(base,'stock/AA/2611_AA');const previo=JSON.parse(fs.readFileSync(p));assert.equal(previo.length,3);assert.equal(Number(urls[0].get('endTime')),noviembre+3*DIA-1);assert.equal(leerEstado(estado).estado,'terminado');
  hoy+=2*DIA;await motor.iniciar({clase:'stock',codigos:['AA'],event:evento});const nuevo=JSON.parse(fs.readFileSync(p));assert.equal(nuevo.length,5);assert.deepEqual(nuevo.slice(0,3),previo);assert.equal(leerEstado(estado).conteo.ampliados,1);assert.ok(msgs.some(m=>m.includes('Tenía 3 días; añadí 2 (hasta el 5).')),'distingue lo que había y lo añadido');assert.ok(msgs.some(m=>m.includes('Mes completo al corte: 5/5 días.')),'los días sin cerrar no son faltantes');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('primer dia UTC empieza mes anterior cerrado; cambio de mes completa noviembre',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-cambio-'));let hoy=Date.UTC(2026,11,1)+1000;const pedidos=[];
 const motor=crearMotor({base:()=>path.join(root,'velas'),archivoEstado:()=>path.join(root,'estado'),ahora:()=>hoy,resolver:async()=>({ok:true,simbolo:'AA'}),avisar:async()=>{},fetchImpl:async u=>{const q=new URL(u).searchParams;pedidos.push(q);return{ok:true,status:200,text:async()=>JSON.stringify(Number(q.get('startTime'))===noviembre?serie(30):[])};}});
 try{const p=path.join(root,'velas/stock/AA/2611_AA');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(serie(20)));await motor.iniciar({clase:'stock',codigos:['AA'],event:evento});assert.equal(Number(pedidos[0].get('startTime')),noviembre);assert.equal(JSON.parse(fs.readFileSync(p)).length,30);assert.equal(leerEstado(path.join(root,'estado')).estado,'terminado');}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('rechaza vela abierta y cambio en dia ya registrado',()=>{
 assert.throws(()=>validarSerie(serie(4),noviembre,noviembre+3*DIA),/abiertas/);
 const a=serie(3),b=serie(5);b[1][4]='99';assert.throws(()=>compararSeries(a,b,noviembre,noviembre+6*DIA),/Conflicto/);
 assert.equal(compararSeries(serie(5),serie(3),noviembre,noviembre+6*DIA),'conservar');
});
async function syncCaso({local,remoto,cambioRemoto,falloPush=false,rel='registros/velas-24h/stock/AA/2610_AA'}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-sync-'));const p=path.join(root,rel.slice('registros/velas-24h/'.length));
 const rem=crearRemoto(remoto?{[rel]:JSON.stringify(remoto)}:{});
 if(local){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(local));}
 try{
  const ctx={conf:{HUGO_GITHUB:'prop/repo',HUGO_VELAS_DIR:root,HUGO_REPO_SYNC_URL:rem.url,HUGO_REPO_SYNC_DIR:path.join(root,'clon')},leerClave:()=> 'simulado',app:{client:{chat:{postMessage:async()=>{}}}},comando:()=>{},alIniciar:()=>{}};registrar(conectarCaja(ctx));
  let aplicado=false;
  const gancho=async(t)=>{ // el avance ajeno (o el bloqueo) cae entre el fetch y el push, como una carrera real
   if(t.startsWith('Publicando commit')&&!aplicado){aplicado=true;if(cambioRemoto)rem.avanceAjeno(rel,JSON.stringify(cambioRemoto));if(falloPush)rem.bloquearEscritura();}
  };
  const resultado=await ctx.pasadaSincronizacion(gancho);
  const arbolFinal=rem.arbol();
  return {resultado,rem,local:fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null,remoto:arbolFinal[rel]?JSON.parse(arbolFinal[rel]):null,commits:rem.commits()};
 }finally{rem.destruir();fs.rmSync(root,{recursive:true,force:true});}
}
const oct=n=>Array.from({length:n},(_,i)=>v(octubre+i*DIA));
test('sync sube ampliacion estricta en un commit sin modificar prefijo',async()=>{const r=await syncCaso({local:oct(5),remoto:oct(3)});assert.deepEqual(r.remoto,oct(5));assert.deepEqual(r.local,oct(5));assert.equal(r.resultado.error,undefined);assert.ok(r.commits.some(c=>c.includes('<osmanvielma@gmail.com>')),'autor del commit: '+r.commits.join(' | '));});
test('sync baja ampliacion estricta, nunca recorta',async()=>{const r=await syncCaso({local:oct(3),remoto:oct(5)});assert.deepEqual(r.remoto,oct(5));assert.deepEqual(r.local,oct(5));});
test('sync conserva ambos ante cambio historico',async()=>{const malo=oct(5);malo[0][4]='99';const r=await syncCaso({local:oct(3),remoto:malo});assert.deepEqual(r.local,oct(3));assert.deepEqual(r.remoto,malo);assert.ok(r.resultado.conflictos);});
test('sync relee remoto antes de subir; cambio divergente no se pisa',async()=>{const malo=oct(4);malo[0][4]='99';const r=await syncCaso({local:oct(5),remoto:oct(3),cambioRemoto:malo});assert.deepEqual(r.remoto,malo);assert.deepEqual(r.local,oct(5));});
test('push rechazado no cambia rama ni local',async()=>{const r=await syncCaso({local:oct(5),remoto:oct(3),falloPush:true});assert.deepEqual(r.remoto,oct(3));assert.deepEqual(r.local,oct(5));assert.ok(r.resultado.hayPendiente||r.resultado.error,'se reporta el freno: '+JSON.stringify(r.resultado));});
const julio=Date.UTC(2026,6,1);
const jul=n=>Array.from({length:n},(_,i)=>v(julio+i*DIA));
test('piso ago-2026: un 2607 solo en GitHub NO baja',async()=>{
 const r=await syncCaso({remoto:jul(31),rel:'registros/velas-24h/stock/AA/2607_AA'});
 assert.equal(r.local,null,'no se descarga nada anterior al piso');
 assert.equal(r.resultado.error,undefined);
});
test('piso ago-2026: un 2607 solo en la Debian NO sube',async()=>{
 const r=await syncCaso({local:jul(31),rel:'registros/velas-24h/stock/AA/2607_AA'});
 assert.equal(r.remoto,null,'no se republica nada anterior al piso');
 assert.deepEqual(r.local,jul(31),'el archivo local queda donde estaba');
});
test('mes en curso sin velas cerradas no oculta el historial anterior',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-vacio-hoy-'));const pedidos=[];
 const m=crearMotor({base:()=>path.join(root,'velas'),archivoEstado:()=>path.join(root,'estado'),ahora:()=>noviembre+5*DIA,resolver:async()=>({ok:true,simbolo:'AA'}),avisar:async()=>{},fetchImpl:async u=>{const t=Number(new URL(u).searchParams.get('startTime'));pedidos.push(t);return{ok:true,status:200,text:async()=>JSON.stringify(t===octubre?[v(t)]:[])};}});
 try{await m.iniciar({clase:'stock',codigos:['AA'],event:evento});assert.deepEqual(pedidos.slice(0,2),[noviembre,octubre]);assert.equal(leerEstado(path.join(root,'estado')).conteo.guardados,1);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('reanudar dias despues conserva corte y no recorta serie local mas nueva',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-corte-fijo-'));let hoy=noviembre+3*DIA,fallar=true;const pedidos=[];const estado=path.join(root,'estado'),p=path.join(root,'velas/stock/AA/2611_AA');
 const opciones={base:()=>path.join(root,'velas'),archivoEstado:()=>estado,ahora:()=>hoy,resolver:async()=>({ok:true,simbolo:'AA'}),avisar:async()=>{},fetchImpl:async u=>{const q=new URL(u).searchParams;pedidos.push(q);if(fallar)throw Error('red');return{ok:true,status:200,text:async()=>JSON.stringify(Number(q.get('startTime'))===noviembre?serie(3):[])};}};
 try{
  await crearMotor(opciones).iniciar({clase:'stock',codigos:['AA'],event:evento});assert.equal(leerEstado(estado).estado,'pausado');
  hoy+=2*DIA;fallar=false;fs.mkdirSync(path.dirname(p),{recursive:true});const previo=JSON.stringify(serie(5));fs.writeFileSync(p,previo);
  await crearMotor(opciones).iniciar({continuar:true,event:evento});assert.equal(Number(pedidos[1].get('endTime')),noviembre+3*DIA-1);assert.equal(fs.readFileSync(p,'utf8'),previo);assert.equal(leerEstado(estado).hasta,noviembre+3*DIA);assert.equal(leerEstado(estado).estado,'terminado');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('migracion de avance v1 conserva corte historico',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-v1-'));const p=path.join(root,'estado');
 try{fs.writeFileSync(p,JSON.stringify({version:1,estado:'en-curso',clase:'stock',codigos:['AA'],indice:0,mes:octubre,channel:'simulado',thread_ts:'raiz',conteo:{guardados:0,existentes:0,activos:0}}));const j=leerEstado(p);assert.equal(j.hasta,noviembre);assert.equal(j.inicial,octubre);assert.equal(j.version,2);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
