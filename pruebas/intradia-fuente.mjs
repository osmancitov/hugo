// Solo temporales y fuentes simuladas; ninguna prueba consulta o publica datos reales.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fetchConPausa, pausaFuente, plazoReintento } from '../app/modulos/intradia-fuente.mjs';
const T = Date.UTC(2026, 10, 21, 10);
const crear = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-pausa-'));
const respuesta = (status, valor) => ({ status, headers: { get: () => valor } });

test('Retry-After interpreta segundos y fecha HTTP sin confiar en basura', () => {
  assert.equal(plazoReintento('600', T), T + 600000);
  assert.equal(plazoReintento('Sat, 21 Nov 2026 10:20:00 GMT', T), T + 1200000);
  for (const v of [undefined, '', '-1', 'basura', 'Infinity', '9'.repeat(100), 'Sat, 21 Nov 2026 09:20:00 GMT']) assert.equal(plazoReintento(v, T), null);
});

test('429 pausa todas las tandas, sobrevive reinicio y permite retomar después del plazo', async () => {
  const p = crear(), raiz = path.join(p, 'registros'); let n = 0, ahora = T;
  try {
    const fuente = async () => { n++; return respuesta(n === 1 ? 429 : 200, '900'); };
    const uno = fetchConPausa(raiz, fuente, () => ahora);
    await assert.rejects(() => uno('tanda1'), /429/);
    assert.equal(pausaFuente(raiz).hasta, T + 900000);
    const reiniciado = fetchConPausa(raiz, fuente, () => ahora);
    await assert.rejects(() => reiniciado('tanda2'), /pausada/); assert.equal(n, 1);
    ahora += 899999; await assert.rejects(() => reiniciado('tanda1'), /pausada/); assert.equal(n, 1);
    ahora++; assert.equal((await reiniciado('tanda1')).status, 200); assert.equal(n, 2);
  } finally { fs.rmSync(p, { recursive: true, force: true }); }
});

test('418 respeta prohibición larga; sin Retry-After válido no insiste después de reiniciar', async () => {
  for (const status of [418, 429]) {
    const p = crear(), raiz = path.join(p, 'registros'); let n = 0;
    try {
      const fuente = async () => { n++; return respuesta(status, null); };
      await assert.rejects(() => fetchConPausa(raiz, fuente, () => T)('tanda'), /requiere revisión/);
      assert.equal(pausaFuente(raiz).hasta, null);
      await assert.rejects(() => fetchConPausa(raiz, fuente, () => T + 4 * 86400000)('tanda'), /requiere revisión/);
      assert.equal(n, 1);
    } finally { fs.rmSync(p, { recursive: true, force: true }); }
  }
  const p = crear(), raiz = path.join(p, 'registros');
  try {
    await assert.rejects(() => fetchConPausa(raiz, async () => respuesta(418, '259200'), () => T)('tanda'), /418/);
    assert.equal(pausaFuente(raiz).hasta, T + 3 * 86400000);
  } finally { fs.rmSync(p, { recursive: true, force: true }); }
});

test('un estado corrupto no elude la pausa; un error corriente no fabrica bloqueo', async () => {
  const p = crear(), raiz = path.join(p, 'registros'); let n = 0;
  try {
    const fuente = async () => { n++; return respuesta(503, null); };
    assert.equal((await fetchConPausa(raiz, fuente, () => T)('tanda')).status, 503);
    assert.equal(pausaFuente(raiz), null);
    fs.mkdirSync(path.join(p, '.estado-intradia'), { recursive: true });
    fs.writeFileSync(path.join(p, '.estado-intradia', 'fuente-pausa.json'), '{');
    await assert.rejects(() => fetchConPausa(raiz, fuente, () => T)('tanda'), /ilegible/);
    assert.equal(n, 1);
  } finally { fs.rmSync(p, { recursive: true, force: true }); }
});
