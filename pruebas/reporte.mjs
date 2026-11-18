// node --test pruebas/reporte.mjs. Componente comun de reporte: un solo mensaje, ediciones
// reguladas y cierre en el mismo mensaje; usable por cualquier flujo. Slack simulado, sin red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearReporte } from '../app/modulos/reporte.mjs';

test('un post inmediato con el inicio del flujo, progreso regulado y cierre en el mismo mensaje', async () => {
 let reloj = 0; const calls = [];
 const client = { chat: { postMessage: async m => { calls.push({ tipo: 'post', reloj, ...m }); return { ts: 'rep' }; }, update: async m => calls.push({ tipo: 'update', reloj, ...m }) } };
 const r = await crearReporte({ client, token: 'simulado', event: { channel: 'canal', thread_ts: 'hilo' }, inicio: 'Compruebo GitHub; aun no instalo nada.', prefijo: 'Comprobando GitHub. ', ahora: () => reloj, esperar: async ms => { reloj += ms; } });
 assert.equal(calls.length, 1); assert.equal(calls[0].thread_ts, 'hilo'); assert.equal(calls[0].text, 'Compruebo GitHub; aun no instalo nada.');
 for (let i = 1; i <= 10; i++) { reloj += 500; await r.progreso(`paso ${i}`); }
 await r.final('Comprobado: al dia.');
 assert.equal(calls.filter(c => c.tipo === 'post').length, 1);
 assert.ok(calls.filter(c => c.tipo === 'update').every(c => c.ts === 'rep'));
 assert.equal(calls.at(-1).text, 'Comprobado: al dia.');
 for (let i = 1; i < calls.length; i++) assert.ok(calls[i].reloj - calls[i - 1].reloj >= 5000);
 assert.ok(calls.some(c => c.tipo === 'update' && c.text.startsWith('Comprobando GitHub. ')));
});

test('modo canal sin hilo para avisos automaticos', async () => {
 const calls = []; const client = { chat: { postMessage: async m => { calls.push(m); return { ts: 'rep' }; }, update: async m => calls.push(m) } };
 const r = await crearReporte({ client, token: 't', canal: 'avisos', inicio: 'Trabajo en curso.', ahora: () => 0, esperar: async () => {} });
 assert.equal(calls[0].channel, 'avisos'); assert.equal(calls[0].thread_ts, undefined);
 await r.final('Hecho.');
});

test('sin referencia de Slack no finje avance: abrir el reporte falla y el llamador decide', async () => {
 const client = { chat: { postMessage: async () => ({}), update: async () => {} } };
 await assert.rejects(crearReporte({ client, token: 't', event: { channel: 'c', ts: 'h' }, inicio: 'x' }), /referencia del reporte/);
});

test('sin referencia de Slack no finje avance: abrir el reporte falla y el llamador decide', async () => {
 const client = { chat: { postMessage: async () => ({}), update: async () => {} } };
 await assert.rejects(crearReporte({ client, token: 't', event: { channel: 'c', ts: 'h' }, inicio: 'x' }), /referencia del reporte/);
});
