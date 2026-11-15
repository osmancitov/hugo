# Manual de Hugo

Referencia del funcionamiento actual: qué hace, cómo se opera y cómo se modifica. Solo describe lo instalado. La historia de cambios va aparte, en `manual/historial-hugo.md` (solo local).

## Qué es
Bot de Slack propio (Socket Mode, Node.js). Corre en la Debian como servicio de usuario `hugo.service` y es el puente entre Slack y esa máquina: recibe y envía archivos, borra hilos y se actualiza. Existe para quitarle trabajo al usuario: el asistente de IA y Hugo hacen el trabajo y el usuario decide con 👍.

## Comandos de Slack
Se escriben mencionando `@Hugo`. Solo los da el usuario (`HUGO_USUARIO`); las excepciones son `actualiza`, `registra` y `sincroniza registros`, que también puede pedir el asistente (`HUGO_DELEGADO`).

| Orden | Qué hace |
| --- | --- |
| `borrar hilo` | Dentro de un hilo. Pregunta y borra lo que Slack permita. |
| archivos adjuntos | Pregunta y los guarda en Descargas, sin pisar uno existente. |
| `envia RUTA` | Pregunta y sube ese archivo al hilo. También `envía` y `manda`. Un nombre sin ruta se busca en Descargas. |
| `registra ACTIVO` | Pregunta y registra un mes de las velas diarias del activo (ver «Registro de velas»). También `registrar`. |
| `actualiza` | Sin adjunto: baja la última versión de GitHub (también `actualiza github`), pregunta y la instala. |
| `actualiza` + `.sh` adjunto | Pregunta y ejecuta ese instalador. También basta un archivo llamado `actualizar-hugo*.sh`. |
| `actualiza hilo` | Usa el último `.sh` adjuntado en ese hilo. Si lo pide el asistente, solo cuenta uno subido por él o por el usuario. |
| `sincroniza registros` | Copia ya (sin 👍) los registros de velas entre la Debian y GitHub, en ambos sentidos y sin pisar contenido distinto (ver «Sincronización de registros»). También `sincronizar`. |
| `estado` | Dice qué hace, qué 👍 espera o que está libre, y cuánto lleva activo. |
| `restart` o `reiniciar` | Reinicia a Hugo. No lo hace si hay una actualización en curso o está ocupado. |
| `ayuda` o `comandos` | Muestra la lista de órdenes. |

Cualquier otro texto: Hugo responde que no reconoce la orden y apunta a `ayuda`. Lo recibe cualquiera que lo mencione, y no ejecuta nada.

### Confirmación
Todo lo que cambia algo (borrar, guardar, enviar, actualizar) se pregunta en el hilo y solo se hace con el 👍 del usuario (`HUGO_USUARIO`). El 👍 de otra persona o del asistente se ignora, con una excepción: la confirmación de `registra` también acepta el 👍 del asistente (`HUGO_DELEGADO`), por decisión del usuario. Sin respuesta en 10 minutos se descarta, sin anunciarlo. Reiniciar a Hugo cancela las confirmaciones pendientes. `estado`, `ayuda` y `restart` no piden confirmación.

## Consola de la Debian (no son órdenes de Slack)
- Estado: `systemctl --user status hugo.service`
- Registro: `journalctl --user -u hugo.service -n 30` (no imprime claves)
- Reiniciar: `systemctl --user restart hugo.service`
- Parar: `systemctl --user stop hugo.service`
- Instalar un `.sh` a mano (solo si Hugo no puede recibirlo): `bash ~/Downloads/actualizar-hugo.sh`

