// node --test pruebas/estado-ciclo.mjs. «estado» libre cuenta lo que sigue y lo que quedó
// (pedido del usuario, 20-nov-2026): última corrida completa y próxima corrida, un dato por
// línea, solo con lo que el ciclo ya mide. Sin marca, la línea de la última no sale; sin el
// enlace al ciclo (Hugo viejo), el texto queda como antes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrar } from '../app/modulos/estado.mjs';

// 2026-11-20 19:00 local (-04) = 2026-11-20 23:00 UTC: la próxima corrida es hoy a las 20:05.
const AHORA = Date.UTC(2026, 10, 20, 23, 0, 0);
const MARCA = Date.UTC(2026, 10, 19); // última corrida completa: registros hasta el 2026-11-19

function banco(cicloInfo) {
 const enviados = [];
 let handler;
 const ctx = {
  activas: new Map(), desde: AHORA - 60000, ahora: () => AHORA,
  esperando: () => [], actualizacionEnCurso: async () => false,
  registroPendiente: () => null,
  cicloInfo: cicloInfo === undefined ? undefined : cicloInfo,
 };
 const app = { client: { chat: { postMessage: async (m) => { enviados.push(m.text); return { ts: '1' }; } } } };
 registrar({ ...ctx, app, botToken: 'x', comando: (p, f) => { handler = f; } });
 return { enviados, run: () => handler({ channel: 'c', ts: 'h' }) };
}

test('libre con ciclo: última corrida y próxima corrida, un dato por línea', async () => {
 const b = banco(() => ({ proxima: Date.UTC(2026, 10, 21, 0, 5, 0), ultimo: MARCA }));
 await b.run();
 const lineas = b.enviados.join('\n').split('\n');
 assert.ok(lineas.includes('Libre: no hago nada y no espero ninguna instrucción.'));
 assert.ok(lineas.includes('Última corrida diaria completa: registros hasta el 2026-11-19.'));
 assert.ok(lineas.includes('Próxima puesta al día diaria: hoy a las 20:05.'));
});

test('pasada la medianoche UTC la próxima ya es de otro día local: dice el día, no «hoy»', async () => {
 const b = banco(() => ({ proxima: Date.UTC(2026, 10, 22, 0, 5, 0), ultimo: MARCA }));
 await b.run();
 const lineas = b.enviados.join('\n').split('\n');
 assert.ok(lineas.includes('Próxima puesta al día diaria: mañana a las 20:05.'));
});

test('sin marca todavía: la línea de la última corrida no sale, sin inventar', async () => {
 const b = banco(() => ({ proxima: Date.UTC(2026, 10, 21, 0, 5, 0), ultimo: null }));
 await b.run();
 const t = b.enviados.join('\n');
 assert.ok(!/Última corrida diaria completa/.test(t));
 assert.ok(/Próxima puesta al día diaria: hoy a las 20:05\./.test(t));
});

test('sin el enlace al ciclo (Hugo viejo): el texto queda como antes', async () => {
 const b = banco(undefined);
 await b.run();
 const t = b.enviados.join('\n');
 assert.match(t, /Libre: no hago nada y no espero ninguna instrucción/);
 assert.ok(!/Próxima puesta al día/.test(t));
});

test('ocupado: las líneas del ciclo no se mezclan con el trabajo en curso', async () => {
 const b = banco(() => ({ proxima: Date.UTC(2026, 10, 21, 0, 5, 0), ultimo: MARCA }));
 b.enviados.length = 0;
 // Simula trabajo en curso registrando de nuevo con activas pobladas: rehace el banco.
 const enviados = [];
 let handler;
 const ctx = {
  activas: new Map([['x', { que: 'registrar historial', desde: AHORA - 5000, largo: true }]]),
  desde: AHORA - 60000, ahora: () => AHORA,
  esperando: () => [], actualizacionEnCurso: async () => false,
  registroPendiente: () => null, cicloInfo: () => ({ proxima: Date.UTC(2026, 10, 21, 0, 5, 0), ultimo: MARCA }),
 };
 const app = { client: { chat: { postMessage: async (m) => { enviados.push(m.text); return { ts: '1' }; } } } };
 registrar({ ...ctx, app, botToken: 'x', comando: (p, f) => { handler = f; } });
 await handler({ channel: 'c', ts: 'h' });
 const t = enviados.join('\n');
 assert.ok(!/Libre/.test(t));
 assert.ok(!/Próxima puesta al día/.test(t), 'ocupado no habla de la próxima corrida');
});

test('ciclo en pausa: lo anuncia y no promete próxima corrida', async () => {
 const b = banco(() => ({ proxima: Date.UTC(2026, 10, 21, 0, 5, 0), ultimo: MARCA, activa: false }));
 await b.run();
 const lineas = b.enviados.join('\n').split('\n');
 assert.ok(lineas.includes('Última corrida diaria completa: registros hasta el 2026-11-19.'));
 assert.ok(lineas.includes('Puesta al día diaria automática en pausa; `pon al día` sigue manual.'));
 assert.ok(!lineas.some((t) => t.startsWith('Próxima puesta al día diaria')), 'sin promesa de próxima corrida');
});
