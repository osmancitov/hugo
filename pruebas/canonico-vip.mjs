// node --test pruebas/canonico-vip.mjs. Registro VIP horario (relanzado el 25-nov-2026; desde el 27-nov-2026 el universo es el VIP núcleo, antes la unión VIP 30/60/90),
// sin Rezagados, canónico del día cerrado de 25 puntos (00:00 a 24:00 UTC) desde cero, que no toca nunca los archivos vivos,
// es idempotente, no rellena lo que no tiene vela, y no choca con la lectura horaria (carrera diaria/horaria).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { vipAdmitidos, construirCanonico, rutaCanonico } from '../app/modulos/completar-vip.mjs';
import { leerCanonico } from '../app/modulos/canonico-lectura.mjs';
import { generarBarra, leerBarra } from '../app/modulos/barra-movil.mjs';

const H = 3600000, D = 24 * H, DIA = '2026-11-25', T0 = Date.parse(DIA);
const AHORA = T0 + D + 30 * 60000; // 00:30 UTC del 26: el día 25 ya cerró
const escribir = (r, c) => { fs.mkdirSync(path.dirname(r), { recursive: true }); fs.writeFileSync(r, typeof c === 'string' ? c : JSON.stringify(c)); };
function fixture({ rezagadoStock = 'SLOW', noVigente = 'GONE' } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'vip-'));
  escribir(path.join(raiz, 'catalogo/stock'), { mercado: 'stock', activos: ['AAA', 'BBB', rezagadoStock].map((codigo) => ({ codigo })) });
  escribir(path.join(raiz, 'catalogo/cripto'), { mercado: 'cripto', activos: ['XXX', 'YYY'].map((codigo) => ({ codigo })) });
  const clas = (ids, rez = []) => ({ clasificados: [...ids.map((id) => ({ id, grupo: 'premium' })), ...rez.map((id) => ({ id, grupo: 'rezagados' }))] });
  escribir(path.join(raiz, 'categorias/260101-261125_carrera-30d'), clas(['stock:AAA', 'cripto:XXX'], ['stock:' + rezagadoStock]));
  escribir(path.join(raiz, 'categorias/260101-261125_carrera-60d'), clas(['stock:BBB', `stock:${noVigente}`]));
  escribir(path.join(raiz, 'categorias/260101-261125_carrera-90d'), clas(['cripto:YYY', 'stock:AAA']));
  for (const [m, c] of [['stock', 'AAA'], ['stock', 'BBB'], ['cripto', 'XXX'], ['cripto', 'YYY']]) escribir(path.join(raiz, `velas-24h/${m}/${c}/2611_${c}`), [[T0 - D, '1', '2', '0.5', '1.5', '0'], [T0, '1', '2', '0.5', '1.6', '0']]);
  return raiz;
}
// Binance falso: vela de 1 h con precio determinista por activo y hora; `sin` omite horas de un símbolo.
const klines = ({ sin = {}, antes = () => {} } = {}) => async (url) => {
  antes(url);
  const u = new URL(url), sym = u.searchParams.get('symbol'), a = Number(u.searchParams.get('startTime')), b = Number(u.searchParams.get('endTime'));
  const base = 1 + (sym.charCodeAt(0) % 7);
  const filas = [];
  const paso = u.searchParams.get('interval') === '15m' ? H / 4 : H;
  for (let t = a; t <= b; t += paso) if (!(sin[sym] || []).includes(t)) filas.push([t, String(base + ((t / H) % 24) / 100), '0', '0', '0', '0']);
  return { ok: true, json: async () => filas };
};

test('vipAdmitidos: el VIP núcleo 54 campañas por mercado; sin núcleo lanza, sin unión antigua', () => {
  const raiz = fixture();
  assert.throws(() => vipAdmitidos(raiz, AHORA), /No hay núcleo/);
  const reg = (mercado, nucleo) => escribir(path.join(raiz, `nucleo/${mercado}/actual_nucleo`), { version: 1, mercado, cierre: DIA, generado: 'x', regla: { minimo: 41, total: 54 }, nucleo, activos: nucleo.map((codigo) => ({ codigo, apariciones: 54 })) });
  reg('stock', ['AAA', 'SLOW']); reg('cripto', ['YYY']);
  const v = vipAdmitidos(raiz, AHORA);
  assert.deepEqual(v.stock, ['AAA', 'SLOW']); // SLOW es Rezagado a 30 días pero está en el núcleo
  assert.deepEqual(v.cripto, ['YYY']);
});

