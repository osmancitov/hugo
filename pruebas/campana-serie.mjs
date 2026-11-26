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
test('el visor conserva las rutas de Campaña, Stocks, Cripto y Buscar aunque no aparezcan como botones de entrada',()=>{
 const h=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(h,/\^#\\\/campana/);
 assert.match(h,/const r=hash\.match\(\/\^#\\\/\(stock\|cripto\)/);
 assert.ok(h.includes("const esBusqueda=hash==='#/buscar'"));
 assert.ok(h.indexOf('id="portada-observatorio"') < h.indexOf('id="reloj-entrada"') && h.indexOf('id="reloj-entrada"') < h.indexOf('<nav class="mercados"'));
 assert.match(h,/id="busqueda-global" hidden/);
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
  // Regla: campaña = raiz((P²+C²)/2); campaña < 1 es rezagado; desde 1, premium con P y C >= 1, potentes solo P, constantes solo C.
  assert.equal(grupoDe(1, 1), 'premium'); assert.equal(grupoDe(0.99, 0.99), 'rezagados'); assert.equal(grupoDe(1.01, 1.01), 'premium'); assert.equal(grupoDe(1, 0.9), 'rezagados'); assert.equal(grupoDe(1.5, 0.9), 'potentes'); assert.equal(grupoDe(0.9, 1.5), 'constantes'); assert.equal(grupoDe(0.99, 0.99), 'rezagados');
  assert.equal(grupoDe(1.4, 1.4), 'premium'); assert.equal(grupoDe(2, 0.1), 'potentes'); assert.equal(grupoDe(0.5, 1.5), 'constantes');
  // Los archivos guardan P y C a 4 decimales, pero el grupo se decide con los valores sin redondear: el guardado no puede
  // reproducir el grupo en el borde. Se comprueba contra el cálculo desde las velas (lo publicado coincide con él).
  assert.equal(grupoDe(1.08, 0.913), 'rezagados'); assert.equal(grupoDe(1.08004, 0.91304), 'potentes'); // Campaña 0,99999 y 1,00004
  assert.equal(grupoDe(0.99996, 1.4), 'constantes'); // 0,99996 se guarda como 1 y no por eso es premium
  assert.equal(grupoDe(1, 1), 'premium'); assert.equal(grupoDe(1, 0.9999), 'rezagados');
  const dir = path.join(process.cwd(), 'registros', 'categorias');
  const ventanas = [30, 60, 90], nombres = (n) => fs.readdirSync(dir).filter((f) => new RegExp(`^\\d{6}-\\d{6}_carrera-${n}d$`).test(f));
  for (const n of ventanas) {
    const pub = nombres(n), fin = Math.max(...pub.map((f) => Date.UTC(2000 + +f.slice(7, 9), +f.slice(9, 11) - 1, +f.slice(11, 13))));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'camp-regen-'));
    generarCarreras({ raiz: process.cwd(), hasta: fin, ventana: n, salida: tmp });
    for (const f of pub) {
      const reg = new Map(JSON.parse(fs.readFileSync(path.join(tmp, f), 'utf8')).clasificados.map((x) => [x.id, x.grupo]));
      const guardado = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).clasificados;
      assert.equal(guardado.length, reg.size, f);
      for (const x of guardado) assert.equal(x.grupo, reg.get(x.id), `${f} ${x.id}`);
    }
  }
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

test('Campañas: el campo de béisbol va bajo espaguetis y curvas, con selección compartida', () => {
  const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(h, /function graficaCampo\(caja,u,seleccion,alElegir,limpio=false,g2=null\)/);
  assert.match(h, /raiz\.append\(\.\.\.\(puente\?\[\]:\[t,sub\]\),cCuad,\.\.\.\(puente\?\[cAct\]:\[\]\),cEsp,\.\.\.\(puente&&puente\.cVar\?\[puente\.cVar\]:\[\]\),\.\.\.\(puente&&puente\.listaEn\?\[\]:\[lista\]\)\)/);
  assert.match(h, /graficaCampo\(cCuad,u,sel,elegir,Boolean\(puente\),g2\)/);
  assert.doesNotMatch(h, /graficaCuadrantes/);
});

test('Campañas: campo con radio logarítmico solo en r desde 0,1, un color por grupo y lista única coloreada', () => {
  const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(h, /R0=0\.1,rho=r=>Math\.log2\(r\/R0\)/);
  assert.match(h, /camp-g-'\+a\.grupo/);
  assert.match(h, /camp-n-'\+a\.grupo/);
  assert.match(h, /\['cod','Código'\],\['nom','Nombre'\],\['tipo','Tipo'\],\['cap','Campaña'\]/);
  assert.doesNotMatch(h, /textContent=`Campaña \$\{fmtCoef\(campana\(a\)\)\}`/);
  assert.doesNotMatch(h, /camp-grupo|createElement\('details'\)/);
  assert.match(h, /tx\('Premium',pol\(RMAX\*\.9,0\)/);
  assert.doesNotMatch(h, /y2:pol\(RMAX,0\)\[1\],class:'camp-uno'/); // sin guía central punteada en el campo
  assert.ok(!h.includes('Home es solo la salida de la pelota'));
});

test('la superficie 3D tiene selectores de grupo y ventana que solo filtran lo dibujado', () => {
  const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(h, /elegirGrupo/); assert.match(h, /elegirVentana/);
  assert.match(h, /montarSuperficie\(zona, lecturas, parsearVista/);
  assert.match(h, /no se retira ningún activo/);
});

test('Campañas: el activo elegido se identifica junto a los cuadrantes y se dice jornadas, no carreras', () => {
  const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(h, /camp-cuad-nombre/);
  assert.ok(!h.includes("'Cuatro cuadrantes'"));
  assert.ok(!/carreras con la ventana|Carreras en horizontal|en cada carrera/.test(h));
  assert.match(h, /jornadas`/);
  assert.ok(!h.includes('jornadas · escala logarítmica'));
});

test('Campañas: el botón solo muestra los tres botones de ventana; la campaña se abre al elegir', () => {
  const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(h, /\(90\|60\|30\)d/);
  assert.match(h, /if\(!mc\[1\]\)\{app\.replaceChildren\(\);return;\}/);
  assert.ok(!h.includes('Number(mc[1]||90)'));
});
