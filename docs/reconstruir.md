# Reconstruir el Observatorio desde cero

Referencia técnica de consulta. El porqué de cada pieza está en [construccion.md](construccion.md).

## Términos de este documento
- **UTC**: hora universal, sin cambio de horario; cada día de velas va de las 00:00 a las 23:59 UTC.
- **Vela diaria**: los precios de apertura, máximo, mínimo y cierre de un activo en un día, más su volumen.
- **Binance**: plataforma que lista activos y publica sus precios.
- **Commit**: un cambio guardado en el historial de un repositorio, con autor, fecha y mensaje.
- **GitHub Actions**: servicio de GitHub que ejecuta programas en sus servidores; un workflow (flujo) es el archivo que dice qué ejecutar y cuándo.
- **GitHub Pages**: servicio de GitHub que publica los archivos de un repositorio como página web.
- **Repositorio**: carpeta de archivos con su historial de cambios, alojada en GitHub.
- **`workflow_dispatch`**: modo de lanzar un workflow mediante una llamada a GitHub, a mano o por programa.
- **`schedule` y cron**: horario propio de un workflow, escrito en formato cron.
- **`GITHUB_TOKEN`**: clave secreta que GitHub da a cada ejecución de un workflow; un secreto es un dato que no se escribe en el repositorio.
- **Node**: programa que ejecuta código JavaScript (un lenguaje de programación) fuera del navegador; los archivos `.mjs` son código para Node.
- **`push`, `fetch`, `reset --hard`, `rebase`**: órdenes de git: subir cambios; bajar cambios sin aplicarlos; dejar la copia local igual a una versión; poner los cambios propios encima de la última versión.
- **Ejecutor**: servidor de GitHub donde corre un workflow.
- **Piso**: fecha más antigua que se guarda y se calcula: 1 de agosto de 2026.
- **Carrera y puesto**: una carrera es un día de comparación; ese día se ordenan todos los activos por variación y el puesto es la posición (1 es la mejor variación).
- **Campaña, P y C**: P es la potencia (suma de variaciones positivas entre el valor absoluto de la suma de las negativas) y C la constancia (días al alza entre días a la baja); Campaña = raíz((P² + C²) / 2).
- **Ranking**: lista de activos con su variación porcentual de un día.
- **Pre-calculado**: resultado calculado de antemano y guardado como archivo para que el visor lo lea sin calcular.
- **Catálogo**: la lista oficial de los activos que cuentan en cada mercado.
- **`raw.githubusercontent.com`**: dirección desde la que GitHub entrega el contenido crudo de un archivo del repositorio.
- **`main`**: la rama principal del repositorio: la línea de historial que publica Pages.
- **Google Apps Script**: servicio de Google que ejecuta programas pequeños; aquí, el que el repositorio menciona como lanzador externo, no comprobado.


Guía para levantar uno nuevo, o recuperar este, sin depender de ninguna conversación. Cada paso dice qué comprobar. Lo marcado "no verificado aquí" no se puede ver desde el repositorio y hay que confirmarlo en GitHub o Google.

## Qué necesitas
- Una cuenta de GitHub con un repositorio **público** (la gratuidad de Pages y de los ejecutores en repositorios públicos no está verificada aquí).
- Node 22 para trabajar en local.
- Una forma de lanzar `workflow_dispatch` por reloj. El repositorio menciona un Google Apps Script que no está en él; no está comprobado que exista ni que corra hoy. Alternativa dentro de GitHub: añadir `schedule` (cron) a los flujos; hoy no lo tienen.
- Ningún secreto propio: los flujos usan `GITHUB_TOKEN`.

