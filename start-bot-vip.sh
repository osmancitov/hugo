#!/bin/sh
# Bot VIP: abre el monitor. Vale doble clic en Archivos (Ejecutar) o terminal:
#   ~/Documents/hugo/start-bot-vip.sh
# Si se abrió sin terminal (doble clic), se reabre él mismo dentro de una.
# El estado (estado-vip.json) queda siempre aquí, junto al script.

SELF="$(readlink -f "$0")"

if [ ! -t 1 ] && command -v gnome-terminal >/dev/null 2>&1; then
  exec gnome-terminal -- bash -c "\"$SELF\"; echo; echo 'Pulsa Enter para cerrar esta ventana'; read _"
fi

cd "$(dirname "$SELF")" || exit 1

if pgrep -f "monitor_vip.py" >/dev/null 2>&1; then
  echo "El monitor ya está corriendo en otra terminal; no abro una segunda copia."
  exit 1
fi

exec python3 -u bot-vip/monitor_vip.py --esperar-nucleo --intervalo 5 "$@"
