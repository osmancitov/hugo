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
- **VIP**: activo con Campaña de 1 o más en la ventana: Premium, Potentes o Constantes. Los de Campaña menor que 1 son Rezagados.
- **Relieve**: superficie 3D en la que cada activo es una cresta cuya altura es su variación contra la primera lectura del día.
- **Lectura**: foto de los precios de los VIP tomada en un instante, cada 15 minutos.


`index.html` contiene el HTML, el CSS y el script principal. Las vistas de rachas y superficie están en `visor-rachas.mjs` y `visor-superficie.mjs`. Los módulos de `app/modulos/` se importan con `?v=N` en la URL (por ejemplo `visor-rachas.mjs?v=9`): al cambiar un módulo hay que subir N, porque Pages cachea unos 10 minutos y sin eso el navegador sigue con la copia vieja. Un guard de las pruebas exige esa importación versionada.

## Rutas (el enrutador está en `index.html`)
| Ruta | Vista |
|---|---|
| `#/stock/...`, `#/cripto/...` con `empresas` o `fondos` (solo stock) y `capitalizacion`, `variacion` o `indicadores` | Listas por mercado. Los enlaces a `persistencia` llevan a `variacion`. |
| `#/a/<stock\|cripto>/<código>` | Ruta antigua (26-nov-2026): abre la vista integrada del activo en Mercado (`/mercado/<mercado>/<código>/`) y baja al título de su ficha. La ficha sale del catálogo: no depende de la lista VIP. |
| `#/i/iceberg-stock/barra-dia`, `barra-24h`, `barra-movimiento` | Indicadores de barra del iceberg de stocks. |
| `#/i/iceberg-stock/superficie` | Superficie 3D (solo dibuja stocks). Filtros de grupo y ventana. |
| `#/campana`, `#/campana/<90\|60\|30>d`, `#/campana/<90\|60\|30>d/<clase>/<código>` | Campaña de la ventana, con el activo elegido. |
| `#/buscar` | Búsqueda por código, nombre o lectura. |
| `/mercado/`, `/mercado/<empresas\|fondos\|cripto>/`, `/mercado/<stock\|cripto>/<código>/` | Mercado, la página principal (sección siguiente). Direcciones reales sin `#`: se generan al publicar (`app/generar-rutas-mercado.mjs`) a partir de `index.html`. |

Menú principal: Mercado y Cimiento.

Variación (stocks empresas, fondos y cripto): el selector tiene cinco órdenes, G/P, Día, Oscilación, Rango diario y Variación acumulada, sin selector de dirección y sin cuadro de filtro propio (queda la búsqueda global). La racha se ve como columna de datos. Debajo del selector solo se lee «27 de agosto → 24 de noviembre • N de M activos» (sin año; N = activos comparables, M = todos los de la lista). Un aviso de fuente aparece únicamente si el archivo del día falta o está atrasado.

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
- **Selección desde la lista**: la vista no se mueve (decisión del dueño, audio 26-nov-2026 12:54: sin saltos, las animaciones salen al deslizar). El batazo del campo espera a que el campo entre en pantalla y se juega una vez por selección; si se elige algo fuera de vista, se muestra al llegar. El visor no usa `scrollIntoView` (un guard de las pruebas lo prohíbe).
- **Espaguetis** (puestos de todos los activos por jornada): líneas grises tenues (opacidad .12); el activo elegido y el hover se resaltan en el blanco cálido `#fff3cf`, el mismo de la trayectoria del campo. Ningún color de categoría se usa para resaltar, porque un activo cambia de categoría con el tiempo.
- **Curvas P y C** del activo elegido: tercera gráfica, sin leyenda de escala.
- La Campaña no lleva textos explicativos; solo «Último día cerrado…».

