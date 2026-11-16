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
// el dispatcher de app.mjs busca el primer patrón que coincide; la simulación hace LO
// MISMO (si el patrón no reconoce la orden, la prueba falla: fue el fallo del estreno real)
const comandos = [];
ctx.comando = (patron, fn, op) => comandos.push({ patron, fn, op });
const { registrar } = await import('../app/modulos/radiografias.mjs');
registrar(ctx);
const evento = { channel: 'C1', ts: '1.0', thread_ts: '1.0', user: 'U1' };
const corre = async (texto) => {
  const c = comandos.find((x) => x.patron.test(texto));
  if (!c) { mal.push(`orden no reconocida: ${texto}`); return; }
  await c.fn(evento, texto, { delegado: false });
};

const ok = [], mal = [];
const espera = (nombre, cond) => (cond ? ok.push(nombre) : mal.push(nombre));

// 1) dos activos: subidas + archivos + huellas + marca largo
await corre('radiografía SPCX INTW');
espera('2 subidas', subidas.length === 2);
espera('subidas >100KB', subidas.every((s) => s.bytes > 100000));
espera('SPCX guardado', fs.existsSync('/tmp/hugo_sim/graficas2/stock/SPCX/SPCX_radiografia.png'));
espera('INTW guardado', fs.existsSync('/tmp/hugo_sim/graficas2/stock/INTW/INTW_radiografia.png'));
espera('huellas', fs.existsSync('/tmp/hugo_sim/graficas2/stock/SPCX/.SPCX_radiografia.sha256'));
espera('nombre entregado', subidas.every((s) => s.filename === `${s.filename.split('_')[0]}_radiografia.png`));
espera('marcada largo', largoVisto.length === 2 && largoVisto.every((l) => l && l.largo));
espera('cierre 2 de 2', mensajes.some((m) => m.includes('Encomienda terminada: 2 de 2 radiograf\u00edas entregadas, sin fallos')));
espera('activas limpia', ctx.activas.size === 0);

// 2) reorden mismo activo: pisa lo propio sin aviso
mensajes.length = 0;
await corre('radiografia SPCX');
espera('reorden sin aviso de pisado', !mensajes.some((m) => m.includes('no lo pis')));
espera('cierre reorden 1 de 1', mensajes.some((m) => m.includes('Encomienda terminada: 1 de 1')));

// 3) archivo ajeno: no se pisa, se avisa, igual se sube
const dirAmd = '/tmp/hugo_sim/graficas2/stock/AMD';
fs.mkdirSync(dirAmd, { recursive: true });
fs.writeFileSync(path.join(dirAmd, 'AMD_radiografia.png'), 'archivo puesto a mano');
mensajes.length = 0; subidas.length = 0;
await corre('radiografía AMD');
espera('ajeno avisado', mensajes.some((m) => m.includes('no lo pis')));
espera('ajeno intacto', fs.readFileSync(path.join(dirAmd, 'AMD_radiografia.png'), 'utf8') === 'archivo puesto a mano');
espera('ajeno igual sube al hilo', subidas.length === 1);
espera('ajeno cuenta entregada', mensajes.some((m) => m.includes('Encomienda terminada: 1 de 1 radiograf\u00edas entregadas, sin fallos')));

// 4) parada única: tras la primera subida, stop corta el resto
mensajes.length = 0; subidas.length = 0;
alSubir = () => { ctx.parada.n++; };
await corre('radiografía MU NVDA SNDK');
espera('parada corta lista', subidas.length === 1 && mensajes.some((m) => m.includes('Parada pedida')));
espera('parada no la da por terminada', mensajes.some((m) => m.includes('Llevaba 1 de 3 entregadas')) && !mensajes.some((m) => m.includes('Encomienda terminada')));

// 5) errores de entrada
mensajes.length = 0;
await corre('radiografía FFFFFF');
espera('sin registros', mensajes.some((m) => m.includes('no tiene registros')));
espera('cierre con fallo', mensajes.some((m) => m.includes('Encomienda terminada: 0 de 1 radiograf\u00edas entregadas. Fallaron 1: FFFFFF')));
await corre('radiografía SPCX SPCX');
espera('repetidos', mensajes.some((m) => m.includes('repetidos')));
await corre('radiografía');
espera('sin códigos', mensajes.some((m) => m.includes('Indica uno o varios')));

