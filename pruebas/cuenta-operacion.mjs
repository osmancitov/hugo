import test from 'node:test';import assert from 'node:assert/strict';
import {cuadrarOperacion,nuevoRegistro,etiquetaFecha} from '../cuenta/operacion.mjs';
test('la venta se calcula para que la compra cuadre con el saldo final',()=>{
  const r=cuadrarOperacion({saldoPrevio:240.71,compra:210,saldoFinal:250});
  assert.equal(Math.round(240.71*r.venta/210*100)/100,250);assert.equal(r.change,9.29);assert.equal(r.percent,3.86);
});
test('con cualquier saldo final razonable hay precio de venta que cuadra',()=>{
  for(const [s0,b,f] of [[240.71,210,236.5],[240.71,0.4321,260.07],[240.71,1257.99,239.9],[240.71,55555,300]]){
    const r=cuadrarOperacion({saldoPrevio:s0,compra:b,saldoFinal:f});assert.equal(Math.round(s0*r.venta/b*100)/100,f);}
});
test('el registro nuevo no lleva marcas de aproximación ni comisión aparte',()=>{
  const reg=nuevoRegistro({anteriores:[{balance:240.71}],activo:'TSLA',codigo:'TSLA',mercado:'stock',compra:400,saldoFinal:250,fecha:'2026-11-24',horaCompra:'08:00',horaVenta:'09:00'});
  assert.equal(reg.label,'24 de noviembre');assert.equal(reg.balance,250);assert.equal(reg.balance_confirmed,true);
  for(const k of ['approximate','prices_approximate','commission','fee','adjustment'])assert.equal(reg[k],undefined,k);
  assert.equal(etiquetaFecha('2026-12-01'),'1 de diciembre');
});
test('datos inválidos se rechazan',()=>{assert.throws(()=>cuadrarOperacion({saldoPrevio:240.71,compra:0,saldoFinal:250}));});
