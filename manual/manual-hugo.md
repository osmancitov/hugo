# Manual de Hugo

## Qué es
Un bot pequeño de Slack, propio, independiente de otros programas. Corre en la Debian como servicio. Es el puente propio entre Slack y la Debian, pensado para el trabajo con archivos y cambios.


## Para qué existe
Hugo existe para quitarle trabajo al usuario. Lo que Hugo ya puede hacer (recibir, enviar, colocar y aplicar archivos, borrar hilos) lo hacen el asistente de IA del usuario y Hugo entre los dos, sin devolverle al usuario copias ni comandos manuales. El usuario decide y confirma con 👍. Esto no amplía permisos: los límites de "Quién da órdenes" y de la confirmación siguen igual, y el asistente solo puede pedir actualizar.


## Comandos (consulta rápida)

### En Slack (mencionar a @Hugo; solo las da el usuario)
| Orden | Qué hace |
| --- | --- |
| `@Hugo borrar hilo` | Dentro de un hilo. Pide confirmación y borra lo que Slack permita. |
| `@Hugo` + archivos adjuntos | Pide confirmación y los guarda en Descargas. No pisa uno existente. |
| `@Hugo envia RUTA` | Pide confirmación y sube ese archivo al hilo. También `envía` y `manda`. Un nombre sin ruta se busca en Descargas. |
| `@Hugo actualiza` + un `.sh` adjunto | Pide confirmación, guarda el `.sh`, lo ejecuta y reinicia a Hugo. También `actualizar`. |
| `@Hugo actualiza` sin adjunto | Baja la última versión de GitHub (también `actualiza github`), muestra el commit y los archivos que cambian, pide confirmación, instala y reinicia. |
| `@Hugo actualiza hilo` | Dentro de un hilo: usa el último `.sh` adjuntado en ese hilo. |
| `@Hugo estado` | Dice qué está haciendo, qué confirmación espera o que está libre, y cuánto lleva activo. |
| `@Hugo restart` o `@Hugo reiniciar` | Reinicia a Hugo. No lo hace si hay una actualización en curso o está ocupado con otro trabajo. |
| `@Hugo ayuda` o `@Hugo comandos` | Muestra esta lista de órdenes de Slack. |

- Cualquier otro texto: Hugo responde que no reconoce la orden y apunta a `ayuda`. No ejecuta nada.
- Las confirmaciones son con 👍 del usuario; 10 minutos sin respuesta = no.

### En la consola de la Debian (no son órdenes de Slack)
- Estado del servicio: `systemctl --user status hugo.service`
- Registro: `journalctl --user -u hugo.service -n 30` (no imprime claves)
- Reiniciar: `systemctl --user restart hugo.service` (publica otro aviso de arranque)
- Parar: `systemctl --user stop hugo.service`
- Instalación manual de una actualización (solo si Hugo no puede recibirla): guardar `actualizar-hugo.sh` en Descargas y ejecutar `bash ~/Downloads/actualizar-hugo.sh`.

## Regla: Hugo es modular
- Cada capacidad es un módulo: un archivo propio en `app/modulos/`.
- `app.mjs` solo arranca Hugo y conecta los módulos; no contiene su lógica.
- Un módulo que sirve para varias cosas es uno solo y se usa muchas veces: los demás lo llaman, sin copiar su lógica. Así se actualiza en un solo sitio.
- Módulos: `saludo.mjs` (aviso al iniciar y respuesta a una orden no reconocida), `confirmacion.mjs` (la confirmación común), `borrar-hilo.mjs`, `archivos.mjs`, `actualizar.mjs`, `github.mjs`, `estado.mjs`, `ayuda.mjs`, `reiniciar.mjs`.


