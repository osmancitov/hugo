import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fechaLegibleUTC} from '../app/modulos/fechas-visor.mjs';
test('fechas visibles UTC legibles sin cambiar identificadores',()=>{
 assert.equal(fechaLegibleUTC('2026-11-21'),'21 nov 2026');
 assert.equal(fechaLegibleUTC(Date.UTC(2026,0,2,23,59)),'2 ene 2026');
 assert.equal(fechaLegibleUTC('2026-11-22T00:01:00Z'),'22 nov 2026');
 assert.equal(fechaLegibleUTC(NaN),'sin fecha');
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(html.includes('value: dia, textContent: fechaLegibleUTC(dia)'));
 assert.ok(!html.includes('lecturas reales guardadas'));
 assert.ok(html.includes('cargarDiaObservatorio(elegirDia.value, mercado)'));
 const r=fs.readFileSync(new URL('../visor-rachas.mjs',import.meta.url),'utf8');
 assert.match(r,/const fecha = fechaLegibleUTC/);
});

