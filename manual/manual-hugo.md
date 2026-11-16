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
| `registra CLASE CODIGO [CODIGO ...]` | Recorre los historiales completos de uno o varios activos en ese orden, sin 👍. La clase (`stock` o `cripto`) aplica a toda la lista; sin clase o códigos pide esos datos. También `registrar`. |
| `registra continuar` | Retoma un recorrido pausado tras corregir la causa; no pide 👍 ni reemplaza su lista. |
| `actualiza` | Sin adjunto: baja la última versión de GitHub (también `actualiza github`), pregunta y la instala. |
| `actualiza` + `.sh` adjunto | Pregunta y ejecuta ese instalador. También basta un archivo llamado `actualizar-hugo*.sh`. |
| `actualiza hilo` | Usa el último `.sh` adjuntado en ese hilo. Si lo pide el asistente, solo cuenta uno subido por él o por el usuario. |
| `sincroniza registros` | Copia ya (sin 👍) los registros de velas entre la Debian y GitHub, en ambos sentidos y sin pisar contenido distinto (ver «Sincronización de registros»). También `sincronizar`. |
| `estado` | Dice qué hace, qué 👍 espera o que está libre, y cuánto lleva activo. |
| `restart` o `reiniciar` | Reinicia a Hugo. No lo hace si hay una actualización en curso o está ocupado. |
| `ayuda` o `comandos` | Muestra la lista de órdenes. |

Cualquier otro texto: Hugo responde que no reconoce la orden y apunta a `ayuda`. Lo recibe cualquiera que lo mencione, y no ejecuta nada.

### Confirmación
Borrar, guardar archivos recibidos, enviar y actualizar se preguntan en el hilo y solo se hacen con el 👍 del usuario (`HUGO_USUARIO`). El 👍 de otra persona o del asistente se ignora. Regla común de `registra`, por decisión del usuario (15-nov-2026): ejecuta directamente la orden del usuario o del asistente autorizado, sin pedir 👍, con independencia de la clase del activo. No cambia la confirmación de las actualizaciones del programa. Sin respuesta en 10 minutos se descarta, sin anunciarlo. Reiniciar a Hugo cancela las confirmaciones pendientes. `estado`, `ayuda` y `restart` no piden confirmación.

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
- Regla única: `registra` ejecuta directamente la orden del usuario o del asistente autorizado, sin pedir 👍, con independencia de la clase. Los demás comandos conservan sus controles.
- Orden: `registra stock NVDA SPCX` o `registra cripto BTC ETH`. Admite un código o una lista (hasta 500), separados por espacios, comas o punto y coma; rechaza códigos repetidos y conserva el orden. La clase aplica a toda la lista. Los ejemplos son de sintaxis, no una lista fija de activos.
- Recorre TODO el historial del primer activo, mes por mes hacia atrás desde el mes del último día cerrado en UTC (incluido el mes en curso, si ya tiene días cerrados). Al encontrar un mes sin velas, pasa al siguiente activo. Ya no hace falta una orden por mes. Tope de seguridad: 240 meses por activo; alcanzar el tope pausa el trabajo, no lo declara completo.
- Fuente: Binance, velas `1d`, corte UTC (medianoche a medianoche). Cada lote fija al empezar un corte en la última medianoche UTC: solo consulta y admite velas con cierre anterior a ese corte. Excluye la vela que todavía se está formando, aunque ya haya cambiado el día local. Guarda los 12 campos de cada vela cerrada; el cierre es el precio de referencia.
- El corte queda fijo al reanudar el mismo lote, aunque hayan pasado días. Una nueva orden después de terminarlo fija un corte nuevo y pone al día el mes en curso. No hay una tarea diaria automática nueva. El primer día del mes UTC, si aún no cerró ningún día de ese mes, empieza por el mes anterior. Si el mes abierto no tiene velas cerradas, consulta el mes anterior antes de declarar terminado el historial.
- Resolución común de la clase: biblioteca `activos`, sin tabla por empresa. Comprueba en vivo que el par está TRADING, cotiza en USDT y tiene la base exacta.
  - `stock`: `CODIGO` + `B` + `USDT`; exige además etiqueta `bStocks` y nombre de bStocks en la lista pública de productos de Binance.
  - `cripto`: `CODIGO` + `USDT`; rechaza los pares etiquetados bStocks. No adivina entre clases ni cambia de clase.
  - Un código inexistente/inactivo, etiqueta de otra clase o fallo de clasificación pausa sin guardar ese mes ni pasar al siguiente activo. La lista pública de productos es una API interna de Binance, no documentada ni estable; si deja de servir, no adivina.
