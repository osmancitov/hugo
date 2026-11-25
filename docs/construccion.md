# Cómo se construye y cómo funciona el Observatorio Bursátil

El Observatorio Bursátil es una página web que cada día ordena cientos de activos por rendimiento y constancia.

## Palabras que este documento usa

- **Activo**: algo que se compra y se vende en un mercado, como una acción o una criptomoneda.
- **Binance**: plataforma que lista activos y publica sus precios.
- **USDT**: moneda digital que vale cerca de un dólar. Los precios de Binance se expresan en USDT.
- **Vela diaria**: los cuatro precios de un activo en un día (apertura, máximo, mínimo, cierre) y su volumen.
- **UTC**: hora universal, sin cambio de horario. Cada día de velas va de las 00:00 a las 23:59 UTC.
- **API**: dirección web que responde con datos cuando se la consulta. Un **endpoint** es una de esas direcciones.
- **JSON**: formato de texto para guardar datos: pares nombre y valor, y listas ordenadas de valores.
- **GitHub**: sitio web que aloja repositorios y ofrece, además, GitHub Actions y GitHub Pages.
- **Repositorio**: carpeta de archivos con su historial completo de cambios, alojada en GitHub.
- **Commit**: un cambio guardado en el historial del repositorio, con autor, fecha y mensaje. Un **hash** es el código corto que identifica un commit.
- **GitHub Actions**: servicio de GitHub que ejecuta programas en sus servidores. Un **workflow** es un archivo que dice qué programa ejecutar y cuándo.
- **GitHub Pages (Pages)**: servicio de GitHub que publica los archivos del repositorio como página web.
- **Piso**: la fecha más antigua que se guarda y se calcula: el 1 de agosto de 2026. Nada anterior existe en el Observatorio.
- **Rama**: una línea de historial del repositorio. `main` es la rama principal, la que Pages publica y de donde el visor lee los datos.
- **Mercado**: uno de los dos grupos de activos, `stock` (acciones y fondos) o `cripto` (criptomonedas).
- **Carrera**: un día de comparación. Ese día se ordenan todos los activos por su variación, y la posición de cada uno es su **puesto** (1 es la mejor variación).
- **Pre-calculado**: resultado ya calculado y guardado como archivo para que el visor lo lea sin calcular.
- **`workflow_dispatch`**: modo de lanzar un workflow a mano o desde otro programa, mediante una llamada a GitHub. Es la única forma de lanzar los flujos diario y horario, que no tienen horario propio.
- **Error 429**: respuesta de un servidor que significa «demasiadas peticiones, espera».
- **Rebase**: poner los cambios propios encima de la última versión de la rama, para publicarlos sin pisar cambios ajenos.
- **Milisegundo (ms)**: milésima de segundo. Las fechas internas son milisegundos desde el 1 de enero de 1970 UTC.
- **HTTP, GET y POST**: HTTP es el protocolo con que un programa pide datos a un servidor web. GET pide un dato; POST envía uno. El **código HTTP** es el número con que el servidor responde: 200 es correcto, 429 y 418 piden esperar, 451 niega el servicio por ubicación.
- **Host**: nombre del servidor al que se pide un dato, como `api.binance.com`.
- **Archivo temporal**: archivo auxiliar que se escribe primero y se renombra al terminar, para que nadie lea un archivo a medias.
- **Clon**: copia del repositorio en la máquina donde corre un programa.
- **Idempotente**: que repetirlo da el mismo resultado que hacerlo una vez.
- **Caché de Actions**: almacén de GitHub donde un workflow guarda archivos para su próxima ejecución.
- **Huella sha**: código calculado del contenido de un archivo; dos archivos con el mismo contenido tienen la misma huella.
- **Stablecoin**: criptomoneda que busca valer una moneda fija, como el dólar.
- **Capitalización (`cap`)**: valor total de mercado de un activo.
- **SEC y EDGAR**: la SEC es el regulador bursátil de EE. UU.; EDGAR es su archivo público de documentos de empresas.
- **`schedule` y cron**: horario propio de un workflow, escrito en formato cron.
- **`push`**: subir cambios al repositorio.
- **AAMM y AAMMDD**: año, mes y día con dos cifras cada uno. `2611` es noviembre de 2026; `261124` es el 24 de noviembre de 2026.
- **Arreglo**: lista ordenada de valores.
- **Acción tokenizada**: activo digital que Binance vende y compra como una criptomoneda y que sigue el precio de una acción real; Binance lo etiqueta `bStocks`. **ETF**: fondo de inversión que se compra y se vende en bolsa como una acción.
- **VIX, S&P 500, put/call**: el VIX mide la volatilidad esperada de la bolsa de EE. UU.; el S&P 500 es un índice de 500 empresas grandes de EE. UU.; put/call compara apuestas a la baja y al alza. Una de las fuentes de miedo y codicia las usa; este proyecto no las calcula.
- **Unicode y pinyin**: Unicode es el estándar que da un número a cada letra de cada idioma, incluidos los caracteres chinos. El pinyin escribe el sonido de las palabras chinas con letras latinas.
- **Byte a byte idéntico**: dos archivos con exactamente los mismos caracteres.
- **Clave de acceso (token)**: texto secreto que identifica a un programa ante un servicio. `GITHUB_TOKEN` es la clave que GitHub da a cada ejecución de un workflow. Un **secreto** es un dato así, que no se escribe en el repositorio. No tiene relación con las acciones tokenizadas.
- **Ejecutor**: el servidor de GitHub donde corre un workflow. **Concurrencia**: regla que impide que dos ejecuciones del mismo workflow corran a la vez.
- **`fetch`, `reset --hard`, `push`, `rebase`**: órdenes de git. `fetch` baja los cambios de GitHub sin aplicarlos; `reset --hard` deja la copia local igual a una versión indicada; `push` sube; `rebase` está definido arriba.
- **SHA**: el hash de un commit. `sha7` son sus 7 primeras cifras.
- **Época Unix**: el instante 1 de enero de 1970 UTC, desde el que se cuentan las fechas internas.
- **Ventana de N días**: los últimos N días terminados, contados hacia atrás desde la fecha de corte.
- **JavaScript y Node**: JavaScript es un lenguaje de programación. Node es el programa que ejecuta código JavaScript en una computadora o en un servidor, fuera del navegador. Los archivos `.mjs` son código JavaScript para Node.
- **Prueba**: programa que comprueba que otro programa da el resultado esperado. La suite es el conjunto de pruebas.

## Cómo se marca lo que se afirma

