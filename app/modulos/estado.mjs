// Modulo estado: "@hugo estado" informa de lo que Hugo sabe de si mismo: si esta ocupado, esperando un 👍 o libre.
// Solo cuenta lo que Hugo registra de verdad (trabajo en curso, confirmaciones pendientes, actualizacion en curso).
// No mira el sistema: no dice nada de la Debian ni de otros procesos.
// Libre tambien dice que sigue y que quedo hecho (pedido del usuario, 20-nov-2026: el «Libre»
// pelado no le respondia nada): ultimo dia con corrida completa y proxima corrida, un dato por
// linea, con lo que el ciclo ya mide (marca y proximaCorrida); sin marca, la linea no sale.
const TZ = 'America/Caracas'; // la hora que le importa al usuario
const DIA = 86400000;
const diaLocal = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(t));
const horaLocal = (t) => new Intl.DateTimeFormat('es', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t));
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
    // Un registro pausado no esta activo ni espera pulgar, pero bloquea registros nuevos: no callarlo.
    let pausado = null;
    try { pausado = ctx.registroPendiente ? ctx.registroPendiente() : null; } catch {}
    const l = [];
    if (activas.length) l.push(`Estoy trabajando en:\n${activas.map((a) => `\u00b7 ${a.que} (desde hace ${dur(Date.now() - a.desde)})`).join('\n')}`);
    if (actualizando) l.push('Hay una actualizaci\u00f3n en curso o con su aviso pendiente.');
    if (esperando.length) l.push(`Espero tu \u{1F44D} para:\n${esperando.map((e) => `\u00b7 ${e.que} (desde hace ${dur(Date.now() - e.desde)})`).join('\n')}\nSin respuesta en 10 minutos se descarta.`);
    if (pausado) l.push(`Tengo un registro pausado en ${pausado}: \`registra continuar\` lo retoma, \`descarta registro\` lo abandona (sin borrar los datos guardados).`);
    if (!activas.length && !actualizando && !esperando.length && !pausado) {
      l.push('Libre: no hago nada y no espero ninguna instrucci\u00f3n.');
      const ahora = (ctx.ahora || Date.now)();
      let info = null;
      try { info = ctx.cicloInfo ? ctx.cicloInfo() : null; } catch {}
      if (info) {
        if (info.ultimo) l.push(`Última corrida diaria completa: registros hasta el ${new Date(info.ultimo).toISOString().slice(0, 10)}.`);
        if (info.activa === false) {
          l.push('Puesta al día diaria automática en pausa; `pon al día` sigue manual.');
        } else if (Number.isInteger(info.proxima)) {
          const cuando = diaLocal(info.proxima) === diaLocal(ahora) ? 'hoy' : diaLocal(info.proxima) === diaLocal(ahora + DIA) ? 'mañana' : `el ${diaLocal(info.proxima)}`;
          l.push(`Próxima puesta al día diaria: ${cuando} a las ${horaLocal(info.proxima)}.`);
        }
      }
    }
    l.push(`Llevo activo ${dur(Date.now() - ctx.desde)} desde el \u00faltimo arranque.`);
    await app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: hilo, text: l.join('\n') });
  }, { nombre: 'dar el estado' });
}
