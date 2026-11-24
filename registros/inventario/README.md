# Inventario de días registrados

Dos archivos, uno por mercado: `stock` (incluye empresas y fondos ETF) y `cripto`. Cada uno es un JSON:

    {"mercado": "...", "desde": "2026-08-01", "hasta": "AAAA-MM-DD",
     "activos": {"CODIGO": [acumulado en desde, en desde+1, ..., en hasta]}}

## Qué cuenta
Para cada activo y cada día UTC cerrado, cuántos días con vela diaria válida guardada lleva desde el 1 de agosto de 2026, ese día incluido. El array tiene una posición por día: la posición 0 es `desde`, la última es `hasta`. Cada día suma 0 o 1: sube en 1 si la vela de ese día está guardada en el registro; si falta, repite el valor del día anterior. Un activo que entró después de `desde` tiene ceros hasta su primera vela. Vela válida: hora de apertura en día UTC exacto, apertura y cierre mayores que 0.

## Cómo se actualiza
Lo hace la pasada de sincronización (`app/modulos/inventario-dias.mjs`), después de poner al día las velas diarias y antes de comparar con GitHub; sube en el mismo commit. Es incremental: agrega solo las columnas de los días cerrados que faltan, leyendo de cada activo solo el archivo mensual de esos días. La columna se calcula de la vela guardada de esa fecha (valor anterior + 1 si existe, + 0 si no), nunca con un +1 ciego, así repetir la pasada no cambia nada. Solo se reconstruye entero si el archivo no existe o es inválido; un activo nuevo en el registro se rellena solo él desde sus velas. El día UTC en curso no cuenta hasta cerrarse. Si una vela de un día pasado aparece después de haberse contado como ausente, el valor ya escrito no se corrige solo.

## Relación con el catálogo
El catálogo (`registros/catalogo/<mercado>`) identifica cada activo: nombre y, en stocks, tipo (empresa o fondo). El inventario solo cuenta días. No duplica datos del catálogo; para unir ambos, se cruza por mercado y código.

## Uso
Días de un activo a una fecha: la posición de esa fecha en su array. Admisión por días acumulados (p. ej. 90 o más): leer la última posición. Es un inventario compartido, no pertenece a ninguna campaña.
