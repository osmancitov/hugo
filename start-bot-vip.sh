#!/bin/sh
# Arranca el monitor VIP desde cualquier carpeta:
#   ~/Documents/hugo/monitor-vip.sh
# El estado (estado-vip.json) y las referencias quedan siempre aquí, junto al script.
# Se puede relanzar tras un corte de luz: retoma lo guardado.

cd "$(dirname "$(readlink -f "$0")")" || exit 1

if pgrep -f "monitor_vip.py" >/dev/null 2>&1; then
  echo "El monitor ya está corriendo en otra terminal; no abro una segunda copia."
  exit 1
fi

exec python3 -u bot-vip/monitor_vip.py --esperar-nucleo --intervalo 5 "$@"
