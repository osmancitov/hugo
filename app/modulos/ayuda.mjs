// Modulo ayuda: "@hugo ayuda" (o "comandos") lista las ordenes de Slack que Hugo entiende.
const TEXTO = [
  '*Ordenes de Hugo* (mencionalo con @Hugo):',
  '\u2022 `borrar hilo`: dentro de un hilo, pide confirmaci\u00f3n y lo borra.',
  '\u2022 archivos adjuntos: los guarda en Descargas.',
  '\u2022 `envia RUTA`: pide confirmaci\u00f3n y sube ese archivo al hilo.',
  '\u2022 `actualiza` con un `.sh` adjunto: pide confirmaci\u00f3n, lo instala y reinicia a Hugo.',
  '\u2022 `actualiza` sin adjunto: baja la \u00faltima versi\u00f3n de GitHub, pide confirmaci\u00f3n, la instala y reinicia a Hugo.',
  '\u2022 `registra stock CODIGO [CODIGO ...]` / `registra cripto CODIGO [CODIGO ...]`: recorre historiales completos en orden, sin pedir confirmaci\u00f3n. Incluye el mes en curso solo hasta el ultimo dia cerrado UTC. Edita un mensaje por activo con una linea por mes; conserva el avance para retomar tras un corte. Con `desde AAMM` tras la clase (2607 = julio de 2026) no baja de ese mes.',
  '\u2022 `registra continuar`: retoma un recorrido pausado tras corregir la causa, sin pedir confirmaci\u00f3n.',
  '\u2022 `radiograf\u00eda [CLASE] CODIGO [CODIGO ...]`: dibuja la radiograf\u00eda de variaci\u00f3n de cada activo con sus registros guardados, la sube al hilo y la guarda en graficas/ (misma estructura que registros/; HUGO_GRAFICAS_DIR cambia la ra\u00edz), sin \ud83d\udc4d. La CLASE (stock/cripto) es opcional, aplica a toda la lista y desambigua c\u00f3digos con registros en las dos clases.',
  '\u2022 `sincroniza registros`: fuerza ya una pasada de la sincronizaci\u00f3n (que es autom\u00e1tica, sin \ud83d\udc4d) de los registros de velas entre la Debian y GitHub, sin pisar contenido distinto.',
  '\u2022 `estado`: dice si est\u00e1 haciendo algo o esperando instrucciones.',
  '\u2022 `stop`: pide tu \ud83d\udc4d y detiene el trabajo en curso (borrado, registro o sincronizaci\u00f3n). Lo ya hecho se conserva.',
  '\u2022 `restart` o `reiniciar`: pide tu \ud83d\udc4d y reinicia a Hugo; si est\u00e1 haciendo un trabajo, lo interrumpe antes.',
  '\u2022 `ayuda` o `comandos`: muestra esta lista.',
].join('\n');

export function registrar(ctx) {
  const { app, botToken } = ctx;
  ctx.comando(/^\s*(ayuda|comandos)\s*[.!?]*\s*$/i, async (event) => {
    await app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: event.thread_ts || event.ts, text: TEXTO });
  }, { nombre: 'mostrar la ayuda' });
}
export const _prueba = { TEXTO };
