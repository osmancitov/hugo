import test from 'node:test';
import assert from 'node:assert/strict';
import { publicarVisor } from '../.github/publicar-visor.mjs';

// Simula la API: cada dispatch crea una corrida nueva cuyo resultado se toma de `resultados`.
function api(resultados, { dispatchStatus = 204 } = {}) {
  const runs = [{ id: 1, status: 'completed', conclusion: 'success' }]; let n = 0, despachos = 0; const pend = new Map();
  const fetchImpl = async (url, opt = {}) => {
    if (opt.method === 'POST') { despachos++; if (dispatchStatus !== 204) return { status: dispatchStatus, text: async () => 'x' }; n++; const id = 100 + n; runs.unshift({ id, status: 'in_progress', conclusion: null }); pend.set(id, resultados[n - 1]); return { status: 204 }; }
    for (const r of runs) { if (r.status !== 'completed' && pend.get(r.id) !== 'colgada') { r.status = 'completed'; r.conclusion = pend.get(r.id); } }
    return { ok: true, status: 200, json: async () => ({ workflow_runs: runs }) };
  };
  return { fetchImpl, despachos: () => despachos };
}
const base = { repo: 'o/r', token: 't', dormir: async () => {}, pasoMs: 1000, limiteMs: 5000, log: () => {} };

test('éxito al primer intento: una sola solicitud', async () => {
  const a = api(['success']);
  const r = await publicarVisor({ ...base, fetchImpl: a.fetchImpl });
  assert.equal(r.conclusion, 'success'); assert.equal(a.despachos(), 1);
});
test('falla y vuelve a salir bien: exactamente una corrida nueva', async () => {
  const a = api(['failure', 'success']);
  const r = await publicarVisor({ ...base, fetchImpl: a.fetchImpl });
  assert.equal(r.id, 102); assert.equal(a.despachos(), 2);
});
test('corrida atascada (no termina): tiempo agotado y una corrida nueva', async () => {
  const a = api(['colgada', 'success']);
  const r = await publicarVisor({ ...base, fetchImpl: a.fetchImpl });
  assert.equal(r.conclusion, 'success'); assert.equal(a.despachos(), 2);
});
test('dos fallos: error visible y sin bucle (solo dos solicitudes)', async () => {
  const a = api(['failure', 'failure']);
  await assert.rejects(publicarVisor({ ...base, fetchImpl: a.fetchImpl }), /falló dos veces/);
  assert.equal(a.despachos(), 2);
});
test('si no se puede ni solicitar (no 204), falla de inmediato', async () => {
  const a = api([], { dispatchStatus: 403 });
  await assert.rejects(publicarVisor({ ...base, fetchImpl: a.fetchImpl }), /No pude solicitar Pages: HTTP 403/);
  assert.equal(a.despachos(), 1);
});
