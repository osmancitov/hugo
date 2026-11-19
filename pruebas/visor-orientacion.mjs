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

// Guardia del trazado común: un solo controlador y una sola duración para todas las
// gráficas; activos e indicadores pasan por él y cada una aporta solo su dibujo.
test('el trazado animado existe una sola vez y lo usan activos e indicadores', () => {
  assert.match(visor, /function trazadoAnimado\(/);
  assert.equal(visor.match(/requestAnimationFrame\(paso\)/g)?.length, 2); // arranque y cuadro siguiente, dentro de la pieza
  assert.equal(visor.match(/prefers-reduced-motion/g)?.length, 1);
  assert.equal(visor.match(/const DURACION_TRAZADO_MS = 2000;/g)?.length, 1);
  assert.equal(visor.match(/= trazadoAnimado\(caja/g)?.length, 2);
  assert.doesNotMatch(visor, /\/ 2000\)/);
});

test('los dibujos de indicador aceptan trazado parcial (hasta) y no pintan el último valor antes de terminar', () => {
  assert.match(visor, /function graficoIndicador\(ctx, puntos, e, hasta\)/);
  assert.match(visor, /function graficoIndicadorVertical\(ctx, puntos, e, alto, hasta\)/);
  assert.equal(visor.match(/if \(k >= n\)/g)?.length, 2);
});
