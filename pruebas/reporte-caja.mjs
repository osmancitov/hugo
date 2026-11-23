// node --test pruebas/reporte-caja.mjs. Guardia de la caja unica de reportes: app.mjs la
// conecta una sola vez en el contexto comun (ctx.reporte) y todo trabajo la recibe por
// defecto; ningun modulo se conecta a mano ni edita mensajes por su cuenta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const modulos = path.join(app, 'modulos');
const leer = (n) => fs.readFileSync(path.join(modulos, n), 'utf8');

test('app.mjs conecta la caja una sola vez en el contexto comun', () => {
 const fuente = fs.readFileSync(path.join(app, 'app.mjs'), 'utf8');
 assert.match(fuente, /import \* as reporte from '\.\/modulos\/reporte\.mjs'/);
 assert.match(fuente, /reporte: \{/);
 assert.match(fuente, /reporte\.crearReporte\(/);
 assert.match(fuente, /reporte\.crearAvisador\(/);
});

test('menciones sin acuse de ojos conservan formato de avisos', () => {
 const fuente = fs.readFileSync(path.join(app, 'app.mjs'), 'utf8');
 assert.match(fuente, /reporte\.crearOjos\(/);
 assert.doesNotMatch(fuente, /\.anunciar\(event\)|event\.ojos/);
 const caja = leer('reporte.mjs');
 assert.match(caja, /export function crearOjos/);
 assert.match(caja, /text:'👀'/);
});

test('ningun modulo importa la caja a mano: la recibe por el contexto', () => {
 for (const n of fs.readdirSync(modulos).filter(n => n.endsWith('.mjs') && n !== 'reporte.mjs')) {
  assert.doesNotMatch(leer(n), /from '\.\/reporte\.mjs'/, `${n} se conecta a mano a la caja`);
 }
});

test('los flujos de trabajo lento usan la caja del contexto', () => {
 assert.match(leer('velas.mjs'), /ctx\.reporte\.avisador\(\)/);
 assert.match(leer('sincronizar-registros.mjs'), /ctx\.reporte\.crearSync\(/);
 // Decisión del usuario, 19-nov-2026: "actualiza github" no abre reporte previo; cuando hay
 // cambios publica directamente la única solicitud de aprobación (ctx.confirmar).
 assert.doesNotMatch(leer('github.mjs'), /ctx\.reporte\.crear\(/);
 assert.match(leer('github.mjs'), /ctx\.confirmar\(/);
});

test('solo la caja edita mensajes; nadie remienda reportes por su cuenta', () => {
 for (const n of fs.readdirSync(modulos).filter(n => n.endsWith('.mjs') && n !== 'reporte.mjs')) {
  assert.doesNotMatch(leer(n), /chat\.update/, `${n} edita mensajes fuera de la caja`);
 }
});

test('no quedan cajas viejas de reporte sueltas', () => {
 assert.ok(!fs.existsSync(path.join(modulos, 'registro-avisos.mjs')));
 assert.ok(!fs.existsSync(path.join(modulos, 'sincronizar-reporte.mjs')));
});
