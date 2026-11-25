// node --test pruebas/sincronizar-resumen.mjs. El informe de la pasada es un resumen breve y
// ordenado (decisión del usuario, 20-nov-2026): solo lo que cambió y los problemas. Los «igual»
// callan; un pre-cálculo o catálogo escrito pero idéntico al remoto no se anuncia; los problemas
// van en su propia sección. Remoto git real por file://, sin red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { conectarCaja } from './caja.mjs';
import { crearRemoto } from './git-remoto.mjs';
import { fijarPasoIndicador, fijarPasoPreCalculo, fijarPasoCatalogo, fijarPasoInventario } from '../app/modulos/sincronizar-registros.mjs';

const vela = (t) => [t, '1', '2', '1', '2', '10', t + 86400000 - 1, '10', 3, '1', '2', '0'];
const serie = JSON.stringify([vela(Date.UTC(2026, 10, 1)), vela(Date.UTC(2026, 10, 2))]);

async function banco({ locales = {}, remotos = {}, pre = { lineas: [] }, cat = { lineas: [] } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-resumen-'));
  const velas = path.join(root, 'velas');
  fs.mkdirSync(velas, { recursive: true });
  for (const [rel, contenido] of Object.entries(locales)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, contenido);
  }
  const envAntes = process.env.HUGO_VELAS_DIR;
  process.env.HUGO_VELAS_DIR = velas;
  const rem = crearRemoto(remotos);
  fijarPasoIndicador(async () => ({ series: [] }));
  fijarPasoPreCalculo(async () => pre);
  fijarPasoCatalogo(async () => cat);
  fijarPasoInventario(async () => ({ lineas: [] })); // el inventario tiene sus propias pruebas
  const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
  const ctx = {
    conf: { HUGO_GITHUB: 'osman/repo', HUGO_REPO_SYNC_URL: rem.url, HUGO_REPO_SYNC_DIR: path.join(root, 'clon') },
    app: { client: {} }, botToken: 'x', canal: 'C',
    parada: { n: 0 }, activas: new Map(), leerClave: () => 'token-simulado',
    comando: () => {}, alIniciar: () => {},
  };
  registrar(conectarCaja(ctx));
  return {
    ctx, rem,
    async fin() {
      if (envAntes === undefined) delete process.env.HUGO_VELAS_DIR; else process.env.HUGO_VELAS_DIR = envAntes;
      rem.destruir();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test('sin cambios: una línea; los «igual» de pre-cálculos y catálogo callan', async () => {
  const b = await banco({
    locales: { 'velas/cripto/A/2611_A': serie },
    remotos: { 'registros/velas-24h/cripto/A/2611_A': serie },
    pre: { lineas: [{ calculo: 'lectura-dia-90d', mercado: 'stock', periodo: '260822-261119', estado: 'igual', archivo: 'pre-calculado/stock/lectura-dia-90d/260822-261119_lectura-dia' }] },
    cat: { lineas: [{ calculo: 'catalogo', mercado: 'stock', periodo: '113 activos', estado: 'igual' }] },
  });
  try {
    const r = await b.ctx.correrPasada();
    assert.equal(r.texto, 'Registros al día: 1 archivos iguales, sin cambios.');
    assert.equal(r.hayPendiente, false);
  } finally { await b.fin(); }
});

const lectura = JSON.stringify({ corte: Date.UTC(2026, 10, 19), ventana: { cantidad: 90, unidad: 'd', inicio: Date.UTC(2026, 7, 22), fin: Date.UTC(2026, 10, 19) }, activos: {} }) + '\n';
const catalogo = JSON.stringify({ mercado: 'stock', generado: '2026-11-20', activos: [{ codigo: 'A', nombre: 'A SA', meses: ['2611'] }] }, null, 1) + '\n';

test('con cambios: subida con commit y lista ordenada de lo que cambió', async () => {
  const b = await banco({
    locales: {
      'velas/cripto/A/2611_A': serie,
      'pre-calculado/stock/lectura-dia-90d/261119_lectura-dia': lectura,
      'catalogo/stock': catalogo,
    },
    pre: { lineas: [{ calculo: 'lectura-dia-90d', mercado: 'stock', periodo: '260822-261119', estado: 'escrito', archivo: 'pre-calculado/stock/lectura-dia-90d/261119_lectura-dia' }] },
    cat: { lineas: [{ calculo: 'catalogo', mercado: 'stock', periodo: '113 activos', estado: 'escrito' }] },
  });
  try {
    const r = await b.ctx.correrPasada();
    assert.match(r.texto, /^Sincronización lista en [\d.,]+ s: subí 3 archivo\(s\) en el commit [0-9a-f]{7}\./);
    assert.ok(r.texto.includes('\nCambios:\n· pre-cálculo lectura-dia-90d stock 260822-261119.\n· catálogo stock (113 activos).\n· velas cripto: 1 archivo(s).'), r.texto);
    assert.ok(!/Problemas/.test(r.texto));
    assert.equal(b.rem.arbol()['registros/catalogo/stock'], catalogo, 'el catálogo sube (el local gana)');
    assert.equal(b.rem.arbol()['registros/pre-calculado/stock/lectura-dia-90d/261119_lectura-dia'], lectura, 'el pre-cálculo sube');
    const subidas = b.rem.commits().filter((c) => c.includes('Registros de velas:'));
    assert.equal(subidas.length, 1, 'un solo commit');
  } finally { await b.fin(); }
});

test('escrito pero idéntico al remoto: no se anuncia como cambio', async () => {
  const b = await banco({
    locales: { 'pre-calculado/stock/lectura-dia-90d/261119_lectura-dia': lectura },
    remotos: { 'registros/pre-calculado/stock/lectura-dia-90d/261119_lectura-dia': lectura },
    pre: { lineas: [{ calculo: 'lectura-dia-90d', mercado: 'stock', periodo: '260822-261119', estado: 'escrito', archivo: 'pre-calculado/stock/lectura-dia-90d/261119_lectura-dia' }] },
  });
  try {
    const r = await b.ctx.correrPasada();
    assert.equal(r.texto, 'Registros al día: 1 archivos iguales, sin cambios.');
  } finally { await b.fin(); }
});

test('problemas: sección aparte con cada fallo; faltantes de información curada visibles', async () => {
  const b = await banco({
    locales: { 'velas/cripto/A/2611_A': serie },
    remotos: { 'registros/velas-24h/cripto/A/2611_A': serie },
    pre: { lineas: [{ calculo: 'iceberg-90d', mercado: 'stock', estado: 'error', error: 'boom', archivo: 'pre-calculado/stock/iceberg-90d' }] },
    cat: { lineas: [{ calculo: 'catalogo', mercado: 'stock', periodo: '113 activos', estado: 'igual', sinInfo: ['XETA'], aviso: 'lista de productos sin consultar (HTTP 451); nombres solo curados' }] },
  });
  try {
    const r = await b.ctx.correrPasada();
    assert.equal(r.hayPendiente, true);
    assert.ok(r.texto.startsWith('Registros al día: 1 archivos iguales, sin cambios.\nProblemas:\n'), r.texto);
    assert.ok(r.texto.includes('· pre-cálculo iceberg-90d stock sin hacer (boom); sigo con las velas.'), r.texto);
    assert.ok(r.texto.includes('· catálogo stock: falta información curada de XETA.'), r.texto);
    assert.ok(r.texto.includes('· catálogo stock: lista de productos sin consultar (HTTP 451); nombres solo curados.'), r.texto);
  } finally { await b.fin(); }
});

test('conflicto: problema visible, nada se pisa', async () => {
  const otra = JSON.stringify([vela(Date.UTC(2026, 10, 3))]);
  const b = await banco({
    locales: { 'velas/cripto/A/2611_A': serie },
    remotos: { 'registros/velas-24h/cripto/A/2611_A': otra },
  });
  try {
    const r = await b.ctx.correrPasada();
    assert.ok(r.texto.includes('· conflicto sin tocar (mismo mes, contenido distinto):'), r.texto);
    assert.equal(b.rem.arbol()['registros/velas-24h/cripto/A/2611_A'], otra, 'el remoto intacto');
  } finally { await b.fin(); }
});
