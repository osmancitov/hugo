// Modulo actualizar: recibe un instalador .sh por Slack y lo aplica, con la confirmacion comun.
// Uso: mencionar a Hugo con el archivo adjunto y la palabra "actualiza" (o adjuntar un archivo actualizar-hugo*.sh),
// o escribir "@hugo actualiza hilo" en un hilo que ya tiene el .sh adjunto (usa el ultimo).
// Pasos: pregunta (nombre y tamano) -> con tu pulgar arriba lo guarda en Descargas, muestra su sha256 y lo ejecuta
// FUERA del servicio (systemd-run --user), porque el instalador reinicia a Hugo.
// Resultado real y persistente: el instalador corre con su salida y su codigo de salida guardados en archivos; el
// estado queda en ~/.local/share/hugo-respaldo/pendiente.json hasta que el aviso final se publica en el hilo.
// El aviso lo da el Hugo que siga vivo (si el instalador falla antes de reiniciar) o el que arranque despues.
// Una sola actualizacion a la vez. Solo ordenes del usuario autorizado.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const ex = promisify(execFile);

const base = () => path.join(os.homedir(), '.local', 'share', 'hugo-respaldo');
const PEND = () => path.join(base(), 'pendiente.json');
const AVIS = () => path.join(base(), 'pendiente.avisando');
const sinClaves = (t) => String(t).replace(/xox[a-z]-[A-Za-z0-9-]+/g, '[clave]');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ESPERA_MS = Number(process.env.HUGO_ESPERA_ACT_MS || 180000);   // cuanto espera el resultado antes de decir que aun no lo tiene
const VIGENTE_MS = Number(process.env.HUGO_VIGENTE_ACT_MS || 600000); // un estado mas viejo que esto sin unidad activa se considera abandonado

const leer = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const edad = (f) => { try { return Date.now() - fs.statSync(f).mtimeMs; } catch { return Infinity; } };
async function unidadActiva(u) {
  try { const r = await ex('systemctl', ['--user', 'is-active', u]); return /^(active|activating)/.test(r.stdout.trim()); } catch { return false; }
}

