// node --test pruebas/estado-pausado.mjs. «estado» no calla un registro pausado: lo muestra
// con sus salidas y deja de decir «Libre»; sin pausado, el texto de siempre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrar } from '../app/modulos/estado.mjs';

function banco(pendiente) {
 const enviados = [];
 let handler;
 const ctx = {
  activas: new Map(), desde: Date.now() - 60000,
  esperando: () => [], actualizacionEnCurso: async () => false,
  registroPendiente: pendiente === undefined ? undefined : () => pendiente,
 };
 const app = { client: { chat: { postMessage: async (m) => { enviados.push(m.text); return { ts: '1' }; } } } };
 registrar({ ...ctx, app, botToken: 'x', comando: (p, f) => { handler = f; } });
 return { enviados, run: () => handler({ channel: 'c', ts: 'h' }) };
}

test('con registro pausado: lo muestra con sus salidas y no dice Libre', async () => {
 const b = banco('BBB, septiembre de 2026 (1/2 activos)');
 await b.run();
 const t = b.enviados.join('\n');
 assert.match(t, /registro pausado en BBB, septiembre de 2026 \(1\/2 activos\)/);
 assert.match(t, /registra continuar.*lo retoma/);
 assert.match(t, /descarta registro.*lo abandona/);
 assert.ok(!/Libre: no hago nada/.test(t), 'no puede decir Libre con un pausado');
 assert.match(t, /Llevo activo/);
});

test('sin registro pausado: dice Libre como siempre', async () => {
 const b = banco(null);
 await b.run();
 const t = b.enviados.join('\n');
 assert.match(t, /Libre: no hago nada y no espero ninguna instrucción/);
 assert.ok(!/registro pausado/.test(t));
});

test('sin el enlace al motor (Hugo viejo): se comporta como antes', async () => {
 const b = banco(undefined);
 await b.run();
 assert.match(b.enviados.join('\n'), /Libre: no hago nada/);
});