- **Hecho** quiere decir leído en el código de este repositorio (commit publicado, 25-nov-2026) o ejecutado. **Propuesta** quiere decir una idea no probada y lleva la etiqueta **[PROPUESTA]** donde aparece. Lo que no pude verificar lleva **[NO VERIFICADO]**.
- El orden de las piezas es el orden real de los datos: universo de activos (Pieza A), velas diarias (Pieza B), catálogo (Pieza C), cálculos, publicación. El catálogo se deriva de las carpetas de velas ya descargadas.

Documentos de consulta del mismo repositorio: [datos.md](datos.md) (cada carpeta), [flujos-github.md](flujos-github.md) (los flujos), [visor.md](visor.md) (pantallas), [arquitectura.md](arquitectura.md) (módulos), [reconstruir.md](reconstruir.md) (lista corta de pasos) y [decisiones.md](decisiones.md) (reglas del dueño con su origen).

---

## 1. Qué es y para qué sirve

**La pregunta.** Cada día, sobre un mercado de cientos de activos: ¿cuáles vienen rindiendo mejor y con qué consistencia? Mirar el precio de hoy no basta. Un activo que subió 40 % un solo día y cayó el resto no es lo mismo que otro que sube un poco casi todos los días.

**Qué mira.** Dos mercados que Binance ofrece contra USDT:
- `stock`: acciones y fondos tokenizados (Binance los etiqueta "bStocks"). Son unos 113.
- `cripto`: criptomonedas. Son unas 400 y pico.

**Qué produce.** A partir de una vela diaria por activo y por día:
- el **iceberg**: para cada día, cuántos activos subieron (cierre igual o mayor que apertura) y cuántos bajaron;
- el **ranking** del día: la lista de activos con su variación porcentual de ese día;
- la **lectura del día** de cada activo: su **racha** (días seguidos en la misma dirección), lo que acumula en esa racha y la razón entre lo que gana y lo que pierde;
- la **persistencia**: el puesto promedio que ocupa un activo, día tras día, al ordenar todos por variación;
- la **Campaña**: un número que combina **potencia** (cuánto gana en comparación con lo que pierde) y **constancia** (cuántos días gana en comparación con los que pierde), y que reparte los activos en grupos, calculada sobre las últimas 90, 60 y 30 jornadas;
- una **foto cada hora** del mercado de stocks: sus precios guardados cada hora;
- dos índices de **miedo y codicia**: números de 0 a 100 que publican otras páginas y que aquí solo se guardan.

Todo se publica en https://osmancitov.github.io/hugo/ como una página estática, y los datos quedan abiertos en el repositorio https://github.com/osmancitov/hugo.

**Principios que explican casi todo el diseño:**
- **Sin servidor propio.** Los cálculos corren en GitHub Actions y el resultado se guarda como archivos en el repositorio. Por qué: no hay máquina que mantener, y el historial queda versionado y auditable.
- **El pasado no se reescribe.** Un día cerrado se guarda una vez. Si un archivo ya existe con contenido distinto, el sistema avisa y no lo toca. Una excepción hecha a mano: el 25-nov-2026 se regrupó el campo `grupo` de 171 archivos de la Campaña (commit `cc539d9`, apartado 7.6). Por qué: si los números viejos cambian en silencio, nadie puede confiar en ninguna comparación.
- **Una sola fuente por regla.** Qué activos cuentan, a qué grupo pertenece cada uno, cómo se escribe un nombre: cada regla vive en un solo archivo y el resto la lee. Por qué: si una regla vive en dos sitios, tarde o temprano dicen cosas distintas.
- **Ante la duda, se detiene.** Si una respuesta de Binance viene incompleta o incoherente, el cálculo termina con un error claro. Por qué: un dato inventado o a medias contamina todo lo que se calcula encima.
- **Un día sin dato es un hueco visible.** Nunca se rellena ni se inventa.

---

## 2. El plano completo

```
Binance (API pública, solo lectura)
   │
   ▼
[A] UNIVERSO: qué activos existen hoy y de qué clase         
   │
   ▼
[B] VELAS DIARIAS: una vela por activo y día UTC cerrado
   │        guardadas por mes en registros/velas-24h/...
   ▼
[C] CATÁLOGO: la lista oficial de quién participa
   │        registros/catalogo/stock y /cripto
   ▼
[D] CÁLCULOS que leen velas filtradas por el catálogo
   ├─ iceberg, ranking, lectura del día   (pre-calculado)
   ├─ persistencia                         (derivado en Pages)
   └─ Campaña 90/60/30                     (paso aparte, tras la pasada)
   │
[E] Foto horaria de los stocks ───────────────────────────►
   │
   ▼
Todo se guarda en registros/ y se sube a la rama main
   │                                   │
   ▼                                   ▼
Pages publica el visor            El visor lee los DATOS directamente
(index.html y módulos)            desde raw.githubusercontent.com/.../main
```

**Un detalle que sorprende y hay que saber.** El sitio (Pages) solo entrega el visor: `index.html`, los módulos de JavaScript y algunos derivados. Los **datos** el navegador los pide aparte a `https://raw.githubusercontent.com/osmancitov/hugo/main/registros/...` (hecho: constantes `RAW`, `RAW_CAT`, `RAW_IND` y `BASE_INTRADIA_WEB` en `index.html`, y `RAW` en `visor-rachas.mjs`). Consecuencia práctica: un dato nuevo aparece en el visor en cuanto está en `main`, sin esperar a Pages. Y al revés: un cambio en el código del visor solo aparece cuando Pages termina de publicar.

**Qué dispara cada cosa.** Hay tres flujos en `.github/workflows/`: `actualizacion-diaria.yml`, `lectura-horaria.yml` y `pages.yml`. Los dos primeros no tienen horario propio: se ejecutan cuando alguien o algo llama a GitHub para lanzarlos (`workflow_dispatch`), a mano desde su página o por programa mediante la API. Que algo los llame de forma automática hoy no está comprobado; el apartado «El reloj» lo detalla.

---

## 3. Pieza A: el universo (qué activos existen)

**El problema.** Binance lista miles de pares. Hay que decidir cuáles son del Observatorio: acciones tokenizadas por un lado, criptos por otro, y fuera todo lo que no sea un activo (monedas fiat, dólares digitales). Si esa decisión se toma con trucos (por ejemplo, por el nombre), se cuelan activos que no son y se pierden otros.

**Cómo funciona** (`app/modulos/universo-binance.mjs`, reglas en `activos.mjs` y `exclusiones.mjs`).

Se piden dos listas públicas:
1. `https://api.binance.com/api/v3/exchangeInfo`: todos los pares con su estado.
2. `https://www.binance.com/bapi/asset/v2/public/asset-service/product/get-products?includeEtf=true`: la lista de productos de Binance, que trae para cada par un nombre (`an`) y etiquetas (`tags`).

