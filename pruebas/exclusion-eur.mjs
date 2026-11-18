import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registrar } from '../app/modulos/sincronizar-registros.mjs';
import { conectarCaja } from './caja.mjs';
test('sync no baja EUR remoto ni resube EUR local; limpieza arranca aun con sync apagada',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-exclusion-')),original=globalThis.fetch,arranques=[];
 const base=path.join(root,'velas'),dir=path.join(base,'cripto/EUR');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'2611_EUR'),'[]');let consultas=0;
 globalThis.fetch=async url=>{consultas++;let j;
 if(url.endsWith('/git/ref/heads/main'))j={object:{sha:'head'}};
 else if(url.endsWith('/git/commits/head'))j={tree:{sha:'tree'}};
 else if(url.endsWith('/git/trees/tree?recursive=1'))j={tree:[{type:'blob',path:'registros/velas-24h/cripto/EUR/2611_EUR',sha:'eur'}]};
 else throw Error('No debe consultar blobs ni subir EUR');
 return {ok:true,json:async()=>j};};
 try {
 const ctx={conf:{HUGO_VELAS_DIR:base,HUGO_GRAFICAS_DIR:path.join(root,'graficas'),HUGO_GITHUB:'prop/repo',HUGO_SYNC_MINUTOS:0},leerClave:()=>'',app:{client:{chat:{postMessage:async()=>{}}}},comando:()=>{},alIniciar:fn=>arranques.push(fn)};
 registrar(conectarCaja(ctx));assert.equal(arranques.length,1);await arranques[0]();assert.ok(!fs.existsSync(dir));
 const r=await ctx.pasadaSincronizacion();assert.equal(r.error,undefined);assert.equal(r.cambios,false);assert.ok(!fs.existsSync(dir));assert.equal(consultas,3);
 }finally{globalThis.fetch=original;fs.rmSync(root,{recursive:true,force:true});}
});
