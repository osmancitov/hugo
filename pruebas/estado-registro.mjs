import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leerCobertura, ultimaPublicacion, registrar, _prueba, fechaLocal } from '../app/modulos/estado-registro.mjs';
import { retirarEUR } from '../app/modulos/retirar-eur.mjs';
import { _prueba as ayuda } from '../app/modulos/ayuda.mjs';
const DIA=86400000, mes=Date.UTC(2026,10,1);
const vela=t=>[t,'1','2','1','2','10',t+DIA-1,'10',3,'1','2','0'];
function entorno(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-estado-'));return {root, escribir:(clase,codigo,datos,nombre=`2611_${codigo}`)=>{const p=path.join(root,clase,codigo,nombre);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(datos));}};}
test('estado agrupa fechas distintas y excluye EUR sin confundir descarga con mercado',async()=>{
 const e=entorno();try{
 e.escribir('stock','AA',[vela(mes)]);e.escribir('cripto','BTC',[vela(mes),vela(mes+DIA)]);e.escribir('cripto','EUR',[vela(mes)]);
 const c=await leerCobertura(e.root);assert.equal(c.activos.length,2);assert.equal(c.archivos,2);assert.equal(c.activos.some(a => a.codigo === 'EUR'),false);
 const t=_prueba.coberturaTexto(c).join('\n');assert.match(t,/2026-11-01/);assert.match(t,/2026-11-02/);assert.match(t,/descarga por sincronizacion/);assert.doesNotMatch(t,/EUR/);
 e.escribir('stock','AA',[]);assert.equal((await leerCobertura(e.root)).errores.length,1);
 }finally{fs.rmSync(e.root,{recursive:true,force:true});}
});
test('no sigue enlaces y no da por valido un nombre ajeno',async()=>{
 const e=entorno();try{e.escribir('stock','AA',[vela(mes)],'2611_BB');assert.equal((await leerCobertura(e.root)).errores.length,1);
 fs.symlinkSync(path.join(e.root,'stock/AA'),path.join(e.root,'stock/CC'));assert.equal((await leerCobertura(e.root)).archivos,0);
 }finally{fs.rmSync(e.root,{recursive:true,force:true});}
});
test('consulta commit solo en registros y distingue fallo HTTP',async()=>{
 const c=await ultimaPublicacion('prop/repo',async url=>{const u=new URL(url);assert.equal(u.searchParams.get('path'),'registros/velas-24h');assert.equal(u.searchParams.get('sha'),'main');return {ok:true,json:async()=>[{sha:'a'.repeat(40),html_url:'https://github.com/prop/repo/commit/'+ 'a'.repeat(40),commit:{committer:{date:'2026-11-18T03:09:30Z'}}}]};});
 assert.equal(fechaLocal(c.fecha),'2026-11-17 23:09:30 UTC-4');
 await assert.rejects(ultimaPublicacion('prop/repo',async()=>({ok:false,status:403})),/403/);
});
test('comando nuevo solo usuario, respuestas a su hilo aun sin GitHub',async()=>{
 const e=entorno(),comandos=[],mensajes=[];try{
 registrar({conf:{HUGO_VELAS_DIR:e.root},app:{client:{chat:{postMessage:async m=>mensajes.push(m)}}},comando:(patron,fn,opciones)=>comandos.push({patron,fn,opciones})});
 const c=comandos[0];assert.equal(!!c.opciones.delegable,false);assert.ok(c.patron.test('estado del registro'));assert.ok(c.patron.test('estado registro?'));assert.ok(!c.patron.test('estado'));
 await c.fn({channel:'canal',ts:'raiz',thread_ts:'hilo'});assert.equal(mensajes[0].thread_ts,'hilo');assert.match(mensajes[0].text,/No pude verificar/);assert.match(mensajes[0].text,/no se guarda/);
 assert.ok(ayuda.TEXTO.length<2100);assert.match(ayuda.TEXTO,/estado del registro/);
 }finally{fs.rmSync(e.root,{recursive:true,force:true});}
});
test('retirada EUR idempotente, solo archivos conocidos, no otros activos',()=>{
 const e=entorno(),g=path.join(e.root,'graficas');try{
 e.escribir('cripto','EUR',[vela(mes)]);e.escribir('cripto','BTC',[vela(mes)]);
 assert.equal(retirarEUR(e.root,g),1);assert.equal(retirarEUR(e.root,g),0);assert.ok(fs.existsSync(path.join(e.root,'cripto/BTC/2611_BTC')));
 e.escribir('cripto','EUR',[],'desconocido');assert.throws(()=>retirarEUR(e.root,g),/no reconocidos/);assert.ok(fs.existsSync(path.join(e.root,'cripto/EUR/desconocido')));
 }finally{fs.rmSync(e.root,{recursive:true,force:true});}
});
