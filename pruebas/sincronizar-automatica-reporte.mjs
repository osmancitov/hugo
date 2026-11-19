// node --test pruebas/sincronizar-automatica-reporte.mjs. La pasada automatica anuncia
// «comprobando GitHub» antes de empezar, edita ese reporte con el avance, lo renueva mas o menos
// cada minuto, muestra tiempo restante aproximado cuando el ritmo permite estimarlo y cierra con
// el resultado, aunque no haya nada que copiar (decision del usuario, 18-nov-2026).
// Remoto git real por file:// (sin red) y Slack simulado; el reloj es falso y avanza con cada
// llamada a Slack, como si cada tramo de la pasada tomara unos segundos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { conectarCaja } from './caja.mjs';
import { crearRemoto } from './git-remoto.mjs';
import { fijarPasoIndicador } from '../app/modulos/sincronizar-registros.mjs';
// Estas pruebas miden el reporte de la pasada, no los indicadores: paso anulado, sin red.
fijarPasoIndicador(async () => ({ nuevos: 0, dias: [], archivos: [] }));

const vela = (t) => [t, '1', '2', '1', '2', '10', t + 86400000 - 1, '10', 3, '1', '2', '0'];
const serie = JSON.stringify([vela(Date.UTC(2026, 10, 1)), vela(Date.UTC(2026, 10, 2))]);

