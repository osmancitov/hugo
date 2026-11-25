import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { construirBalance, escribirBalance, archivoBalance } from '../app/modulos/campana-balance.mjs';
import { sufijo } from '../app/modulos/campana-serie.mjs';

const DIA = 86400000, T0 = Date.UTC(2026, 10, 1);
function fixture() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'bal-'));
  const cat = path.join(raiz, 'registros/categorias'); fs.mkdirSync(cat, { recursive: true });
  fs.mkdirSync(path.join(raiz, 'registros/catalogo'), { recursive: true });
  const act = ['AAA', 'BBB', 'CCC'];
  fs.writeFileSync(path.join(raiz, 'registros/catalogo/stock'), JSON.stringify({ activos: act.map((codigo) => ({ codigo, meses: ['2611'] })) }));
  fs.writeFileSync(path.join(raiz, 'registros/catalogo/cripto'), JSON.stringify({ activos: [] }));
  fs.writeFileSync(path.join(cat, `261101-261103${sufijo(3)}`), JSON.stringify({
    carrera: { ventana: { fin: '2026-11-03' } },
    clasificados: [{ id: 'stock:AAA', grupo: 'premium' }, { id: 'stock:BBB', grupo: 'constantes' }, { id: 'stock:CCC', grupo: 'rezagados' }],
  }));
  const velas = { AAA: [[1, 2, 2], [2, 1, 1], [1, 1, 3]], BBB: [[2, 1], [1, 2], null] };
  for (const [c, dias] of Object.entries(velas)) {
    const d = path.join(raiz, 'registros/velas-24h/stock', c); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, `2611_${c}`), JSON.stringify(dias.map((x, i) => x && [T0 + i * DIA, x[0], 0, 0, x[1]]).filter(Boolean)));
  }
  return { raiz, cat };
}

test('balance: cohorte sin Rezagados, sin vela no cuenta, iguales aparte', () => {
  const { raiz, cat } = fixture();
  const b = construirBalance({ raiz, n: 3, salida: cat });
  assert.equal(b.balance.cohorte.total, 2);
  
  assert.equal(b.puntos.length, 3);
  const suma = b.puntos.map((p) => p[1] + p[2] + p[3]);
  assert.deepEqual(suma, [2, 2, 1], 'el día sin vela de BBB baja el denominador');
  assert.equal(b.puntos[0][0], T0);
});

test('escribirBalance guarda el archivo de la ventana', () => {
  const { raiz, cat } = fixture();
  escribirBalance(cat, 3, raiz);
  assert.ok(fs.existsSync(path.join(cat, archivoBalance(3))));
});

test('el visor usa el balance guardado y avisa si todavía no existe', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /balance_carrera-\$\{ndias\}d/);
  assert.match(html, /Todavía no hay balance/);
});

test('Mercado no muestra el subtítulo "conteo diario" bajo Balance diario', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /if \(!\(limpio && e\.iceberg\)\) ficha\.appendChild\(meta\)/);
});

test('Mercado: Balance sin títulos internos ni fuente, cifras con su significado', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /if \(!e\.limpio\) \{/);
  assert.match(html, /'en baja'/); assert.match(html, /'en alta'/); assert.match(html, /sinFuente: Boolean\(en\)/);
});

test('Mercado: nota del Relieve del día = total VIP, desglose y fecha corta', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /activos VIP · \$\{conteoG\} · \$\{df\} \$\{MESES_ES\[mf - 1\]\}/);
});

test('Mercado: cabecera única del activo (matriz dentro de la ficha, sin títulos repetidos ni descarga)', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /ficha\.appendChild\(extra\.matriz\)/);
  assert.match(html, /sinDescarga: Boolean\(en\)/);
  assert.match(html, /cab\.append\(\.\.\.\(limpio\?\[d\]:\[h,d\]\)\)/);
  assert.match(html, /en \? null : e\.codigo/);
});

test('Mercado: sin título "Campaña de N días" ni nota "Trazada en vivo" repetidos', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /raiz\.append\(\.\.\.\(puente\?\[\]:\[t,sub\]\)/);
  assert.match(html, /if \(!en\) pie\.append\(nota\)/);
});
