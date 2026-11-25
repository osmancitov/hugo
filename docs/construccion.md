# Cómo se construye el Observatorio Bursátil, desde cero

Esta es la explicación principal. Se lee como una exposición: para qué sirve el Observatorio, qué piezas necesita, por qué existe cada una y cómo encajan, en el orden en que conviene construirlas hoy. Sirve igual para una persona que no conoce nada y para una IA que tenga que reconstruirlo. No es la historia de cómo llegamos aquí (esa fue parche por parche); es el sistema contado ya ordenado.

Cómo leerla: cada sección dice **qué es**, **por qué existe**, **qué archivos la forman** y **cómo comprobar que funciona**. Los detalles de formato están en la referencia: [datos.md](datos.md) (carpetas y archivos), [flujos-github.md](flujos-github.md) (automatización), [visor.md](visor.md) (pantallas y Campaña), [arquitectura.md](arquitectura.md) (mapa de módulos), [reconstruir.md](reconstruir.md) (lista de pasos) y [decisiones.md](decisiones.md) (reglas del dueño). Todo lo de aquí está leído del código del repositorio; lo que no, se marca como «no verificado aquí» o como «propuesta».

## 1. Para qué sirve
El Observatorio responde, cada día, una pregunta simple sobre un mercado: **¿qué activos vienen rindiendo mejor y con qué consistencia?**

Mira dos mercados que Binance ofrece contra USDT: las acciones tokenizadas (que en el código se llaman `stock`, con par `CÓDIGO+B+USDT`, etiquetadas «bStocks» por Binance) y las criptomonedas (`cripto`). Guarda las velas diarias de cada activo y, a partir de ellas, calcula indicadores (cuántos suben y bajan cada día, el ranking de la jornada, la persistencia de cada activo, la Campaña). Todo se publica como una página estática en https://osmancitov.github.io/hugo/ y los datos quedan abiertos en el repositorio.

Principios que sostienen el diseño:
- **Sin servidor.** Todo corre en GitHub Actions y se guarda como archivos en el repositorio. Pages sirve el sitio.
- **El historial no se reescribe.** Cada día cerrado se guarda una vez; lo que se calcula sale de eso.
- **Una sola fuente por regla.** Cada regla (qué activos cuentan, qué grupo es cada uno, cómo se escribe un nombre) vive en un lugar y todo lo demás la lee.
- **Si algo no cuadra, no se publica.** Los cálculos se detienen con un error claro en lugar de adivinar.

## 2. El plano en una página
```
Binance (API pública)
   │  universo: qué activos existen y cotizan
   ▼
CATÁLOGO ──────────────► quién participa (vistas y cálculos)
   │
   ▼
VELAS DIARIAS (una por activo y día UTC cerrado)
   │
   ├─► iceberg · ranking de 24 h · lectura del día  (pre-cálculos)
   ├─► persistencia (promedio de puestos)
   └─► Campaña (potencia, constancia, grupo) en ventanas de 90, 60 y 30 días
   │
Lectura horaria (foto intradiaria de los stocks) ──┐
   ▼                                              │
registros/ (archivos JSON en el repositorio) ◄────┘
   ▼
Pages ─► visor (index.html) ─► la gente
```
Dos relojes empujan el sistema: una lectura cada hora y una puesta al día diaria justo después del cierre UTC. Los dispara un reloj externo.

## 3. Primera pieza: el catálogo
**Qué es.** La lista oficial de los activos que participan: por mercado, un archivo (`registros/catalogo/stock` y `registros/catalogo/cripto`) con código, nombre, tipo, capitalización, fichas y, si hace falta, lectura latina del nombre.

**Por qué es el centro.** Todo lo demás pregunta primero al catálogo «¿este activo cuenta?». El módulo `app/modulos/vigencia.mjs` lo dice sin rodeos: el catálogo publicado es la lista de quién participa en vistas y cálculos; las carpetas de velas conservan la historia y nunca se tocan. Si un activo sale del catálogo deja de contar, pero sus registros siguen ahí. Y si el catálogo falta o no sirve, **los cálculos se detienen** (lanzan error): no se calcula con las carpetas como sustituto, porque eso reintroduciría en silencio activos dados de baja. Así hay un solo punto de control sobre qué activos entran y salen.