function bancoDePruebas(archivos) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-sync-auto-'));
  const velas = path.join(root, 'velas');
  for (const [clase, codigo] of archivos) {
    fs.mkdirSync(path.join(velas, clase, codigo), { recursive: true });
    fs.writeFileSync(path.join(velas, clase, codigo, `2611_${codigo}`), serie);
  }
  const rem = crearRemoto();
  const llamadas = [];
  let ahora = Date.UTC(2026, 10, 16, 12, 0, 0);
  const slack = { chat: {
    postMessage: async (m) => { llamadas.push({ tipo: 'post', ...m }); const ts = 'msg' + llamadas.length; llamadas[llamadas.length - 1].tsAsignado = ts; return { ts }; },
    update: async (m) => { llamadas.push({ tipo: 'update', ...m }); },
  } };
  const originalAhora = Date.now;
  Date.now = () => ahora;
  const ctx = conectarCaja({
    conf: { HUGO_GITHUB: 'osman/repo', HUGO_VELAS_DIR: velas, HUGO_REPO_SYNC_URL: rem.url, HUGO_REPO_SYNC_DIR: path.join(root, 'clon') }, app: { client: slack }, botToken: 'x', canal: 'avisos',
    activas: new Map(), parada: () => false, alIniciar: () => {}, comando: () => {}, leerClave: () => 'xoxb-simulado',
  });
  // Cada avance de la pasada toma un rato de trabajo: el reloj falso avanza con cada progreso
  // reportado, aunque la edicion en Slack quede estrangulada por la cadencia del reporte.
  const crearSyncOriginal = ctx.reporte.crearSync;
  ctx.reporte.crearSync = async (o) => {
    const r = await crearSyncOriginal(o);
    const p = r.progreso.bind(r);
    r.progreso = async (t) => { ahora += 30000; return p(t); };
    return r;
  };
  return {
    llamadas,
    rem,
    avanzar: (ms) => { ahora += ms; },
    ctx,
    restaurar: () => {
      Date.now = originalAhora;
      rem.destruir();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test('automatica: un mensaje editado por minuto con estimacion y cierre con el resultado', async () => {
  const archivos = Array.from({ length: 12 }, (_, i) => ['cripto', 'A' + i]);
  const b = bancoDePruebas(archivos);
  try {
    const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
    registrar(b.ctx);
    // 12 archivos por subir; el reloj falso avanza con cada llamada a la API (30 s por blob).
    await b.ctx.automaticaSincronizacion();
    const posts = b.llamadas.filter((l) => l.tipo === 'post');
    const updates = b.llamadas.filter((l) => l.tipo === 'update');
    // Ni un mensaje por archivo ni uno solo editado toda la pasada: ~1 por minuto con 12 avances de 30 s.
    assert.ok(posts.length >= 4 && posts.length <= 9, `mensajes abiertos: ${posts.length}`);
    // El primer mensaje avisa en el canal que empieza la pasada; los avances son respuestas en su hilo.
    assert.equal(posts[0].thread_ts, undefined, 'el aviso inicial va al canal, sin hilo');
    assert.ok(/comprobando GitHub/.test(posts[0].text), posts[0].text);
    assert.ok(posts.slice(1).every((p) => p.thread_ts === posts[0].tsAsignado), 'los avances cuelgan del aviso inicial');
    assert.ok(posts.slice(1).every((p) => p.channel === 'avisos' && p.text.startsWith('Sincronización automática de registros en curso.')));
    // A 30 s por archivo, tras el primero el ritmo permite estimar: alguna edicion muestra el tiempo aproximado.
    assert.ok(updates.some((u) => /Quedan aprox\. \d+ min\./.test(u.text)), 'falta la estimacion aproximada');
    assert.ok(!updates.some((u) => /estimación aproximada, no exacta|sigue en un mensaje nuevo/.test(u.text)), 'sobran las muletillas retiradas');
    // El ultimo mensaje abierto queda editado con el resultado final de la pasada.
    const ultimo = b.llamadas.at(-1);
    assert.equal(ultimo.tipo, 'update');
    assert.equal(ultimo.ts, posts.at(-1).tsAsignado, 'el resultado se edita sobre el ultimo mensaje abierto');
    assert.ok(/Sincronización automática de registros\./.test(ultimo.text) && /subí 12/.test(ultimo.text), ultimo.text);
    // La estimacion nunca promete: siempre lleva «aprox.».
    assert.ok(!updates.some((u) => /[Qq]uedan \d+ min/.test(u.text) || (/[Qq]uedan aprox\. \d+ min/.test(u.text) && !/Quedan aprox\. \d+ min\./.test(u.text))));
  } finally { b.restaurar(); }
});

test('automatica: sin nada que copiar, anuncia la comprobacion y cierra con el resultado', async () => {
  const b = bancoDePruebas([]);
  try {
    const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
    registrar(b.ctx);
    await b.ctx.automaticaSincronizacion();
    const posts = b.llamadas.filter((l) => l.tipo === 'post');
    // La senal de arranque es lo primero que sale, antes de clonar y comparar: un aviso en el canal.
    assert.equal(posts.length, 2, `mensajes abiertos: ${posts.length}`);
    assert.equal(posts[0].thread_ts, undefined, 'el aviso inicial va al canal, sin hilo');
    assert.ok(/comprobando GitHub/.test(posts[0].text), posts[0].text);
    assert.equal(posts[1].thread_ts, posts[0].tsAsignado, 'el reporte cuelga del aviso inicial');
    assert.ok(/en curso\. Comprobando GitHub/.test(posts[1].text), posts[1].text);
    // El cierre con el resultado se edita sobre ese mismo mensaje, aunque no hubiera nada que copiar.
    const ultimo = b.llamadas.at(-1);
    assert.equal(ultimo.tipo, 'update');
    assert.equal(ultimo.ts, posts[1].tsAsignado, 'el resultado se edita sobre el mensaje del reporte');
    assert.ok(/sin cambios; todo sigue igual\./.test(ultimo.text), ultimo.text);
  } finally { b.restaurar(); }
});

test('automatica: si el reporte falla en Slack, la copia termina igual', async () => {
  const b = bancoDePruebas([['cripto', 'A'], ['cripto', 'B']]);
  try {
    b.ctx.app.client.chat.postMessage = async () => { throw new Error('Slack fallo'); };
    const { registrar } = await import('../app/modulos/sincronizar-registros.mjs');
    registrar(b.ctx);
    await b.ctx.automaticaSincronizacion();
    // El fallo del reporte no interrumpe la pasada: los archivos subieron al remoto igual.
    assert.ok(b.rem.arbol()['registros/velas-24h/cripto/A/2611_A'] && b.rem.arbol()['registros/velas-24h/cripto/B/2611_B'], 'subio aunque Slack fallo');
  } finally { b.restaurar(); }
});
