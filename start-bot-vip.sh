#!/bin/sh
# Bot VIP: actualiza el código y abre el monitor. Todo con doble clic en
# Archivos (Ejecutar) o desde la terminal:
#   ~/Documents/hugo/start-bot-vip.sh
# - Si se abrió sin terminal, se reabre él mismo dentro de una.
# - Si no hay internet o la actualización no aplica, abre con la copia actual
#   (lo dice claro; nunca finge que actualizó).
# - El estado (estado-vip.json) queda siempre aquí, junto al script.

# El bloque { } hace que el shell lea el script entero antes de ejecutarlo,
# así un git pull que cambie este mismo archivo no rompe la corrida en curso.
{
SELF="$(readlink -f "$0")"

if [ ! -t 1 ] && command -v gnome-terminal >/dev/null 2>&1; then
  exec gnome-terminal -- bash -c "\"$SELF\"; echo; echo 'Pulsa Enter para cerrar esta ventana'; read _"
fi

cd "$(dirname "$SELF")" || exit 1

if pgrep -f "monitor_vip.py" >/dev/null 2>&1; then
  echo "El monitor ya está corriendo en otra terminal; no abro una segunda copia."
  exit 1
fi

if git pull --ff-only --quiet 2>/dev/null; then
  echo "Código al día."
else
  echo "No pude actualizar (sin internet o cambios locales); arranco con la copia actual."
fi

exec python3 -u bot-vip/monitor_vip.py --esperar-nucleo --intervalo 5 "$@"
exit
}