export function registrar(ctx) {
  const { app, botToken } = ctx;
  const decir = (channel, thread_ts, text) => app.client.chat.postMessage({ token: botToken, channel, thread_ts, text });
  let finalizando = false;
  ctx.actualizacionEnCurso = () => enCurso();

  // Hay una actualizacion en curso si existe estado vigente (se esta aplicando o falta su aviso).
  async function enCurso() {
    for (const f of [PEND(), AVIS()]) {
      const p = leer(f);
      if (!p) continue;
      if (edad(f) < VIGENTE_MS || await unidadActiva(p.unidad)) return true;
      fs.rmSync(f, { force: true }); // abandonado: ni activo ni reciente
    }
    return false;
  }

  // Espera el resultado real, lo publica y solo entonces borra el estado. Idempotente: quien reclama el estado
  // (rename atomico) es el unico que avisa.
  async function finalizar() {
    if (finalizando) return;
    if (!leer(AVIS()) && !leer(PEND())) return;
    finalizando = true;
    try {
      if (!leer(AVIS())) { try { fs.renameSync(PEND(), AVIS()); } catch { return; } }
      const p = leer(AVIS());
      if (!p) return;
      const t0 = Date.now();
      let rc = null;
      while (Date.now() - t0 < ESPERA_MS) {
        try { const v = fs.readFileSync(p.rc, 'utf8').trim(); if (v !== '') { rc = Number(v); break; } } catch {}
        if (!(await unidadActiva(p.unidad))) { await dormir(500); try { const v = fs.readFileSync(p.rc, 'utf8').trim(); if (v !== '') rc = Number(v); } catch {} break; }
        await dormir(1000);
      }
      let salida = '';
      try { salida = sinClaves(fs.readFileSync(p.log, 'utf8')).trim().split('\n').slice(-8).join('\n'); } catch {}
      const ficha = p.etiqueta || `${p.nombre}, sha256 ${p.sha}`;
      const bloque = `\n\`\`\`${salida || 'sin salida registrada'}\`\`\``;
      let texto;
      if (rc === null) {
        texto = `Todav\u00eda no tengo el resultado de la actualizaci\u00f3n (${ficha}): la unidad ${(await unidadActiva(p.unidad)) ? 'sigue en ejecuci\u00f3n' : 'termin\u00f3 sin registrar su c\u00f3digo'}. Revisa: systemctl --user status ${p.unidad}; log en ${p.log}.${bloque}`;
      } else if (rc === 0) {
        texto = p.etiqueta ? `Hugo actualizado (${ficha}).${bloque}` : `Actualizaci\u00f3n terminada, c\u00f3digo de salida 0 (${ficha}).${bloque}`;
      } else {
        const revirtio = /Vuelvo a lo anterior/.test(salida) ? ' El instalador informa que volvi\u00f3 a lo anterior.' : ' No tengo confirmaci\u00f3n de que haya vuelto a lo anterior; revisa el log.';
        texto = `La actualizaci\u00f3n fall\u00f3, c\u00f3digo de salida ${rc} (${ficha}).${revirtio}${bloque}`;
      }
      try {
        await decir(p.channel, p.thread_ts, texto);
      } catch (e) {
        console.error('aviso final:', e.data?.error || e.message);
        try { fs.renameSync(AVIS(), PEND()); } catch {}   // el aviso no sali: queda para el proximo intento
        return;
      }
      if (rc === null) { try { fs.renameSync(AVIS(), PEND()); } catch {} return; }
      if (p.limpiar) fs.rmSync(p.limpiar, { recursive: true, force: true });
      fs.rmSync(AVIS(), { force: true });
    } finally {
      finalizando = false;
    }
  }

  // Ejecuta un instalador ya guardado (ruta) fuera del servicio y deja el aviso final pendiente. Lo usan "actualiza" con .sh
  // y el modulo github (con args, etiqueta y carpeta temporal a limpiar al terminar).
  async function lanzar({ channel, hilo, ruta, args = [], etiqueta = '', sha = null, limpiar = '' }) {
    const quitarTmp = () => { if (limpiar) fs.rmSync(limpiar, { recursive: true, force: true }); };
    if (await enCurso()) { quitarTmp(); return decir(channel, hilo, 'Ya hay una actualizaci\u00f3n en curso o sin avisar; no empiezo otra.'); }
    const shaV = sha || crypto.createHash('sha256').update(fs.readFileSync(ruta)).digest('hex').slice(0, 8);
    fs.mkdirSync(base(), { recursive: true });
    const unidad = `hugo-actualizacion-${Date.now()}`;
    const log = path.join(base(), `${unidad}.log`), rc = path.join(base(), `${unidad}.rc`);
    // Reserva el estado de forma exclusiva: si otro lo creo entre medias, no se lanza nada.
    try { fs.writeFileSync(PEND(), JSON.stringify({ channel, thread_ts: hilo, nombre: path.basename(ruta), sha: shaV, etiqueta, limpiar, unidad, log, rc }), { flag: 'wx' }); }
    catch { quitarTmp(); return decir(channel, hilo, 'Ya hay una actualizaci\u00f3n en curso; no empiezo otra.'); }
    await decir(channel, hilo, etiqueta ? `Ejecutando ${etiqueta}; Hugo se reinicia y te aviso aqu\u00ed cuando termine.` : `Guardado ${ruta} (sha256 ${shaV}). Ejecutando; Hugo se reinicia y te aviso aqu\u00ed cuando termine.`).catch(() => {});
    const PATH = [path.dirname(process.execPath), process.env.PATH || ''].filter(Boolean).join(':');
    try {
      await ex('systemd-run', ['--user', '--collect', '--quiet', `--unit=${unidad}`, `--setenv=PATH=${PATH}`, '--working-directory=' + path.dirname(ruta),
        'bash', '-c', '{ bash "$0" "${@:3}"; echo $? > "$2"; } > "$1" 2>&1', ruta, log, rc, ...args]);
    } catch (e) {
      fs.rmSync(PEND(), { force: true });
      quitarTmp();
      return decir(channel, hilo, `No pude lanzar la actualizaci\u00f3n (${sinClaves(e.stderr || e.message).trim().slice(0, 200)}). El archivo qued\u00f3 en ${ruta}; no cambi\u00e9 nada.`);
    }
    finalizar(); // si el instalador falla antes de reiniciar, este mismo Hugo sigue vivo y avisa
  }
  ctx.lanzarInstalacion = lanzar;

  const esActualizacion = (texto, event) => Array.isArray(event.files) && event.files.length > 0
    && (/actualiz/i.test(texto) || event.files.some((f) => /^actualizar-hugo.*\.sh$/i.test(f.name || '')));
  // "@hugo actualiza hilo" (sin adjunto), dentro de un hilo: usa el ultimo .sh adjuntado en ese hilo ("actualiza" a secas baja de GitHub: modulo github) (lo subiera quien lo subiera;
  // la pregunta dice quien lo subio y el 👍 que cuenta es el tuyo).
  const esActualizarDelHilo = (texto, event) => Array.isArray(event.files) && event.files.length === 0 && /^\s*actualiz\w*\s+hilo\s*$/i.test(texto);

  // Pregunta, y con 👍 guarda, ejecuta y avisa. f = archivo de Slack; quien = id de quien lo subio (si se conoce).
  async function proponer(event, f, quien, delegado) {
    const hilo = event.thread_ts || event.ts;
    if (!/\.sh$/i.test(f.name || '')) return decir(event.channel, hilo, `\u00ab${f.name}\u00bb no es un instalador .sh; no lo aplico.`);
    if (await enCurso()) return decir(event.channel, hilo, 'Ya hay una actualizaci\u00f3n en curso o sin avisar; no empiezo otra.');
    await ctx.confirmar({
      que: 'aplicar una actualizaci\u00f3n', channel: event.channel, thread_ts: hilo, user: ctx.usuario, // el 👍 que cuenta es siempre el del usuario
      texto: `Solicitud.\n\u00bfAplico ${ctx.archivos.limpio(f.name)} (${ctx.archivos.kb(f.size || 0)}${quien ? `, subida por <@${quien}>` : ''})?`,
      alSi: async () => {
        if (await enCurso()) return decir(event.channel, hilo, 'Ya hay una actualizaci\u00f3n en curso o sin avisar; no empiezo otra.');
        let ruta;
        try { ruta = await ctx.archivos.guardar(f, ctx.archivos.descargas()); } catch (e) { return decir(event.channel, hilo, `No pude guardar la actualizaci\u00f3n: ${sinClaves(e.message)}. No cambi\u00e9 nada.`); }
        await lanzar({ channel: event.channel, hilo, ruta });
      },
      alNo: async () => { await decir(event.channel, hilo, 'Sin respuesta: no apliqu\u00e9 nada.'); },
    });
  }

  ctx.comando(esActualizacion, async (event, _t, { delegado } = {}) => {
    if (event.files.length !== 1) return decir(event.channel, event.thread_ts || event.ts, 'Para actualizar adjunta un solo archivo.');
    await proponer(event, event.files[0], event.user, delegado);
  }, { delegable: true });

  ctx.comando(esActualizarDelHilo, async (event, _t, { delegado } = {}) => {
    if (!event.thread_ts || event.thread_ts === event.ts) return decir(event.channel, event.ts, 'Escribe "actualiza hilo" dentro del hilo donde est\u00e1 el instalador adjunto, o adjunta el .sh a tu mensaje.');
    let ultimo = null, cursor;
    try {
      for (let i = 0; i < 20; i++) {
        const r = await app.client.conversations.replies({ token: botToken, channel: event.channel, ts: event.thread_ts, limit: 200, cursor });
        for (const m of r.messages || []) {
          if (Number(m.ts) >= Number(event.ts)) continue;
          // Si la orden la dio el asistente, solo cuenta un .sh subido por el asistente o por el usuario (no por terceros).
          if (delegado && m.user !== ctx.delegado && m.user !== ctx.usuario) continue;
          for (const f of m.files || []) if (/\.sh$/i.test(f.name || '')) ultimo = { f, quien: m.user };
        }
        cursor = r.response_metadata?.next_cursor;
        if (!cursor) break;
      }
    } catch (e) { return decir(event.channel, event.thread_ts, `No pude leer el hilo (${e.data?.error || e.message}); no apliqu\u00e9 nada.`); }
    if (!ultimo) return decir(event.channel, event.thread_ts, 'No encuentro un instalador .sh adjunto en este hilo. Adj\u00fantalo con tu mensaje.');
    await proponer(event, ultimo.f, ultimo.quien, delegado);
  }, { delegable: true });

  // Al arrancar: si quedo un aviso sin dar (actualizacion que reinicio, o aviso que no salio), darlo ahora.
  ctx.alIniciar(async () => {
    finalizar();
  });
}
