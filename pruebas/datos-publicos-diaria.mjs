import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchDatosPublicos} from '../.github/datos-publicos-diaria.mjs';
test('diaria usa fuente pública solo para GET catálogo y velas, conservando parámetros y opciones',async()=>{
 const llamadas=[];const pedir=fetchDatosPublicos(async(...args)=>{llamadas.push(args);return 'ok';});
 const opciones={headers:{'User-Agent':'hugo'},signal:new AbortController().signal};
 for(const ruta of ['exchangeInfo?symbol=BTCUSDT','klines?symbol=BTCUSDT&interval=1d&startTime=5&endTime=9&limit=1000']){
  assert.equal(await pedir('https://api.binance.com/api/v3/'+ruta,opciones),'ok');
  const [url,opts]=llamadas.at(-1);assert.equal(url,'https://data-api.binance.vision/api/v3/'+ruta);assert.equal(opts,opciones);
 }
});
test('no cambia productos, GitHub, API privada, host parecido ni métodos de escritura',async()=>{
 const pedir=fetchDatosPublicos(async url=>url);
 for(const u of ['https://www.binance.com/bapi/asset/v2/public/asset-service/product/get-products?includeEtf=true','https://api.github.com/repos/osmancitov/hugo','https://api.binance.com/api/v3/account','https://api.binance.com.example/api/v3/klines'])assert.equal(await pedir(u),u);
 const u='https://api.binance.com/api/v3/klines';assert.equal(await pedir(u,{method:'POST'}),u);
});
