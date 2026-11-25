import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { construirSerie } from '../app/modulos/campana-serie.mjs';

const dia = (fin, cl) => ({ carrera: { ventana: { fin } }, clasificados: cl, no_clasificados: [] });
const a = (id, puesto, p, c) => ({ id, puesto, potencia: p, constancia: c });

test('la serie ordena por fecha, deja null donde no hay punto y no inventa valores', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'camp-'));
  fs.writeFileSync(path.join(d, '260801-261029_carrera-90d'), JSON.stringify(dia('2026-10-29', [a('stock:A', 1, 1.5, 1.2)])));
  fs.writeFileSync(path.join(d, '260802-261030_carrera-90d'), JSON.stringify(dia('2026-10-30', [a('stock:A', 2, 1.4, 1.1), a('cripto:B', 1, 0.9, 1.3)])));
  fs.writeFileSync(path.join(d, 'serie_carrera-90d'), '{}'); // la serie previa no cuenta como día
  const s = construirSerie(d);
  assert.deepEqual(s.fechas, ['2026-10-29', '2026-10-30']);
  assert.deepEqual(s.activos['stock:A'], [[1, 1.5, 1.2], [2, 1.4, 1.1]]);
  assert.deepEqual(s.activos['cripto:B'], [null, [1, 0.9, 1.3]]);
  assert.equal(s.ultimo, '260802-261030_carrera-90d');
});
test('el visor tiene el botón Campaña y la ruta #/campana, sin selector de fecha', () => {
  const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(h, /id="mercado-cripto">Criptos<\/a><a href="#\/campana" id="mercado-campana">Campañas<\/a><a href="cuenta\/">Cimiento<\/a>/);
  assert.match(h, /\^#\\\/campana/);
  assert.doesNotMatch(h.slice(h.indexOf('async function vistaCampana'), h.indexOf('async function ruta()')), /<select|type="date"/);
});
test('la diaria registra la Campaña antes de pedir Pages', () => {
  const y = fs.readFileSync(new URL('../.github/workflows/actualizacion-diaria.yml', import.meta.url), 'utf8');
  assert.ok(y.indexOf('node .github/campana-diaria.mjs') > y.indexOf('node .github/actualizacion-diaria.mjs'));
  assert.ok(y.indexOf('node .github/campana-diaria.mjs') < y.indexOf('node .github/publicar-visor.mjs'));
});
test('la carrera ya escrita no se reescribe y las existentes coinciden con su recálculo', async () => {
  const { generarCarreras, nombreCarrera, grupoDe } = await import('../app/modulos/campana-carrera.mjs');
  const r = generarCarreras({ raiz: process.cwd(), hasta: Date.UTC(2026, 9, 29) });
  assert.deepEqual(r.escritos, []); // 29-oct ya existe en registros/categorias
  assert.equal(nombreCarrera(Date.UTC(2026, 9, 29)), '260801-261029_carrera-90d');
  assert.equal(grupoDe(1, 1), 'premium'); assert.equal(grupoDe(1, 0.9), 'potentes'); assert.equal(grupoDe(0.9, 1), 'constantes'); assert.equal(grupoDe(0.99, 0.99), 'rezagados');
});
test('60d y 30d: nombres, primera carrera y serie topada a 90 puntos', async () => {
  const c = await import('../app/modulos/campana-carrera.mjs');
  const { construirSerie, MAX_PUNTOS } = await import('../app/modulos/campana-serie.mjs');
  assert.equal(new Date(c.primeraCarrera(60)).toISOString().slice(0, 10), '2026-09-29');
  assert.equal(new Date(c.primeraCarrera(30)).toISOString().slice(0, 10), '2026-08-30');
  assert.equal(c.nombreCarrera(Date.UTC(2026, 10, 24), 60), '260926-261124_carrera-60d');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'camp-'));
  for (let i = 0; i < 95; i++) { const f = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10); const e = f.slice(2).replace(/-/g, ''); fs.writeFileSync(path.join(d, `${e}-${e}_carrera-30d`), JSON.stringify(dia(f, [a('stock:A', 1, 1, 1)]))); }
  assert.equal(construirSerie(d, 30).fechas.length, MAX_PUNTOS);
  assert.throws(() => construirSerie(d, 60), /Sin archivos de carrera 60d/);
});
test('Campañas: título enlazado a la ficha y columna Tipo sin Detalles', () => {
  const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(h, /tl\.href='#\/a\/'\+id\.split\(':'\)\[0\]\+'\/'\+encodeURIComponent\(cod\)/);
  assert.doesNotMatch(h, /camp-det/);
  assert.match(h, /\^fondo ETF\/i\.test\(t\)\?'Fondo ETF'/);
  assert.match(h, /startsWith\('cripto:'\)\?'Cripto'/);
  assert.doesNotMatch(h, /camp-enlace/);
});

test('Campañas: gráfica de cuatro cuadrantes bajo espaguetis y curvas, con selección compartida', () => {
  const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(h, /function graficaCuadrantes\(caja,u,seleccion,alElegir\)/);
  assert.match(h, /raiz\.append\(ven,t,sub,cEsp,cAct,cCuad,lista\)/);
  assert.match(h, /graficaCuadrantes\(cCuad,u,sel,elegir\)/);
});

test('Campañas: cuadrantes en escala logarítmica y un color por grupo', () => {
  const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(h, /Math\.log2\(c\)-lc\[0\]/);
  assert.match(h, /camp-g-'\+a\.grupo/);
  assert.match(h, /camp-cuad-juntos/); assert.match(h, /activos juntos aqu/);
  assert.match(h, /const lg=v=>Math\.log2/);
});

test('la superficie 3D tiene selectores de grupo y ventana que solo filtran lo dibujado', () => {
  const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(h, /elegirGrupo/); assert.match(h, /elegirVentana/);
  assert.match(h, /montarSuperficie\(zona, lecturas, parsearVista/);
  assert.match(h, /no se retira ningún activo/);
});
