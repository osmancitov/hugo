# Datos: carpeta `registros/`

Referencia técnica de consulta. El porqué de cada pieza está en [construccion.md](construccion.md).

## Términos de este documento

- **UTC**: hora universal, sin cambio de horario; cada día de velas va de las 00:00 a las 23:59 UTC.
- **Vela diaria**: los precios de apertura, máximo, mínimo y cierre de un activo en un día, más su volumen.
- **Binance**: plataforma que lista activos y publica sus precios.
- **JSON**: formato de texto para guardar datos: pares nombre y valor, y listas ordenadas de valores.
- **Commit**: un cambio guardado en el historial de un repositorio, con autor, fecha y mensaje.
- **GitHub Pages**: servicio de GitHub que publica los archivos de un repositorio como página web.
- **Repositorio**: carpeta de archivos con su historial de cambios, alojada en GitHub.
- **AAMM y AAMMDD**: año, mes y día con dos cifras cada uno: `2611` es noviembre de 2026, `261124` el 24 de noviembre de 2026.
- **ms (milisegundo)**: milésima de segundo; las fechas internas cuentan milisegundos desde el 1 de enero de 1970 UTC (época Unix).
- **Piso**: fecha más antigua que se guarda y se calcula: 1 de agosto de 2026.
- **Carrera y puesto**: una carrera es un día de comparación; ese día se ordenan todos los activos por variación y el puesto es la posición (1 es la mejor variación).
- **Campaña, P y C**: P es la potencia (suma de variaciones positivas entre el valor absoluto de la suma de las negativas) y C la constancia (días al alza entre días a la baja); Campaña = raíz((P² + C²) / 2).
- **Iceberg**: para cada día, cuántos activos subieron (cierre igual o mayor que apertura) y cuántos bajaron.
- **Persistencia**: promedio simple de los puestos de un activo en las carreras donde participó.
- **Ranking**: lista de activos con su variación porcentual de un día.
- **Pre-calculado**: resultado calculado de antemano y guardado como archivo para que el visor lo lea sin calcular.
- **Mercado**: `stock` (acciones y fondos tokenizados) o `cripto` (criptomonedas).
- **`cap`**: capitalización: valor total de mercado de un activo.
- **G/P**: razón entre la suma de variaciones positivas y el valor absoluto de la suma de las negativas.


Todo lo que publica el Observatorio vive aquí como archivos JSON sin extensión. Las fechas internas son milisegundos UTC (época Unix). Piso fijo: 1-ago-2026. Los registros históricos no se reescriben (excepción: el regrupado de `grupo` del 25-nov-2026, abajo): los generadores de Pages escriben solo derivados fuera de esta carpeta.

| Carpeta | Archivo | Contenido | Escribe | Lee |
|---|---|---|---|---|
| `velas-24h/<mercado>/<COD>/` | `<AAMM>_<COD>` | Velas diarias cerradas de Binance, un mes por archivo. Cada vela es el arreglo de 12 campos de Binance (apertura en ms, abrir, máx, mín, cerrar, volumen, cierre en ms, ...). | ingesta diaria (`velas`, `registro-motor`) | visor, iceberg, persistencia, campaña |
| `catalogo/` | `stock`, `cripto` | `{mercado, generado, activos:[{codigo, nombre, tipo, cap, cap_sub, edgar, web, ficha, lectura, traduccion, meses}]}`. Lista quién participa en vistas y cálculos. | pasada de sincronización (`catalogo.mjs`), con la capa curada `app/modulos/activos-curados.json` | visor y cálculos |
| `iceberg-<mercado>/` | `<AAMM>` | Serie diaria `[día, activos en alza, activos a la baja]`, del módulo viejo `iceberg.mjs` (no cuenta la vela plana). **Serie congelada; el visor no la lee** (usa `pre-calculado/.../iceberg-90d`). | ninguno hoy | ninguno |
| `alternative-fear-greed/` | `<AAMM>` | Miedo y codicia de cripto: `[día, valor 0-100]`. | pasada (`indicadores.mjs`) | visor |
| `feargreedchart-bolsa/` | `<AAMM>` | Miedo y codicia de bolsa, mismo formato. | pasada | visor |
| `ranking-24h/<mercado>/` | `<AAMMDD>_ranking-24h` | Ranking de la jornada: `[código, variación %]`, de la mayor caída a la mayor subida (orden creciente). | pasada (`pre-calculado.mjs`) | visor |
| `pre-calculado/<mercado>/lectura-dia-90d/` | `<AAMMDD>_lectura-dia` | Lectura del día sobre la ventana de 90 días: por activo, dirección, acumulado, variación, razón G/P, límites. | pasada | visor |
| `pre-calculado/<mercado>/iceberg-90d/` | `<inicio>-<fin>_iceberg` | Iceberg de la ventana de 90 días, `[día, alza, baja]`. | pasada | visor |
| `inventario/` | `stock`, `cripto`, `README.md` | Días registrados acumulados por activo desde el piso. Formato y reglas en su README. | pasada (`inventario-dias.mjs`) | uso de admisión por días |
| `intradia/<mercado>/canonico/` | `<AAAA-MM-DD>.json` | Registro VIP canónico del día cerrado (97 puntos de 15 min con `ritmo_min: 15`; sin ese campo, 25 puntos de 60 min): `{version, canonico: true, dia, mercado, lecturas:[{generada, texto}]}` con 25 puntos (00:00 a 24:00 UTC), reconstruidos al cierre con velas de 1 h de Binance para los VIP del núcleo (los anteriores al 27-nov-2026, para la unión VIP 30/60/90 de entonces). Convive con los vivos, que no se tocan. | cierre diario (`canonico-diario.mjs`) | visor (Mercado, día cerrado) |
| `intradia/stock/` | `<AAAA-MM-DD>.json`, `indice.json` | Fotos de la barra móvil de 24 h: `{version, dia, lecturas:[{generada, texto, ...}]}`. `indice.json`: `{version, dias, ultima}`. | lectura horaria | visor (barra móvil) |
| `categorias/` | `<inicio>-<fin>_carrera-<N>d` | Un día de la Campaña para la ventana N (90, 60 o 30). Contiene `carrera` (encabezado con reglas), `clasificados` (puesto, `promedio`, `potencia`, `constancia`, `grupo`) y `no_clasificados`. Un archivo por día cerrado; no se reescribe si existe. | `.github/campana-diaria.mjs` (`campana-carrera.mjs`) | visor |
| `categorias/` | `serie_carrera-<N>d` | La serie compacta de las ventanas: fechas y, por activo, `[puesto, potencia, constancia]` por día (`null` si no clasificó). No lleva el campo `grupo`. | `campana-serie.mjs` | visor |