// 6) el patrón reconoce con y sin tilde, singular y plural
const formas = ['radiografía SPCX', 'radiografia SPCX', 'radiografías SPCX NVDA', 'radiografias'];
espera('reconoce tilde/sin tilde', formas.every((f) => comandos.some((x) => x.patron.test(f))));

// 7) clase explícita: código con carpeta en las dos clases se dibuja por la pedida; códigos de
//    1 letra y Unicode pasan la validación de la orden (fallan después por falta de registros)
const velasSim = '/tmp/hugo_sim/velas';
fs.rmSync(velasSim, { recursive: true, force: true });
const velasSimu = [];
let precio = 100;
for (let i = 0; i < 45; i++) { // 1 oct - 14 nov 2026, con días verdes y rojos (Date.UTC desborda el mes solo)
  const t = Date.UTC(2026, 9, 1 + i);
  const delta = (i % 3 === 0 ? -1 : 1) * (1 + (i % 5));
  const cierre = precio + delta;
  velasSimu.push([t, String(precio), String(Math.max(precio, cierre)), String(Math.min(precio, cierre)), String(cierre), '1000', t + 86400000 - 1, '1000', 3, '1', '2', '0']);
  precio = cierre;
}
const octSimu = velasSimu.filter((v) => new Date(v[0]).getUTCMonth() === 9);
const novSimu = velasSimu.filter((v) => new Date(v[0]).getUTCMonth() === 10);
for (const claseSim of ['cripto', 'stock']) {
  const dirSim = path.join(velasSim, claseSim, 'SIMU');
  fs.mkdirSync(dirSim, { recursive: true });
  fs.writeFileSync(path.join(dirSim, '2610_SIMU'), JSON.stringify(octSimu));
  fs.writeFileSync(path.join(dirSim, '2611_SIMU'), JSON.stringify(novSimu));
}
const velasAntes = process.env.HUGO_VELAS_DIR;
process.env.HUGO_VELAS_DIR = velasSim;
mensajes.length = 0; subidas.length = 0;
await corre('radiografía SIMU');
espera('dos clases sin clase explícita se detiene', mensajes.some((m) => m.includes('aparece en las dos clases')));
espera('cierre con fallo SIMU', mensajes.some((m) => m.includes('Encomienda terminada: 0 de 1 radiograf\u00edas entregadas. Fallaron 1: SIMU')));
mensajes.length = 0; subidas.length = 0;
await corre('radiografía cripto SIMU');
espera('clase explícita dibuja', subidas.length === 1 && subidas[0].filename === 'SIMU_radiografia.png');
espera('clase explícita guarda en su clase', fs.existsSync('/tmp/hugo_sim/graficas2/cripto/SIMU/SIMU_radiografia.png') && fs.existsSync('/tmp/hugo_sim/graficas2/cripto/SIMU/.SIMU_radiografia.sha256'));
espera('cierre 1 de 1 cripto', mensajes.some((m) => m.includes('Encomienda terminada: 1 de 1 radiograf\u00edas entregadas, sin fallos')));
mensajes.length = 0;
await corre('radiografía cripto W');
espera('código de 1 letra pasa validación', mensajes.some((m) => m.includes('No pude dibujar W:')) && !mensajes.some((m) => m.includes('Indica uno o varios')));
mensajes.length = 0;
await corre('radiografía cripto 牛来');
espera('código Unicode pasa validación', mensajes.some((m) => m.includes('No pude dibujar 牛来:')) && !mensajes.some((m) => m.includes('Indica uno o varios')));
process.env.HUGO_VELAS_DIR = velasAntes;

console.log('OK:', ok.length, ok.map((x) => `[${x}]`).join(' '));
if (mal.length) { console.log('MAL:', mal.join(' | ')); process.exit(1); }
