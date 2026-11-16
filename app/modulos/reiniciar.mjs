// Modulo reiniciar: "@hugo restart" o "@hugo reiniciar" reinicia el servicio de Hugo (hugo.service).
// Una sola logica para los dos nombres. No reinicia si hay una actualizacion en curso (el instalador ya lo reinicia).
// Siempre pide el pulgar arriba del usuario antes de reiniciar. Si Hugo esta haciendo un trabajo largo, con el
// pulgar lo interrumpe antes de reiniciar: misma parada unica que stop (sube ctx.parada.n y cada trabajo frena
// limpio); lo ya hecho no se deshace. Un reinicio cancela las confirmaciones pendientes y publica otro aviso de arranque.
// Se lanza fuera del proceso (systemd-run --user) para que la orden sobreviva al reinicio.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const ex = promisify(execFile);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ESPERA_PARADA_MS = 4000; // margen para que el trabajo frene limpio antes del reinicio; luego se reinicia igual

export function registrar(ctx) {
  const { app, botToken } = ctx;
  ctx.comando(/^\s*(restart|reiniciar)\s*[.!?]*\s*$/i, async (event) => {
    const hilo = event.thread_ts || event.ts;
    const decir = (text) => app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: hilo, text });
    let actualizando = false;
    try { actualizando = ctx.actualizacionEnCurso ? await ctx.actualizacionEnCurso() : false; } catch {}
    if (actualizando) return decir('No reinicio: hay una actualizaci\u00f3n en curso o con su aviso pendiente.');

    const lanzarReinicio = async (interrumpo) => {
      const esperando = ctx.esperando ? ctx.esperando().length : 0;
      await decir(`${interrumpo ? 'Trabajo detenido. ' : ''}Reiniciando.${esperando ? ` Se cancelan ${esperando} confirmaci\u00f3n(es) pendiente(s).` : ''} Al volver publico el aviso de arranque en el canal.`);
      try {
        await ex('systemd-run', ['--user', '--collect', '--quiet', `--unit=hugo-reinicio-${Date.now()}`, 'systemctl', '--user', 'restart', 'hugo.service']);
      } catch (e) {
        await decir(`No pude reiniciar: ${String(e.stderr || e.message).replace(/xox[a-z]-[A-Za-z0-9-]+/g, '[clave]').trim().slice(0, 200)}. Sigo activo${interrumpo ? ' y el trabajo qued\u00f3 detenido' : ''}.`);
      }
    };

    const largos = [...ctx.activas.values()].filter((a) => a.largo && a.que !== 'reiniciar a Hugo');

    // Reiniciar siempre pide el pulgar arriba del usuario; con trabajo largo, el pulgar tambien lo interrumpe.
    await ctx.confirmar({
      channel: event.channel, thread_ts: hilo, user: event.user,
      que: largos.length ? 'interrumpir el trabajo y reiniciar a Hugo' : 'reiniciar a Hugo',
      texto: largos.length
        ? `Estoy haciendo: ${largos.map((a) => a.que).join('; ')}. \u00bfLo interrumpo y reinicio? Lo ya hecho se conserva.`
        : '\u00bfReinicio a Hugo? Al volver publico el aviso de arranque en el canal.',
      alSi: async () => {
        if (!largos.length) return lanzarReinicio(false);
        ctx.parada.n++;
        const t0 = Date.now();
        while ([...ctx.activas.values()].some((a) => a.largo) && Date.now() - t0 < ESPERA_PARADA_MS) await espera(200);
        await lanzarReinicio(true);
      },
      alNo: async () => { await decir(`Sin respuesta: no reinicio${largos.length ? ' ni detengo nada' : ''}.`); },
    });
  }, { nombre: 'reiniciar a Hugo' });
}
