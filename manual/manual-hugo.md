# Manual de Hugo

Referencia del funcionamiento actual: qué hace, cómo se opera y cómo se modifica. Solo describe lo instalado. La historia de cambios va aparte, en `manual/historial-hugo.md` (solo local).

## Qué es
Bot de Slack propio (Socket Mode, Node.js). Corre en la Debian como servicio de usuario `hugo.service` y es el puente entre Slack y esa máquina: recibe y envía archivos, borra hilos y se actualiza. Existe para quitarle trabajo al usuario: el asistente de IA y Hugo hacen el trabajo y el usuario decide con 👍.

## Comandos de Slack
Se escriben mencionando `@Hugo`. Solo los da el usuario (`HUGO_USUARIO`); la única excepción es `actualiza`, que también puede pedir el asistente (`HUGO_DELEGADO`).

| Orden | Qué hace |
| --- | --- |
| `borrar hilo` | Dentro de un hilo. Pregunta y borra lo que Slack permita. |
| archivos adjuntos | Pregunta y los guarda en Descargas, sin pisar uno existente. |
| `envia RUTA` | Pregunta y sube ese archivo al hilo. También `envía` y `manda`. Un nombre sin ruta se busca en Descargas. |
| `actualiza` | Sin adjunto: baja la última versión de GitHub (también `actualiza github`), pregunta y la instala. |
| `actualiza` + `.sh` adjunto | Pregunta y ejecuta ese instalador. También basta un archivo llamado `actualizar-hugo*.sh`. |
| `actualiza hilo` | Usa el último `.sh` adjuntado en ese hilo. Si lo pide el asistente, solo cuenta uno subido por él o por el usuario. |
| `estado` | Dice qué hace, qué 👍 espera o que está libre, y cuánto lleva activo. |
| `restart` o `reiniciar` | Reinicia a Hugo. No lo hace si hay una actualización en curso o está ocupado. |
| `ayuda` o `comandos` | Muestra la lista de órdenes. |

Cualquier otro texto: Hugo responde que no reconoce la orden y apunta a `ayuda`. Lo recibe cualquiera que lo mencione, y no ejecuta nada.

### Confirmación
Todo lo que cambia algo (borrar, guardar, enviar, actualizar) se pregunta en el hilo y solo se hace con el 👍 del usuario (`HUGO_USUARIO`). El 👍 de otra persona o del asistente se ignora. Sin respuesta en 10 minutos se descarta, sin anunciarlo. Reiniciar a Hugo cancela las confirmaciones pendientes. `estado`, `ayuda` y `restart` no piden confirmación.

## Consola de la Debian (no son órdenes de Slack)
- Estado: `systemctl --user status hugo.service`
- Registro: `journalctl --user -u hugo.service -n 30` (no imprime claves)
- Reiniciar: `systemctl --user restart hugo.service`
- Parar: `systemctl --user stop hugo.service`
- Instalar un `.sh` a mano (solo si Hugo no puede recibirlo): `bash ~/Downloads/actualizar-hugo.sh`

## Actualizar
- Fuente: el repositorio público de `HUGO_GITHUB` (`propietario/repositorio`, rama `main`). Hugo solo descarga; nunca sube.
- `@Hugo actualiza` descarga el último commit a una carpeta temporal, comprueba que los archivos son normales y pasan `node --check`, y compara su contenido con lo instalado. Si no hay diferencias dice que ya está al día. Si las hay, pregunta con el commit, su título y los archivos que cambian.
- Con 👍: copia lo anterior a `~/.local/share/hugo-respaldo/<fecha>`, instala, reinicia y avisa en el hilo: «Hugo actualizado (commit …)» o el fallo con las últimas líneas del registro. Si algo falla o Hugo no queda activo, vuelve a lo anterior.
- Solo toca `app/app.mjs`, `app/modulos/` y `manual/manual-hugo.md`. No toca `config.env`, `keys/`, `historial-hugo.md`, `package.json` ni `node_modules/`.
- Con un `.sh` adjunto el flujo es el mismo (copia, reversión y aviso), pero el contenido lo trae el instalador. Una actualización a la vez; su estado queda en `~/.local/share/hugo-respaldo/pendiente.json` hasta que sale el aviso.
- Al arrancar, unos segundos después del saludo (la fecha), Hugo comprueba GitHub en segundo plano y avisa en el canal solo si hay cambios. Al día: silencio. Sin conexión: 3 intentos cortos, un aviso único («sigo con la versión instalada, sin dar por comprobada la actualización») y reintentos a los 2, 10 y 60 minutos. Comprobar nunca instala ni reinicia, así que no puede causar un bucle.
- Al iniciar publica la fecha y hora del arranque (UTC-4, `Sat Nov 14 - 10:20 PM`) en el canal `HUGO_AVISO_CANAL`.

