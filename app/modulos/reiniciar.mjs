// Modulo reiniciar: "@hugo restart" o "@hugo reiniciar" reinicia el servicio de Hugo (hugo.service).
// No reinicia si hay una actualizacion en curso (el instalador ya lo reinicia) ni si Hugo esta haciendo otro trabajo;
// dice por que. Un reinicio cancela las confirmaciones pendientes y publica otro aviso de arranque en el canal.
// Se lanza fuera del proceso (systemd-run --user) para que la orden sobreviva al reinicio.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const ex = promisify(execFile);

export function registrar(ctx) {
  const { app, botToken } = ctx;
  ctx.comando(/^\s*(restart|reiniciar)\s*[.!?]*\s*$/i, async (event) => {
    const hilo = event.thread_ts || event.ts;
    const decir = (text) => app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: hilo, text });
    let actualizando = false;
    try { actualizando = ctx.actualizacionEnCurso ? await ctx.actualizacionEnCurso() : false; } catch {}
    if (actualizando) return decir('No reinicio: hay una actualizaci\u00f3n en curso o con su aviso pendiente.');
    const otras = [...ctx.activas.values()].filter((a) => a.que !== 'reiniciar a Hugo');
    if (otras.length) return decir(`No reinicio ahora: estoy ocupado con ${otras.map((a) => a.que).join('; ')}.`);
    const esperando = ctx.esperando ? ctx.esperando().length : 0;
    await decir(`Reiniciando.${esperando ? ` Se cancelan ${esperando} confirmaci\u00f3n(es) pendiente(s).` : ''} Al volver publico el aviso de arranque en el canal.`);
    try {
      await ex('systemd-run', ['--user', '--collect', '--quiet', `--unit=hugo-reinicio-${Date.now()}`, 'systemctl', '--user', 'restart', 'hugo.service']);
    } catch (e) {
      await decir(`No pude reiniciar: ${String(e.stderr || e.message).replace(/xox[a-z]-[A-Za-z0-9-]+/g, '[clave]').trim().slice(0, 200)}. Sigo activo.`);
    }
  }, { nombre: 'reiniciar a Hugo' });
}