Reglas, en orden:
- Solo cuentan los pares con `status = TRADING` y `quoteAsset = USDT`. El símbolo debe ser exactamente `base + USDT`.
- **Clase.** Una acción tokenizada es un par cuyo producto lleva la etiqueta `bStocks`. Además su nombre debe terminar en "(bStocks)". Si una de las dos cosas está y la otra no, el sistema se detiene ("clasificación incoherente"). Su base termina en `B` (por ejemplo `NVDAB`), y el código visible es la base sin esa `B` (`NVDA`). El par de consulta de una acción es `CÓDIGO+B+USDT`. Una cripto es cualquier otro par: base = código, par = `CÓDIGO+USDT`.
- **Códigos válidos:** de 1 a 15 letras o números Unicode (`^[\p{L}\p{N}]{1,15}$`). Por eso existen criptos de una letra (`A`, `W`) y de caracteres chinos (`币安人生`, `牛来`).
- **Exclusiones** (`exclusiones.mjs`): fuera el euro y las stablecoins en dólares (USDC, FDUSD, TUSD, USD1, RLUSD, XUSD, U, USDE, USDS y USDT como activo). Se excluye por identidad verificada, no por el precio ni por el nombre. USDT sigue siendo la moneda en que se cotiza todo. Hay una lista de casos revisados a mano que no son dólares (FRAX, BFUSD, RWUSD, EURI, KGST, USTC). Una alta nueva cuyo nombre o etiquetas sugieran "usd" o "stable" y que no esté en esa lista revisada **detiene el lote** con un aviso: hay que revisar su identidad y actualizar la tabla.

**Protecciones contra respuestas malas** (`registro-universo.mjs`, función `prepararUniverso`). Aquí se decide qué se descarga. Por qué importa: una lista parcial de Binance parecería que muchos activos "se dieron de baja".
- Si la lista de un mercado viene vacía, o tiene más de 500 activos, se detiene.
- Antes de darle de baja a un activo se confirma: si su par sigue en `TRADING`, error. Si no aparece en la lista, se pregunta por ese par solo y Binance debe contestar con el código `-1121` (símbolo inexistente). Si no, error.
- Si hay 10 o más activos previos y las bajas superan el mayor entre 3 y el 20 % de los previos, error ("baja masiva inesperada").
- Un activo dado de baja no pierde su historial: sus velas siguen en su carpeta.
- Qué activos conoce el sistema se guarda en un archivo local de trabajo (`universo.json`, en una carpeta temporal de la corrida). No sube al repositorio.

**Por qué así.** La clasificación de acciones depende de la lista de productos de Binance, que es la API interna de su web, no una API documentada. Eso es un riesgo conocido y está dicho en el propio `activos.mjs`: si la dejaran de servir, el sistema se detiene con aviso claro en lugar de adivinar.

**Cómo comprobarlo.** El módulo no escribe nada en el repositorio por sí solo. Su resultado visible es la lista de qué descargar (las velas, Pieza B) y el texto de cotejo ("Cotejo de stock con Binance: N activos elegibles. Altas: ... Bajas nuevas: ...") que aparece en el registro de la corrida diaria.

---

## 4. Pieza B: las velas diarias

**El problema.** Todo lo demás se calcula de aquí. Hace falta guardar, para cada activo y cada día UTC ya cerrado, la vela diaria que Binance publicó, sin duplicados, sin huecos escondidos y sin cambiar nunca un día ya guardado.

**El formato.** Cada vela es un arreglo de **12 elementos** (el formato estándar de Binance, `klines`). Los que usa el sistema:

| Posición | Contenido |
|---|---|
| 0 | apertura del día, en milisegundos UTC (siempre múltiplo de 86 400 000) |
| 1 | precio de apertura (texto) |
| 2 | máximo |
| 3 | mínimo |
| 4 | precio de cierre |
| 5 | volumen |
| 6 | cierre del día en ms (siempre `apertura + 86 400 000 - 1`) |

Los precios vienen como texto. Todo el sistema los convierte con `Number(...)` al calcular.

*Dónde se guardan.* Un archivo por activo y por mes: `registros/velas-24h/<mercado>/<CÓDIGO>/<AAMM>_<CÓDIGO>`, que es una lista JSON de velas ordenadas. Ejemplo real: `registros/velas-24h/stock/NVDA/2611_NVDA`. Por qué un archivo por mes: los commits quedan pequeños y se puede validar un mes sin leer todo el historial.

*El piso.* **1 de agosto de 2026** (`Date.UTC(2026,7,1)`). Nada anterior se guarda ni se calcula.

**Cómo funciona la descarga** (`registro-motor.mjs`, `registro-serie.mjs`, `velas.mjs`).

1. Se calcula el **último día cerrado**: `ciclo-diario.mjs`, `ultimoCerrado(ahora) = inicio del día UTC de (ahora - 5 minutos) menos un día`. El margen de 5 minutos da tiempo a que Binance tenga lista la vela de las 00:00 UTC. Todo lo que cierra después del corte se descarta.
2. Para cada activo de la lista del universo, y para cada mes desde el actual hacia atrás hasta el piso, se pide a Binance:
   `GET https://api.binance.com/api/v3/klines?symbol=<PAR>&interval=1d&startTime=<inicio del mes>&endTime=<fin del mes o corte, menos 1 ms>&limit=1000`
   (En GitHub Actions esa petición se desvía al host público de datos `data-api.binance.vision`, ver más abajo.)
3. Se **valida** la respuesta (`validarSerie`): debe ser una lista; cada vela, 12 elementos; apertura dentro del mes y múltiplo de un día; orden creciente sin repetidos; `cierre = apertura + 1 día - 1 ms`; y el cierre debe estar antes del corte (ninguna vela abierta). Si algo falla, error: "Velas inválidas, abiertas, repetidas o fuera del mes". Una respuesta que no es JSON, o HTTP distinto de 200, también es error ("no equivale a un mes vacío").
4. Se **compara con lo que ya hay** (`compararSeries`):
   - sin archivo: se guarda (`nuevo`),
   - mismas velas: no se hace nada (`igual`),
   - el archivo local es un prefijo de lo nuevo: se amplía (`ampliar`),
   - cualquier vela ya guardada que difiera: **error de conflicto**, no se pisa.
5. Se escribe con `publicarSerie`: a un archivo temporal con permisos restringidos y se fuerza su grabación en disco; si es archivo nuevo, se crea el definitivo de modo que falle si alguien lo creó en medio; si se amplía, se verifica por segunda vez que el destino no cambió y se renombra el temporal.
6. La bajada de un activo termina cuando llega a un mes sin velas (su primer mes) o al piso. Hay un tope de seguridad de 240 meses por activo.

