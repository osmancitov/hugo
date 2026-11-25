# El visor

Referencia técnica de consulta. El porqué de cada pieza está en [construccion.md](construccion.md).

## Términos de este documento
- **UTC**: hora universal, sin cambio de horario; cada día de velas va de las 00:00 a las 23:59 UTC.
- **Vela diaria**: los precios de apertura, máximo, mínimo y cierre de un activo en un día, más su volumen.
- **Binance**: plataforma que lista activos y publica sus precios.
- **JSON**: formato de texto para guardar datos: pares nombre y valor, y listas ordenadas de valores.
- **GitHub Pages**: servicio de GitHub que publica los archivos de un repositorio como página web.
- **Carrera y puesto**: una carrera es un día de comparación; ese día se ordenan todos los activos por variación y el puesto es la posición (1 es la mejor variación).
- **Campaña, P y C**: P es la potencia (suma de variaciones positivas entre el valor absoluto de la suma de las negativas) y C la constancia (días al alza entre días a la baja); Campaña = raíz((P² + C²) / 2).
- **Iceberg**: para cada día, cuántos activos subieron (cierre igual o mayor que apertura) y cuántos bajaron.
- **Persistencia**: promedio simple de los puestos de un activo en las carreras donde participó.
- **Pre-calculado**: resultado calculado de antemano y guardado como archivo para que el visor lo lea sin calcular.
- **Mercado**: `stock` (acciones y fondos tokenizados) o `cripto` (criptomonedas).
- **Catálogo**: la lista oficial de los activos que cuentan en cada mercado.
- **Pinyin**: escritura de los sonidos del chino con letras latinas.
- **G/P**: razón entre la suma de variaciones positivas y el valor absoluto de la suma de las negativas.
- **Racha**: días seguidos con la misma dirección, alza o baja.


`index.html` contiene el HTML, el CSS y el script principal. Las vistas de rachas, persistencia y superficie están en `visor-rachas.mjs`, `visor-persistencia.mjs` y `visor-superficie.mjs`. Los módulos de `app/modulos/` se importan con `?v=N` en la URL (por ejemplo `visor-rachas.mjs?v=9`): al cambiar un módulo hay que subir N, porque Pages cachea unos 10 minutos y sin eso el navegador sigue con la copia vieja. Un guard de las pruebas exige esa importación versionada.

## Rutas (el enrutador está en `index.html`)
| Ruta | Vista |
|---|---|
| `#/stock/...`, `#/cripto/...` con `empresas` o `fondos` (solo stock) y `capitalizacion`, `variacion`, `persistencia` o `indicadores` | Listas por mercado. |
| `#/a/<stock\|cripto>/<código>` | Ficha del activo (nombre, lectura y significado si los hay, enlaces, radiografía). |
| `#/i/iceberg-stock/barra-dia`, `barra-24h`, `barra-movimiento` | Indicadores de barra del iceberg de stocks. |
| `#/i/iceberg-stock/superficie` | Superficie 3D (solo dibuja stocks). Filtros de grupo y ventana. |
| `#/campana`, `#/campana/<90\|60\|30>d`, `#/campana/<90\|60\|30>d/<clase>/<código>` | Campaña de la ventana, con el activo elegido. |
| `#/buscar` | Búsqueda por código, nombre o lectura. |

## Campaña
Cada día cerrado se clasifica a cada activo que tenga todas las velas de la ventana (90, 60 o 30 días).
- **Potencia P** y **constancia C**: calculadas desde los días al alza y a la baja de la ventana. Constancia = días al alza / días a la baja; potencia = suma de variaciones positivas / valor absoluto de la suma de las negativas (`campana-carrera.mjs`, líneas `potencia = pos / Math.abs(neg)` y `constancia = dp / dn`).
- **Campaña** = raíz((P² + C²) / 2). Vale 1 con P = 1 y C = 1.
- **Grupo** (única fuente: `grupoDe` en `campana-carrera.mjs`):
  - Campaña menor que 1: **Rezagados** (gris). Campaña exactamente 1 ya no es Rezagados.
  - Campaña de 1 o más: **Premium** si P ≥ 1 y C ≥ 1; **Potentes** si solo P ≥ 1; **Constantes** si solo C ≥ 1. Con Campaña ≥ 1 siempre se cumple al menos una de las dos.
