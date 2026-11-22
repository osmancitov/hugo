import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {paginaSuperficie} from '../app/generar-pagina-superficie.mjs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('identidad aprobada usa avatar y portada externos sin androide incrustado',()=>{
 assert.match(html,/<img class="avatar" src="identidad\/avatar.png"/);
 assert.match(html,/id="portada-observatorio"/);
 assert.match(html,/hidden=hash!=='#\/'/);
 for(const p of ['avatar.png','icono.png','portada.jpg','tarjeta.jpg'])assert.ok(fs.statSync(new URL('../identidad/'+p,import.meta.url)).size>0);
});
test('tarjeta general nueva conserva tarjeta propia de Superficie',()=>{
 assert.match(html,/og:image" content="https:\/\/osmancitov.github.io\/hugo\/identidad\/tarjeta.jpg/);
 assert.match(paginaSuperficie(html),/og:image" content="https:\/\/osmancitov.github.io\/hugo\/superficie-og.jpg/);
});
