// node --test pruebas/visor-orientacion.mjs. Guardia de la modularidad de presentación
// (decisión del usuario, 19-nov-2026: las gráficas de indicadores giran en pantallas
// verticales «igual que las otras», con la misma pieza común, no con otra implementación).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const visor = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('la regla de orientación y reajuste existe una sola vez y la usan todas las vistas', () => {
  assert.match(visor, /function graficaAdaptable\(/);
  // La regla se escribe una vez: un solo matchMedia de orientación y un solo ResizeObserver.
  assert.equal(visor.match(/matchMedia\('\(orientation: portrait\)'\)/g)?.length, 1);
  assert.equal(visor.match(/new ResizeObserver/g)?.length, 1);
  // La vista de activo y la vista de indicador pasan por la pieza común.
  assert.equal(visor.match(/= graficaAdaptable\(caja/g)?.length, 2);
});

test('las gráficas de indicadores tienen trazado vertical como la radiografía', () => {
  assert.match(visor, /function graficoIndicadorVertical\(/);
  assert.match(visor, /if \(geometria\.vertical\) graficoIndicadorVertical/);
});
