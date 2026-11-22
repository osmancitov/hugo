import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularPersistencia, prepararPersistenciaGlobal } from '../app/modulos/persistencia.mjs';
const t = Date.UTC(2026,10,1), DIA = 86400000;
const v = (dia, cierre) => [t + dia*DIA, 100, 1000, 1, cierre];
const ventana = {inicio:t,fin:t+89*DIA};
test('promedio simple: suma de lugares / carreras, sin bonificaciones', () => {
 const m = new Map([['A',[v(0,110),v(1,90)]],['B',[v(0,105),v(1,105)]]]);
 const r = calcularPersistencia(m,ventana);
 assert.deepEqual(r.get('A'),{sumaPuestos:3,carreras:2,promedio:1.5});
 assert.deepEqual(r.get('B'),{sumaPuestos:3,carreras:2,promedio:1.5});
});
test('salto de 800% solo gana una carrera, no multiplica su peso', () => {
 const m = new Map([['A',[v(0,900),v(1,90),v(2,90)]],['B',[v(0,101),v(1,101),v(2,101)]]]);
 const r=calcularPersistencia(m,ventana);
 assert.equal(r.get('A').promedio,5/3); assert.equal(r.get('B').promedio,4/3);
});
test('ausencia no suma puesto ni carrera; no exige 90 participaciones', () => {
 const m = new Map([['A',[v(0,110)]],['B',[v(0,105),v(2,90)]],['VACIO',[]]]);
 const r=calcularPersistencia(m,ventana);
 assert.deepEqual(r.get('A'),{sumaPuestos:1,carreras:1,promedio:1});
 assert.deepEqual(r.get('B'),{sumaPuestos:3,carreras:2,promedio:1.5});
 assert.equal(r.has('VACIO'),false);
});
test('usa puesto diario vigente: variación real descendente, empate por código', () => {
 const r=calcularPersistencia(new Map([['Z',[v(0,100)]],['B',[v(0,100.04)]],['A',[v(0,100)]],['N',[v(0,99)]]]),ventana);
 assert.equal(r.get('B').promedio,1); assert.equal(r.get('A').promedio,2);
 assert.equal(r.get('Z').promedio,3); assert.equal(r.get('N').promedio,4);
});
test('limita ventana con ambos extremos incluidos y no desplaza los huecos', () => {
 const r=calcularPersistencia(new Map([['A',[v(-1,110),v(0,100),v(89,100),v(90,110)]]]),ventana);
 assert.equal(r.get('A').carreras,2);
});
test('conjunto explícito permite carreras de categoría o global, sin mezclar puestos', () => {
 const m=new Map([['EMPRESA',[v(0,105)]],['FONDO',[v(0,110)]]]);
 assert.equal(calcularPersistencia(m,ventana).get('EMPRESA').promedio,2);
 assert.equal(calcularPersistencia(new Map([['EMPRESA',m.get('EMPRESA')]]),ventana).get('EMPRESA').promedio,1);
});
test('rechaza carreras duplicadas y velas inválidas, no las cuenta dos veces', () => {
 assert.throws(()=>calcularPersistencia(new Map([['A',[v(0,100),v(0,110)]]]),ventana),/repetida/);
 const mala=v(0,100);mala[1]=0;
 assert.throws(()=>calcularPersistencia(new Map([['A',[mala]]]),ventana),/no válida/);
 assert.throws(()=>calcularPersistencia(new Map(),{inicio:t,fin:t-1}),/Ventana/);
});

test('listas filtran un único promedio global, no recalculan las carreras', () => {
 const entradas=[
 {activo:{codigo:'E',clase:'stock',tipo:'empresa'},filas:[v(0,110),v(1,90)]},
 {activo:{codigo:'F',clase:'stock',tipo:'fondo ETF'},filas:[v(0,105),v(1,100)]},
 {activo:{codigo:'C',clase:'cripto',tipo:'empresa'},filas:[v(0,120),v(1,120)]},
 ];
 const r=prepararPersistenciaGlobal(entradas,ventana);
 assert.deepEqual(r.global.map(x=>x.id),['cripto:C','stock:E','stock:F']);
 assert.equal(r.empresas.length,1);assert.equal(r.fondos.length,1);assert.equal(r.criptos.length,1);
 assert.equal(r.empresas[0].promedio,2.5);assert.equal(r.fondos[0].promedio,2.5);
 assert.strictEqual(r.empresas[0],r.global[1]);assert.strictEqual(r.stocks[0],r.global[1]);
 assert.equal(r.global[1].promedio,r.global[2].promedio); // sin desempate matemático nuevo
});
test('mercado y código identifican al participante sin colisiones globales', () => {
 const r=prepararPersistenciaGlobal([
 {activo:{codigo:'X',clase:'stock',tipo:'empresa'},filas:[v(0,110)]},
 {activo:{codigo:'X',clase:'cripto'},filas:[v(0,90)]},
 ],ventana);
 assert.equal(r.global.length,2);assert.equal(r.stocks[0].promedio,1);assert.equal(r.criptos[0].promedio,2);
 assert.throws(()=>prepararPersistenciaGlobal([
 {activo:{codigo:'X',clase:'stock'},filas:[]}, {activo:{codigo:'X',clase:'stock'},filas:[]},
 ],ventana),/repetido/);
});
