# Hugo

Bot pequeño de Slack (Socket Mode, Node.js) que corre en una Debian como servicio de usuario. Sirve de puente entre Slack y esa máquina: recibir y enviar archivos, borrar hilos, registrar velas, sincronizar los registros con este repositorio y actualizarse. Los registros de velas se ejecutan directamente por orden del usuario o del asistente, sin pedir 👍. La sincronización de los registros con GitHub es automática. Los demás cambios conservan su confirmación del usuario, incluidas las actualizaciones del programa.

Este repositorio es la fuente del código y del manual. La Debian descarga de aquí; nunca sube.

## Contenido
- `app/app.mjs`: arranca Hugo y conecta los módulos.
- `app/modulos/`: un archivo por capacidad (`saludo`, `confirmacion`, `borrar-hilo`, `archivos`, `actualizar`, `github`, `estado`, `ayuda`, `reiniciar`, `velas`, `sincronizar-registros`; y la biblioteca `activos`, que resuelve el código de un activo a su instrumento de Binance).
- `app/config.ejemplo.env`: plantilla de la configuración local (`config.env` no se versiona).
- `manual/manual-hugo.md`: el manual, con las órdenes de Slack y las de la consola.

## Fuera del repositorio
Claves (`keys/`), `config.env`, `node_modules/`, copias de respaldo y cualquier dato local. Nunca se publican.

## Uso
Todo lo que hay que saber para operarlo y modificarlo está en el [manual](manual/manual-hugo.md).