- Destino: `~/Documents/hugo/registros/velas-24h/<clase>/CODIGO/yymm_CODIGO`. `HUGO_VELAS_DIR` cambia la carpeta base. No mezcla clases ni usa el par como nombre del registro.
- Un archivo existente se relee y se compara con las velas de ese mes en Binance antes de saltarlo. Si es ilegible, está truncado, vacío o cambia alguna vela ya registrada, pausa y conserva el archivo. Solo amplía una serie cuando todas sus velas previas son un prefijo idéntico de Binance; añade los días nuevos ya cerrados mediante reemplazo atómico, sin alterar los anteriores. Si el archivo tiene más días cerrados que el corte de un lote reanudado y el prefijo coincide, lo conserva entero: nunca lo recorta. También protege ante una creación concurrente de la sincronización. Un mes parcial válido se guarda con sus días y se avisa cuáles faltan, sin darlo por completo.
- Un error HTTP/red, JSON inválido o respuesta distinta de una lista de velas válida NO es un mes vacío: pausa en ese activo/mes y conserva el resto de la cola. No da por terminada la lista por un fallo.
- Progreso visible en el hilo que recibió la orden: inicio/reanudación, activo y posición en la lista, mes consultado, velas guardadas o existentes comprobadas, cobertura y duración, fin de cada activo y resumen final. No necesita respuestas para continuar. Los avisos se esperan en orden; un fallo al publicarlos pausa el trabajo, con el avance ya guardado. Un corte justo tras enviar un aviso puede repetir ese aviso al volver.
- Avance privado fuera del repositorio: `~/.local/share/hugo-registro/estado.json`, configurable con `HUGO_REGISTRO_ESTADO`. Guarda clase, lista ordenada, posición, próximo mes, conteos y conversación de origen. Nunca se sincroniza con GitHub. Los meses nuevos se publican con enlace sin pisar; las ampliaciones se publican por renombrado atómico solo tras verificar de nuevo el archivo anterior. Se sincronizan los archivos y el directorio a disco. El avance se reemplaza por renombrado atómico. Esto reduce el riesgo del corte, no certifica la durabilidad del hardware.
- Al arrancar Hugo, un trabajo que quedó en curso se reanuda automáticamente en su hilo. Un mes guardado antes del corte pero aún no marcado en el avance se comprueba contra Binance y no se sobrescribe. Un temporal sin definitivo no cuenta como mes guardado. Si el archivo de avance no se puede leer, lo conserva y avisa; no inventa otra cola.
- Los errores dejan el recorrido pausado, sin reintentos automáticos indefinidos. Tras corregir la causa, `registra continuar` (usuario o asistente autorizado) lo retoma en el hilo original. Repetir exactamente su clase/lista también lo retoma; otra lista no desplaza un trabajo pendiente. No se aceptan dos recorridos simultáneos, ni durante la validación.
- Los conteos separan meses nuevos, meses ampliados, existentes comprobados y activos terminados. Un archivo que quedó guardado justo antes de un corte puede contarse como existente al reanudar. Los avances de la versión anterior conservan su corte histórico al continuar; no se cambian a otra fecha en silencio. El resumen final confirma el recorrido local, NO la subida: sigue rigiendo la sincronización habitual de registros.
- El registro solo consulta datos públicos, no opera activos ni mueve fondos. Futuros no están soportados.

