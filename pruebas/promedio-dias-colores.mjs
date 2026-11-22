import test from 'node:test';
import assert from 'node:assert/strict';
import {claseDiasPromedio} from '../visor-persistencia.mjs';
test('Días: rojo antes de 20, amarillo hasta 39, normal desde 40',()=>{
 for(const d of [0,1,19])assert.equal(claseDiasPromedio(d),'promedio-dias-rojo');
 for(const d of [20,25,39])assert.equal(claseDiasPromedio(d),'promedio-dias-amarillo');
 for(const d of [40,46,90])assert.equal(claseDiasPromedio(d),'');
});
