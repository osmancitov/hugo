// Ayuda breve: una orden por linea, sin cambiar permisos ni confirmaciones.
const TEXTO = [
  '*Comandos de Hugo* - escribe @Hugo y la orden:',
  '`estado` - que hago y que confirmaciones espero.',
  '`envia archivo` - enviar un archivo al hilo.',
  '`borrar hilo` - borrar el hilo actual.',
  '`actualiza` - instalar la version de GitHub.',
  '`stop` - detener el trabajo en curso.',
  '`restart` - reiniciar Hugo.',
  '`hola` - saludar.',
  '`ayuda` - mostrar esta lista.',
  'Borrar, guardar, enviar, actualizar, parar y reiniciar piden tu pulgar arriba. Los permisos de cada orden no cambian.',
].join('\n');

export function registrar(ctx) {
  const { app, botToken } = ctx;
  ctx.comando(/^\s*(ayuda)\s*[.!?]*\s*$/i, async (event) => {
    await app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: event.thread_ts || event.ts, text: TEXTO });
  }, { nombre: 'mostrar la ayuda' });
}
export const _prueba = { TEXTO };
