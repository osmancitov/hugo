// node --test pruebas/reportes-legibles.mjs. Reportes ordenados (preferencia del usuario,
// 20-nov-2026): un dato por línea, sin enumeraciones de datos separadas por comas o punto y coma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const leer = (f) => fs.readFileSync(new URL(`../app/modulos/${f}`, import.meta.url), 'utf8');

test('el resumen del registro va un dato por línea', () => {
  const s = leer('registro-motor.mjs');
  assert.match(s, /join\('\\n'\)/, 'resumen une con saltos de línea');
  assert.ok(!s.includes('activos terminados; '), 'sin cifras amontonadas con punto y coma');
});

test('la propuesta de actualización lista un archivo por línea', () => {
  const s = leer('github.mjs');
  assert.ok(s.includes('\\nCambia:\\n${resumenDe(dif)}'), 'Cambia: va en su línea y la lista debajo');
  assert.ok(!s.includes(".join(', ')"), 'sin lista de archivos con comas');
});

test('las listas de trabajo en curso y la pregunta de borrado van por líneas', () => {
  for (const [f, marca] of [['detener.mjs', 'Estoy haciendo:\\n'], ['reiniciar.mjs', 'Estoy haciendo:\\n'], ['confirmacion.mjs', 'Ojo: ahora estoy en:\\n'], ['borrar-hilo.mjs', "partes.join('\\n')"]]) {
    assert.ok(leer(f).includes(marca), `${f} mantiene su lista por líneas`);
  }
  for (const f of ['detener.mjs', 'reiniciar.mjs', 'confirmacion.mjs']) {
    assert.ok(!leer(f).includes(".join('; ')"), `${f} aún amontona con punto y coma`);
  }
});

test('estado lista trabajos y esperas por líneas', () => {
  const s = leer('estado.mjs');
  assert.ok(s.includes('Estoy trabajando en:\\n'), 'trabajos por líneas');
  assert.ok(s.includes('para:\\n'), 'esperas por líneas');
});