## Qué hace
- Al iniciar publica un mensaje nuevo en el canal definido en `HUGO_AVISO_CANAL` con la fecha y hora del arranque en UTC-4, formato `Sat Nov 14 - 10:20 PM`.
- Si lo mencionan con un texto que no es una orden, responde en el hilo que no la reconoce y que `ayuda` muestra las órdenes.
- `borrar hilo`: pregunta diciendo cuántos mensajes son de Hugo, cuántos del usuario y cuántos de otros, y borra los que Slack permita. Si alguno no se puede borrar, el primer mensaje del hilo se conserva y Hugo lo dice.
- Recibir archivos: guarda en Descargas sin pisar uno existente. Guardar no ejecuta ni aplica nada; aplicar una actualización es solo del módulo `actualizar`.
- Servir archivos: la pregunta muestra la ruta completa y el tamaño. No envía archivos dentro de `~/Documents/hugo/keys/`, `~/.ssh` ni `~/.gnupg`, ni archivos cuyo nombre indica clave, token o contraseña. Alcance real: el filtro mira solo la ruta y el nombre del archivo; no examina su contenido, así que un archivo con otro nombre se enviaría si el usuario lo confirma.
- `estado` informa solo de lo que Hugo registra: trabajo en curso, confirmaciones pendientes y actualización en curso. No revisa la Debian ni otros procesos.
- `restart`/`reiniciar` reinicia el servicio `hugo.service`; las confirmaciones pendientes se cancelan y se publica otro aviso de arranque.
- Configurado para arrancar al encender la Debian (servicio de usuario `hugo.service` con `linger`); aún no se ha comprobado reiniciando la Debian.

## Quién da órdenes
- Las órdenes (borrar, guardar, enviar, actualizar, estado, reiniciar, ayuda) solo las acepta el usuario definido en `HUGO_USUARIO` (`app/config.env`). Sin ese valor, Hugo no acepta ninguna.
- Única excepción: El asistente de IA (`HUGO_DELEGADO`) puede pedir actualizar y nada más. Lo pide con `@hugo actualiza`; la confirmación sigue siendo del usuario.
- Si otra persona o bot pide una orden que Hugo reconoce, la ignora sin responder. Un texto que no es una orden recibe la respuesta de "no reconozco esa orden", venga de quien venga.


## Actualizar desde GitHub
- Fuente: el repositorio público definido en `HUGO_GITHUB` (`app/config.env`, formato `propietario/repositorio`), rama `main`. Hugo solo descarga; nunca sube nada.
- `@hugo actualiza` sin adjunto (o `@hugo actualiza github`): Hugo busca el último commit, descarga ese commit exacto a una carpeta temporal, comprueba que los archivos son normales y pasan `node --check`, y compara su contenido con lo instalado.
- Si no hay diferencias responde que ya está al día. Si las hay, pregunta con el commit, su título y los archivos que cambian (nuevo, cambiado o se borra). Con 👍 del usuario hace copia, instala, reinicia y, si falla, vuelve a lo anterior.
- Solo toca `app/app.mjs`, `app/modulos/` y `manual/manual-hugo.md`. No toca `config.env`, `keys/`, `historial-hugo.md`, `package.json` ni `node_modules/`.
- El aviso final es «Hugo actualizado (commit …)» si salió bien, o el aviso de fallo con las últimas líneas del registro. El saludo de arranque sigue siendo la fecha.
- Sin internet o con GitHub caído: dice que no pudo comprobar y no cambia nada.
- Al arrancar (unos segundos después del saludo con la fecha) Hugo comprueba GitHub en segundo plano y avisa en el canal solo si hay cambios («Hay una actualización en GitHub: commit …»); aplicar sigue pidiendo el 👍 con `@Hugo actualiza`. Si ya está al día, no dice nada. Sin conexión: 3 intentos cortos, un aviso único («No pude comprobar GitHub al arrancar. Sigo con la versión instalada, sin dar por comprobada la actualización») y reintentos a los 2, 10 y 60 minutos; si después comprueba, avisa los cambios o «Comprobado: Hugo está al día». Comprobar nunca instala ni reinicia, por lo que no puede causar un bucle de reinicios.
- El último commit instalado queda en `~/.local/share/hugo-respaldo/github-instalado.json`.

## Confirmación (un solo módulo, usado por todos)
- Los demás módulos lo llaman cuando necesitan confirmar; ninguno trae su propia versión.
- Regla: 👍 = sí; 10 minutos sin respuesta = no. La pregunta solo muestra "👍 = sí"; la espera de 10 minutos funciona sin anunciarse.
- Hugo publica la pregunta en el hilo. Confirma siempre el usuario (`HUGO_USUARIO`), también cuando la orden la dio el asistente; el 👍 de otra persona o del asistente se ignora. Una respuesta tardía no cuenta.
- La usan: borrar hilo, guardar archivos, enviar archivos y actualizar (con `.sh` o desde GitHub). Un reinicio de Hugo cancela las confirmaciones pendientes.