**Para no repetir trabajo** (modo "pon al día", `rapido: true`). Pedir 4 meses × 520 activos cada noche sería caro y arriesgado. El motor deja tres marcas locales por activo, dentro de la carpeta del activo: `_primer-mes`, `_verificado` y `_cobertura`. Con ellas, la corrida diaria solo pide los días que faltan desde el último cubierto. Estas marcas **no se suben** al repositorio: en Actions cada corrida parte de un clon limpio, así que las rehace comprobando en disco los meses cerrados que ya tienen archivo completo (sin consultar a Binance por ellos). Si un mes sale vacío donde no debería, se apaga la confianza y se vuelve a consultar hacia abajo. Si una corrida se interrumpe, el estado de avance (`estado.json`, en una carpeta temporal) permite continuar. En Actions ese archivo es temporal de la corrida.

**El host de Actions** (`.github/datos-publicos-diaria.mjs`). Desde los servidores de GitHub, `api.binance.com` a veces responde 451 (ubicación restringida). Por eso la diaria sustituye el host en dos rutas exactas, `/api/v3/exchangeInfo` y `/api/v3/klines`, y solo con método GET, por `data-api.binance.vision` (host documentado de Binance para datos públicos). No toca ningún otro destino. La lista de productos del universo (`www.binance.com/bapi/...`) no se desvía.

**Por qué así.** Guardar la respuesta tal cual la dio Binance (no recalcular nada) permite comparar byte a byte y detectar cualquier cambio. Y "nunca pisar" convierte cualquier rareza de la fuente en un error visible en lugar de un dato cambiado.

**Cómo comprobarlo.** El archivo del mes del activo termina con la vela del último día cerrado: `jq`/Python sobre `registros/velas-24h/stock/NVDA/2611_NVDA`, la última vela tiene apertura = 00:00 UTC de ese día.

---

## 5. Pieza C: el catálogo (la lista oficial)

**El problema.** Cada cálculo y cada pantalla necesita saber "¿este activo cuenta?". Si cada uno lo decide por su cuenta (mirando carpetas, o listas propias), aparecen diferencias: un activo en el iceberg que no sale en el ranking. Hace falta **un solo punto de control**.

**Cómo funciona.**

*El archivo.* `registros/catalogo/stock` y `registros/catalogo/cripto`. Es JSON con esta forma (hecho, leído de los archivos reales):

```
{ "mercado": "cripto", "generado": "2026-11-24",
  "activos": [ { "codigo": "0G", "nombre": "0G", "cap": 90000000,
                 "meses": ["2608","2609","2610","2611"] }, ... ],
  "retirados": [ { "codigo": "...", "nombre": "...", "retirado": "AAAA-MM-DD" } ] }
```
Los activos de stock llevan además `tipo` (`empresa` o un tipo de fondo), `cap_sub`, `edgar` (enlace a la SEC), `edgar_titulo`, `web` y `ficha`. Los de nombre chino llevan `lectura` y `traduccion`. `meses` son los meses (AAMM) para los que hay archivo de velas.

*La regla de vigencia* (`app/modulos/vigencia.mjs`). El catálogo publicado **es** la lista de quién participa. Todo cálculo empieza llamando a `esVigente(dirVelas, clase)`, que lee el catálogo. Si el catálogo falta, está vacío, es de otro mercado o tiene códigos inválidos, la función **lanza un error** y el cálculo se detiene. No cae en "mirar las carpetas": eso reintroduciría en silencio activos dados de baja. Lo anterior queda como estaba y el fallo se ve en el flujo.

*Cómo se genera* (`app/modulos/catalogo.mjs`, función `actualizarCatalogos`, que corre dentro de la pasada diaria de publicación):
1. `universoLocal`: recorre `registros/velas-24h/<mercado>/<CÓDIGO>/` y toma los activos con archivos mensuales `AAMM_CÓDIGO` desde `2608` (el piso, ago-2026).
2. Quita los excluidos y los `retirados`.
3. Para cada activo arma su entrada: nombre y tipo salen de, en este orden, la tabla `activos-info.mjs` (solo acciones), la capa curada `app/modulos/activos-curados.json`, el nombre que trae el cotejo de Binance y, como último recurso, el propio código. El **tipo solo viene de lo curado**; nunca se deduce del nombre. Los campos de la capa curada (`cap`, `cap_sub`, `edgar`, `web`, `ficha`, `lectura`, `traduccion`) se copian tal cual.
4. Escribe el archivo **solo si cambió el contenido** (escribe a un temporal y renombra). La fecha `generado` marca el último cambio de contenido, no la última pasada.
5. Informa los activos nuevos sin información curada ("falta información curada de ...") para que alguien la complete.

**Por qué así y qué consecuencias tiene.**
- El catálogo se deriva de las carpetas de velas. Esas carpetas existen porque el paso del universo (sección 3) decidió qué descargar. El orden real es: universo, velas, catálogo; desde ahí todo lee el catálogo.
- **Una baja de Binance no saca sola al activo del catálogo.** El cotejo la avisa y conserva el historial, pero el catálogo seguiría listándolo porque su carpeta de velas sigue ahí. Para retirarlo hay que ponerlo a mano en la lista `retirados` del archivo del catálogo (hecho: el módulo dice que ese sector "solo se llena a mano" y que la pasada lo conserva y mantiene a esos códigos fuera de `activos`). Hoy ningún cálculo mira `retirados`: es solo referencia histórica.
- La capa curada es el único sitio donde se escribe a mano información de un activo (nombres con cuidado, tipo, capitalización, fichas, lectura de nombres chinos). Un activo nuevo aparece de todas formas, por su código y su nombre de Binance, aunque nadie lo haya curado.

**[PROPUESTA]** Alternativa no implementada: decidir el catálogo primero, con una lista explícita de altas y bajas, y hacer que el descargador de velas lea de ese catálogo. Hoy ocurre al revés. La alternativa es más fácil de razonar, pero no está probada en este repositorio.

**Cómo comprobarlo.** Abrir `registros/catalogo/cripto`: debe tener `mercado`, `generado` y `activos`. Para `币安人生` y `牛来` deben aparecer `lectura` y `traduccion`. En el flujo diario, el aviso "catálogo cripto (N activos)" indica que se escribió.

---

## 6. Los dos índices de miedo y codicia

**El problema.** Dar contexto de ánimo del mercado junto a los datos propios: dos índices de 0 a 100, uno para cripto y otro para la bolsa de EE. UU.

