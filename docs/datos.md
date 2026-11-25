# Datos: carpeta `registros/`

Todo lo que publica el Observatorio vive aquí como archivos JSON sin extensión. Las fechas internas son milisegundos UTC (época Unix). Piso fijo: 1-ago-2026. Los registros históricos no se reescriben: los generadores de Pages escriben solo derivados fuera de esta carpeta.

| Carpeta | Archivo | Contenido | Escribe | Lee |
|---|---|---|---|---|
| `velas-24h/<mercado>/<COD>/` | `<AAMM>_<COD>` | Velas diarias cerradas de Binance, un mes por archivo. Cada vela es el arreglo de 12 campos de Binance (apertura en ms, abrir, máx, mín, cerrar, volumen, cierre en ms, ...). | ingesta diaria (`velas`, `registro-motor`) | visor, iceberg, persistencia, campaña |
| `catalogo/` | `stock`, `cripto` | `{mercado, generado, activos:[{codigo, nombre, tipo, cap, cap_sub, edgar, web, ficha, lectura, traduccion, meses}]}`. Lista quién participa en vistas y cálculos. | pasada de sincronización (`catalogo.mjs`), con la capa curada `app/modulos/activos-curados.json` | visor y cálculos |
| `iceberg-<mercado>/` | `<AAMM>` | Serie diaria `[día, activos en alza, activos a la baja]`. | pasada | visor |
| `alternative-fear-greed/` | `<AAMM>` | Miedo y codicia de cripto: `[día, valor 0-100]`. | pasada (`indicadores.mjs`) | visor |
| `feargreedchart-bolsa/` | `<AAMM>` | Miedo y codicia de bolsa, mismo formato. | pasada | visor |
| `ranking-24h/<mercado>/` | `<AAMMDD>_ranking-24h` | Ranking de la jornada: `[código, variación %]`, de mayor a menor. | pasada (`pre-calculado.mjs`) | visor |
| `pre-calculado/<mercado>/lectura-dia-90d/` | `<AAMMDD>_lectura-dia` | Lectura del día sobre la ventana de 90 días: por activo, dirección, acumulado, variación, razón G/P, límites. | pasada | visor |
| `pre-calculado/<mercado>/iceberg-90d/` | `<inicio>-<fin>_iceberg` | Iceberg de la ventana de 90 días, `[día, alza, baja]`. | pasada | visor |
| `inventario/` | `stock`, `cripto`, `README.md` | Días registrados acumulados por activo desde el piso. Formato y reglas en su README. | pasada (`inventario-dias.mjs`) | uso de admisión por días |
| `intradia/stock/` | `<AAAA-MM-DD>.json`, `indice.json` | Fotos de la barra móvil de 24 h: `{version, dia, lecturas:[{generada, texto, ...}]}`. `indice.json`: `{version, dias, ultima}`. | lectura horaria | visor (barra móvil) |
| `categorias/` | `<inicio>-<fin>_carrera-<N>d` | Un día de la Campaña para la ventana N (90, 60 o 30). Contiene `carrera` (encabezado con reglas), `clasificados` (puesto, `promedio`, `potencia`, `constancia`, `grupo`) y `no_clasificados`. Un archivo por día cerrado; no se reescribe si existe. | `.github/campana-diaria.mjs` (`campana-carrera.mjs`) | visor |
| `categorias/` | `serie_carrera-<N>d` | La serie compacta de las ventanas: fechas y, por activo, `[puesto, potencia, constancia]` por día (`null` si no clasificó). No lleva el campo `grupo`. | `campana-serie.mjs` | visor |

## Detalles que importan
- **Mercado**: `stock` o `cripto`. Los códigos de cripto pueden estar en caracteres chinos (hoy `币安人生` y `牛来`): en rutas y archivos van codificados en URL; el visor muestra su lectura latina (ver `visor.md`).
- **Grupo de campaña**: el campo `grupo` de cada clasificado sale de una sola función, `grupoDe` en `app/modulos/campana-carrera.mjs`. La regla vigente está en `visor.md`. Los 171 archivos diarios anteriores se regruparon con ella el 25-nov-2026 a partir de la potencia y la constancia guardadas.
- **Observación sobre `serie_carrera-<N>d`**: su encabezado dice "sin las 90 velas ese día" incluso en las ventanas de 30 y 60 días. Es texto heredado; el dato es correcto por ventana.
- **Cuántos archivos hay**: `velas-24h` es la carpeta grande (miles de archivos mensuales); `categorias` tiene 174 archivos (171 diarios más 3 series) al 25-nov-2026.
- **Derivados fuera de `registros/`** (generados en Pages, no versionados como historia): `persistencia-90d.json`, `iceberg-colores.json`, `superficie.html`, `cuenta/index.html`.