## Actualizar
- Fuente: el repositorio público de `HUGO_GITHUB` (`propietario/repositorio`, rama `main`). Para el código, Hugo solo descarga; nunca sube código (los registros de velas sí se sincronizan: ver «Sincronización de registros»).
- `@Hugo actualiza` descarga el último commit a una carpeta temporal, comprueba que los archivos son normales y pasan `node --check`, y compara su contenido con lo instalado. Si no hay diferencias dice que ya está al día. Si las hay, pregunta con el commit, su título y los archivos que cambian.
- Con 👍: copia lo anterior a `~/.local/share/hugo-respaldo/<fecha>`, instala, reinicia y avisa en el hilo: «Hugo actualizado (commit …)» o el fallo con las últimas líneas del registro. Si algo falla o Hugo no queda activo, vuelve a lo anterior.
- Solo toca `app/app.mjs`, `app/modulos/` y `manual/manual-hugo.md`. No toca `config.env`, `keys/`, `historial-hugo.md`, `package.json` ni `node_modules/`.
- Con un `.sh` adjunto el flujo es el mismo (copia, reversión y aviso), pero el contenido lo trae el instalador. Una actualización a la vez; su estado queda en `~/.local/share/hugo-respaldo/pendiente.json` hasta que sale el aviso.
- Al arrancar, unos segundos después del saludo (la fecha), Hugo comprueba GitHub en segundo plano y avisa en el canal solo si hay cambios. Al día: silencio. Sin conexión: 3 intentos cortos, un aviso único («sigo con la versión instalada, sin dar por comprobada la actualización») y reintentos a los 2, 10 y 60 minutos. Comprobar nunca instala ni reinicia, así que no puede causar un bucle.
- Al iniciar publica la fecha y hora del arranque (UTC-4, `Sat Nov 14 - 10:20 PM`) en el canal `HUGO_AVISO_CANAL`.

## Registro de velas
- Orden: `registra ACTIVO` (la pide el usuario o el asistente; la confirma un 👍 del usuario o del asistente). Registra UN mes por orden: el más reciente pendiente antes de la fecha cero (1 de noviembre de 2026, 00:00 UTC), yendo hacia atrás mes por mes.
- Fuente: la API de Binance, velas `1d` con el corte predeterminado UTC (de medianoche a medianoche UTC).
- Correspondencia: el código que escribes es el nombre visible del registro (comandos, reportes, carpetas y archivos): el de la bolsa de valores o del cripto, sin `B` ni `USDT`. El instrumento de Binance solo se usa al consultar y lo resuelve el módulo común `activos`, sin tabla ni lista por activo: todo se comprueba en vivo en cada orden. Un par vale si existe en Binance, está activo (TRADING), cotiza en USDT y su activo base es exactamente el esperado. `CODIGO` + `USDT` se acepta tal cual (`BTC` → `BTCUSDT`), salvo que exista también `CODIGO` + `B` + `USDT`: entonces hay que clasificarlo. `CODIGO` + `B` + `USDT` solo se acepta como acción tokenizada si Binance lo etiqueta `bStocks` en su lista pública de productos (`NVDA` → `NVDABUSDT`, «NVIDIA (bStocks)»); la `B` nunca se asume. La confirmación muestra el nombre oficial. No hace falta tocar el código para registrar otro activo.
- Hugo rechaza sin guardar nada: código inexistente o inactivo; código ambiguo (dos instrumentos con el mismo código, como `STX`, que es Seagate tokenizada y también Stacks); y un código que solo existe con la `B` sin etiqueta bStocks. Si no puede leer la clasificación de Binance (red o respuesta ajena) cuando hace falta descartar un homónimo tokenizado, detiene la orden en vez de aceptar el activo directo o adivinar. Límite: esa lista de productos es la API pública interna de la web de Binance, no la documentada ni estable; no hay clasificación documentada. Si la cambian o retiran, los códigos con homónimo posible se detienen con aviso (los demás directos siguen funcionando).
- Se guarda la vela completa, tal como la entrega la API (el cuerpo crudo de la respuesta), sin filtrar campos. El cierre es el precio de referencia del registro.
- Destino: `~/Documents/hugo/registros/velas-24h/ACTIVO/yymm_ACTIVO` (por ejemplo `2610_SPCX` para octubre de 2026). Una carpeta por código de activo, sin el par, y un archivo por mes. `HUGO_VELAS_DIR` en `config.env` cambia la carpeta base.
- Un mes ya registrado no se pisa ni se repite: la siguiente orden toma el mes anterior pendiente. Si Binance no tiene velas de ese mes, no guarda nada y lo dice.
- Visibilidad: avisa al empezar la consulta y al terminar el mes: velas guardadas, los días que faltan si los hay (sin dar el mes por completo) y lo que tardaron la consulta y el guardado por separado. Si algo falla, dice en qué mes y paso se detuvo; lo ya registrado no se toca.
- Meses parciales (por ejemplo, el primer mes del activo) se guardan con sus días y se reportan como incompletos.

