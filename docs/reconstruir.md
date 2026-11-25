# Reconstruir el Observatorio desde cero

Guía para levantar uno nuevo, o recuperar este, sin depender de ninguna conversación. Cada paso dice qué comprobar. Lo marcado "no verificado aquí" no se puede ver desde el repositorio y hay que confirmarlo en GitHub o Google.

## Qué necesitas
- Una cuenta de GitHub con un repositorio **público** (Pages gratis y ejecutores estándar gratis).
- Node 22 para trabajar en local.
- Una forma de lanzar `workflow_dispatch` por reloj. Aquí es un Google Apps Script que no está en el repositorio. Alternativa dentro de GitHub: añadir `schedule` (cron) a los flujos; hoy no lo tienen.
- Ningún secreto propio: los flujos usan `GITHUB_TOKEN`.

## Pasos
1. **Copia el repositorio** completo (incluida la carpeta `registros/`: es la única copia del historial publicado; las velas pasadas no se vuelven a pedir para los días que ya están).
2. **Ajusta el nombre del repositorio**: `HUGO_GITHUB` en `actualizacion-diaria.yml` (`osmancitov/hugo`), las rutas `raw.githubusercontent.com/osmancitov/hugo/main/...` de `index.html` (constantes `RAW`, `RAW_IND`, `RAW_CAT` y las de las vistas) y los scripts de `.github/` que construyen URLs del repositorio.
3. **Activa Pages** con fuente «GitHub Actions» y permite que Actions escriba en el repositorio (Settings). No verificado aquí.
4. **Comprueba las pruebas** en local: `node --test pruebas/*.mjs`. Deben quedar solo las dos rojas aceptadas (ver `visor.md`).
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
- Los registros históricos: no se reescriben; los derivados salen de ellos.
- La identidad de commits (`Osmancito <osmanvielma@gmail.com>`): la usan todos los flujos y la regla del dueño es mantenerla.

## Límites de esta guía
- El horario real del reloj de Google, la configuración de Settings de GitHub y la app de Slack de GitHub no se pudieron leer desde el repositorio.
- La primera diaria generada con la regla de categorías «menor que 1» estaba pendiente de comprobar en vivo al escribir esto (00:05 UTC del 26-nov-2026).
