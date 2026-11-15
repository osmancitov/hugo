// Modulo archivos: recibir y servir archivos por Slack.
// - Recibir: mencionar a Hugo con un archivo adjunto. Pide confirmacion (modulo comun) y lo guarda en Descargas
//   (la carpeta de descargas del usuario; HUGO_RECIBIDOS en config.env la cambia), sin pisar otro.
// - Servir: "@hugo envia RUTA" pide confirmacion y sube ese archivo al hilo desde donde este, sin copiarlo.
//   Un nombre sin ruta se busca en Descargas. La ruta y el tamano se muestran en la pregunta.
// - No sirve secretos: keys/ de Hugo, ~/.ssh, ~/.gnupg y archivos cuyo nombre indica clave, token o contrasena.
// Este modulo solo guarda y entrega. Aplicar una actualizacion recibida es del modulo actualizar.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const limpio = (n) => path.basename(String(n || 'archivo')).replace(/[^\w.\- ()\u00C0-\u024F]/g, '_').replace(/^\.+/, '_') || 'archivo';
const kb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
const SECRETO = /(^\.env|token|secret|api[-_ ]?key|passw|credencial|credential|\.pem$|\.key$|\.p12$|^id_(rsa|ed25519|ecdsa|dsa))/i;

export function registrar(ctx) {
  const { app, botToken } = ctx;
  const home = () => os.homedir();
  const expandir = (v) => v.replace(/^~(?=\/|$)/, home());

  // Descargas del usuario: HUGO_RECIBIDOS, o XDG_DOWNLOAD_DIR de ~/.config/user-dirs.dirs, o ~/Downloads.
  const descargas = () => {
    const v = process.env.HUGO_RECIBIDOS || ctx.conf.HUGO_RECIBIDOS;
    if (v) return path.resolve(expandir(v));
    try {
      const t = fs.readFileSync(path.join(home(), '.config', 'user-dirs.dirs'), 'utf8');
      const m = t.match(/^XDG_DOWNLOAD_DIR="?([^"\n]+)"?/m);
      if (m) return path.resolve(m[1].replace(/^\$HOME(?=\/|$)/, home()));
    } catch {}
    return path.join(home(), 'Downloads');
  };
  const prohibidas = () => [path.join(home(), 'Documents', 'hugo', 'keys'), path.join(home(), '.ssh'), path.join(home(), '.gnupg')];
  const dentro = (r, dir) => r === dir || r.startsWith(dir + path.sep);
  // Devuelve { ruta } o { error }.
  function resolverEnvio(pedido) {
    const p = pedido.trim();
    const ruta = p.startsWith('/') || p.startsWith('~') ? path.resolve(expandir(p)) : path.join(descargas(), p);
    let real;
    try { real = fs.realpathSync(ruta); } catch { return { error: `No encuentro \u00ab${p}\u00bb.` }; }
    if (!fs.statSync(real).isFile()) return { error: `\u00ab${p}\u00bb no es un archivo.` };
    const bloqueada = prohibidas().map((d) => { try { return fs.realpathSync(d); } catch { return d; } });
    if (bloqueada.some((d) => dentro(real, d)) || SECRETO.test(path.basename(real)) || SECRETO.test(path.basename(ruta))) return { error: 'No env\u00edo claves, tokens ni contrase\u00f1as.' };
    return { ruta: real };
  }

  const decir = (event, text) => app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: event.thread_ts || event.ts, text });

  function nombreLibre(dir, nombre) {
    let destino = path.join(dir, nombre);
    if (!fs.existsSync(destino)) return destino;
    const ext = path.extname(nombre), base = path.basename(nombre, ext);
    const sello = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    destino = path.join(dir, `${base}-${sello}${ext}`);
    for (let i = 1; fs.existsSync(destino); i++) destino = path.join(dir, `${base}-${sello}-${i}${ext}`);
    return destino;
  }

  // Solo se envia el token a https://files.slack.com (host exacto), tambien en cada redireccion.
  const hostSlack = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'files.slack.com'; } catch { return false; } };
  async function descargar(url) {
    let actual = url;
    for (let i = 0; i < 5; i++) {
      if (!hostSlack(actual)) throw new Error('origen no permitido');
      const r = await fetch(actual, { headers: { Authorization: `Bearer ${botToken}` }, redirect: 'manual' });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { actual = new URL(r.headers.get('location'), actual).href; continue; }
      return r;
    }
    throw new Error('demasiadas redirecciones');
  }

  async function guardar(f, dir) {
    if (f.is_external || f.mode === 'external' || f.filetype === 'remote') throw new Error('archivo remoto, no alojado en Slack');
    const url = f.url_private_download || f.url_private;
    const r = await descargar(url);
    if (!r.ok || (r.headers.get('content-type') || '').startsWith('text/html')) throw new Error(`descarga ${r.status}`);
    fs.mkdirSync(dir, { recursive: true });
    const priv = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-')); // carpeta temporal privada (0700)
    try {
      const tmp = path.join(priv, 'descarga');
      await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(tmp));
      const destino = nombreLibre(dir, limpio(f.name));
      fs.copyFileSync(tmp, destino, fs.constants.COPYFILE_EXCL);
      return destino;
    } finally {
      fs.rmSync(priv, { recursive: true, force: true });
    }
  }

  ctx.archivos = { guardar, descargas, limpio, kb }; // lo usa el modulo actualizar

  // El evento app_mention puede no traer los archivos adjuntos: si no vienen, se lee el mensaje (mismo permiso de historial).
  ctx.alMencionar(async (event) => {
    if (Array.isArray(event.files)) return;
    const enHilo = event.thread_ts && event.thread_ts !== event.ts;
    const r = enHilo
      ? await app.client.conversations.replies({ token: botToken, channel: event.channel, ts: event.thread_ts, oldest: event.ts, latest: event.ts, inclusive: true, limit: 1 })
      : await app.client.conversations.history({ token: botToken, channel: event.channel, latest: event.ts, inclusive: true, limit: 1 });
    const m = (r.messages || []).find((x) => x.ts === event.ts);
    event.files = (m && m.files) || [];
  });

  // Recibir: mencion con archivos adjuntos.
  ctx.comando((texto, event) => Array.isArray(event.files) && event.files.length > 0, async (event) => {
    const dir = descargas();
    const lista = event.files.map((f) => `${limpio(f.name)} (${kb(f.size || 0)})`).join(', ');
    await ctx.confirmar({
      channel: event.channel, thread_ts: event.thread_ts || event.ts, user: event.user,
      texto: `\u00bfGuardo en ${dir}: ${lista}?`, que: 'guardar archivos adjuntos',
      alSi: async () => {
        const ok = [], mal = [];
        for (const f of event.files) {
          try { ok.push(path.basename(await guardar(f, dir))); } catch (e) { mal.push(`${f.name} (${e.message})`); }
        }
        await decir(event, [ok.length && `Guardado en ${dir}: ${ok.join(', ')}.`, mal.length && `No pude guardar: ${mal.join(', ')}.`].filter(Boolean).join(' '));
      },
      alNo: async () => { await decir(event, 'Sin respuesta: no guard\u00e9 nada.'); },
    });
  });

  // Servir: desde la ruta indicada.
  ctx.comando(/^\s*(env[i\u00ed]a|manda)\s+\S/i, async (event, texto) => {
    const pedido = texto.replace(/^\s*(env[i\u00ed]a|manda)\s+/i, '').trim().replace(/^[`"'\u201c\u00ab]+|[`"'\u201d\u00bb]+$/g, '');
    const r = resolverEnvio(pedido);
    if (r.error) return decir(event, r.error);
    const nombre = path.basename(r.ruta);
    await ctx.confirmar({
      channel: event.channel, thread_ts: event.thread_ts || event.ts, user: event.user,
      texto: `\u00bfEnv\u00edo ${r.ruta} (${kb(fs.statSync(r.ruta).size)}) a este hilo?`, que: 'enviar un archivo',
      alSi: async () => {
        await app.client.filesUploadV2({
          token: botToken, channel_id: event.channel, thread_ts: event.thread_ts || event.ts,
          file: fs.createReadStream(r.ruta), filename: nombre,
        });
      },
      alNo: async () => { await decir(event, 'Sin respuesta: no envi\u00e9 nada.'); },
    });
  });
}

export const _prueba = { limpio };