## Sincronización de registros
- Es automática por decisión del usuario (15-nov-2026), sin 👍 en cada pasada: Hugo sincroniza solo, poco después de arrancar y luego cada `HUGO_SYNC_MINUTOS` minutos (60 por defecto; 0 la apaga). La orden `sincroniza registros` (la pide el usuario o el asistente) fuerza una pasada ya. Copia el registro de velas entre la Debian y el repositorio público de `HUGO_GITHUB`, en los dos sentidos. Los registros son públicos por decisión del usuario.
- Cada pasada compara primero y luego actúa. En el canal de avisos solo habla cuando algo cambió, hay un conflicto o un error nuevo; si todo sigue igual, calla (un error repetido se avisa una vez). La orden manual siempre contesta en su hilo. Actualizar el programa sigue pidiendo el 👍 del usuario; esto solo cubre los registros.
- Lo que solo está en la Debian se sube en un solo commit (el título lista los meses; autor y committer con el correo del usuario). Lo que solo está en GitHub se baja sin pisar, con el mismo criterio que el registro.
- La comparación es por contenido, no por nombre ni por fecha: el mismo mes con contenido distinto en los dos lados es un conflicto; Hugo lo reporta y no lo toca en ningún lado. Si el repo cambia entre la comparación y la ejecución, lo nuevo con contenido distinto se omite y se reporta; nada se pisa.
- Solo toca `registros/velas-24h/<ACTIVO>/yymm_ACTIVO`, con la misma estructura en los dos lados. Ninguna otra carpeta, en ningún sentido. Archivos vacíos o de más de 5 MB no entran.
- Credencial: `keys/.github-key` (token de GitHub). Hugo lo lee solo aquí, nunca lo imprime ni lo envía, y antes de ofrecer subida comprueba contra la API que tiene escritura en el repo. Sin el archivo o sin ese permiso, la bajada funciona igual (el repo es público) y la subida queda pendiente, avisando.

## Dónde está cada cosa (`~/Documents/hugo`)
- `app/`: `app.mjs`, `modulos/`, `config.env` (valores no secretos), `package.json`, `node_modules/`.
- `keys/`: `.bot-token` y `.app-token` (al arrancar), `.user-token` (solo para borrar hilos) y `.github-key` (solo para subir registros a GitHub).
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
- El registro de velas solo lee de la API pública de Binance; no usa claves ni mueve fondos.
- Slack: eventos `app_mention` y `reaction_added`. Permisos del bot: app_mentions:read, channels:history, channels:join, chat:write, files:read, files:write, reactions:read. Permiso de usuario: chat:write.

## Cómo modificar Hugo
1. Leer este manual antes de tocar nada. Cambiar el código en una copia del repositorio y actualizar este manual en el mismo cambio. El manual describe solo lo instalado.
2. Reglas del código: Hugo es modular. Cada capacidad es un archivo de `app/modulos/` con `registrar(ctx)`; `app.mjs` solo arranca y conecta. La biblioteca compartida `activos` no tiene `registrar`: las importan los módulos que las usan. Lo que sirve para varias cosas es un solo módulo que los demás usan, sin copiar su lógica.
3. Lo que ofrece `ctx` a un módulo: `comando(patron, fn, { delegable, nombre })`, `porDefecto(fn)`, `alIniciar(fn)`, `confirmar({...})` (la confirmación común), `activas` y `esperando()` (lo que ve `estado`), `lanzarInstalacion(...)` y `actualizacionEnCurso()`. Un comando nuevo no es delegable salvo decisión del usuario.
4. Comprobar antes de publicar: `node --check` de cada archivo y una prueba con Slack simulado de lo que cambia, incluidos permisos (tercero y asistente) y el caso de fallo.
5. Publicar en el repositorio de `HUGO_GITHUB` y aplicar con `@Hugo actualiza` (el usuario da el 👍).
6. En el repositorio no va nada personal: ni claves, ni `config.env`, ni identificadores de Slack, ni rutas o datos del usuario. La configuración va en la plantilla. Todo commit lleva como autor y committer al usuario.
7. Cambios en las propias reglas de seguridad (quién ordena, 👍, filtro de archivos) solo si el usuario lo pide.
