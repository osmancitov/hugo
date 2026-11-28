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
  assert.equal(visor.match(/= graficaAdaptable\(caja/g)?.length, 1); // solo dentro del graficador común
});

test('las gráficas de indicadores tienen trazado vertical como la radiografía', () => {
  assert.match(visor, /function graficoIndicadorVertical\(/);
  assert.match(visor, /if \(geometria\.vertical\) graficoIndicadorVertical/);
});

// Guardia del trazado común: un solo controlador y una sola duración para todas las
// gráficas; activos e indicadores pasan por él y cada una aporta solo su dibujo.
test('el trazado animado existe una sola vez, dentro del graficador común', () => {
  assert.match(visor, /function trazadoAnimado\(/);
  assert.equal(visor.match(/requestAnimationFrame\(paso\)/g)?.length, 2); // arranque y cuadro siguiente, dentro de la pieza
  assert.equal(visor.match(/prefers-reduced-motion/g)?.length, 1);
  assert.equal(visor.match(/const DURACION_TRAZADO_MS = 1000;/g)?.length, 1);
  // Un mecanismo, dos llamadores: el graficador común y el campo (la bola). Ninguno trae su propio
  // requestAnimationFrame ni su propia duración: los contadores de arriba siguen en 2 y 1.
  assert.equal(visor.match(/=\s*trazadoAnimado\(caja/g)?.length, 2);
  assert.match(visor, /function graficaCampo\([\s\S]*?trazadoAnimado\(caja,\(\)=>100/);
  assert.doesNotMatch(visor, /\/ 1000\)/);
});

test('los dibujos de indicador aceptan trazado parcial (hasta) y no pintan el último valor antes de terminar', () => {
  assert.match(visor, /function graficoIndicador\(ctx, puntos, e, hasta\)/);
  assert.match(visor, /function graficoIndicadorVertical\(ctx, puntos, e, alto, hasta\)/);
  assert.equal(visor.match(/if \(k >= n\)/g)?.length, 5); // índice, iceberg y Fear & Greed junto (Mercado), horizontales y verticales
});

// Guardia del graficador configurable: cada caso entrega datos y solo su desviación
// necesaria; geometría, orientación, trazado, escala y controles salen de lo común.
test('activos e indicadores pasan por el graficador común y heredan sus valores por defecto', () => {
  assert.match(visor, /function graficador\(caja, pie, deCaso\)/);
  assert.match(visor, /const GRAFICADOR_COMUN = \{/);
  assert.equal(visor.match(/= graficador\(caja, pie, \{|^\s+graficador\(caja, pie, \{/gm)?.length, 4); // activo, indicador, Fear & Greed junto y balance del grupo (Triple play)
  // Ningún caso repite la geometría común ni la descarga; los botones Repetir trazado, Escala y Ver todo ya no existen.
  assert.equal(visor.match(/'Repetir trazado'|Escala: ±|'Ver todo'/g)?.length ?? 0, 0);
  assert.equal(visor.match(/'Descargar imagen'/g)?.length, 1);
  assert.equal(visor.match(/toBlob\(/g)?.length, 1);
  assert.equal(visor.match(/ancho: 700, alto: Math\.max\(1400/g)?.length, 1);
});

test('la escala vive en el graficador: los activos la configuran fija en ±5, los indicadores no la tienen', () => {
  assert.equal(visor.match(/escalas: \{/g)?.length, 1);
  assert.match(visor, /valores: \[5\]/);
  assert.equal(visor.match(/limite = limite === 15/g)?.length ?? 0, 0);
});