## Pasos
1. **Copia el repositorio** completo (incluida la carpeta `registros/`: es el historial publicado; las velas pasadas no se vuelven a pedir para los días que ya están).
2. **Ajusta el nombre del repositorio**: `HUGO_GITHUB` en `actualizacion-diaria.yml` (`osmancitov/hugo`), las rutas `raw.githubusercontent.com/osmancitov/hugo/main/...` de `index.html` (constantes `RAW`, `RAW_IND`, `RAW_CAT` y las de las vistas) y los scripts de `.github/` que construyen URLs del repositorio.
3. **Activa Pages** con fuente «GitHub Actions» y permite que Actions escriba en el repositorio (Settings). No verificado aquí.
4. **Comprueba las pruebas** en local: `node --test pruebas/*.mjs`. Las 419 deben pasar.
5. **Primera publicación**: haz un push a `main`. `pages.yml` genera las entradas derivadas y publica. Abre `https://<usuario>.github.io/<repo>/?v=<sha7>` y comprueba el encabezado «Observatorio Bursátil».
6. **Lectura horaria**: lanza `lectura-horaria.yml` a mano una vez (con permiso de quien administra) y comprueba que sube un commit "Guardar lectura horaria…" que toca solo `registros/intradia/stock/`.
7. **Diaria**: lanza `actualizacion-diaria.yml`. Debe producir (a) un commit de la pasada con velas, indicadores, pre-cálculos, ranking, catálogo e inventario; (b) un commit de campaña con `*_carrera-90d`, `-60d` y `-30d` del día más sus series; (c) una corrida de `pages.yml` en `success`.
8. **Automatiza**: configura el reloj externo para lanzar la horaria cada hora en punto UTC (el flujo tarda unos minutos y guarda la hora real de la lectura) y la diaria entre las 00:05 y las 00:14 UTC. Las dos son seguras de repetir: no duplican lo ya publicado.
9. **Verifica la primera diaria automática**: al día siguiente, comprueba que los archivos nuevos de `registros/categorias/` traen `grupo` según la regla vigente (`visor.md`) y que el sitio muestra el último día cerrado.

## Si hay que empezar sin historial
- El piso de los registros es el 1-ago-2026 (`PISO` en `campana-carrera.mjs` y los demás módulos). Cambiarlo exige revisar `registro-motor`, `inventario-dias`, `campana-*` y las pruebas.
- Sin carpeta `velas-24h`, la ingesta diaria reconstruye mes a mes hacia atrás hasta el piso (`registro-motor.mjs`). Puede tardar y toca los límites de la fuente; el motor guarda avance y retoma.
- Catálogo: se regenera en la pasada desde las velas, usando `activos-info.mjs` y `activos-curados.json` (nombre, tipo, capitalización, lectura latina). Sin entradas curadas, un activo aparece con su código y el nombre que dé el cotejo con Binance.

## Qué NO tocar sin pensar
- Los módulos que importan los flujos: `barra-movil`, `ciclo-diario`, `intradia-*`, `registro-*`, `sincronizar-registros`, `velas`, `indicadores`, `pre-calculado`, `catalogo`, `campana-*`. Antes de renombrar o borrar uno, buscar sus imports en `.github/*.mjs` y en `index.html`.
- `grupoDe` (`campana-carrera.mjs`): es la única regla de categorías. Cambiarla exige regrupar los archivos diarios existentes y actualizar su encabezado.
- Los registros históricos: no se reescriben; los derivados salen de ellos. Excepción registrada: el 25-nov-2026 se regrupó el campo `grupo` de 171 archivos de la Campaña (commit `cc539d9`).
- La identidad de commits: los flujos usan la identidad de git del dueño. Al reconstruir, configura la tuya con `git config user.name` y `git config user.email` en el repositorio y en el valor que usen los flujos. La norma del Núcleo exige que el autor sea Osmancito.

## Límites de esta guía
- El horario real del reloj de Google, la configuración de Settings de GitHub y la app de Slack de GitHub no se pudieron leer desde el repositorio.
- La primera diaria generada con la regla de categorías «menor que 1» estaba pendiente de comprobar en vivo al escribir esto (00:05 UTC del 26-nov-2026).