test('construirCanonico: 97 puntos (15 min) 00:00 a 24:00 UTC, todos los VIP, validable', async () => {
  const raiz = fixture();
  const r = await construirCanonico({ raiz, mercado: 'stock', dia: DIA, vip: ['AAA', 'BBB'], ahora: AHORA, fetchImpl: klines() });
  assert.equal(r.estado, 'creado'); assert.equal(r.puntos, 97); assert.deepEqual(r.sinVela, []);
  const j = leerCanonico(fs.readFileSync(rutaCanonico(raiz, 'stock', DIA), 'utf8'), DIA);
  assert.equal(j.lecturas.length, 97); assert.equal(j.ritmo_min, 15);
  assert.equal(j.lecturas[0].generada, '2026-11-25T00:00:00.000Z');
  assert.equal(j.lecturas[96].generada, '2026-11-26T00:00:00.000Z');
  for (const l of j.lecturas) assert.equal(leerBarra(l.texto).activos.size, 2);
  const b = leerBarra(j.lecturas[12].texto);
  assert.equal(b.activos.get('AAA').dia_cierre, '1.5'); // cierre de la vela diaria del día anterior
  assert.match(j.lecturas[12].texto, /^# Origen tecnico: registro canonico/m); // trazabilidad técnica
});

test('un activo sin vela queda sin dato en esa hora: no se rellena ni se inventa', async () => {
  const raiz = fixture();
  const sym = 'AAABUSDT';
  const r = await construirCanonico({ raiz, mercado: 'stock', dia: DIA, vip: ['AAA', 'BBB'], ahora: AHORA, fetchImpl: klines({ sin: { [sym]: [T0 + 5 * H] } }) });
  assert.deepEqual(r.sinVela, ['AAA@05:00']);
  const j = JSON.parse(fs.readFileSync(rutaCanonico(raiz, 'stock', DIA), 'utf8'));
  assert.equal(leerBarra(j.lecturas[20].texto).activos.has('AAA'), false);
  assert.equal(leerBarra(j.lecturas[20].texto).activos.has('BBB'), true);
  assert.equal(leerBarra(j.lecturas[21].texto).activos.has('AAA'), true);
});

test('no se construye un día que no ha cerrado, ni con VIP vacío; un canónico existente no se reescribe', async () => {
  const raiz = fixture();
  await assert.rejects(() => construirCanonico({ raiz, mercado: 'stock', dia: DIA, vip: ['AAA'], ahora: T0 + D + 60000, fetchImpl: klines() }), /no está cerrado/);
  await assert.rejects(() => construirCanonico({ raiz, mercado: 'stock', dia: DIA, vip: [], ahora: AHORA, fetchImpl: klines() }), /No hay VIP/);
  await construirCanonico({ raiz, mercado: 'stock', dia: DIA, vip: ['AAA'], ahora: AHORA, fetchImpl: klines() });
  const antes = fs.readFileSync(rutaCanonico(raiz, 'stock', DIA), 'utf8');
  let consultas = 0;
  const r = await construirCanonico({ raiz, mercado: 'stock', dia: DIA, vip: ['AAA', 'BBB'], ahora: AHORA + H, fetchImpl: klines({ antes: () => consultas++ }) });
  assert.equal(r.estado, 'existe'); assert.equal(consultas, 0);
  assert.equal(fs.readFileSync(rutaCanonico(raiz, 'stock', DIA), 'utf8'), antes);
});

test('CARRERA diaria/horaria: la reconstrucción no toca los vivos aunque la lectura horaria escriba a mitad de la construcción', async () => {
  const raiz = fixture();
  const vivoDia = path.join(raiz, 'intradia/cripto', '2026-11-26.json'), vivoIdx = path.join(raiz, 'intradia/cripto/indice.json');
  const vivoTomado = '{"version":1,"dia":"2026-11-26","lecturas":[{"generada":"2026-11-26T00:00:16.000Z","texto":"# lectura real tomada"}]}\n';
  const idx = '{"version":1,"dias":["2026-11-26"],"ultima":"2026-11-26T00:00:16.000Z"}\n';
  escribir(vivoDia, vivoTomado); escribir(vivoIdx, idx);
  let n = 0;
  // A mitad de la construcción la lectura horaria publica una lectura nueva de su día (otro archivo y otro índice).
  const nueva = '{"version":1,"dia":"2026-11-26","lecturas":[{"generada":"2026-11-26T00:00:16.000Z","texto":"# lectura real tomada"},{"generada":"2026-11-26T01:00:03.000Z","texto":"# lectura real 01"}]}\n';
  const f = klines({ antes: () => { if (++n === 2) escribir(vivoDia, nueva); } });
  const r = await construirCanonico({ raiz, mercado: 'cripto', dia: DIA, vip: ['XXX', 'YYY'], ahora: AHORA, fetchImpl: f });
  assert.equal(r.estado, 'creado');
  assert.equal(fs.readFileSync(vivoDia, 'utf8'), nueva); // la lectura tomada se conserva, intacta
  assert.equal(fs.readFileSync(vivoIdx, 'utf8'), idx);
  // Dos corridas seguidas (reintento del cierre) no cambian nada.
  const c1 = fs.readFileSync(rutaCanonico(raiz, 'cripto', DIA), 'utf8');
  await construirCanonico({ raiz, mercado: 'cripto', dia: DIA, vip: ['XXX', 'YYY'], ahora: AHORA + 5 * H, fetchImpl: f });
  assert.equal(fs.readFileSync(rutaCanonico(raiz, 'cripto', DIA), 'utf8'), c1);
});

test('CARRERA en git: cierre diario y lectura horaria publican a la vez sin chocar y sin perder la lectura tomada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'race-'));
  const g = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g(dir, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  const A = path.join(dir, 'a'), B = path.join(dir, 'b');
  g(dir, 'clone', '-q', 'origin.git', 'a'); g(A, 'checkout', '-q', '-b', 'main');
  escribir(path.join(A, 'registros/intradia/cripto/2026-11-26.json'), '{"version":1,"lecturas":["una sola linea"]}\n');
  g(A, 'add', '-A'); g(A, 'commit', '-qm', 'base'); g(A, 'push', '-q', 'origin', 'main');
  g(dir, 'clone', '-q', 'origin.git', 'b');
  // B (cierre diario) prepara su canónico; A (lectura horaria) publica primero la lectura tomada en la misma línea JSON.
  escribir(path.join(B, 'registros/intradia/cripto/canonico/2026-11-25.json'), '{"canonico":true}\n');
  g(B, 'add', '-A'); g(B, 'commit', '-qm', 'canonico');
  escribir(path.join(A, 'registros/intradia/cripto/2026-11-26.json'), '{"version":1,"lecturas":["una sola linea","lectura tomada 01:00"]}\n');
  g(A, 'add', '-A'); g(A, 'commit', '-qm', 'hora'); g(A, 'push', '-q', 'origin', 'main');
  assert.throws(() => g(B, 'push', '-q', 'origin', 'HEAD:main')); // rechazado: la punta se movió
  g(B, 'fetch', '-q', 'origin', 'main'); g(B, 'rebase', 'origin/main'); g(B, 'push', '-q', 'origin', 'HEAD:main'); // el reintento no choca: archivos distintos
  const vivo = fs.readFileSync(path.join(B, 'registros/intradia/cripto/2026-11-26.json'), 'utf8');
  assert.match(vivo, /lectura tomada 01:00/);
  assert.ok(fs.existsSync(path.join(B, 'registros/intradia/cripto/canonico/2026-11-25.json')));
});

test('lectura horaria de stocks: con universo VIP solo lee los VIP, y compara con una lectura previa más ancha sin perder valores', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hor-'));
  const velas = path.join(dir, 'velas-24h');
  for (const c of ['AAA', 'BBB', 'CCC']) escribir(path.join(velas, 'stock', c, `2611_${c}`), [[T0 - D, '1', '2', '0.5', '1.5', '0']]);
  escribir(path.join(dir, 'catalogo/stock'), { mercado: 'stock', activos: ['AAA', 'BBB', 'CCC'].map((codigo) => ({ codigo })) });
  const pedidos = [];
  const tk = async (url) => {
    const lista = JSON.parse(new URL(url).searchParams.get('symbols'));
    pedidos.push(...lista);
    return { ok: true, text: async () => JSON.stringify(lista.map((s) => ({ symbol: s, openPrice: '1', lastPrice: '1.1', openTime: AHORA - D, closeTime: AHORA }))) };
  };
  const ancha = await generarBarra({ dirVelas: velas, fetchImpl: tk, ahora: AHORA });
  pedidos.length = 0;
  const vip = await generarBarra({ dirVelas: velas, fetchImpl: tk, ahora: AHORA + H, anteriorTexto: ancha.texto, inicialTexto: ancha.texto, universo: ['AAA'] });
  assert.deepEqual(pedidos.map((s) => s.replace('BUSDT', '')).sort(), ['AAA']);
  assert.equal(leerBarra(vip.texto).activos.size, 1);
  assert.equal(leerBarra(ancha.texto).activos.size, 3);
});

test('canónico heredado de 25 puntos (ritmo ausente = 60) sigue siendo válido y ritmo 60 reconstruye 25', async () => {
  const raiz = fixture();
  const r = await construirCanonico({ raiz, mercado: 'stock', dia: DIA, vip: ['AAA', 'BBB'], ahora: AHORA, fetchImpl: klines(), ritmo: 60 });
  assert.equal(r.puntos, 25);
  const j = leerCanonico(fs.readFileSync(rutaCanonico(raiz, 'stock', DIA), 'utf8'), DIA);
  assert.equal(j.lecturas.length, 25);
});
