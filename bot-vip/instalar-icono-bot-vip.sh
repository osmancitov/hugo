#!/bin/sh
# Instala el icono "Bot VIP" para abrir el monitor con doble clic, sin terminal.
# Se corre UNA sola vez. Después: Actividades -> "Bot VIP", o doble clic en el
# icono del escritorio. El icono actualiza el código y abre el monitor él solito.

set -e

APPS="$HOME/.local/share/applications"
mkdir -p "$APPS"
cat > "$APPS/bot-vip.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Bot VIP
Comment=Monitor VIP del Observatorio
Exec=gnome-terminal -- bash -c "/home/user/Documents/hugo/start-bot-vip.sh; echo; echo 'Pulsa Enter para cerrar esta ventana'; read _"
Icon=utilities-terminal
Terminal=false
Categories=Utility;
Keywords=bot;vip;monitor;
EOF

# Copia al escritorio si hay carpeta (Escritorio en español o Desktop en inglés)
# y la marca como confiable para que GNOME la deje lanzar.
for E in "$HOME/Escritorio" "$HOME/Desktop"; do
  if [ -d "$E" ]; then
    cp "$APPS/bot-vip.desktop" "$E/Bot VIP.desktop"
    chmod +x "$E/Bot VIP.desktop"
    gio set "$E/Bot VIP.desktop" metadata::trusted true 2>/dev/null || true
  fi
done

echo "Listo. Busca 'Bot VIP' en Actividades o en el escritorio: doble clic y abre."
