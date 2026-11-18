import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepararUniverso } from '../app/modulos/registro-universo.mjs';
import { conectarCaja } from './caja.mjs';
function fuente({vacio=false,parcial=false,fallo=false}={}) {
 const symbols=Array.from({length:110},(_,i)=>({symbol:`X${i}USDT`,baseAsset:`X${i}`,quoteAsset:'USDT',status:'TRADING'}));
 symbols.push({symbol:'EURUSDT',baseAsset:'EUR',quoteAsset:'USDT',status:'TRADING'});
 const data=symbols.map(s=>({s:s.symbol,an:s.baseAsset,tags:[]}));
 return async url=>{
 if(fallo)throw Error('red');
 if(url.includes('?symbol='))return {ok:false,status:400,json:async()=>parcial?{symbols:[symbols[0]]}:{code:-1121}};
 return {ok:true,json:async()=>url.includes('/bapi/')?{data}:{symbols:vacio?[]:symbols}};
 };
}
test('universo avisa todas las altas y bajas, excluye EUR y solo guarda tras decision de llamador',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hugo-universo-')),archivo=path.join(root,'privado/universo.json'),base=path.join(root,'velas');
 try {
 await fs.mkdir(path.join(base,'cripto/ANTIGUO'),{recursive:true});await fs.mkdir(path.join(base,'cripto/EUR'));
 const u=await prepararUniverso({clase:'cripto',base,archivo,fetchImpl:fuente()});
 assert.equal(u.codigos.length,110);assert.ok(!u.codigos.includes('EUR'));assert.match(u.texto,/Altas: 110/);assert.match(u.texto,/Bajas nuevas: 1 \(ANTIGUO\)/);assert.match(u.texto,/X109/);
 await assert.rejects(fs.stat(archivo));await u.guardar();
 const j=JSON.parse(await fs.readFile(archivo));assert.deepEqual(j.clases.cripto.retirados,['ANTIGUO']);
 const otra=await prepararUniverso({clase:'cripto',base,archivo,fetchImpl:fuente()});assert.match(otra.texto,/Altas: 0/);assert.match(otra.texto,/Bajas nuevas: 0/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('API vacia, fallida o parcial no cambia catalogo ni declara bajas',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hugo-universo-')),archivo=path.join(root,'catalogo'),base=path.join(root,'velas');
 try {
 await fs.mkdir(path.join(base,'cripto/ANTIGUO'),{recursive:true});
 for(const opciones of [{vacio:true},{fallo:true},{parcial:true}]) await assert.rejects(prepararUniverso({clase:'cripto',base,archivo,fetchImpl:fuente(opciones)}));
 await assert.rejects(fs.stat(archivo));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('aviso de altas rechazado impide guardar catalogo y descargar velas',async()=>{
 const {registrar}=await import('../app/modulos/velas.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hugo-aviso-')),original=globalThis.fetch;
 const comandos=[];let envios=0,klines=0;
 globalThis.fetch=async url=>{if(String(url).includes('klines'))klines++;return fuente()(url);};
 try {
 const ctx={conf:{HUGO_VELAS_DIR:path.join(root,'velas'),HUGO_REGISTRO_ESTADO:path.join(root,'estado.json')},app:{client:{chat:{postMessage:async()=>{envios++;if(envios===1)throw Error('Slack no disponible');}}}},comando:(p,fn)=>comandos.push(fn),alIniciar:()=>{},activas:new Map(),parada:{n:0}};
 registrar(conectarCaja(ctx));await comandos[0]({channel:'canal',ts:'hilo'},'registra cripto todos');
 assert.equal(klines,0);assert.equal(envios,2);await assert.rejects(fs.stat(path.join(root,'universo.json')));await assert.rejects(fs.stat(path.join(root,'estado.json')));
 }finally{globalThis.fetch=original;await fs.rm(root,{recursive:true,force:true});}
});