## Nombres con lectura latina
Dos activos de cripto tienen nombre en caracteres chinos: `币安人生` y `牛来`. Se anotan en `app/modulos/activos-curados.json` con `lectura` (pinyin) y `traduccion` (traducción literal breve, no oficial), y la pasada de catálogo los copia a `registros/catalogo/cripto` (campos en `CAMPOS_CURADOS` de `catalogo.mjs`). El formato visible sale de una función, `parentesisLectura` en `app/modulos/lectura-latina.mjs`: «币安人生 (Bì'ān Rénshēng, Vida Binance)». Se usa en las listas, Campaña, Variación, Persistencia, títulos y ficha. En el punto elegido del campo va solo el código para que no se corte. Para añadir un nombre así: anotar `lectura` y `traduccion` en el JSON curado y regenerar el catálogo.

## Otras vistas
- **Iceberg**: por día cerrado UTC, activos en alza y a la baja (barra verde y roja). Ventana de 90 días en `registros/pre-calculado/<mercado>/iceberg-90d` (la vela plana cuenta como verde). Las carpetas `registros/iceberg-*` son una serie vieja congelada.
- **Persistencia**: promedio simple de los puestos de cada activo en las carreras donde participó (una carrera por fecha UTC con velas cerradas). No tiene vista propia; el cálculo lo usa la Campaña. Los enlaces `#/…/persistencia` llevan a Variación.
- **Variación y rachas**: razón G/P y racha por activo desde sus velas diarias (`visor-rachas-datos.mjs`).
- **Día cerrado en Mercado**: si el día visible ya cerró, el Relieve y las barras usan el registro VIP canónico (97 puntos de 15 min, o 25 si es heredado, 00:00 a 24:00 UTC) cuando existe; si no, el vivo. Mercado no tiene selector de día, así que el canónico se ve en la ventana 00:00-01:00 UTC (hasta la segunda lectura del día nuevo). Los VIP de ese registro son los del núcleo vigente al cierre (54 campañas de duración variable, de 7 a 60 días). Los canónicos anteriores al 27-nov-2026 guardan la unión de las campañas de 30, 60 y 90 días del cierre de entonces; no se reescriben.
- **Barra móvil de 24 h**: foto intradiaria de los stocks (ventana móvil de 24 h, no el día cerrado del iceberg).
- **Capitalización**: lista por capitalización con fichas curadas.

## Nombre visible
«Observatorio Bursátil» en `<title>`, `og:title`, `<h1>` y el alt del avatar. El visor no usa las palabras «caballo» ni «hipódromo».

## Mercado (la página principal)
Es la entrada del visor. Dirección `/mercado/`: muestra tres botones, Empresas, Fondos y Cripto. Elegir uno lleva a `/mercado/<grupo>/`; con un activo elegido, `/mercado/<stock|cripto>/<código>/` (el grupo se deduce del activo). Moverse entre estas vistas no recarga la página (History API); abrir una dirección directo o recargar funciona porque cada una existe como entrada generada con respuesta 200. El periodo es siempre 30 días. El menú principal tiene dos entradas: Mercado y Cimiento. Las demás rutas de este documento siguen funcionando por su dirección, pero no están en el menú.

**Orden de la página**, de arriba abajo:
1. Botones de grupo, y debajo el reloj: «Hora actual» en amarillo y la hora local de quien mira en blanco.
2. **Activos VIP**: lista de los VIP del grupo elegido. Elegir uno de la lista lo marca en todas las vistas de abajo.
3. **Balance del día**: cuántos VIP del grupo suben, bajan o quedan iguales, día por día.
4. **Cuatro barras de movimiento**: 24 horas, día, 1 hora y 15 min. Siempre hay cuatro espacios; si una barra aún no tiene lectura suficiente, su espacio queda vacío con «sin datos» y nada se desplaza. «1 hora» y «15 min» necesitan una lectura real de unos 60 y 15 minutos antes, y las dos tienen «Ver tabla».
5. **Relieve del día**: superficie 3D de los VIP.
6. **Campaña**: campo de béisbol del activo elegido, con su nombre y enlace a su ficha.
7. **Potencia y constancia**: curvas P y C del activo elegido.
8. **Evolución**: Campaña de cada VIP, día por día.
9. **Variación diaria**: variación de los VIP en la ventana.
10. **Ficha del activo**, al final: código y nombre, una línea amarilla debajo, la matriz de categorías (Premium verde, Potentes amarillo, Constantes azul, en columnas de 30, 60 y 90 días; se enciende lo que le corresponde al activo) y los enlaces externos (por ejemplo Stock Analysis, TipRanks, TradingView, Gobierno y Oficial, según el activo). Aparece y desaparece sin empujar el resto de la página. Sin activo elegido no hay ficha.

Los títulos «Activos VIP», «Balance del día» y «Relieve del día» van en blanco y grandes; «Campaña», «Potencia y constancia», «Evolución de campaña» y «Variación diaria» van en dorado y pequeños.

- **VIP**: Premium, Potentes y Constantes del último cierre de la Campaña de 30 días, dentro del grupo elegido (empresas, fondos o cripto). Los Rezagados siguen en los registros pero no aparecen en Mercado.
- **Frontera VIP**: Campaña 1 (raíz((P²+C²)/2) = 1). Un activo es VIP si y solo si su Campaña es 1 o más. Esa línea no separa Premium de Potentes o Constantes: eso lo deciden P y C por separado (`grupoDe` en `campana-carrera.mjs`). Un activo puede tener P ≥ 1 o C ≥ 1 y ser Rezagado si su Campaña es menor que 1. En el campo, la cerca (radio 1) es esa misma frontera.
- **Balance del día**: la cohorte es el conjunto de VIP del último cierre, seguida hacia atrás durante los días cerrados de la ventana. No es el balance del mercado entero. Una vela sin cambio cuenta como «igual», ni alza ni baja. Cada día se cuenta cierre contra apertura con las velas diarias de los VIP del grupo (`vistaBalanceGrupo` en `index.html`; el archivo `registros/categorias/balance_carrera-{N}d` lo precalcula el proceso diario con `campana-balance.mjs`). Su trazado de 1 s arranca cuando la gráfica entra en pantalla, no al cargar la página; las demás gráficas conservan su trazado actual.
- **Relieve del día**: crestas con pared, contorno dorado en cero, rotación libre con imán al plano, marcas fijas cada 10 puntos, zoom con pellizco y rueda. Sin selector de grupo, sin franja y sin leyenda de colores. El tiempo se recorre con dos flechas verticales: la de arriba avanza en el tiempo y, desde la última lectura, vuelve directamente a la primera (00:00 UTC) para seguir avanzando; la de abajo recorre el sentido contrario (desde la primera vuelve a la última). El ciclo recorre solo lecturas: la vista completa del día es la vista al entrar y queda fuera del ciclo de las flechas. Mantener una flecha pulsada recorre diez lecturas por segundo. Muestra la hora de la lectura junto al punto elegido, no un rango arriba. La altura de cada punto es su variación contra la primera lectura del día. **Color**: negro en cero, verde para positivos y rojo para negativos. El mayor valor absoluto del relieve (positivo o negativo) fija el brillo máximo en los dos signos, sin piso mínimo; el lado con menos recorrido queda más apagado. Se recalcula con cada lectura nueva (`topeAltura` y `colorAltura` en `visor-superficie.mjs`). Si todo el relieve vale cero, el tope es 1 para no dividir por cero. Elegir un punto elige el activo en toda la página, y tocar el vacío suelta la selección. Si un activo no tiene lectura horaria (por ejemplo, un cripto fuera del registro), un aviso lo dice y su ficha y su Campaña se consultan igual. Abre con el zoom máximo (2×) para ocupar el espacio de la gráfica; con ese acercamiento la etiqueta de la hora puede quedar momentáneamente fuera, pero la lectura más reciente sigue seleccionada y las cuatro barras se calculan igual.
- **Animación de entrada**: en Mercado, Balance del día, Evolución, Potencia y constancia y Variación diaria se dibujan una sola vez, en 1 s, cuando entra en pantalla; con movimiento reducido aparece completa. Las cuatro barras y el Relieve no tienen trazado.
- **Evolución**: una línea por VIP con la Campaña de la ventana que termina cada día, eje logarítmico común, referencia 1 punteada. Las líneas secundarias son finas y transparentes con el color de su categoría actual; la del activo elegido es gruesa. Los huecos cortan la línea, sin relleno. Son los VIP de hoy vistos hacia atrás, no la cohorte real de cada día pasado: no sirve para decir quién competía entonces, ni cruzar el 1 hacia atrás demuestra un buen momento de compra. Se traza una vez al entrar en pantalla (1 s; `movimientoReducido()` la desactiva).
- **Datos que alimentan la página**: `serie_carrera-Nd` (P y C por día), `{stock,cripto}_carrera-Nd`, `velas-24h`, `intradia` y su canónico. La hora del Observatorio es UTC. El registro horario de cripto empieza el 26-nov-2026 a las 00:00 UTC.
- **Estabilidad al cargar**: los bloques superiores reservan su alto (el último medido, o una proporción del ancho) para que el Relieve no salte mientras llegan los datos (`index.html`, `vistaUnificada`).
- **Colores de las barras**: bajó en rojo, igual en gris, subió en verde. «Igual» sale del precio exacto, no del porcentaje redondeado, y se cuenta aparte para que el verde no afirme un aumento que no hubo (`iguales` en `app/modulos/barra-movil.mjs`).
- **Barras de movimiento**: «15 min» compara con la lectura anterior publicada; «1 hora» recalcula cada activo contra la lectura publicada de hace 60 min (enlace con `&base=`), nunca contra la de 15 min.
- **Reloj**: el reloj de la página es la hora local de quien mira y solo aparece en la página del grupo, no en la portada ni en la elección de grupo.
- **Calendario NYSE**: el 26-nov-2026 no hay sesión y el 27-nov cierra a las 13:00 ET. La ausencia de vela del 26 es legítima, sin imputar ceros. Fuente: https://www.nyse.com/trade/hours-calendars

## Pruebas
`node --test pruebas/*.mjs` (unos 75 s, sin red). Cualquier prueba roja debe investigarse.

### VIP núcleo en Mercado
Las vistas de Mercado (lista, relieve, barras, balance, evolución, variación) usan el núcleo (`registros/nucleo/<mercado>/actual_nucleo`), no el grupo de la campaña elegida: un Rezagado a 30 días puede estar en el núcleo. La lista (todas las categorías) tiene las columnas Código, Nombre, Av. y Campaña, ordenada por Av. de mayor a menor. Av. = apariciones / 54 por unidad: 1 si es perfecto, si no dos decimales sin el cero de la izquierda (.89). Si el núcleo no carga, la página muestra el error.
