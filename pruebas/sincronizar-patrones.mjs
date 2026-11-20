import { fijarPasoCatalogo } from '../app/modulos/sincronizar-registros.mjs';
fijarPasoCatalogo(async () => ({ lineas: [] })); // el paso de catálogo consulta la red; aquí se anula
// node --test pruebas/sincronizar-patrones.mjs. La sincronizacion acepta codigos de 1 letra y
// Unicode en las rutas del registro (la misma forma que CODIGO_OK). Remoto git real por file://, sin red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { conectarCaja } from './caja.mjs';
import { crearRemoto } from './git-remoto.mjs';

const vela = (t) => [t, '1', '2', '1', '2', '10', t + 86400000 - 1, '10', 3, '1', '2', '0'];
const serie = JSON.stringify([vela(Date.UTC(2026, 10, 1)), vela(Date.UTC(2026, 10, 2))]);

test('pasada sube cripto/A, cripto/牛来 y stock/AA en un solo commit; nombres ajenos no entran', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-sync-'));
  const velas = path.join(root, 'velas');
  for (const [clase, codigo] of [['cripto', 'A'], ['cripto', '牛来'], ['stock', 'AA']]) {
    fs.mkdirSync(path.join(velas, clase, codigo), { recursive: true });
    fs.writeFileSync(path.join(velas, clase, codigo, `2611_${codigo}`), serie);
  }
  fs.writeFileSync(path.join(velas, 'cripto', 'A', 'nota.txt'), 'ajeno'); // no es archivo mensual: no entra
  const envAntes = process.env.HUGO_VELAS_DIR;
  process.env.HUGO_VELAS_DIR = velas;
  const rem = crearRemoto();
  try {
    const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
    const ctx = {
      conf: { HUGO_GITHUB: 'osman/repo', HUGO_REPO_SYNC_URL: rem.url, HUGO_REPO_SYNC_DIR: path.join(root, 'clon') },
      app: { client: {} }, botToken: 'x', canal: 'C',
      parada: { n: 0 }, activas: new Map(), leerClave: () => 'token-simulado',
      comando: () => {}, alIniciar: () => {},
    };
    registrar(conectarCaja(ctx));
    const r = await ctx.pasadaSincronizacion();
    assert.ok(r.texto.includes('subí 3'), r.texto);
    const arbol = rem.arbol();
    const rutas = Object.keys(arbol).filter((k) => k.includes('velas-24h')).sort();
    assert.deepEqual(rutas, ['registros/velas-24h/cripto/A/2611_A', 'registros/velas-24h/cripto/牛来/2611_牛来', 'registros/velas-24h/stock/AA/2611_AA'].sort());
    assert.ok(!rutas.some((k) => k.includes('nota.txt')), 'lo ajeno no entra');
    for (const k of rutas) assert.equal(arbol[k], serie, 'contenido intacto en ' + k);
    const subidas = rem.commits().filter((c) => c.includes('Registros de velas:'));
    assert.equal(subidas.length, 1, 'un solo commit de subida: ' + rem.commits().join(' | '));
    assert.ok(subidas[0].includes('<osmanvielma@gmail.com>'), 'autor y committer con el correo del usuario');
  } finally {
    if (envAntes === undefined) delete process.env.HUGO_VELAS_DIR; else process.env.HUGO_VELAS_DIR = envAntes;
    rem.destruir();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('un fallo de git muestra su detalle (stderr) y oculta el token', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-syncerr-'));
  const velas = path.join(root, 'velas');
  fs.mkdirSync(velas, { recursive: true });
  const envAntes = process.env.HUGO_VELAS_DIR;
  process.env.HUGO_VELAS_DIR = velas;
  try {
    const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
    const ctx = {
      conf: { HUGO_GITHUB: 'osman/repo', HUGO_REPO_SYNC_URL: 'file:///no/existe-token-simulado/repo.git', HUGO_REPO_SYNC_DIR: path.join(root, 'clon') },
      app: { client: {} }, botToken: 'x', canal: 'C',
      parada: { n: 0 }, activas: new Map(), leerClave: () => 'token-simulado',
      comando: () => {}, alIniciar: () => {},
    };
    registrar(conectarCaja(ctx));
    const r = await ctx.pasadaSincronizacion();
    assert.ok(r.error.includes('No pude comparar con GitHub'), r.error);
    assert.ok(r.error.includes('Detalle git:'), 'el aviso trae el stderr de git: ' + r.error);
    const detalle = r.error.split('Detalle git:')[1];
    assert.ok(!detalle.includes('token-simulado'), 'el detalle no filtra el token: ' + detalle);
    assert.ok(detalle.includes('***'), 'el token aparece redactado: ' + detalle);
  } finally {
    if (envAntes === undefined) delete process.env.HUGO_VELAS_DIR; else process.env.HUGO_VELAS_DIR = envAntes;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
