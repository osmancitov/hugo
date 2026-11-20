// node --test pruebas/autoridad-comandos.mjs. Autoridad de comandos (decisión del usuario,
// 20-nov-2026): los bots tienen sus comandos y ya; cualquiera los puede comandar; algunos
// requieren el 👍 de Osmancito. En la práctica: sin marca delegable ni filtro de remitente en
// el despachador, y TODA confirmación lleva user: ctx.usuario (su pulgar es el único que cuenta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dirModulos = new URL('../app/modulos/', import.meta.url);
const leer = (u) => fs.readFileSync(u, 'utf8');

test('el despachador no filtra por remitente ni conoce marcas delegables', () => {
  const app = leer(new URL('../app/app.mjs', import.meta.url));
  assert.ok(!app.includes('Orden ignorada'), 'ninguna orden se ignora en silencio por remitente');
  assert.ok(!app.includes('delegable'), 'la marca delegable ya no existe');
  assert.match(app, /Cualquiera puede pedir cualquier comando/);
});

test('ningún módulo registra marca delegable', () => {
  for (const f of fs.readdirSync(dirModulos)) {
    if (!f.endsWith('.mjs')) continue;
    assert.ok(!leer(new URL(f, dirModulos)).includes('delegable'), `${f} aún menciona delegable`);
  }
});

test('toda confirmación la aprueba solo el usuario (user: ctx.usuario)', () => {
  let total = 0;
  for (const f of fs.readdirSync(dirModulos)) {
    if (!f.endsWith('.mjs')) continue;
    const s = leer(new URL(f, dirModulos));
    const llamadas = s.split('ctx.confirmar({').slice(1);
    for (const c of llamadas) {
      total++;
      const bloque = c.slice(0, c.indexOf('alSi')); // el encabezado de la confirmación
      assert.match(bloque, /user:\s*ctx\.usuario/, `${f}: una confirmación no fija user: ctx.usuario`);
    }
    assert.ok(!s.includes('user: event.user'), `${f}: una confirmación aceptaría el 👍 de quien pide`);
  }
  assert.ok(total >= 7, `se esperaban las confirmaciones existentes, hay ${total}`);
});
