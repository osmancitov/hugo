// Simulación del módulo radiografias sin Slack: ctx y cliente falsos, python3 real.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-home-'));
process.env.HUGO_VELAS_DIR = '/tmp/hugo/registros/velas-24h';
process.env.HUGO_GRAFICAS_DIR = '/tmp/hugo_sim/graficas2';
fs.rmSync('/tmp/hugo_sim/graficas2', { recursive: true, force: true });

const mensajes = [], subidas = [], largoVisto = [];
let alSubir = null;
const ctx = {
  conf: {}, parada: { n: 0 }, activas: new Map(), usuario: 'U1', delegado: 'U2', botToken: 'x',
  app: { client: {
    chat: { postMessage: async (m) => { mensajes.push(m.text); } },
    filesUploadV2: async (a) => {
      const entrada = [...ctx.activas.values()].find((x) => x.que.includes('radiograf'));
      largoVisto.push(entrada ? { que: entrada.que, largo: !!entrada.largo } : null);
      let n = 0; for await (const c of a.file) n += c.length;
      subidas.push({ filename: a.filename, bytes: n });
      if (alSubir) { const f = alSubir; alSubir = null; f(); }
    },
  } },
};
// el dispatcher de app.mjs busca el primer patrón que coincide; aquí llamamos directo
const comandos = [];
ctx.comando = (patron, fn, op) => comandos.push({ patron, fn, op });
const { registrar } = await import('../app/modulos/radiografias.mjs');
registrar(ctx);
const cmd = comandos[0];
const evento = { channel: 'C1', ts: '1.0', thread_ts: '1.0', user: 'U1' };
const corre = (texto) => cmd.fn(evento, texto, { delegado: false });

const ok = [], mal = [];
const espera = (nombre, cond) => (cond ? ok.push(nombre) : mal.push(nombre));

// 1) dos activos: subidas + archivos + huellas + marca largo
await corre('radiografía SPCX INTW');
espera('2 subidas', subidas.length === 2);
espera('subidas >100KB', subidas.every((s) => s.bytes > 100000));
espera('SPCX guardado', fs.existsSync('/tmp/hugo_sim/graficas2/stock/SPCX/SPCX.png'));
espera('INTW guardado', fs.existsSync('/tmp/hugo_sim/graficas2/stock/INTW/INTW.png'));
espera('huellas', fs.existsSync('/tmp/hugo_sim/graficas2/stock/SPCX/.SPCX.sha256'));
espera('marcada largo', largoVisto.length === 2 && largoVisto.every((l) => l && l.largo));
espera('activas limpia', ctx.activas.size === 0);

// 2) reorden mismo activo: pisa lo propio sin aviso
mensajes.length = 0;
await corre('radiografia SPCX');
espera('reorden sin aviso de pisado', !mensajes.some((m) => m.includes('no lo pis')));

// 3) archivo ajeno: no se pisa, se avisa, igual se sube
const dirAmd = '/tmp/hugo_sim/graficas2/stock/AMD';
fs.mkdirSync(dirAmd, { recursive: true });
fs.writeFileSync(path.join(dirAmd, 'AMD.png'), 'archivo puesto a mano');
mensajes.length = 0; subidas.length = 0;
await corre('radiografía AMD');
espera('ajeno avisado', mensajes.some((m) => m.includes('no lo pis')));
espera('ajeno intacto', fs.readFileSync(path.join(dirAmd, 'AMD.png'), 'utf8') === 'archivo puesto a mano');
espera('ajeno igual sube al hilo', subidas.length === 1);

// 4) parada única: tras la primera subida, stop corta el resto
mensajes.length = 0; subidas.length = 0;
alSubir = () => { ctx.parada.n++; };
await corre('radiografía MU NVDA SNDK');
espera('parada corta lista', subidas.length === 1 && mensajes.some((m) => m.includes('Parada pedida')));

// 5) errores de entrada
mensajes.length = 0;
await corre('radiografía FFFFFF');
espera('sin registros', mensajes.some((m) => m.includes('no tiene registros')));
await corre('radiografía SPCX SPCX');
espera('repetidos', mensajes.some((m) => m.includes('repetidos')));
await corre('radiografía');
espera('sin códigos', mensajes.some((m) => m.includes('Indica uno o varios')));

console.log('OK:', ok.length, ok.map((x) => `[${x}]`).join(' '));
if (mal.length) { console.log('MAL:', mal.join(' | ')); process.exit(1); }
