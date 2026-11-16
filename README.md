# Hugo

Bot pequeño de Slack (Socket Mode, Node.js) que corre en una Debian como servicio de usuario. Sirve de puente entre Slack y esa máquina: recibir y enviar archivos, borrar hilos, registrar velas, sincronizar los registros con este repositorio y actualizarse. Una orden de `registra` recorre el historial de uno o varios activos en orden, sin pedir 👍. Avisa dónde va y conserva el avance fuera del repositorio para retomarlo tras un corte. La sincronización de los registros con GitHub es automática. Los demás cambios conservan su confirmación del usuario, incluidas las actualizaciones del programa.

Este repositorio es la fuente del código y del manual. La Debian descarga de aquí; nunca sube.

## Contenido
- `app/app.mjs`: arranca Hugo y conecta los módulos.
- `app/modulos/`: un archivo por capacidad (`saludo`, `confirmacion`, `borrar-hilo`, `archivos`, `actualizar`, `github`, `estado`, `ayuda`, `reiniciar`, `velas`, `registro-motor`, `sincronizar-registros`; y la biblioteca `activos`, que resuelve el código de un activo a su instrumento de Binance).
- `app/config.ejemplo.env`: plantilla de la configuración local (`config.env` no se versiona).
- `manual/manual-hugo.md`: el manual, con las órdenes de Slack y las de la consola.

## Fuera del repositorio
Claves (`keys/`), `config.env`, `node_modules/`, copias de respaldo y cualquier dato local. Nunca se publican.

## Uso
Todo lo que hay que saber para operarlo y modificarlo está en el [manual](manual/manual-hugo.md).

## Pruebas sin red
`node --test pruebas/registra-directo.mjs pruebas/mes-en-curso.mjs pruebas/registro-avisos.mjs` comprueba recorrido, progreso, conflictos y recuperación con datos simulados, incluidos cortes del proceso, mes abierto, cambios de mes y sincronización de ampliaciones y reportes editados por activo con ritmo regulado. No usa cuentas ni registra activos reales.
