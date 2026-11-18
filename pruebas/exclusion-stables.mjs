import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EXCLUIDOS} from '../app/modulos/exclusiones.mjs';
import {resolverActivo} from '../app/modulos/activos.mjs';
import {retirarExcluidos} from '../app/modulos/retirar-eur.mjs';
import {leerCobertura} from '../app/modulos/estado-registro.mjs';
import {listarUniverso} from '../app/modulos/universo-binance.mjs';
test('stablebases rechazadas sin consultar Binance; otros activos no se excluyen por nombre',async()=>{
 for(const codigo of EXCLUIDOS){const r=await resolverActivo('cripto',codigo,{fetchImpl:async()=>{throw Error('no debe consultar');}});assert.equal(r.ok,false);}
 for(const c of ['FRAX','BFUSD','RWUSD','USTC','EURI','KGST'])assert.equal(EXCLUIDOS.has(c),false);
});
test('limpieza y estado excluyen stablecripto pero conservan stock USDE',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hugo-stables-')),mes=Date.UTC(2026,10,1),v=[mes,'1','2','1','2','10',mes+86400000-1,'10',3,'1','2','0'];
 try{
 for(const clase of ['cripto','stock'])for(const codigo of ['USDE','BTC']){const dir=path.join(root,clase,codigo);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,`2611_${codigo}`),JSON.stringify([v]));}
 const c=await leerCobertura(root);assert.ok(c.activos.some(a=>a.clase==='stock'&&a.codigo==='USDE'));assert.ok(!c.activos.some(a=>a.clase==='cripto'&&a.codigo==='USDE'));
 assert.equal(retirarExcluidos(root,path.join(root,'graficas')),1);assert.ok(fs.existsSync(path.join(root,'stock/USDE/2611_USDE')));assert.ok(fs.existsSync(path.join(root,'cripto/BTC/2611_BTC')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('universo mantiene stock USDE, cotizacion USDT y marca nueva pistaUSD para revision',async()=>{
 const symbols=Array.from({length:110},(_,i)=>({symbol:`X${i}USDT`,baseAsset:`X${i}`,quoteAsset:'USDT',status:'TRADING'}));
 symbols.push(...['USDE','USDEB','USDC','NUSD'].map(baseAsset=>({symbol:baseAsset+'USDT',baseAsset,quoteAsset:'USDT',status:'TRADING'})));
 const data=symbols.map(s=>({s:s.symbol,an:s.baseAsset==='USDEB'?'StablecoinX (bStocks)':s.baseAsset,tags:s.baseAsset==='USDEB'?['bStocks']:[]}));
 const u=await listarUniverso({fetchImpl:async url=>({ok:true,json:async()=>url.includes('bapi')?{data}:{symbols}})});
 assert.ok(u.activos.stock.includes('USDE'));assert.ok(!u.activos.cripto.includes('USDE'));assert.ok(!u.activos.cripto.includes('USDC'));assert.ok(u.activos.cripto.includes('X1'));assert.ok(u.revisar.includes('NUSD'));
});
