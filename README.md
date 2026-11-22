# Hugo

Bot pequeño de Slack (Socket Mode, Node.js) que corre en una Debian como servicio de usuario. Sirve de puente entre Slack y esa máquina: recibir y enviar archivos, borrar hilos, registrar velas, dibujar radiografías, sincronizar los registros con este repositorio y actualizarse. Una orden de `registra` recorre el historial de uno o varios activos en orden, sin pedir 👍; `registra todo` recorre el universo completo de las dos clases (stock y luego cripto) con un solo corte UTC, y `pon al día` actualiza ese universo consultando solo lo pendiente y comprobando en disco lo ya guardado. Avisa dónde va y conserva el avance fuera del repositorio para retomarlo tras un corte. La sincronización de los registros con GitHub es automática. Los demás cambios conservan su confirmación del usuario, incluidas las actualizaciones del programa.

Este repositorio es la fuente del código y del manual. La Debian descarga de aquí; nunca sube.

## Contenido
- `app/app.mjs`: arranca Hugo y conecta los módulos.
- `app/modulos/`: un archivo por capacidad (`saludo`, `confirmacion`, `borrar-hilo`, `archivos`, `actualizar`, `github`, `estado`, `ayuda`, `reiniciar`, `detener`, `velas`, `registro-motor`, `registro-serie`, `radiografias`, `sincronizar-registros`; `reporte`, la caja única de reportes que usan todos los trabajos; y la biblioteca `activos`, que resuelve el código de un activo a su instrumento de Binance).
- `app/config.ejemplo.env`: plantilla de la configuración local (`config.env` no se versiona).
- `.github/workflows/lectura-horaria.yml`: lectura a la hora en punto UTC desde GitHub Actions mientras la Debian está apagada. La corrida empieza unos minutos antes para absorber la demora de GitHub; si la Debian ya publicó la lectura de esa hora, no toma otra ni duplica, y cada lectura guarda su instante real. No mueve el bot ni la actualización diaria general.
- `manual/manual-hugo.md`: el manual, con las órdenes de Slack y las de la consola.

## Fuera del repositorio
Claves (`keys/`), `config.env`, `node_modules/`, copias de respaldo y cualquier dato local. Nunca se publican.

## Uso
Todo lo que hay que saber para operarlo y modificarlo está en el [manual](manual/manual-hugo.md).

## Pruebas sin red
`node --test pruebas/registra-directo.mjs pruebas/registra-todo.mjs pruebas/pon-al-dia.mjs pruebas/mes-en-curso.mjs pruebas/reporte.mjs pruebas/reporte-caja.mjs pruebas/registro-avisos.mjs pruebas/actualiza-aviso.mjs pruebas/registro-corte.mjs pruebas/registro-piso.mjs pruebas/sincronizar-patrones.mjs pruebas/sincronizar-reporte.mjs pruebas/sincronizar-automatica-reporte.mjs pruebas/detener.mjs` comprueba recorrido, progreso, conflictos y recuperación con datos simulados, incluidos cortes del proceso, mes abierto, cambios de mes, sincronización de ampliaciones y reportes por activo con acumulacion local y vuelco regulado, y el reporte de avance de la sincronización automática. No usa cuentas ni registra activos reales.