**De dónde sale.** Hay dos capas:
1. **El universo, de Binance.** `universo-binance.mjs` pide `exchangeInfo` (pares en estado `TRADING` contra USDT) y la lista pública de productos de Binance, y clasifica cada activo en `stock` o `cripto`. Es estricto a propósito: si la respuesta es incompleta o incoherente, se detiene y «no interpreta bajas». Las reglas de clasificación están en `activos.mjs`.
2. **La capa curada, a mano.** `app/modulos/activos-curados.json` guarda lo que Binance no da: nombre cuidado, tipo, capitalización, ficha, y para nombres en caracteres chinos la lectura latina y el significado breve. `activos-info.mjs` trae nombre y tipo de las acciones.

`catalogo.mjs` junta ambas capas y escribe el catálogo en cada pasada diaria. Hoy, para decidir qué activos tienen datos, parte de las carpetas de velas del registro local (`universoLocal`) y las cruza con esas capas.

**Exclusiones.** `exclusiones.mjs` deja fuera el euro y las stablecoins en dólares (USDC, FDUSD, TUSD, USD1, RLUSD, XUSD, U, USDE, USDS y el propio USDT como activo), por identidad verificada y no por el precio. USDT sigue permitido como moneda de cotización. Hay casos revisados que no son stablecoins USD (FRAX, BFUSD, RWUSD, EURI, KGST, USTC).

**Cómo comprobar.** Abrir `registros/catalogo/cripto`: es un JSON con `mercado`, `generado` y `activos`. Para un nombre chino, deben aparecer `lectura` y `traduccion`.

## 4. Segunda pieza: las velas diarias
**Qué es.** Para cada activo del catálogo, una vela por día UTC cerrado, guardada por mes: `registros/velas-24h/<mercado>/<CÓDIGO>/<AAMM>_<CÓDIGO>`. Cada vela es el arreglo estándar de Binance (apertura en milisegundos, abrir, máximo, mínimo, cerrar, volumen, etc.).

**Por qué así.** Un archivo por activo y mes mantiene los commits pequeños y permite validar una vela sin leer todo. El piso fijo es el **1-ago-2026**: nada se guarda antes.

**Cómo se obtiene.** `registro-motor.mjs` recorre los meses hacia atrás hasta el piso y solo pide a Binance lo que falta. En Actions, `datos-publicos-diaria.mjs` envía las peticiones de `exchangeInfo` y de velas al host público de datos de mercado de Binance (`data-api.binance.vision`); no toca ningún otro destino. `registro-serie.mjs` no cambia los días ya registrados.

**Cuándo.** `ciclo-diario.mjs` define el último día cerrado: resta un margen tras la medianoche UTC y retrocede un día. Si la ingesta llega solo hasta un día anterior al objetivo, la diaria sale con error y no publica; la siguiente corrida retoma.

**Cómo comprobar.** El archivo del mes del activo termina con la vela del último día cerrado.

## 5. Tercera pieza: los cálculos
Todos leen las velas filtradas por el catálogo y escriben archivos nuevos; ninguno modifica velas.

**Iceberg** (`iceberg.mjs`): cada día cuenta cuántos activos cerraron en alza y cuántos a la baja. Una barra por día: trozo verde y trozo rojo. Series por mercado en `registros/iceberg-<mercado>/<AAMM>`; la ventana de 90 días se pre-calcula en `registros/pre-calculado/<mercado>/iceberg-90d/`.

**Ranking de 24 h y lectura del día** (`pre-calculado.mjs`): se dejan listos antes de publicar para que el visor no recorra todas las velas en cada visita. Ranking: variación porcentual de la jornada por activo. Lectura del día: por activo, dirección, acumulado, razón G/P y límites, sobre la ventana de 90 días.

**Persistencia** (`persistencia.mjs`): cada día es una «carrera» en la que los activos se ordenan por su variación del día (de mayor a menor, empate exacto por código). La persistencia de un activo es el promedio simple de sus puestos en las carreras en las que participó (sin vela no hay participación).

**Campaña** (`campana-carrera.mjs`, `campana-serie.mjs`, `campana-orden.mjs`): para cada día cerrado y cada ventana (90, 60 y 30 días), solo los activos con **todas** las velas de la ventana se clasifican. Potencia P = suma de las variaciones positivas / valor absoluto de la suma de las negativas. Constancia C = número de días al alza / número de días a la baja. Campaña = raíz((P² + C²) / 2). La función `grupoDe` pone el grupo: gris (Rezagados) si Campaña < 1; desde 1, Premium si P ≥ 1 y C ≥ 1, Potentes si solo P ≥ 1, Constantes si solo C ≥ 1. Es la única fuente de esa regla; los archivos diarios (`registros/categorias/<inicio>-<fin>_carrera-<N>d`) guardan el grupo y el visor solo lo lee. Las series (`serie_carrera-<N>d`) juntan los días en un archivo compacto.

