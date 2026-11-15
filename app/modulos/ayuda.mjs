// Modulo ayuda: "@hugo ayuda" (o "comandos") lista las ordenes de Slack que Hugo entiende.
const TEXTO = [
  '*Ordenes de Hugo* (mencionalo con @Hugo):',
  '\u2022 `borrar hilo`: dentro de un hilo, pide confirmaci\u00f3n y lo borra.',
  '\u2022 archivos adjuntos: los guarda en Descargas.',
  '\u2022 `envia RUTA`: pide confirmaci\u00f3n y sube ese archivo al hilo.',
  '\u2022 `actualiza` con un `.sh` adjunto: pide confirmaci\u00f3n, lo instala y reinicia a Hugo.',
  '\u2022 `actualiza` sin adjunto: baja la \u00faltima versi\u00f3n de GitHub, pide confirmaci\u00f3n, la instala y reinicia a Hugo.',
  '\u2022 `registra stock ACTIVO` / `registra cripto ACTIVO`: registra directamente un mes de sus velas diarias, sin pedir confirmaci\u00f3n (registros/velas-24h/<clase>/).',
  '\u2022 `sincroniza registros`: fuerza ya una pasada de la sincronizaci\u00f3n (que es autom\u00e1tica, sin \ud83d\udc4d) de los registros de velas entre la Debian y GitHub, sin pisar contenido distinto.',
  '\u2022 `estado`: dice si est\u00e1 haciendo algo o esperando instrucciones.',
  '\u2022 `restart` o `reiniciar`: reinicia a Hugo.',
  '\u2022 `ayuda` o `comandos`: muestra esta lista.',
].join('\n');

export function registrar(ctx) {
  const { app, botToken } = ctx;
  ctx.comando(/^\s*(ayuda|comandos)\s*[.!?]*\s*$/i, async (event) => {
    await app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: event.thread_ts || event.ts, text: TEXTO });
  }, { nombre: 'mostrar la ayuda' });
}
export const _prueba = { TEXTO };
