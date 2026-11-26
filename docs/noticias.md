# Noticias archivadas de un activo

Página `noticias/<CODIGO>.html` (hoy GME, LLY y WDC), enlazada como «Noticias ↗» en la ficha del activo (`CON_NOTICIAS` en `index.html`).

El retorno «← Mercado · COD» abre la vista integrada `#/unificada/30d/<mercado>/<COD>` y baja al título de la ficha del activo. La ficha sale del catálogo, no de la lista VIP: el enlace sigue funcionando cuando el activo sale de los VIP (26-nov-2026, pedido del dueño). La ruta antigua `#/a/<mercado>/<COD>` abre esa misma vista integrada, para los enlaces ya publicados (p. ej. `cuenta/estado-de-cuenta.md`).

## Qué se muestra: campaña de 30 días

El dueño pidió (26-nov-2026, hilo 1795722192.426879 del canal del Observatorio) «los últimos 30 días, igual que con todo: campaña de 30 días», y luego concretó: hoy se recogen las de los últimos 30 días y las nuevas que aparezcan hoy.

La página muestra solo las noticias desde las 00:00 UTC-4 de (hoy − 30 días): ventana móvil que se recalcula en cada generación (`inicioVentana` en `app/generar-noticias.mjs`). El archivo JSON guarda también las anteriores; no se borran, solo no se muestran.

Diferencia con la Campaña del visor: allá la ventana de N días es `[fin−(N−1), fin]` (30 fechas contando el día de cierre); aquí se usa (hoy − 30 días), que da 31 fechas inclusivas. Para la carga del 26-nov-2026 el inicio confirmado con el dueño fue el 27-oct-2026 y eso es lo que produce la regla ese día.

## De dónde salen

- Los titulares que Inter publicó en el hilo GME de Slack (canal del dueño, hilo 1795668606.797819), recuperados el 26-nov-2026: 83 titulares válidos. Sus enlaces pasan por Google News (no son la URL final del medio).
- Los enlaces de la página pública de GuruFocus para GME (`https://www.gurufocus.com/stock/GME/article`), recogidos el 26-nov-2026 sin sesión ni API: 5 noticias nuevas y 1 enlace directo sumado a una noticia que ya estaba (`enlaces_extra`). Ver la sección GuruFocus abajo.
- LLY y WDC: índice de vínculos (titular, fecha y enlace; sin cuerpos) recuperado del archivo de la respuesta del Data API de GuruFocus del 26-nov-2026 ~00:38 UTC-4 (página 1 de 192 declaradas para LLY, de 73 para WDC). Del archivo sobrevivieron 4 enlaces completos por símbolo en el registro de la conversación; el resto del lote quedó sin enlace recuperable y no se carga (no se reconstruyen slugs). Decisión expresa del dueño (26-nov-2026, hilo «Candidatos» 1795665962.658339, mensaje 1795726350.699059): hacer las páginas solo con ese material, como índice de vínculos. Sin nuevas consultas a GuruFocus. Cada fila guarda en `origen` y `fecha_fuente_original` la procedencia exacta, y el año va `verificado` contra el `publish_time` declarado por la propia fuente en esa respuesta.

## Qué guarda cada noticia (`registros/noticias/GME.json`)

- `fecha_texto`: la fecha tal como la mostró la fuente (`25 nov · 18:35`, hora UTC-4, sin año; las de GuruFocus van sin hora, ver abajo). Es la procedencia; no se reescribe.
- `orden`: fecha ISO usada solo para ordenar. Si el año está verificado, usa la fecha real; si no, la inferencia de abajo. Las filas con solo día ordenan a mediodía UTC-4.
- `anio`, `anio_estado`, `anio_fuente`: `verificado` (contra la fuente original, URL en `anio_fuente`), `inferido` (la fuente no da año; se supone el más reciente que no dé fecha futura) o `sin_fecha` (páginas de cotización evergreen, sin fecha de publicación propia; no se inventa una).
- `nota_fecha`: aclaración visible cuando la fecha mostrada no es la de publicación (p. ej. Google mostró una fecha de actualización).
- `enlaces_extra`: enlaces directos adicionales al mismo artículo (hoy: el enlace de GuruFocus para el titular que ya llegó por Inter vía Google News).
- `fecha_fuente_original`, `origen`: procedencia cruda cuando aplica (las filas de GuruFocus guardan lo que mostraba su página, con su rótulo ET sin verificar por artículo).
- `medio`, `titular`, `enlace`, `lote` (id del mensaje de Slack, si vino de Inter).

La página muestra el año solo cuando está verificado. Las horas son UTC-4; las filas sin hora solo tienen el día comprobado.

## Años verificados (26-nov-2026)

Verificación contra la fuente original, una por una. La consulta de Inter fue en 2026, pero el feed de Google News resurgió artículos viejos: el año de la consulta NO es el año de publicación.

