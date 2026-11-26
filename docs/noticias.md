# Noticias archivadas de un activo

Página `noticias/<CODIGO>.html` (hoy solo GME), enlazada como «Noticias ↗» en la ficha del activo (`CON_NOTICIAS` en `index.html`).

## De dónde salen
Los titulares son los que Inter publicó en el hilo GME de Slack (canal del dueño, hilo 1795668606.797819), recuperados el 26-nov-2026 leyendo el hilo en el navegador: 10 lotes, 83 titulares válidos (una fila sin titular se descartó). No son un archivo de Inter ni la URL final del medio: los enlaces pasan por Google News.

## Qué guarda cada noticia (`registros/noticias/GME.json`)
`fecha_texto` tal como la mostró Inter (`25 nov · 18:35`, hora UTC-4, sin año), `orden` (fecha ISO usada solo para ordenar), `medio`, `titular`, `enlace`, `lote` (id del mensaje de Slack).
La fuente no da el año. Verificación parcial (26-nov-2026): 27 de las 83 coinciden en día y año 2026 con la fecha de publicación del feed de Google News para GME; las otras 56 no se pudieron comprobar (no aparecen en ese feed, que cubre ~30 días). Para ordenar se toma la fecha más reciente que no sea futura (un «23 dic» queda en 2025). La página no muestra año.

## Sumar noticias
1. Reunir las nuevas en un archivo JSON con la misma forma que usa la recuperación: lista de `{medio, "fecha_local_utc-4", titular, url, mensaje_ts}`.
2. `node app/generar-noticias.mjs GME --agregar nuevas.json`
3. Se descartan las filas sin titular, fecha válida o enlace, y las repetidas (mismo enlace o mismo titular). Se conserva lo anterior, se reordena de reciente a antigua y se regenera la página.
4. Subir `registros/noticias/GME.json` y `noticias/GME.html`.

No hay automatismo ni lectura de red: la página solo cambia cuando se ejecuta esto. `node app/generar-noticias.mjs GME` sola regenera la página desde el archivo.

## GuruFocus (pendiente de decisión)
El dueño quiere poder sumar también las noticias de GuruFocus al mismo archivo. Falta decidir qué se puede publicar: el acuerdo de su API prohíbe redistribuir la salida bruta (según la lectura que hizo el encargado de Inter; no la pude volver a comprobar, la página de precios no devuelve texto) y este repositorio es público. Hasta decidir (página privada, solo enlaces o consultar al proveedor), `--agregar` retiene las filas de GuruFocus: las que traen `"fuente": "gurufocus"` o un enlace en gurufocus.com. Con `--permitir-gurufocus` se suman, y eso solo debe usarse con decisión expresa del dueño. Quedan además por verificar la cuota (4 de 100 consultas usadas hoy, no repetir consultas) y la renovación del plan gratuito. Esta herramienta no consulta GuruFocus ni gasta cuota.
