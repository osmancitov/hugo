// Modulo confirmacion: UNO solo, lo usan todos los demas modulos (ctx.confirmar).
// Regla: pulgar arriba = si. 10 minutos sin respuesta = no.
// Detalle de esta version: confirma quien dio la orden; otras reacciones se ignoran.
const pendientes = new Map(); // "canal:ts" -> { user, alSi, alNo, timer, que, desde }

const esPulgar = (r) => r === '+1' || r === 'thumbsup' || r.startsWith('+1::') || r.startsWith('thumbsup::');

export function registrar(ctx) {
  const { app, botToken } = ctx;

  // confirmar({ channel, thread_ts, user, texto, alSi, alNo, minutos })
  ctx.confirmar = async ({ channel, thread_ts, user, texto, alSi, alNo, minutos = 10, que = 'una orden' }) => {
    const r = await app.client.chat.postMessage({
      token: botToken, channel, thread_ts,
      text: `${texto}\n\u{1F44D} = s\u00ed.`,
    });
    const clave = `${channel}:${r.ts}`;
    const timer = setTimeout(async () => {
      if (!pendientes.delete(clave)) return;
      try { await alNo({ motivo: 'sin-respuesta', ts: r.ts }); } catch (e) { console.error('alNo:', e.data?.error || e.message); }
    }, minutos * 60 * 1000);
    pendientes.set(clave, { user, alSi, alNo, timer, que, desde: Date.now() });
    return r.ts;
  };

  // Lo que espera un 👍 (para el comando estado).
  ctx.esperando = () => [...pendientes.values()].map((p) => ({ que: p.que, desde: p.desde }));

  app.event('reaction_added', async ({ event }) => {
    if (event.item?.type !== 'message') return;
    const clave = `${event.item.channel}:${event.item.ts}`;
    const p = pendientes.get(clave);
    if (!p || event.user !== p.user || !esPulgar(event.reaction)) return;
    clearTimeout(p.timer);
    pendientes.delete(clave);
    const idAct = `conf-${clave}`;
    ctx.activas.set(idAct, { que: p.que, desde: Date.now() });
    try { await p.alSi({ ts: event.item.ts }); } catch (e) { console.error('alSi:', e.data?.error || e.message); }
    finally { ctx.activas.delete(idAct); }
  });
}

export const _prueba = { pendientes, esPulgar };