## Dónde está cada cosa (`~/Documents/hugo`)
- `app/`: `app.mjs`, `modulos/`, `config.env` (valores no secretos), `package.json`, `node_modules/`.
- `keys/`: `.bot-token` y `.app-token` (al arrancar) y `.user-token` (solo para borrar hilos).
- `manual/`: este manual y el historial.
- Servicio: `~/.config/systemd/user/hugo.service` (arranca al encender la Debian con `linger`; aún no se ha comprobado reiniciando la Debian).
- Respaldos y estado de actualizaciones: `~/.local/share/hugo-respaldo/`, fuera de `hugo/`.
- Configuración (`app/config.env`, plantilla en `app/config.ejemplo.env`): `HUGO_AVISO_CANAL`, `HUGO_USUARIO`, `HUGO_DELEGADO`, `HUGO_GITHUB`; `HUGO_RECIBIDOS` solo para recibir en otra carpeta que Descargas. Tras cambiarla, reiniciar.

## Límites y alcance real
- Enviar archivos: no sirve `~/Documents/hugo/keys/`, `~/.ssh`, `~/.gnupg` ni archivos cuyo nombre indica clave, token o contraseña. El filtro mira la ruta y el nombre, no el contenido: un archivo con otro nombre se enviaría si el usuario confirma.
- Guardar un archivo no lo ejecuta. Solo `actualiza` ejecuta instaladores.
- Descargas de Slack: solo desde `files.slack.com`.
- Borrar hilos: los mensajes de Hugo con su token; los demás con `keys/.user-token`, solo los que ese usuario puede borrar. Si alguno no se puede borrar, el primer mensaje se conserva y lo dice. Hugo debe estar en el canal y tener `channels:history` (hoy solo canales públicos); si no puede leer el hilo, lo dice y no borra.
- `estado` informa solo de lo que Hugo registra (trabajo en curso, confirmaciones, actualización). No revisa la Debian.
- Slack: eventos `app_mention` y `reaction_added`. Permisos del bot: app_mentions:read, channels:history, channels:join, chat:write, files:read, files:write, reactions:read. Permiso de usuario: chat:write.

## Cómo modificar Hugo
1. Leer este manual antes de tocar nada. Cambiar el código en una copia del repositorio y actualizar este manual en el mismo cambio. El manual describe solo lo instalado.
2. Reglas del código: Hugo es modular. Cada capacidad es un archivo de `app/modulos/` con `registrar(ctx)`; `app.mjs` solo arranca y conecta. Lo que sirve para varias cosas es un solo módulo que los demás usan, sin copiar su lógica.
3. Lo que ofrece `ctx` a un módulo: `comando(patron, fn, { delegable, nombre })`, `porDefecto(fn)`, `alIniciar(fn)`, `confirmar({...})` (la confirmación común), `activas` y `esperando()` (lo que ve `estado`), `lanzarInstalacion(...)` y `actualizacionEnCurso()`. Un comando nuevo no es delegable salvo decisión del usuario.
4. Comprobar antes de publicar: `node --check` de cada archivo y una prueba con Slack simulado de lo que cambia, incluidos permisos (tercero y asistente) y el caso de fallo.
5. Publicar en el repositorio de `HUGO_GITHUB` y aplicar con `@Hugo actualiza` (el usuario da el 👍).
6. En el repositorio no va nada personal: ni claves, ni `config.env`, ni identificadores de Slack, ni rutas o datos del usuario. La configuración va en la plantilla. Todo commit lleva como autor y committer al usuario.
7. Cambios en las propias reglas de seguridad (quién ordena, 👍, filtro de archivos) solo si el usuario lo pide.
