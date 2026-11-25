# Flujos de GitHub Actions

Referencia técnica de consulta rápida. Las palabras técnicas (UTC, API, JSON, commit, Actions, Pages, vela) se definen en la sección «Palabras que este documento usa» de [construccion.md](construccion.md), que también explica el porqué de cada pieza.

Fuente: los tres archivos de `.github/workflows/` y los scripts de `.github/` leídos el 25-nov-2026. Los tres flujos usan Node 22 y ejecutores `ubuntu-latest`.

## Disparo (fuera de este repositorio)
Ningún flujo tiene `schedule`: solo `workflow_dispatch` (y `pages.yml` además `push` a `main`). Quien los lanza es un reloj externo (Google Apps Script de la cuenta del dueño). No verificado aquí: sus horas, su token y su configuración. Para ver o cambiar los disparadores hay que abrir ese proyecto de Apps Script. Evidencia indirecta en el repositorio: commits horarios de Actions y la diaria tras las 00:05 UTC. Una corrida lanzada por el reloj de Google y una lanzada a mano no se distinguen en los datos de Actions (ambas son `workflow_dispatch`).

## 1. Lectura horaria (`lectura-horaria.yml`)
- Permisos: `contents: write`. Concurrencia `lectura-horaria` sin cancelar. Tiempo máximo 29 min.
- Restaura de la caché de Actions la cola y la pausa (`.estado-intradia`), corre `.github/lectura-horaria.mjs`, publica y guarda de nuevo la caché (siempre).
- Toma la lectura a la hora en punto UTC y guarda su instante real, nunca uno forzado. Si el repositorio ya tiene lectura de esa hora, no toma otra. Entrada manual `intrahora` (verdadero): toma la lectura ya; es una prueba manual, solo con permiso del dueño.
- Publicación (solo si hubo cambios): hasta 5 intentos de `fetch`, `reset --hard origin/main`, `recombinar-horaria.mjs`, commit y `push`. Mensaje: "Guardar lectura horaria de las HH:MM UTC desde Actions". Autor y committer: Osmancito <osmanvielma@gmail.com>. Si el push no cabe, la cola queda en la caché y se reintenta en la siguiente corrida; `confirmar-horaria.mjs` marca como enviada solo la versión exacta que se publicó.
- Salida: `registros/intradia/stock/`. Una pausa por límite de la fuente (429) viaja en la caché y se respeta.

## 2. Puesta al día diaria (`actualizacion-diaria.yml`)
- Permisos: `contents: write`, `actions: write`. Concurrencia `actualizacion-diaria` sin cancelar. Máximo 75 min.
- Tres pasos, en orden:
  1. `node .github/actualizacion-diaria.mjs` con `HUGO_GH_KEY` = `GITHUB_TOKEN` y `HUGO_GITHUB` = `osmancitov/hugo`. Reemplaza `fetch` por el de datos públicos (`datos-publicos-diaria.mjs`, solo lectura), ingiere las velas que faltan y corre la pasada de publicación (indicadores, pre-cálculos, ranking, catálogo, inventario). Si la ingesta no termina o llega solo a un día anterior al cierre objetivo, sale con error y no publica; la siguiente corrida lo retoma.
  2. `node .github/campana-diaria.mjs`: alinea con `origin/main`, genera los días que faltan de las ventanas 90, 60 y 30 y sus series, y los sube en un commit (hasta 3 reintentos con rebase si `main` avanzó). Sin días nuevos no hace nada.
  3. `node .github/publicar-visor.mjs`: pide `pages.yml`, espera su conclusión y, si falla o se atasca, pide una corrida nueva. Pages solo publica lo que ya está en `main`.
- Idempotente: un día ya cubierto no produce cambios ni commit. Si hubo noches sin correr, alcanza los pendientes.
- Los avisos de inicio y resultado llegan a Slack por la app oficial de GitHub (no por un bot propio). No verificado aquí: configuración de esa app.

## 3. Visor (`pages.yml`)
- Disparo: `push` a `main` salvo cambios solo en `registros/intradia/stock/**` o en `registros/pre-calculado/stock/barra-24h/actual_barra`, y `workflow_dispatch`. Permisos: `contents: read`, `pages: write`, `id-token: write`. Concurrencia `pages` sin cancelar.
- Pasos: `node cuenta/generar.mjs`, `node app/generar-persistencia.mjs`, `node app/generar-colores-iceberg.mjs`, `node app/generar-pagina-superficie.mjs`; configura Pages; empaqueta la raíz del repositorio (`path: '.'`); despliega, con un reintento tras 20 s si falla. Los pasos de despliegue usan acciones de GitHub en las versiones del archivo.
- Por eso lo que esté en la raíz (incluido `manual/` y `docs/`) queda público.

## Comprobar que todo corrió
- Hora: en `git log`, un commit por hora "Guardar lectura horaria de las HH:MM UTC desde Actions" que toca solo `registros/intradia/stock/`.
- Diaria: commit de la puesta al día después de las 00:05 UTC, día nuevo en `registros/velas-24h`, commit de campaña con los archivos `*_carrera-*d` del día, y una corrida de `pages.yml` en `success`.
- Falla: pestaña Actions; relanzar con `workflow_dispatch`. La diaria es idempotente y la horaria retoma su cola.
- Pages en vivo: abrir `https://osmancitov.github.io/hugo/?v=<sha7>` con el SHA del commit y mirar el cambio.

## Configuración que hay que tener
- Repositorio público, Pages con fuente «GitHub Actions», y permiso de escritura del `GITHUB_TOKEN` para Actions. Verificar en Settings (no verificado aquí desde el código).
- No hay otros secretos en los flujos: usan `GITHUB_TOKEN`.
- Identidad de commits en todos los flujos: `Osmancito <osmanvielma@gmail.com>`.
