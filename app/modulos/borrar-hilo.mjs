// Modulo borrar-hilo: "@hugo borrar hilo" dentro de un hilo. Pide confirmacion con el modulo comun.
// Slack decide que se puede borrar: el token del bot borra solo mensajes del propio bot;
// el token de usuario (keys/.user-token) borra lo que ese usuario puede borrar en Slack.
// La pregunta dice cuantos mensajes son de Hugo, cuantos del usuario del token y cuantos de otros.
// Si algun mensaje no se puede borrar, el primer mensaje del hilo NO se borra y Hugo lo dice.
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export function registrar(ctx) {
  const { app, botToken } = ctx;
  const pausa = Number(process.env.HUGO_PAUSA_BORRADO_MS ?? 1200);

  // Lee todas las paginas del hilo.
  async function mensajesDelHilo(channel, thread_ts) {
    const todos = [];
    let cursor;
    do {
      const r = await app.client.conversations.replies({ token: botToken, channel, ts: thread_ts, limit: 200, cursor });
      todos.push(...(r.messages || []));
      cursor = r.response_metadata?.next_cursor || undefined;
    } while (cursor);
    return todos;
  }

  // Quien es el dueno del token de usuario (vacio si no hay token o no sirve).
  async function duenoDelToken() {
    const t = ctx.leerClave('.user-token');
    if (!t) return { token: '', id: '' };
    try { return { token: t, id: (await app.client.auth.test({ token: t })).user_id || '' }; }
    catch (e) { console.error('user-token:', e.data?.error || e.message); return { token: '', id: '' }; }
  }

  function clasificar(msgs, botId, userId) {
    const c = { hugo: 0, tuyos: 0, otros: 0 };
    for (const m of msgs) {
      if (botId && m.user === botId) c.hugo++;
      else if (userId && m.user === userId) c.tuyos++;
      else c.otros++;
    }
    return c;
  }

  async function borrar(channel, thread_ts) {
    const msgs = await mensajesDelHilo(channel, thread_ts);
    const { token: userToken } = await duenoDelToken();
    const respuestas = msgs.filter((m) => m.ts !== thread_ts).reverse(); // de la mas nueva a la mas vieja
    const raiz = msgs.filter((m) => m.ts === thread_ts);
    let borrados = 0;
    const fallos = {};
    const intentar = async (m) => {
      const token = ctx.botUserId && m.user === ctx.botUserId ? botToken : userToken;
      if (!token) { fallos.sin_token_de_usuario = (fallos.sin_token_de_usuario || 0) + 1; return false; }
      try {
        await app.client.chat.delete({ token, channel, ts: m.ts });
        borrados++;
        return true;
      } catch (e) {
        const c = e.data?.error || e.message;
        if (c === 'message_not_found') { borrados++; return true; }
        fallos[c] = (fallos[c] || 0) + 1;
        return false;
      } finally { if (pausa) await espera(pausa); }
    };
    for (const m of respuestas) await intentar(m);
    // El primer mensaje solo se borra si todo lo demas se borro.
    let raizBorrada = false;
    if (Object.keys(fallos).length === 0) for (const m of raiz) raizBorrada = await intentar(m);
    else if (raiz.length) fallos.primer_mensaje_conservado = 1;
    return { total: msgs.length, borrados, fallos, raizBorrada };
  }

  ctx.comando(/\bborrar\s+hilo\b/i, async (event) => {
    if (!event.thread_ts) {
      await app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: event.ts, text: 'Escr\u00edbeme \u00abborrar hilo\u00bb dentro del hilo que quieres borrar.' });
      return;
    }
    const channel = event.channel;
    const thread_ts = event.thread_ts;
    let msgs;
    try { msgs = await mensajesDelHilo(channel, thread_ts); }
    catch (e) {
      // Leer el hilo usa el token del bot: requiere que Hugo este en el canal y el permiso de historial de ese tipo de canal.
      const c = e.data?.error || e.message;
      await app.client.chat.postMessage({ token: botToken, channel, thread_ts, text: `No pude leer este hilo (${c}), as\u00ed que no borro nada.` });
      return;
    }
    const { id } = await duenoDelToken();
    const c = clasificar(msgs, ctx.botUserId, id);
    let texto = `\u00bfBorro este hilo? Tiene ${msgs.length} mensajes: ${c.hugo} de Hugo`;
    if (id) texto += `, ${c.tuyos} tuyos (los puedo borrar)`;
    if (c.otros) texto += `. ${c.otros} ${id ? 'son de otras personas o apps' : 'no son de Hugo y no tengo token de usuario v\u00e1lido'}: solo se borran si Slack lo permite`;
    texto += c.otros ? '. Si alguno no se puede borrar, dejo el primer mensaje del hilo y te lo digo.' : '.';
    await ctx.confirmar({
      channel, thread_ts, user: event.user, texto, que: 'borrar un hilo',
      alSi: async () => {
        let r;
        try { r = await borrar(channel, thread_ts); }
        catch (e) {
          await app.client.chat.postMessage({ token: botToken, channel, thread_ts, text: `No pude leer el hilo para borrarlo (${e.data?.error || e.message}).` });
          return;
        }
        console.log(`borrar-hilo: ${r.borrados}/${r.total}`, JSON.stringify(r.fallos));
        const quedan = r.total - r.borrados;
        if (quedan > 0) {
          const det = Object.entries(r.fallos).map(([k, v]) => `${k}: ${v}`).join(', ');
          await app.client.chat.postMessage({ token: botToken, channel, thread_ts, text: `Borr\u00e9 ${r.borrados} de ${r.total}. Quedan ${quedan} (${det}).` });
        }
      },
      alNo: async () => {
        await app.client.chat.postMessage({ token: botToken, channel, thread_ts, text: 'Sin respuesta: no borr\u00e9 nada.' });
      },
    });
  });
}
