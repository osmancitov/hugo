import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('diaria solicita Pages después de guardar datos, sin cron ni segunda ingesta',()=>{
 const s=fs.readFileSync(new URL('../.github/workflows/actualizacion-diaria.yml',import.meta.url),'utf8');
 assert.match(s,/actions: write/);
 assert.ok(s.indexOf('Publicar el visor con los registros actualizados')>s.indexOf('run: node .github/actualizacion-diaria.mjs'));
 const j=fs.readFileSync(new URL('../.github/publicar-visor.mjs',import.meta.url),'utf8');
 assert.match(s,/node \.github\/publicar-visor\.mjs/);
 assert.match(j,/pages.yml/);assert.match(j,/dispatches/);
 assert.match(j,/r.status !== 204/);
 assert.doesNotMatch(s,/if: always|cron:/);
});
