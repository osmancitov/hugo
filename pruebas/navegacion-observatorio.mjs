import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoNavegacionStocks, listaStocks } from '../app/modulos/navegacion-observatorio.mjs';
test('Stocks revela mercado, categoría y ranking en pasos separados',()=>{
 assert.deepEqual(estadoNavegacionStocks('#/'),{mercado:null,categoria:null,ranking:null});
 assert.deepEqual(estadoNavegacionStocks('#/stock'),{mercado:'stock',categoria:null,ranking:null});
 assert.deepEqual(estadoNavegacionStocks('#/stock/empresas'),{mercado:'stock',categoria:'empresas',ranking:null});
 assert.deepEqual(estadoNavegacionStocks('#/stock/fondos/variacion'),{mercado:'stock',categoria:'fondos',ranking:'variacion'});
 assert.equal(estadoNavegacionStocks('#/stock/fondos/persistencia'),null); // Promedio retirado (25-nov-2026): el enlace antiguo se redirige en el visor
 assert.equal(estadoNavegacionStocks('#/stock/persistencia'),null);
 assert.equal(estadoNavegacionStocks('#/cripto'),null);
});
test('categorías conservan empresas y fondos sin excluir fondos apalancados',()=>{
 const a=[{clase:'stock',codigo:'A',tipo:'empresa'},{clase:'stock',codigo:'F',tipo:'fondo ETF apalancado 3×'},{clase:'cripto',codigo:'C',tipo:'empresa'}];
 assert.deepEqual(listaStocks(a,'empresas').map(x=>x.codigo),['A']);
 assert.deepEqual(listaStocks(a,'fondos').map(x=>x.codigo),['F']);
});
