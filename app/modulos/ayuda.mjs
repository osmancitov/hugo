// Ayuda breve: una orden por linea, sin cambiar permisos ni confirmaciones.
const TEXTO = [
  '*Comandos de Hugo* - escribe @Hugo y la orden:',
  '`estado` - que hago y que confirmaciones espero.',
  '`estado del registro` - hasta que dia hay velas y ultima publicacion de datos.',
  '`registra CLASE todos` - cotejar Binance, avisar altas/bajas y registrar todo.',
  '`registra CLASE CODIGO ...` - registrar historiales (stock o cripto).',
  '`registra CLASE desde AAMM CODIGO ...` - registrar desde ese mes.',
  '`registra continuar` - retomar un registro pausado.',
  '`radiografia [CLASE] CODIGO ...` - dibujar con las velas guardadas.',
  '`sincroniza registros` - copiar registros entre el equipo y GitHub.',
  '`envia RUTA` - enviar un archivo al hilo.',
  '`borrar hilo` - borrar el hilo actual.',
  '`actualiza` - instalar la version de GitHub.',
  '`actualiza` + archivo .sh - instalar ese archivo.',
  '`actualiza hilo` - usar el ultimo instalador del hilo.',
  '`stop` - detener el trabajo en curso.',
  '`restart` o `reiniciar` - reiniciar Hugo.',
  '`ayuda` o `comandos` - mostrar esta lista.',
  'Tambien puedes adjuntar archivos para guardarlos en Descargas.',
  'Borrar, guardar, enviar, actualizar, parar y reiniciar piden tu pulgar arriba. Registrar, dibujar, sincronizar y consultar no. Los permisos de cada orden no cambian.',
].join('\n');

export function registrar(ctx) {
  const { app, botToken } = ctx;
  ctx.comando(/^\s*(ayuda|comandos)\s*[.!?]*\s*$/i, async (event) => {
    await app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: event.thread_ts || event.ts, text: TEXTO });
  }, { nombre: 'mostrar la ayuda' });
}
export const _prueba = { TEXTO };
