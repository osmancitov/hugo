// node --test pruebas/saludo-hola.mjs. «hola» responde el texto exacto decidido por el usuario
// (20-nov-2026) en el hilo de la mención; frases más largas caen al «no reconozco» de siempre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrar, RESPUESTA_HOLA } from '../app/modulos/saludo.mjs';

function banco() {
  const postes = [];
  const comandos = [];
  let defecto = null;
  const ctx = {
    app: { client: { chat: { postMessage: async (m) => { postes.push(m); return { ts: 't1' }; } }, conversations: { join: async () => {} } } },
    botToken: 'x', canal: 'C',
    comando: (patron, fn, op = {}) => comandos.push({ patron, fn, op }),
    porDefecto: (fn) => { defecto = fn; },
    alIniciar: () => {},
  };
  registrar(ctx);
  return { postes, comandos, defecto };
}

const atiende = (comandos, texto) => comandos.find((c) => (typeof c.patron === 'function' ? c.patron(texto, {}) : c.patron.test(texto)));

test('«hola» responde «Hola, me llamo Hugo» en el hilo de la mención', async () => {
  const { postes, comandos } = banco();
  for (const texto of ['hola', 'Hola', 'HOLA!', 'hola.']) {
    const c = atiende(comandos, texto);
    assert.ok(c, `reconoce «${texto}»`);
    await c.fn({ channel: 'C', ts: 'm1' }, texto);
  }
  assert.equal(postes.length, 4);
  for (const p of postes) {
    assert.equal(p.text, 'Hola, me llamo Hugo');
    assert.equal(p.text, RESPUESTA_HOLA);
    assert.equal(p.thread_ts, 'm1');
  }
});

test('frases que solo contienen hola no responden; cae el aviso de siempre', async () => {
  const { postes, comandos, defecto } = banco();
  for (const texto of ['hola qué tal', 'di hola', 'holaaa']) assert.ok(!atiende(comandos, texto), `no reconoce «${texto}»`);
  await defecto({ channel: 'C', ts: 'm2' });
  assert.match(postes[0].text, /No reconozco esa orden/);
});