Con año distinto al que suponía la inferencia (8):
- AAMC «Congress Passes Historic GME Expansion» (23 dic): 2020-12-23 — https://www.aamc.org/advocacy-policy/washington-highlights/congress-passes-historic-gme-expansion
- BBC «GameStop: What is it and why is it trending?» (28 ene): 2021-01-28 — https://www.bbc.com/news/newsbeat-55841719
- WSJ «The GameStop Short Squeeze Shows an Ugly Side…» (27 ene): 2021-01-27 — https://www.wsj.com/articles/gamestop-stock-short-squeeze-ugly-side-11611750250
- CNN «Everything you need to know…» (27 ene): 2021-01-27 — https://amp.cnn.com/cnn/2021/01/27/investing/gamestop-reddit-stock/index.html
- Time «So, Uh, What's Up With GameStop's Stock?» (25 ene): 2021-01-25 — https://time.com/5933242/gamestop-stock-gme/
- International Banker «GameStop: What Happened, and What It Means» (29 mar): 2021-03-29 — https://internationalbanker.com/brokerage/gamestop-what-happened-and-what-it-means/
- Nature (npj Complexity) «The dynamics of the Reddit collective action…» (3 feb): 2025-02-03 — https://www.nature.com/articles/s44260-025-00029-z
- SmartAsset «GameStop Stock Price Spike…» (22 ago): publicada 2021-02-01 — https://smartasset.com/financial-advisor/gamestop-stock-price-wallstreetbets-reddit. Google mostró «22 ago» (fecha de actualización, no la original); se ordena por la de publicación y la página lo aclara.

Confirmadas en 2026 (14): Reuters «Cohen buys shares worth nearly $23 million» (13 oct), Bloomberg Law «GameStop Sued for Alleged Anti-Gay Harassment…» (13 oct), AMA «GME interviews…» (14 oct), ECU Health «Celebrating 50 Years of GME» (21 sep), Reuters «GameStop owns nearly 10% of eBay…» (17 jul), AMA «Promotion in Place…» (23 jun), Niskanen «More doctors where they're needed…» (17 jun), Reuters «14% rise in quarterly revenue…» (2 jun), Vanderbilt «Megan Whitey receives…» (11 nov), Bloomberg «GameStop CEO Criticizes Digital Game Releases…» (18 nov), Motley Fool «Five Below vs. GameStop…» (11 nov), Motley Fool «Coupang vs. GameStop…» (7 nov), Digital Commerce 360 «GME acquires regional rival Commercial Supply Co.» (6 nov), AMA «Low on GME interviews?…» (4 nov). URLs de cada una en `anio_fuente` del JSON.

Las 6 de GuruFocus llevan año en su propia página (2026). El resto sigue `inferido`: la fuente no da año y no se encontró verificación; la página lo explica y no muestra año en esas filas.

## Sumar noticias

1. Reunir las nuevas en un archivo JSON con la misma forma que usa la recuperación: lista de `{medio, "fecha_local_utc-4", titular, url, mensaje_ts?}`.
2. `node app/generar-noticias.mjs GME --agregar nuevas.json`
3. Se descartan las filas sin titular, fecha válida o enlace, y las repetidas (mismo enlace o mismo titular). Se conserva lo anterior, se reordena y se regenera la página.
4. Subir `registros/noticias/GME.json` y `noticias/GME.html`.

Las filas nuevas entran con `anio_estado: inferido`; si se verifica el año contra la fuente, se anota `anio` y `anio_fuente`.

No hay automatismo ni lectura de red: la página solo cambia cuando se ejecuta esto. `node app/generar-noticias.mjs GME` sola regenera la página desde el archivo.

## GuruFocus

Dos orígenes distintos, tratados distinto:

- **Enlaces de su página pública** (`/stock/GME/article`): el dueño pidió sumarlos como vínculos normales (26-nov-2026). Se incorporaron 6 ese día (5 altas + 1 enlace directo en una ya existente), recogidos sin sesión y sin tocar la API. Sus horas se omiten: la página las muestra con rótulo ET, pero la zona no está verificada por artículo; se guarda el texto original en `fecha_fuente_original`. Para futuras altas por esta vía, `--agregar` las retiene por defecto y se suman con `--permitir-gurufocus`, decisión ya tomada por el dueño para estos enlaces.
- **Salida de su Data API**: su acuerdo (cuadro «I agree to the Data API Agreement» en https://www.gurufocus.com/data-api/pricing, leído el 26-nov-2026) licencia uso «internal» y restringe publicar la salida bruta; este repositorio es público. No se publican cuerpos ni datos de la API. Excepción anotada: los índices de vínculos de LLY y WDC (26-nov-2026, arriba), titulares+fecha+enlace sin cuerpos, por decisión expresa del dueño sobre el material ya obtenido.

Regla expresa del dueño (26-nov-2026, hilo 1795722192.426879): **no volver a consultar GuruFocus; las consultas se usan solo al elegir un nuevo candidato.** Para GME se usa solo lo ya recogido; no hay sondeos ni seguimiento de su página.

Esto registra las decisiones del dueño para estos enlaces concretos; no es una conclusión legal general sobre redistribuir titulares.
