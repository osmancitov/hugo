# Flujos de GitHub Actions

Referencia técnica de consulta. El porqué de cada pieza está en [construccion.md](construccion.md).

## Términos de este documento
- **UTC**: hora universal, sin cambio de horario; cada día de velas va de las 00:00 a las 23:59 UTC.
- **Vela diaria**: los precios de apertura, máximo, mínimo y cierre de un activo en un día, más su volumen.
- **API**: dirección web que responde con datos cuando se la consulta.
- **Commit**: un cambio guardado en el historial de un repositorio, con autor, fecha y mensaje.
- **GitHub Actions**: servicio de GitHub que ejecuta programas en sus servidores; un workflow (flujo) es el archivo que dice qué ejecutar y cuándo.
- **GitHub Pages**: servicio de GitHub que publica los archivos de un repositorio como página web.
- **Repositorio**: carpeta de archivos con su historial de cambios, alojada en GitHub.
- **`workflow_dispatch`**: modo de lanzar un workflow mediante una llamada a GitHub, a mano o por programa.
- **`schedule` y cron**: horario propio de un workflow, escrito en formato cron.
- **`GITHUB_TOKEN`**: clave secreta que GitHub da a cada ejecución de un workflow; un secreto es un dato que no se escribe en el repositorio.
- **Node**: programa que ejecuta código JavaScript (un lenguaje de programación) fuera del navegador; los archivos `.mjs` son código para Node.
- **`push`, `fetch`, `reset --hard`, `rebase`**: órdenes de git: subir cambios; bajar cambios sin aplicarlos; dejar la copia local igual a una versión; poner los cambios propios encima de la última versión.
- **Idempotente**: que repetirlo da el mismo resultado que hacerlo una vez.
- **Caché de Actions**: almacén de GitHub donde un workflow guarda archivos para su próxima ejecución.
- **SHA o `sha7`**: código calculado de un commit; `sha7` son sus 7 primeras cifras.
- **Ejecutor**: servidor de GitHub donde corre un workflow.
- **Concurrencia**: regla que impide que dos ejecuciones del mismo workflow corran a la vez.
- **Carrera y puesto**: una carrera es un día de comparación; ese día se ordenan todos los activos por variación y el puesto es la posición (1 es la mejor variación).
- **Iceberg**: para cada día, cuántos activos subieron (cierre igual o mayor que apertura) y cuántos bajaron.
- **Persistencia**: promedio simple de los puestos de un activo en las carreras donde participó.
- **Ranking**: lista de activos con su variación porcentual de un día.
- **Pre-calculado**: resultado calculado de antemano y guardado como archivo para que el visor lo lea sin calcular.
- **Catálogo**: la lista oficial de los activos que cuentan en cada mercado.
- **Código 429**: respuesta de un servidor que significa demasiadas peticiones, espera.
- **`main`**: la rama principal del repositorio: la línea de historial que publica Pages.
- **Google Apps Script**: servicio de Google que ejecuta programas pequeños; aquí, el que el repositorio menciona como lanzador externo, no comprobado.


Fuente: los tres archivos de `.github/workflows/` y los scripts de `.github/` leídos el 25-nov-2026. Los tres flujos usan Node 22 y ejecutores `ubuntu-latest`.

## Disparo (fuera de este repositorio)
Ningún flujo tiene `schedule`: solo `workflow_dispatch` (y `pages.yml` además `push` a `main`). Cada lanzamiento es una llamada a GitHub: a mano desde su página o por programa mediante la API. El repositorio menciona un script externo de Google Apps Script como autor de esas llamadas. No verificado aquí: que exista y corra hoy, sus horas, su token y su configuración. Para ver o cambiar los disparadores hay que abrir ese proyecto de Apps Script. Evidencia indirecta en el repositorio: commits horarios de Actions y la diaria tras las 00:05 UTC. Una corrida lanzada por el reloj de Google y una lanzada a mano no se distinguen en los datos de Actions (ambas son `workflow_dispatch`).

## 1. Lectura horaria (`lectura-horaria.yml`)
- La lectura es cada 15 minutos. El reloj de Google despacha el flujo una vez por cuarto de hora UTC (minuto%15 <= 5); cada corrida dura unos 30 s. El nombre y el grupo de concurrencia no cambian. La concurrencia no cancela y GitHub conserva una sola corrida pendiente.
- Permisos: `contents: write`. Concurrencia `lectura-horaria` sin cancelar. Tiempo máximo 29 min.
- Restaura de la caché de Actions la cola y la pausa (`.estado-intradia`), corre `.github/lectura-horaria.mjs`, publica y guarda de nuevo la caché (siempre).
- Toma la lectura en el cuarto de hora UTC y guarda su instante real, nunca uno forzado. Si el repositorio ya tiene lectura de ese intervalo, no toma otra. Entrada manual `intrahora` (verdadero): toma la lectura ya; es una prueba manual, solo con permiso del dueño.
- Publicación (solo si hubo cambios): hasta 5 intentos de `fetch`, `reset --hard origin/main`, `recombinar-horaria.mjs`, commit y `push`. Mensaje: "Guardar lectura horaria de las HH:MM UTC desde Actions". Autor y committer: la identidad de git configurada en el flujo (nombre Osmancito y el correo del dueño, que no se publica en estas páginas). Si el push no cabe, la cola queda en la caché y se reintenta en la siguiente corrida; `confirmar-horaria.mjs` marca como enviada solo la versión exacta que se publicó.
- Universo: solo los VIP de la unión 30/60/90 del último cierre (`vipAdmitidos` en `completar-vip.mjs`, pasado como `universo` a `generarBarra`). Los días guardados antes del cambio conservan los 113 a 118 stocks.
- Salida: `registros/intradia/stock/`. Una pausa por límite de la fuente (429) viaja en la caché y se respeta.