## Detalles que importan
- **Mercado**: `stock` o `cripto`. Los códigos de cripto pueden estar en caracteres chinos (hoy `币安人生` y `牛来`): en rutas y archivos van codificados en URL; el visor muestra su lectura latina (ver `visor.md`).
- **Grupo de campaña**: el campo `grupo` de cada clasificado sale de una sola función, `grupoDe` en `app/modulos/campana-carrera.mjs`. La regla vigente está en `visor.md`. Los 171 archivos diarios anteriores se regruparon el 25-nov-2026 (commit `cc539d9`). El script de ese regrupado no está en el repositorio; el detalle del único caso que difiere está en `construccion.md`, apartado 7.6.
- **Observación sobre `serie_carrera-<N>d`**: su encabezado dice "sin las 90 velas ese día" incluso en las ventanas de 30 y 60 días. Es texto heredado; el dato es correcto por ventana.
- **Cuántos archivos hay**: `velas-24h` es la carpeta grande (miles de archivos mensuales); `categorias` tiene 174 archivos (171 diarios más 3 series) al 25-nov-2026.
- **Derivados fuera de `registros/`** (generados en Pages, no versionados como historia): `iceberg-colores.json`, `superficie.html`, `cuenta/index.html`.

### `nucleo/<mercado>/`
`<AAMMDD>_nucleo` y `actual_nucleo` (copia del más reciente): VIP núcleo 54 campañas, de 7 a 60 días, por mercado (`stock`, `cripto`). Campos: `cierre`, `regla`, `nucleo` (códigos) y `activos` (código, apariciones, evaluables, sin_bajas, indefinidas). Lo escribe `.github/nucleo-diario.mjs`; lo lee `app/modulos/nucleo.mjs` (`leerNucleo` lanza si falta o está atrasado).

### `historial-monitor/<mercado>/`
`<AAMM>` (un mes por archivo) e `indice`: historial diario consultable del Monitor, desde la jornada 2026-09-30 (primer cierre con 60 velas desde el piso del 1-ago: el del 29-sep). Cada jornada D guarda la lista VIP núcleo calculada AL CIERRE DE D-1 y el rendimiento de la vela diaria de D (apertura 00:00 UTC, cierre 23:59:59 UTC): nunca se elige la lista con la subida del propio día. Por día: `lista` (`cierre` D-1, `origen` `guardado` si es el archivo `nucleo/<mercado>/<D-1>_nucleo` publicado o `reconstruido` si se recalculó con la regla actual, fijada el 27-nov-2026, y las velas guardadas; `total`), `rendimiento` (siempre de las velas diarias guardadas), `resumen` (suben, bajan, iguales, sin_vela, media simple de variaciones) y `activos` con las columnas de `campos` (código, apariciones de 54, apertura, cierre, variación %). Universo: activos del catálogo con velas guardadas hasta D-1, no el universo completo de Binance. Antes del 27-nov-2026 no existía núcleo guardado: esas jornadas son reconstruidas. Lo escribe `.github/historial-monitor.mjs` (módulo `app/modulos/historial-monitor.mjs`); no reescribe días guardados.
