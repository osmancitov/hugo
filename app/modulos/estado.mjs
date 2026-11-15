// Modulo estado: "@hugo estado" informa de lo que Hugo sabe de si mismo: si esta ocupado, esperando un 👍 o libre.
// Solo cuenta lo que Hugo registra de verdad (trabajo en curso, confirmaciones pendientes, actualizacion en curso).
// No mira el sistema: no dice nada de la Debian ni de otros procesos.
const dur = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} d ${h % 24} h`;
};

export function registrar(ctx) {
  const { app, botToken } = ctx;
  ctx.comando(/^\s*(estado)\s*[.!?]*\s*$/i, async (event) => {
    const hilo = event.thread_ts || event.ts;
    const activas = [...ctx.activas.values()].filter((a) => a.que !== 'dar el estado');
    const esperando = ctx.esperando ? ctx.esperando() : [];
    let actualizando = false;
    try { actualizando = ctx.actualizacionEnCurso ? await ctx.actualizacionEnCurso() : false; } catch {}
    const l = [];
    if (activas.length) l.push(`Estoy trabajando en: ${activas.map((a) => `${a.que} (desde hace ${dur(Date.now() - a.desde)})`).join('; ')}.`);
    if (actualizando) l.push('Hay una actualizaci\u00f3n en curso o con su aviso pendiente.');
    if (esperando.length) l.push(`Espero tu \u{1F44D} para: ${esperando.map((e) => `${e.que} (desde hace ${dur(Date.now() - e.desde)})`).join('; ')}. Sin respuesta en 10 minutos se descarta.`);
    if (!activas.length && !actualizando && !esperando.length) l.push('Libre: no hago nada y no espero ninguna instrucci\u00f3n.');
    l.push(`Llevo activo ${dur(Date.now() - ctx.desde)} desde el \u00faltimo arranque.`);
    await app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: hilo, text: l.join('\n') });
  }, { nombre: 'dar el estado' });
}
