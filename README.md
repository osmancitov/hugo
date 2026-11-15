# Hugo

Bot pequeño de Slack (Socket Mode, Node.js) que corre en una Debian como servicio de usuario. Sirve de puente entre Slack y esa máquina: recibir y enviar archivos, borrar hilos y actualizarse. Todo lo que modifica algo pide antes un 👍 del usuario.

Este repositorio es la fuente del código y del manual. La Debian descarga de aquí; nunca sube.

## Contenido
- `app/app.mjs`: arranca Hugo y conecta los módulos.
- `app/modulos/`: un archivo por capacidad (`saludo`, `confirmacion`, `borrar-hilo`, `archivos`, `actualizar`, `github`, `estado`, `ayuda`, `reiniciar`).
- `app/config.ejemplo.env`: plantilla de la configuración local (`config.env` no se versiona).
- `manual/manual-hugo.md`: el manual, con las órdenes de Slack y las de la consola.

## Fuera del repositorio
Claves (`keys/`), `config.env`, `node_modules/`, copias de respaldo y cualquier dato local. Nunca se publican.

## Uso
Las órdenes de Slack están en la sección "Comandos" del [manual](manual/manual-hugo.md). Para actualizarse desde este repositorio, en Slack: `@Hugo actualiza` (sin adjunto). Hugo muestra el commit y los archivos que cambian, y solo instala con el 👍 del usuario.
