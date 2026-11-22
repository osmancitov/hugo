import test from 'node:test';
import assert from 'node:assert/strict';
import {claseDiasPromedio} from '../visor-persistencia.mjs';
test('Días: rojo antes de 20, normal desde 20',()=>{
 for(const d of [0,1,19])assert.equal(claseDiasPromedio(d),'promedio-dias-rojo');

 for(const d of [20,25,39,40,46,90])assert.equal(claseDiasPromedio(d),'');
});

import fs from 'node:fs';
test('Stocks solo en listas del mercado stock',()=>{
 const src=fs.readFileSync(new URL('../visor-persistencia.mjs',import.meta.url),'utf8');
 assert.match(src,/const mostrarStocks=catalogo.filter\(seleccion\).some\(a=>a.clase==='stock'\)/);
 assert.match(src,/if\(mostrarStocks\)r.append/);
 assert.match(src,/mostrarStocks\?\['Stocks'\]:\[\]/);
});
