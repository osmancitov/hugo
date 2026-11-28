import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('Horizontes de potencia y constancia: un panel bajo Horizontes de campaña con los mismos datos',()=>{
 assert.ok(html.includes('function graficaHorizontesPCCampana('));
 assert.ok(html.includes('graficaHorizontesPCCampana(cHorPC,datosHor,gruposHor,sel,elegir)'));
 assert.ok(html.includes('...(puente?[cHor,cHorPC]:[cEsp])'));
 assert.ok(html.includes('return {fin,perfiles,perfP,perfC};'));
});
test('P y C se guardan como en nucleo.mjs y la duración sin bajas no se dibuja',()=>{
 assert.ok(html.includes('if(dn){vp[n]=pos/Math.abs(neg);vc[n]=dp/dn;}'));
 assert.ok(html.includes("pts.push(v==null||!isFinite(v)?null:[x(n),y(v)])"));
 assert.ok(html.includes("lin.style.strokeOpacity=sel?'1':'.12'"));
 assert.ok(html.includes("'var(--oro)'") && html.includes("'#7fb2e5'"));
});
test('Horizontes de campaña sigue presente',()=>{
 assert.ok(html.includes("tit.textContent='Horizontes de campaña'"));
 assert.ok(html.includes('graficaHorizontesCampana(cHor,datosHor,gruposHor,sel,elegir)'));
});