**Cómo funciona** (`app/modulos/indicadores.mjs`).

| Serie | Carpeta | Fuente | Qué es |
|---|---|---|---|
| `alternative-fear-greed` | `registros/alternative-fear-greed/<AAMM>` | `https://api.alternative.me/fng/?limit=N` | Crypto Fear & Greed Index de alternative.me. Valor del día a las 00:00 UTC, ya final desde que se publica. |
| `feargreedchart-bolsa` | `registros/feargreedchart-bolsa/<AAMM>` | `https://feargreedchart.com/api/?action=history` | Fear & Greed de bolsa de EE. UU. de FearGreedChart.com (VIX, momentum del S&P 500, put/call, refugio y crédito). |

- Formato de cada archivo mensual: `[[tsDía, valor], ...]` (día UTC alineado, valor entero 0 a 100, orden creciente). Se valida al leer y antes de escribir.
- **Cripto:** se guarda el valor del día UTC en curso, porque la fuente lo publica final a las 00:00.
- **Bolsa:** solo hay valores en días con sesión bursátil. Fines de semana y festivos **quedan sin dato, visibles; nunca se rellenan**. La fuente no documenta qué sesión representa cada fecha del histórico. Se observó el 19-nov-2026 que la entrada fechada con el día en curso no coincide con el valor en vivo. Por eso hay una regla de resguardo: un día solo se guarda cuando su fecha ya pasó en la zona de Nueva York. El día en curso nunca se guarda.
- La fuente de bolsa también trae una serie cripto: se **ignora**, porque se verificó (19-nov-2026) que es la misma serie de alternative.me con otro rótulo. Un índice de bolsa de CNN se descartó (su espejo difería del oficial en el día más reciente).
- Atribución: alternative.me exige mostrar la fuente junto a los datos; el visor la pone al pie del gráfico.
- Una pasada pide a la fuente solo los días posteriores al último guardado, y si no hay días nuevos no escribe nada. Si una fuente falla, la otra y las velas siguen: el error queda anotado en el informe.

**Cómo comprobarlo.** El último punto de `registros/alternative-fear-greed/<AAMM actual>` tiene el día UTC de hoy o de ayer; el de bolsa, el último día hábil ya cerrado en Nueva York. [NO VERIFICADO] El significado exacto de cada índice es el de sus fuentes; aquí solo se guardan sus valores.

---

## 7. Los cálculos

Todos leen velas filtradas por el catálogo (sección 5) y **no modifican velas**. Dos reglas comunes: el día UTC en curso nunca entra, y un día sin vela no tiene fila (no hay relleno).

### 7.1 Variación de un día
`variación = (cierre / apertura - 1) × 100`, en porcentaje, con el cierre y la apertura de **esa misma vela**. Es la base de casi todo lo siguiente. "Sube" quiere decir variación mayor que cero; "baja", menor que cero; "plana" es exactamente cero.

### 7.2 Iceberg
**El problema.** Una vista de conjunto: cuántos activos subieron y cuántos bajaron cada día, para ver el ánimo del mercado de un vistazo.

**Cómo funciona** (`pre-calculado.mjs`, `calcularIcebergVentana`). Para cada día de la ventana de 90 días y cada mercado se cuentan activos con `cierre >= apertura` (**verde**) y con `cierre < apertura` (**rojo**). Es decir, la vela plana cuenta como verde: no hay tercera categoría. Cada fila es `[día, verdes, rojos]`.
- Ventana: 90 días, `inicio = fin - 89 días` (se cuentan ambos extremos; si la ventana pasara del piso, se recorta al piso) y `fin` = último día cerrado.
- Archivo: `registros/pre-calculado/<mercado>/iceberg-90d/<AAMMDD inicio>-<AAMMDD fin>_iceberg`. Un archivo nuevo por día, sin sobrescribir el del día anterior. El nombre lleva los extremos reales del período.

**Dato que puede confundir (hecho).** Hay un módulo viejo, `app/modulos/iceberg.mjs`, y carpetas `registros/iceberg-stock` y `registros/iceberg-cripto` (series mensuales). Ese módulo **no cuenta las velas planas en ninguno de los dos lados**, y las carpetas **dejaron de actualizarse** (su último cambio en git es del 20-nov-2026). El visor lee el iceberg de `pre-calculado/.../iceberg-90d`, no de esas carpetas (hecho: `index.html` usa esa ruta). El propio `barra-movil.mjs` lo reconoce como pendiente de unificar. **[PROPUESTA]** retirar o actualizar esas carpetas y ese módulo para no dejar dos definiciones.

**Cómo comprobarlo.** Para el último día, `verdes + rojos` = número de activos del mercado que tienen vela ese día (113 en stocks al 24-nov).

### 7.3 Ranking de la jornada
**El problema.** Ver qué activos subieron y bajaron más ayer.

**Cómo funciona** (`calcularRanking`). Para cada activo con vela en el día, `[código, variación]`. Se ordena **de la mayor caída a la mayor subida** (orden creciente de variación); un empate exacto se desempata por código. Archivo: `registros/ranking-24h/<mercado>/<AAMMDD>_ranking-24h`, de un solo día.
Atención: este orden (el más negativo primero) es distinto del orden de los **puestos** de la persistencia y de la Campaña, donde el puesto 1 es la mejor variación (7.5).

### 7.4 Lectura del día
**El problema.** Para cada activo, un resumen de su comportamiento reciente: ¿lleva racha?, ¿cuánto acumula?, ¿es más lo que gana o lo que pierde?

**Cómo funciona** (`calcularLectura`, con las funciones de `visor-rachas-datos.mjs`). Sobre las velas de la ventana de 90 días de cada activo:
- **Racha** (`resumir`): partiendo de la última vela, cuántos días seguidos tuvo la misma dirección (alza o baja). Se corta con un día de dirección contraria, con un día plano o con un hueco de fechas (en ese caso `limitada` y `motivo = "hueco en el registro"`). Si la racha llega al inicio de los datos, `limitada` con motivo "faltan meses anteriores".
- **Acumulado:** variación entre la apertura del primer día de la racha y el cierre del último. `dirección` = 1, -1 o 0 (0 si la última vela es plana).
- **Variación** y **rango** de la última vela. Rango = `(máximo - mínimo) / apertura × 100`.
- **G/P** (`razonVariacion`): suma de variaciones positivas dividida por el valor absoluto de la suma de variaciones negativas, en la ventana. Sin días rojos no hay división: se guarda `null`. Sin verdes, 0. Los días planos no cuentan.
- **Cambios** (`cambiosDireccion`): cuántas veces un día verde siguió a uno rojo o al revés (los planos se saltan sin romper).
Archivo: `registros/pre-calculado/<mercado>/lectura-dia-90d/<AAMMDD>_lectura-dia`: `{corte, ventana, activos: {CÓDIGO: métricas}}`.

