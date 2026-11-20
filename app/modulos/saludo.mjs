// Modulo saludo: aviso al arrancar (fecha y hora), respuesta a «hola» (decision del usuario,
// 20-nov-2026: «Hola, me llamo Hugo») y respuesta a una mencion sin orden reconocida.
export const RESPUESTA_HOLA = 'Hola, me llamo Hugo';
// Aviso de arranque: instante del arranque en UTC-4 (Caracas, sin cambio de horario), formato "Sat Nov 14 - 10:20 PM".
const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const horaArranque = (ms = Date.now()) => {
  const d = new Date(ms - 4 * 3600 * 1000);
  const h = d.getUTCHours();
  return `${DIAS[d.getUTCDay()]} ${MESES[d.getUTCMonth()]} ${d.getUTCDate()} - ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export function registrar(ctx) {
  const { app, botToken, canal } = ctx;
  ctx.comando(/^\s*hola\s*[.!?]*\s*$/i, async (event) => {
    await app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: event.thread_ts || event.ts, text: RESPUESTA_HOLA });
  }, { nombre: 'responder hola' });
  ctx.porDefecto(async (event) => {
    await app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: event.thread_ts || event.ts, text: 'No reconozco esa orden. Escribe @Hugo ayuda para ver las que entiendo.' });
  });
  // Aviso de arranque: mensaje nuevo en el canal (no en un hilo). Se une al canal si es publico.
  ctx.alIniciar(async () => {
    try { await app.client.conversations.join({ token: botToken, channel: canal }); } catch (e) { console.error('join:', e.data?.error || e.message); }
    await app.client.chat.postMessage({ token: botToken, channel: canal, text: horaArranque() });
  });
}