- Cada archivo diario guarda el grupo; el visor, la leyenda, los colores y el filtro de la Superficie 3D lo leen de ahí, no recalculan.
- **Orden** de la lista: Campaña de mayor a menor (`campana-orden.mjs`). Columnas: Código, Nombre, Tipo, Campaña. El número se pinta con el color del grupo (gris para Rezagados).
- **Campo de béisbol**: el home es el origen de la pelota (no un valor). La distancia es la Campaña con radio logarítmico desde 0,1: ρ = log2(r / 0,1). Anillos en 0,25, 0,5, 1 y 2; la cerca verde es la Campaña 1. Potencia a la izquierda (amarillo), constancia a la derecha (azul), Premium al centro (verde), Rezagados en gris. Al elegir un activo se anima la pelota con la misma función que usan las demás gráficas (`trazadoAnimado`).
- **Selección desde la lista**: la vista sube al título del activo (nombre con enlace a su ficha) justo sobre el campo. La subida usa `scrollTo`; el visor no usa `scrollIntoView` (un guard de las pruebas lo prohíbe).
- **Espaguetis** (puestos de todos los activos por jornada): líneas grises tenues (opacidad .12); el activo elegido y el hover se resaltan en el blanco cálido `#fff3cf`, el mismo de la trayectoria del campo. Ningún color de categoría se usa para resaltar, porque un activo cambia de categoría con el tiempo.
- **Curvas P y C** del activo elegido: tercera gráfica, sin leyenda de escala.
- Los textos explicativos largos (conteos, fórmula, explicación del campo) se quitaron (mensajes de Slack 1795615151.124609 y 1795615394.222839 del dueño); queda solo «Último día cerrado…».

## Nombres con lectura latina
Dos activos de cripto tienen nombre en caracteres chinos: `币安人生` y `牛来`. Se anotan en `app/modulos/activos-curados.json` con `lectura` (pinyin) y `traduccion` (traducción literal breve, no oficial), y la pasada de catálogo los copia a `registros/catalogo/cripto` (campos en `CAMPOS_CURADOS` de `catalogo.mjs`). El formato visible sale de una función, `parentesisLectura` en `app/modulos/lectura-latina.mjs`: «币安人生 (Bì'ān Rénshēng, Vida Binance)». Se usa en las listas, Campaña, Variación, Persistencia, títulos y ficha. En el punto elegido del campo va solo el código para que no se corte. Para añadir un nombre así: anotar `lectura` y `traduccion` en el JSON curado y regenerar el catálogo.

## Otras vistas
- **Iceberg**: por día cerrado UTC, activos en alza y a la baja (barra verde y roja). Ventana de 90 días en `registros/pre-calculado/<mercado>/iceberg-90d` (la vela plana cuenta como verde). Las carpetas `registros/iceberg-*` son una serie vieja congelada.
- **Persistencia**: promedio simple de los puestos de cada activo en las carreras donde participó (una carrera por fecha UTC con velas cerradas). Archivo derivado `persistencia-90d.json`.
- **Variación y rachas**: razón G/P y racha por activo desde sus velas diarias (`visor-rachas-datos.mjs`).
- **Barra móvil de 24 h**: foto intradiaria de los stocks (ventana móvil de 24 h, no el día cerrado del iceberg).
- **Capitalización**: lista por capitalización con fichas curadas.

## Nombre visible
«Observatorio Bursátil» en `<title>`, `og:title`, `<h1>` y el alt del avatar. El visor no usa las palabras «caballo» ni «hipódromo».

## Pruebas
`node --test pruebas/*.mjs` (unos 75 s, sin red). Hoy fallan dos pruebas, conocidas desde antes de este documento y sin causa investigada: «superficie tiene entrada estática con metadatos propios antes de ejecutar JS» y «los rótulos visibles de los icebergs viven en la fuente única de rótulos». Cualquier otra roja es nueva.