### 7.5 Persistencia
**El problema.** Un activo puede brillar un día y fallar el resto. Se quiere una medida de qué tan arriba termina **en promedio**.

**Cómo funciona** (`persistencia.mjs`). Cada fecha UTC con velas cerradas es una **carrera**. En cada carrera se ordenan **todos los activos con vela ese día, de los dos mercados juntos** (una competencia global, hecho: `prepararPersistenciaGlobal`), por variación de mayor a menor; un empate exacto, por código. El **puesto** es la posición en esa lista (1 = la mejor variación). La **persistencia** de un activo es el **promedio simple de sus puestos** en las carreras en que participó. Sin vela no hay participación. No hay pesos ni umbrales.
- Menor promedio = mejor.
- La ventana es de 90 días, igual que el resto.
- `app/generar-persistencia.mjs` la calcula **al publicar Pages** y escribe `persistencia-90d.json` en la raíz del sitio. Ese archivo es un derivado: **no existe en el repositorio** (se genera en cada publicación) y no es historia.

### 7.6 La Campaña
**El problema.** Combinar dos ideas: que un activo gane más de lo que pierde (potencia) y que gane más días de los que pierde (constancia), y clasificarlo en grupos fáciles de entender.

**Cómo funciona** (`campana-carrera.mjs`, `campana-serie.mjs`, `campana-orden.mjs`). Para cada día cerrado `fin` y cada ventana `N` en {90, 60, 30}:
- Ventana: de `fin - (N-1) días` a `fin` (sin bajar del piso). La **primera carrera** posible de una ventana de N días es el día `piso + (N-1) días`: para 90d es el 29-oct-2026.
- **Clasifica solo el activo con las N velas de la ventana** (`carreras == N`). Los demás quedan en `no_clasificados` con su cuenta.
- **Potencia P** = suma de variaciones diarias positivas / valor absoluto de la suma de las negativas.
- **Constancia C** = días con variación positiva / días con variación negativa. Los días con variación exactamente 0 no cuentan en ninguno.
- Si un activo con las N velas no tiene ningún día a la baja, **no hay denominador**: el programa se detiene con error ("no se inventa regla").
- **Campaña** = `raíz((P² + C²) / 2)`. Vale 1 cuando P = 1 y C = 1.
- **Grupo** (función `grupoDe`, la única fuente de esta regla): si Campaña < 1, `rezagados` (gris). Desde 1: `premium` si P ≥ 1 y C ≥ 1; `potentes` si solo P ≥ 1; `constantes` si solo C ≥ 1.
- El **puesto** de cada clasificado sale de la misma carrera de persistencia (7.5) de esa fecha y ventana.
- Un archivo por día y ventana: `registros/categorias/<AAMMDD inicio>-<AAMMDD fin>_carrera-<N>d`, con `carrera` (encabezado con reglas), `clasificados` (`puesto`, `id` = `mercado:código`, `carreras`, `sumaPuestos`, `promedio`, `potencia`, `constancia`, `grupo`) y `no_clasificados`. Un archivo existente **no se reescribe**.
- La **serie** (`serie_carrera-<N>d`) junta los últimos 90 días en un solo archivo compacto: por activo `[puesto, potencia, constancia]` por día, `null` si ese día no clasificó. El visor lee solo la serie y el último día (una lectura en vez de decenas). La serie no lleva el `grupo`: el visor lo toma del archivo del último día.

**Por qué así.** P mide cuánta ganancia hay por cada punto de pérdida, y C cuántos días buenos hay por cada día malo. Promediarlas con una media cuadrática da un número comparable y un umbral natural: 1. El grupo se guarda en cada archivo para que el visor, la leyenda y los filtros lo lean sin recalcular y nunca discrepen.

**Un borde de redondeo (hecho, ejecutado y rastreado en el historial de git).** Los archivos guardan `potencia` y `constancia` redondeadas a 4 decimales. El generador diario calcula el grupo con los valores **sin redondear** y después redondea lo que escribe. En un caso límite las dos formas dan grupos distintos: el archivo `260813-261110_carrera-90d`, activo `cripto:ARPA`, guarda potencia 1,08 y constancia 0,913; con esos valores redondeados la Campaña es 0,99999 (menor que 1, `rezagados`), y con los valores sin redondear sube de 1 (`potentes`).
Cómo se llegó a eso. Reproducible con `git show b1cb8f5:registros/categorias/260813-261110_carrera-90d` y `git show cc539d9:registros/categorias/260813-261110_carrera-90d`:
- El commit `b1cb8f5` (24-nov-2026) escribió ARPA como `potentes`, con los valores sin redondear.
- El commit `cc539d9` (25-nov-2026, 09:33, UTC-4) cambió la regla de los grupos y regrupó 171 archivos. En él ARPA pasa a `rezagados` con los mismos valores guardados. La deducción que encaja con esa evidencia: el regrupado calculó el grupo desde los valores guardados (redondeados) y no desde las velas. El script de ese regrupado no está en el repositorio, así que esa última parte no está comprobada.
- El commit `32f29c8` dejó la regla vigente (Campaña menor que 1 es `rezagados`) y dejó el archivo como estaba.
Resultado: el archivo publicado refleja la regla aplicada a valores redondeados y el generador la aplica a valores sin redondear. No se cambiaron datos ni código. **[PROPUESTA]** decidir una sola forma (con o sin redondeo) y regenerar si hace falta.

### 7.7 Inventario de días
**El problema.** Saber cuántos días válidos lleva registrados cada activo (por ejemplo, para exigir antigüedad).
**Cómo funciona** (`inventario-dias.mjs`). `registros/inventario/<mercado>`: `{mercado, desde, hasta, activos: {CÓDIGO: [acumulado al día desde+0, +1, ...]}}`. Cada columna nueva se calcula mirando si hay vela guardada ese día (acumulado previo + 1 si existe, + 0 si no), nunca sumando 1 a ciegas: repetir la pasada no cambia nada. Se reconstruye entero solo si no hay archivo o es inválido. **Es un archivo vivo**: se reescribe cuando cambia.

---

## 8. La pasada de publicación (el orden exacto)

**El problema.** Los cálculos y las velas tienen que publicarse **juntos**: si el visor leyera velas nuevas con una lectura vieja, mostraría números que no cuadran.