## Sincronización de registros
- Es automática por decisión del usuario (15-nov-2026), sin 👍 en cada pasada: Hugo sincroniza solo, poco después de arrancar y luego cada `HUGO_SYNC_MINUTOS` minutos (60 por defecto; 0 la apaga). La orden `sincroniza registros` (la pide el usuario o el asistente) fuerza una pasada ya. Copia el registro de velas entre la Debian y el repositorio público de `HUGO_GITHUB`, en los dos sentidos. Los registros son públicos por decisión del usuario.
- Cada pasada compara primero y luego actúa. En el canal de avisos solo habla cuando algo cambió, hay un conflicto o un error nuevo; si todo sigue igual, calla (un error repetido se avisa una vez). La orden manual siempre contesta en su hilo. Actualizar el programa sigue pidiendo el 👍 del usuario; esto solo cubre los registros.
- Lo que solo está en la Debian y las ampliaciones válidas se suben en un solo commit (el título lista los meses; autor y committer con el correo del usuario). Lo que solo está en GitHub se baja sin pisar, con el mismo criterio que el registro.
- La comparación es por contenido, no por fecha. Para un mes que crece, valida las velas diarias cerradas y solo admite una ampliación estricta: la serie menor debe ser un prefijo idéntico de la mayor. Copia la mayor al lado que falta, sin recortar ni cambiar velas previas. Cualquier otra diferencia es un conflicto y se conserva en ambos lados. Antes de subir relee la rama y vuelve a comparar; el cambio del ref sigue sin force. Antes de ampliar un archivo local lo relee; una escritura concurrente distinta detiene esa copia.
- Solo toca `registros/velas-24h/<clase>/<ACTIVO>/yymm_ACTIVO` (clase `stock` o `cripto`), con la misma estructura en los dos lados. Ninguna otra carpeta, en ningún sentido.
- Mudanza única de lo heredado: los registros de la ruta anterior `velas-24h/<ACTIVO>/` (solo `SPCX`) pasan a `velas-24h/stock/<ACTIVO>/`. En la Debian se copian y se comprueba por sha256 que la copia es idéntica; en GitHub se renombra en un commit (mismo blob, mismo contenido) solo si la Debian ya tiene la copia idéntica; y solo después de releer GitHub (ruta nueva idéntica y ruta vieja ausente) se quita el original de la Debian. Ante cualquier fallo o duda, el original se conserva. Si el destino existe con otro contenido o no hay copia idéntica, no toca nada y lo reporta. Sin heredados, no hace nada; la ruta anterior no se sincroniza. Archivos vacíos o de más de 5 MB no entran.
- Credencial: `keys/.github-key` (token de GitHub). Hugo lo lee solo aquí, nunca lo imprime ni lo envía, y antes de ofrecer subida comprueba contra la API que tiene escritura en el repo. Sin el archivo o sin ese permiso, la bajada funciona igual (el repo es público) y la subida queda pendiente, avisando.

## Dónde está cada cosa (`~/Documents/hugo`)
- `app/`: `app.mjs`, `modulos/`, `config.env` (valores no secretos), `package.json`, `node_modules/`.
- `keys/`: `.bot-token` y `.app-token` (al arrancar), `.user-token` (solo para borrar hilos) y `.github-key` (solo para subir registros a GitHub).
- `manual/`: este manual y el historial.
- Avance privado del registro: `~/.local/share/hugo-registro/estado.json`, fuera del repositorio y de la sincronización.
- Servicio: `~/.config/systemd/user/hugo.service` (arranca al encender la Debian con `linger`; aún no se ha comprobado reiniciando la Debian).
- Respaldos y estado de actualizaciones: `~/.local/share/hugo-respaldo/`, fuera de `hugo/`.
- Configuración (`app/config.env`, plantilla en `app/config.ejemplo.env`): `HUGO_AVISO_CANAL`, `HUGO_USUARIO`, `HUGO_DELEGADO`, `HUGO_GITHUB`; `HUGO_RECIBIDOS` solo para recibir en otra carpeta que Descargas; `HUGO_REGISTRO_ESTADO` permite cambiar la ruta local del avance. Tras cambiarla, reiniciar.

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