## 2. Puesta al día diaria (`actualizacion-diaria.yml`)
- Permisos: `contents: write`, `actions: write`. Concurrencia `actualizacion-diaria` sin cancelar. Máximo 75 min.
- Tres pasos, en orden:
  1. `node .github/actualizacion-diaria.mjs` con `HUGO_GH_KEY` = `GITHUB_TOKEN` y `HUGO_GITHUB` = `osmancitov/hugo`. Reemplaza `fetch` por el de datos públicos (`datos-publicos-diaria.mjs`, solo lectura), ingiere las velas que faltan y corre la pasada de publicación (en este orden: indicadores, catálogo, pre-cálculos con iceberg, lectura del día y ranking, inventario). Si la ingesta no termina o llega solo a un día anterior al cierre objetivo, sale con error y no publica; la siguiente corrida lo retoma.
  2. `node .github/campana-diaria.mjs`: alinea con `origin/main`, genera los días que faltan de las ventanas 90, 60 y 30 y sus series, y los sube en un commit (hasta 3 reintentos con rebase si `main` avanzó). Sin días nuevos no hace nada.
  3. `node .github/publicar-visor.mjs`: pide `pages.yml`, espera su conclusión y, si falla o se atasca, pide una corrida nueva. Pages solo publica lo que ya está en `main`.
- Idempotente: un día ya cubierto no produce cambios ni commit. Si hubo noches sin correr, alcanza los pendientes.
- Los avisos de inicio y resultado llegan a Slack por la app oficial de GitHub (no por un bot propio). No verificado aquí: configuración de esa app.
- Paso «Reconstruir el día cerrado de los VIP» (`.github/canonico-diario.mjs`), después de la campaña y antes de publicar el visor: reconstruye desde cero el día UTC recién cerrado de la unión VIP 30/60/90 de stock y cripto con velas de 1 h (25 puntos, 00:00 a 24:00) y lo guarda en `registros/intradia/<mercado>/canonico/<día>.json`. Idempotente: si el archivo ya existe y valida no hace nada. Escribe solo esos archivos (nunca los vivos de la lectura horaria), así no choca con ella; si la punta de `main` se movió, rebasa y reintenta (hasta 5 veces). Sin vela, el activo queda sin dato en esa hora.

## 3. Visor (`pages.yml`)
- Disparo: `push` a `main` salvo cambios solo en `registros/intradia/stock/**` o en `registros/pre-calculado/stock/barra-24h/actual_barra` (las lecturas de cripto no están en esa lista), y `workflow_dispatch`. Permisos: `contents: read`, `pages: write`, `id-token: write`. Concurrencia `pages` sin cancelar.
- Pasos: `node cuenta/generar.mjs`, `node app/generar-colores-iceberg.mjs`, `node app/generar-pagina-superficie.mjs`; configura Pages; empaqueta la raíz del repositorio (`path: '.'`); despliega, con un reintento tras 20 s si falla. Los pasos de despliegue usan acciones de GitHub en las versiones del archivo.
- Por eso lo que esté en la raíz (incluido `docs/`) queda público.

## Protección de la rama `main`
`main` está protegida contra force-push y contra borrado. No exige pull request ni comprobaciones, y no se aplica a administradores (`enforce_admins` falso). El push normal está permitido, y los flujos y los cambios directos siguen funcionando igual.

## Comprobar que todo corrió
- Hora: en `git log`, un commit por hora "Guardar lectura horaria de las HH:MM UTC desde Actions" que toca solo `registros/intradia/stock/`.
- Diaria: commit de la puesta al día después de las 00:05 UTC, día nuevo en `registros/velas-24h`, commit de campaña con los archivos `*_carrera-*d` del día, y una corrida de `pages.yml` en `success`.
- Falla: pestaña Actions; relanzar con `workflow_dispatch`. La diaria es idempotente y la horaria retoma su cola.
- Pages en vivo: abrir `https://osmancitov.github.io/hugo/?v=<sha7>` con el SHA del commit y mirar el cambio.

## Configuración que hay que tener
- Repositorio público, Pages con fuente «GitHub Actions», y permiso de escritura del `GITHUB_TOKEN` para Actions. Verificar en Settings (no verificado aquí desde el código).
- No hay otros secretos en los flujos: usan `GITHUB_TOKEN`.
- Identidad de commits: la configuración actual de los flujos usa la identidad de git configurada en el flujo (nombre Osmancito y el correo del dueño, que no se publica en estas páginas). La norma vigente del Núcleo (7d8d778) exige autor Osmancito y permite otro committer; no hay que cambiar la configuración por eso.

### Paso del VIP núcleo
En la puesta al día diaria, «Calcular el VIP núcleo 54 campañas (7 a 60 días)» (`.github/nucleo-diario.mjs`) corre antes de la Campaña y del canónico, y sube `registros/nucleo/` (autor y committer Osmancito). El universo de las lecturas horarias (`vipAdmitidos`, `admitidosCripto`) y el balance salen de ese núcleo.