**Cómo funciona** (`sincronizar-registros.mjs`, función `pasada`, que la diaria llama como `correrPasada`). En orden:
1. **Indicadores** (sección 6): día nuevo si lo hay.
2. **Catálogo** (sección 5): se regenera antes de los cálculos, porque los cálculos toman de él su universo; así un activo nuevo ya cuenta en la misma pasada.
3. **Pre-cálculos** (iceberg, lectura del día, ranking): si ya están frescos no se rehacen.
4. **Inventario de días.**
5. **Comparación** entre lo local y lo que hay en GitHub, por contenido (huella sha de blob de git), nunca por nombre ni por fecha:
   - solo está local: se sube,
   - solo está remoto: se baja,
   - ambos con distinto contenido: si es una ampliación estricta (más velas al final), se acepta; si no, es un **conflicto**: se reporta y **no se toca ningún lado**.
6. **Un solo commit** con todo lo que hay que subir (`git add`, `commit`, `push` sin `--force`; si GitHub avanzó en medio, se reintenta de forma acotada). Autor y committer: la identidad de git configurada en el flujo (nombre Osmancito y el correo del dueño, que no se publica en estas páginas). La norma vigente del Núcleo (7d8d778) exige autor Osmancito y permite otro committer.
Cada paso intermedio que falla se anota y no detiene a los demás ni a las velas.

**La Campaña va aparte** (`.github/campana-diaria.mjs`), después de la pasada. Se alinea con `main`, genera los días que faltan de las ventanas 90, 60 y 30 (y las series), y los sube en un segundo commit. Si la punta de `main` se movió (la lectura horaria también sube), reintenta con rebase, máximo 3 veces. Sin días nuevos, no hace nada.

**Por qué así.** Un commit único para velas y cálculos garantiza consistencia. Comparar por contenido hace que repetir la pasada sea inofensivo (idempotente).

**Cómo comprobarlo.** En el historial de `main`, tras la corrida de las 00:05 UTC, debe haber un commit con velas y pre-cálculos del último día cerrado y otro "Campaña 90d: carrera de ...".

---

## 9. La foto horaria de los stocks

**El problema.** El iceberg y las velas son diarios. Se quiere ver también cómo se mueve el mercado de stocks **durante** el día.

**Cómo funciona** (`.github/workflows/lectura-horaria.yml`, `.github/lectura-horaria.mjs`, `app/modulos/barra-movil.mjs`, `registro-intradia.mjs`, `intradia-*.mjs`).
- Cada hora en punto UTC se toma una "barra móvil de 24 h": para cada stock, la variación entre el precio de apertura de las últimas 24 horas y el último precio. Se pide a Binance `/api/v3/ticker?windowSize=1d` (según el encabezado del módulo: máximo 100 símbolos por petición, por eso el universo se parte en dos tandas estables, 57 + 56 con 113 activos). Esa ventana móvil **no es** el día cerrado del iceberg.
- Regla de la barra: cierre >= apertura cuenta como "sube" (la misma regla verde/rojo que el iceberg).
- Se elige el host leyendo `/api/v3/time` primero en `data-api.binance.vision` y, si no responde, en `api.binance.com`.
- La lectura se toma en el minuto 00. El instante real de consulta se guarda con la foto; **nunca se fuerza ni se arrastra una hora distinta**. La corrida empieza unos minutos antes (hasta 13 minutos de espera máxima) para absorber la demora de GitHub.
- **Una hora no se duplica:** si el repositorio ya tiene lectura de esa hora, la corrida no toma otra.
- Si Binance responde 429 o 418, se guarda una **pausa** con el plazo de `Retry-After` y no se consulta hasta que pase (`intradia-fuente.mjs`). Si no hay plazo válido, se detiene hasta revisión.
- Si no se puede publicar, la foto queda en una **cola** en la caché de Actions (`.estado-intradia`) y se reintenta; la cola se recombina contra `origin/main` antes de cada intento (hasta 5).
- Formato: `registros/intradia/stock/<AAAA-MM-DD>.json` = `{version: 1, dia, lecturas: [{generada, texto}]}`. El `texto` es la foto en líneas (`generada:`, `suben:`, `bajan:`, `dia_ref:` y por activo su último precio y cierre de referencia). `indice.json` = `{version, dias, ultima}`.
- Commit: "Guardar lectura horaria de las HH:MM UTC desde Actions". Pages **no** se republica por estos commits (`paths-ignore` en `pages.yml`).

**Por qué así.** Guardar el instante real y rechazar duplicados evita series inventadas. La cola evita perder una foto si GitHub falla justo al publicar.

**Hecho: comentarios heredados.** Esta pieza conserva texto de cuando una máquina propia (la "Debian") también tomaba fotos ("la Debian manda cuando está viva"). La máquina sigue existiendo, pero su servicio de fotos se detuvo, se deshabilitó y se borró su unidad (mensajes de Slack del dueño 1795613907.404739 y 1795614085.044529). El código sigue siendo correcto sin ella; los comentarios están desfasados.

**Cómo comprobarlo.** El archivo del día actual en `registros/intradia/stock/` tiene una lectura por hora en punto; `indice.json` tiene `ultima` reciente.

---

## 10. Publicar y ver: Pages y el visor

**Pages** (`pages.yml`). En cada `push` a `main` (salvo cuando solo cambian las fotos intradiarias) corre en GitHub, en este orden:
`node cuenta/generar.mjs`, `node app/generar-persistencia.mjs`, `node app/generar-colores-iceberg.mjs`, `node app/generar-pagina-superficie.mjs`, y empaqueta **toda la raíz del repositorio** y la publica. Si la publicación falla, espera 20 segundos y reintenta una vez. Los tres generadores escriben derivados que no son historia: `persistencia-90d.json`, `iceberg-colores.json` y `superficie.html` (con su vista previa propia). Ninguno existe en el repositorio.
Después de la diaria, `.github/publicar-visor.mjs` pide explícitamente una corrida de Pages y espera su resultado (hasta 22 minutos). Si falla, pide **una** nueva; si falla otra vez, termina con error visible.

**El visor.** `index.html` (HTML, estilos y el script principal) y los módulos `visor-rachas.mjs`, `visor-persistencia.mjs` y `visor-superficie.mjs`. Importa módulos de `app/modulos/` con `?v=N` en la URL: al cambiar un módulo hay que subir ese número, o los navegadores siguen usando el viejo. Dibuja listas por mercado, la ficha de cada activo, los indicadores, la superficie 3D, la persistencia y la Campaña con su campo de béisbol. Detalles de pantallas y de la regla visual: [visor.md](visor.md). Reglas de nombre: el título visible es "Observatorio Bursátil"; "hugo" solo queda en la URL y el nombre del repositorio. Los nombres en caracteres chinos se muestran con su lectura y traducción entre paréntesis, con una sola función (`app/modulos/lectura-latina.mjs`).

