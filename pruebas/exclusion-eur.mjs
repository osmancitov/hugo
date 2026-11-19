import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registrar } from '../app/modulos/sincronizar-registros.mjs';
import { conectarCaja } from './caja.mjs';
import { crearRemoto } from './git-remoto.mjs';
test('sync no baja EUR remoto ni resube EUR local; limpieza arranca aun con sync apagada',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-exclusion-')),arranques=[];
 // EUR excluido aunque exista en el remoto: se siembra con un autor ajeno para probar que no baja.
 const rem=crearRemoto({'registros/velas-24h/cripto/EUR/2611_EUR':'[]'});
 const base=path.join(root,'velas'),dir=path.join(base,'cripto/EUR');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'2611_EUR'),'[]');
 try {
 const ctx={conf:{HUGO_VELAS_DIR:base,HUGO_GRAFICAS_DIR:path.join(root,'graficas'),HUGO_GITHUB:'prop/repo',HUGO_SYNC_MINUTOS:0,HUGO_REPO_SYNC_URL:rem.url,HUGO_REPO_SYNC_DIR:path.join(root,'clon')},leerClave:()=>'',app:{client:{chat:{postMessage:async()=>{}}}},comando:()=>{},alIniciar:fn=>arranques.push(fn)};
 registrar(conectarCaja(ctx));assert.equal(arranques.length,1);await arranques[0]();assert.ok(!fs.existsSync(dir));
 const r=await ctx.pasadaSincronizacion();assert.equal(r.error,undefined);assert.equal(r.cambios,false);assert.ok(!fs.existsSync(dir));
 assert.ok(rem.arbol()['registros/velas-24h/cripto/EUR/2611_EUR'],'EUR remoto intacto: ni bajo ni se toco');
 }finally{rem.destruir();fs.rmSync(root,{recursive:true,force:true});}
});