## Actualizar Hugo desde Slack
- Adjuntar el instalador `.sh` y mencionar a Hugo con la palabra "actualiza" (también basta un archivo llamado `actualizar-hugo*.sh`). Un solo archivo por vez, solo `.sh`.
- `@hugo actualiza hilo` dentro de un hilo toma el último `.sh` adjuntado en ese hilo. (`actualiza` a secas, sin adjunto, baja de GitHub.) Si la orden la da el asistente, solo cuenta un `.sh` subido por él o por el usuario.
- Hugo pregunta así: `Solicitud.` y, en la línea siguiente, `¿Aplico NOMBRE (TAMAÑO, subida por @AUTOR)?`, más `👍 = sí`. Con 👍 del usuario guarda el archivo en Descargas (con sello de fecha si ya existe uno igual), muestra su sha256, lo ejecuta fuera del servicio (`systemd-run --user`, porque el instalador reinicia a Hugo) y al terminar avisa en el mismo hilo.
- El aviso final da el código de salida real del instalador y sus últimas líneas. Solo dice que volvió a lo anterior si el propio instalador lo informa. Si el instalador falla antes de reiniciar, el mismo Hugo avisa; si no hay resultado a los 3 minutos, lo dice y conserva el estado.
- Una actualización a la vez. El estado queda en `~/.local/share/hugo-respaldo/pendiente.json` hasta que el aviso sale.
- El instalador deja en `~/Documents/hugo/app/` el programa y en `~/Documents/hugo/manual/` este manual y el historial (`manual-hugo.md`, `historial-hugo.md`). Copia lo anterior a `~/.local/share/hugo-respaldo/<fecha>` y, si algo falla o Hugo no queda activo, restaura `app.mjs`, `modulos/`, `config.env` y los dos documentos (o los quita si no existían).
- Instalación manual: ver "Comandos", consola de la Debian.


## Uso diario
- Hablarle: mencionarlo en el canal, por ejemplo `@Hugo ayuda`.
- Cambiar el canal del aviso, la persona que da órdenes o quién puede pedir actualizar: editar `app/config.env` (`HUGO_AVISO_CANAL`, `HUGO_USUARIO`, `HUGO_DELEGADO`; `HUGO_RECIBIDOS` solo para recibir en otra carpeta que Descargas) y reiniciar. Las órdenes de consola están en "Comandos".

## Dónde está cada cosa (`~/Documents/hugo`)
- `app/`: el programa: `app.mjs`, `modulos/`, `package.json`, `config.env`, `node_modules/`, `package-lock.json`.
- `keys/`: Hugo lee `.bot-token` y `.app-token` al arrancar, y `.user-token` solo al borrar hilos. No usa las claves de Binance.
- `img/`: `hugo-avatar.jpg`.
- `manual/`: este manual (`manual/manual-hugo.md`) y el historial (`manual/historial-hugo.md`).
- Servicio: `~/.config/systemd/user/hugo.service`.
- Copias de versiones anteriores y estado de actualizaciones: `~/.local/share/hugo-respaldo/` (fuera de `hugo/`).


## Cómo se construye
- Sin archivos temporales dentro de `hugo/`. El instalador se ejecuta desde Descargas.
- Los secretos nunca van por chat.
- Hugo es modular (ver arriba).


## Borrado de hilos: alcance real
- Los mensajes de Hugo los borra con su propio token.
- Los demás los borra con `keys/.user-token`, y solo los que ese usuario puede borrar en Slack.
- Los hilos largos se leen completos, por páginas.
- El hilo se lee con el token del bot: Hugo debe estar en el canal y tener el permiso de historial de ese tipo de canal (hoy solo `channels:history`, canales públicos). Si no puede leerlo, lo dice y no borra nada.
- Los archivos se descargan solo desde `files.slack.com`; los archivos remotos (no alojados en Slack) no se descargan.


## Slack (app de Hugo)
- Conexión: Socket Mode. El programa usa los eventos `app_mention` y `reaction_added`.
- Permisos del bot: app_mentions:read, channels:history, channels:join, chat:write, files:read, files:write, reactions:read.
- Permiso de usuario: chat:write (para borrar hilos).