**Aparte del Observatorio.** El repositorio también contiene `cuenta/` ("Proyecto Cimiento"): un registro de operaciones propias con su página. Comparte el repositorio y su publicación, pero no forma parte de los datos ni de los cálculos del Observatorio.

---

## 11. El reloj: quién lanza todo

Hecho: los flujos diario y horario **no** tienen `schedule` (horario propio), solo `workflow_dispatch`. Un lanzamiento es una llamada a GitHub: a mano desde la pestaña Actions, o por programa con `POST /repos/osmancitov/hugo/actions/workflows/<archivo>/dispatches` y el cuerpo `{"ref":"main"}`. Que no haya `schedule` no prueba que falte automatización: un programa externo puede hacer esas llamadas, y no está comprobado.
- Diaria: `.github/workflows/actualizacion-diaria.yml`. Sus comentarios la planean entre las 00:05 y las 00:14 UTC (después del cierre y su margen de 5 minutos).
- Horaria: `.github/workflows/lectura-horaria.yml`. Hacia cada hora en punto.
**[NO VERIFICADO]** Qué sistema externo hace hoy esas llamadas, a qué horas y con qué permisos: el repositorio dice que es un script externo de Google (Apps Script), pero ese script no está aquí y no lo comprobé. Su verificación está pendiente. Mientras no esté confirmada, no se debe asumir que corre.
**[PROPUESTA]** Poner `schedule` (cron) dentro de los flujos para no depender de un script externo. El costo conocido: los cron de GitHub pueden retrasarse varios minutos, y la foto horaria quiere el minuto 00.

---

## 12. Cómo saber que todo vive y qué se comprobó

**Comprobación rápida, de más barata a más completa:**
1. Hay un commit horario "Guardar lectura horaria de las HH:MM UTC desde Actions" de la última hora.
2. Hay un commit con las velas del último día cerrado y el de "Campaña 90d: ..." tras las 00:05 UTC.
3. La última corrida de `pages.yml` está en `success`.
4. Abrir el sitio con `?v=<sha de 7 cifras del último commit>` y mirar el último día cerrado.
5. `node --test pruebas/*.mjs` desde la raíz (sin red; unos 65 a 75 segundos). Hoy fallan dos pruebas, conocidas desde antes de este documento: "superficie tiene entrada estática con metadatos propios antes de ejecutar JS" y "los rótulos visibles de los icebergs viven en la fuente única de rótulos". Al 25-nov-2026: 378 pasan y esas dos fallan. No se investigó su causa, así que no se conoce su efecto. Cualquier otra prueba roja es nueva.

**Recorrido de reconstrucción ejecutado el 25-nov-2026, sin tocar producción y sin llamar a Binance.** Se trabajó en una copia en `/tmp` de los datos publicados (velas, catálogo) y se regeneró con el código del repositorio:
- **Pre-cálculos:** con las velas y el catálogo publicados y la fecha de corte del 25-nov a las 00:10 UTC, `actualizarPreCalculos` produjo la lectura del día, el iceberg de 90 días y el ranking de los dos mercados. Los seis archivos resultaron **idénticos byte a byte** a los publicados.
- **Campaña 90d:** `generarCarreras` regeneró los 27 días (copia en `/tmp`). En 26 archivos los valores por activo (puesto, potencia, constancia, grupo, no clasificados) coinciden con los publicados; el archivo 27 es el borde de redondeo descrito en 7.6. Solo 5 de los 27 son idénticos byte a byte: en los otros 22 cambia el orden de algunas filas entre activos con el mismo promedio. Causa: el generador ordena por grupo y por promedio, y deja los empates en el orden de la persistencia (puesto menor primero). En tres archivos inspeccionados, dos activos empatados aparecen intercambiados: en `260802-261030_carrera-90d`, BABA (puesto 357) y GOOGL (puesto 358) con promedio 245,2; el publicado pone GOOGL primero y el regenerado BABA primero. Antes del regrupado de `cc539d9`, esos dos estaban en grupos distintos; la deducción es que el regrupado los reordenó sin aplicar el desempate por puesto. Esa deducción no está comprobada, porque el script del regrupado no está en el repositorio. Los valores no cambian; solo el orden de dos filas con igual promedio.
- **Persistencia:** `generarPersistencia` sobre la copia produjo la lista de 516 activos con corte 24-nov.
Lo que **no** se reconstruyó: la descarga real de velas y del universo desde Binance, las dos fuentes de miedo y codicia, la foto horaria, la publicación de Pages en un entorno nuevo, y los flujos de Actions fuera de este repositorio. Esas piezas dependen de la red o de GitHub y se describen aquí a partir de su código. Para esos pasos la prueba real es mirar una corrida en producción (la lista de comprobación rápida de arriba), no repetirla.

---

## 13. Qué carga historia y qué haríamos distinto

**Hechos (verificados en el código):**
- Muchos módulos nacieron como órdenes de un bot de Slack, ya retirado. Conservan su forma: los flujos arman un `ctx` mínimo y llaman a `registrar(ctx)`. Funciona, pero los comentarios que hablan de "@hugo", de la Debian o de un cron de respaldo están desfasados.
- El encabezado de `actualizacion-diaria.yml` y de `actualizacion-diaria.mjs` dice que hay un cron de respaldo hacia la 01:00 UTC. **No existe:** el flujo solo tiene `workflow_dispatch`.
- `reporte.mjs` y `fechas-aviso.mjs` son restos del bot que se mantienen porque `pruebas/caja.mjs` los importa.
- El encabezado de `serie_carrera-<N>d` dice "sin las 90 velas ese día" incluso para las ventanas de 60 y 30. Es texto heredado; el dato es correcto por ventana. Del mismo modo, el comentario de `.github/campana-diaria.mjs` dice "90d" pero genera 90, 60 y 30.
- `registros/iceberg-stock` y `registros/iceberg-cripto` están congelados (7.2).
- El visor lee datos desde `raw.githubusercontent.com` y no desde Pages (sección 2).

**[PROPUESTA] (no probadas):**
- Alternativa a lo que hace el código hoy: catálogo explícito primero, y que el descargador de velas lea de él.
- Sustituir la forma "orden de bot" (`ctx` y `registrar`) por funciones simples que reciban datos y devuelvan resultados.
- Poner el reloj dentro del repositorio (apartado «El reloj»).
- Limpiar los comentarios heredados y retirar el iceberg viejo.
- Decidir una sola forma de redondeo para el grupo de la Campaña (7.6).