**Inventario** (`inventario-dias.mjs`): cuántos días válidos lleva cada activo desde el piso, para decidir admisiones por antigüedad.

**Miedo y codicia** (`indicadores.mjs`): series de cripto y de bolsa, un valor por día, guardadas como las velas.

**Cómo comprobar.** Cada cálculo tiene su archivo del último día cerrado; la Campaña del último día debe tener sus tres ventanas y `grupo` según la regla.

## 6. Cuarta pieza: la foto horaria
`lectura-horaria.yml` toma cada hora en punto UTC la «barra móvil» de 24 h de los stocks (la ventana móvil de Binance, distinta del día cerrado del iceberg) y la guarda en `registros/intradia/stock/<fecha>.json`, con el instante real de la consulta. Si el repositorio ya tiene la lectura de esa hora, no toma otra. Si no puede publicar, deja una cola en la caché de Actions y la reintenta. Pausas por límite de la fuente se respetan.

## 7. Quinta pieza: publicar
`pages.yml` empaqueta la raíz del repositorio (`index.html` y los archivos de `registros/`) y la publica con GitHub Pages en cada push a `main`, salvo cuando solo cambian las fotos intradiarias. Antes genera tres archivos derivados que no son historia (`persistencia-90d.json`, `iceberg-colores.json`, `superficie.html`) y la página de Cimiento. Tras la diaria, `publicar-visor.mjs` pide la publicación y comprueba el resultado.

## 8. Sexta pieza: el visor
`index.html` (y `visor-rachas.mjs`, `visor-persistencia.mjs`, `visor-superficie.mjs`) lee el catálogo y los registros directamente y dibuja las pantallas: listas por mercado, ficha de cada activo, indicadores del iceberg, superficie 3D, persistencia y la Campaña con su campo de béisbol. El nombre visible es «Observatorio Bursátil». Los nombres en caracteres chinos se muestran con su lectura y significado breve entre paréntesis, con una sola función (`lectura-latina.mjs`). Detalle de pantallas y de la regla visual en [visor.md](visor.md).

## 9. Séptima pieza: el reloj
Los tres flujos solo se lanzan a mano o con `workflow_dispatch`: no tienen `cron`. Quien los lanza hoy es un Google Apps Script que no está en el repositorio (no verificado aquí: horas y token). La diaria está pensada para las 00:05 a 00:14 UTC; la horaria, cada hora en punto. Los flujos son idempotentes: repetirlos no duplica lo ya publicado.

## 10. Cómo comprobar que todo vive
Lista corta, de más barata a más completa: (1) el commit horario «Guardar lectura horaria de las HH:MM UTC desde Actions»; (2) el commit diario con velas y cálculos y el commit de Campaña; (3) `pages.yml` en `success`; (4) abrir el sitio con `?v=<sha7>` y mirar el último día cerrado; (5) `node --test pruebas/*.mjs` (unos 75 s, sin red), donde solo pueden quedar rojas las dos pruebas conocidas.

## 11. Qué carga historia y qué haríamos distinto hoy
Esto separa hechos de propuestas.

**Hechos (verificados en el código):**
- Muchos módulos nacieron como órdenes de un bot de Slack, ya retirado. Conservan su forma: los flujos arman un `ctx` mínimo y llaman a `registrar(ctx)`. Funciona; los comentarios de contexto antiguo («@hugo…», la Debian) ya no describen la operación.
- Hay comentarios desactualizados en los flujos (por ejemplo, el encabezado de `actualizacion-diaria.yml` habla de una diaria en la Debian y de un cron de respaldo que no existe).
- `reporte.mjs` y `fechas-aviso.mjs` son restos del bot que se mantienen solo porque `pruebas/caja.mjs` los importa.
- La lista de productos de Binance que usa la clasificación bStocks es la API interna de su web, no una API documentada ni estable; si dejara de servirla, el universo se detiene con aviso claro (lo dice el propio `activos.mjs`).

**Propuestas (no probadas, para quien reconstruya):**
- Empezar por el catálogo y el universo, como en esta explicación, y hacer que todo lo demás consulte `vigencia` desde el primer día. Hoy el catálogo se deriva de las carpetas de velas; partir del catálogo como pieza central sería el orden natural si se construye de nuevo.
- Sustituir la forma «orden de bot» (`ctx` y `registrar`) por funciones simples que reciban datos y devuelvan resultados.
- Poner el reloj dentro del repositorio (`schedule` en los flujos) en vez de depender de un script externo, si se acepta la imprecisión de los cron de GitHub.
- Limpiar los comentarios heredados.
