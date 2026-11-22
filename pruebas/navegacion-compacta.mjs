import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('selecciones contraen los niveles y se puede volver al nivel anterior',()=>{
 assert.match(html,/contraerNavegacion\(navMerc,mercado,'#\/'\)/);
 assert.match(html,/contraerNavegacion\(navCat,/);
 assert.match(html,/contraerNavegacion\(navV,ranking,/);
 assert.match(html,/a.hidden=!a.classList.contains\('actual'\)/);
 assert.match(html,/a.href=volver/);
 assert.match(html,/rot.hidden=true/);
});
test('capitalización sin explicación eliminada, Promedio conserva su módulo',()=>{
 assert.doesNotMatch(html,/Capitalización del token y, en su caso/);
 assert.match(html,/montarPersistencia\(seccion,TODOS/);
});
