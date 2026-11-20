// Modulo detener: "@hugo stop" frena el trabajo largo en curso, con el pulgar arriba del usuario.
// Una sola logica de parada para todo: sube ctx.parada.n y cada trabajo largo (borrar hilo, registro
// de velas, sincronizacion) la mira en cada paso y frena limpio. Lo ya hecho no se deshace:
// el registro queda pausado y se retoma con "registra continuar"; el borrado deja el resto del hilo;
// la sincronizacion frena entre archivos y la pasada siguiente retoma lo que falte.
// Sin trabajo largo en curso no hace nada; una actualizacion en curso no se detiene (ella misma reinicia a Hugo).
export function registrar(ctx) {
  const { app, botToken } = ctx;
  ctx.comando(/^\s*stop\s*[.!?]*\s*$/i, async (event) => {
    const hilo = event.thread_ts || event.ts;
    const decir = (text) => app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: hilo, text });
    let actualizando = false;
    try { actualizando = ctx.actualizacionEnCurso ? await ctx.actualizacionEnCurso() : false; } catch {}
    if (actualizando) return decir('Hay una actualizaci\u00f3n en curso; esa no la detengo (termina y reinicia sola).');
    const largos = [...ctx.activas.values()].filter((a) => a.largo);
    if (!largos.length) {
      const esperando = ctx.esperando ? ctx.esperando() : [];
      return decir(esperando.length
        ? `No estoy haciendo ning\u00fan trabajo que detener; solo espero tu \u{1F44D} para:\n${esperando.map((e) => `\u00b7 ${e.que}`).join('\n')}\nSin respuesta en 10 minutos se descarta solo.`
        : 'No estoy haciendo ning\u00fan trabajo que detener.');
    }
    await ctx.confirmar({
      channel: event.channel, thread_ts: hilo, user: ctx.usuario,
      que: 'detener el trabajo en curso',
      texto: `Estoy haciendo:\n${largos.map((a) => `\u00b7 ${a.que}`).join('\n')}\n\u00bfLo detengo? Lo ya hecho se conserva.`,
      alSi: async () => {
        ctx.parada.n++;
        await decir('Detengo el trabajo en curso; cada trabajo avisa aqu\u00ed cuando haya parado.');
      },
      alNo: async () => { await decir('Sin respuesta: no detuve nada.'); },
    });
  }, { nombre: 'detener el trabajo en curso' });
}
