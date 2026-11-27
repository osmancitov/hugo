# Arquitectura del Observatorio Bursátil

Referencia técnica de consulta. El porqué de cada pieza está en [construccion.md](construccion.md).

## Términos de este documento
- **UTC**: hora universal, sin cambio de horario; cada día de velas va de las 00:00 a las 23:59 UTC.
- **Vela diaria**: los precios de apertura, máximo, mínimo y cierre de un activo en un día, más su volumen.
- **Binance**: plataforma que lista activos y publica sus precios.
- **API**: dirección web que responde con datos cuando se la consulta.
- **Commit**: un cambio guardado en el historial de un repositorio, con autor, fecha y mensaje.
- **GitHub Actions**: servicio de GitHub que ejecuta programas en sus servidores; un workflow (flujo) es el archivo que dice qué ejecutar y cuándo.
- **GitHub Pages**: servicio de GitHub que publica los archivos de un repositorio como página web.
- **Repositorio**: carpeta de archivos con su historial de cambios, alojada en GitHub.
- **`workflow_dispatch`**: modo de lanzar un workflow mediante una llamada a GitHub, a mano o por programa.
- **`push`, `fetch`, `reset --hard`, `rebase`**: órdenes de git: subir cambios; bajar cambios sin aplicarlos; dejar la copia local igual a una versión; poner los cambios propios encima de la última versión.
- **Caché de Actions**: almacén de GitHub donde un workflow guarda archivos para su próxima ejecución.
- **Piso**: fecha más antigua que se guarda y se calcula: 1 de agosto de 2026.
- **Carrera y puesto**: una carrera es un día de comparación; ese día se ordenan todos los activos por variación y el puesto es la posición (1 es la mejor variación).
- **Campaña, P y C**: P es la potencia (suma de variaciones positivas entre el valor absoluto de la suma de las negativas) y C la constancia (días al alza entre días a la baja); Campaña = raíz((P² + C²) / 2).
- **Iceberg**: para cada día, cuántos activos subieron (cierre igual o mayor que apertura) y cuántos bajaron.
- **Persistencia**: promedio simple de los puestos de un activo en las carreras donde participó.
- **Ranking**: lista de activos con su variación porcentual de un día.
- **Pre-calculado**: resultado calculado de antemano y guardado como archivo para que el visor lo lea sin calcular.
- **Mercado**: `stock` (acciones y fondos tokenizados) o `cripto` (criptomonedas).
- **Catálogo**: la lista oficial de los activos que cuentan en cada mercado.
- **ETF**: fondo de inversión que se compra y se vende en bolsa como una acción.
- **Stablecoin**: criptomoneda que busca valer una moneda fija, como el dólar.
- **`raw.githubusercontent.com`**: dirección desde la que GitHub entrega el contenido crudo de un archivo del repositorio.
- **`main`**: la rama principal del repositorio: la línea de historial que publica Pages.
- **Racha**: días seguidos con la misma dirección, alza o baja.
- **Google Apps Script**: servicio de Google que ejecuta programas pequeños; aquí, el que el repositorio menciona como lanzador externo, no comprobado.


Estado leído del código y de los flujos de este repositorio el 25-nov-2026. Lo que no se puede ver desde aquí está marcado "no verificado aquí".

## Qué es
Un visor público estático (GitHub Pages) con los registros de mercado que lo alimentan. No hay servidor propio: todo lo produce GitHub Actions, todo se guarda como archivos en este repositorio (`registros/`) y el visor los lee directo desde el sitio y desde `raw.githubusercontent.com/osmancitov/hugo/main/registros/`.

- Sitio: https://osmancitov.github.io/hugo/
- Repositorio: `osmancitov/hugo` (público). El nombre «hugo» queda solo en la URL y en el nombre del repositorio. El nombre visible es «Observatorio Bursátil».
- Mercados: `stock` (empresas y fondos ETF) y `cripto`. El piso de los registros es el 1-ago-2026 (UTC).

## Flujo de punta a punta
1. **Disparo.** Los flujos diario y horario se lanzan con `workflow_dispatch`: una llamada a GitHub, a mano desde su página o por programa mediante la API. No hay `cron` en los flujos (comprobado en los tres archivos de `.github/workflows/`). Quién hace hoy esas llamadas no está comprobado: el repositorio menciona un script de Google Apps Script que no está aquí. Ver `flujos-github.md`.
2. **Lectura horaria** (`lectura-horaria.yml`): toma una foto intradiaria cada 15 minutos y la guarda en `registros/intradia/<mercado>/`. Lee **solo los VIP** (unión de las campañas 30, 60 y 90 del último cierre, sin Rezagados): stocks por este flujo, cripto por su propio trabajo. El día cerrado se reconstruye en el cierre diario (`registros/intradia/<mercado>/canonico/`).
3. **Puesta al día diaria** (`actualizacion-diaria.yml`), pensada para las 00:05 a 00:14 UTC, con la vela diaria cerrada:
   - `actualizacion-diaria.mjs`: ingesta de velas diarias de Binance (solo lo que falta) y «pasada de publicación»: indicadores (miedo y codicia), catálogo, pre-cálculos (iceberg, lectura del día, ranking), inventario de días. Un commit.
   - `campana-diaria.mjs`: genera los días que faltan de la carrera de Campaña en las tres ventanas (90, 60 y 30 días) y la serie de cada ventana. Otro commit.
   - `publicar-visor.mjs`: pide la publicación de Pages y comprueba que terminó bien.
4. **Pages** (`pages.yml`): con cada push a `main` (salvo las lecturas intradiarias) genera las entradas derivadas y publica el sitio desde la raíz del repositorio.
5. **Visor** (`index.html` y `visor-*.mjs`): carga catálogo, series y carreras y dibuja las vistas.

## Mapa del repositorio
| Ruta | Qué hay |
|---|---|
| `index.html` | El visor completo (HTML, CSS y el script principal). |
| `visor-rachas.mjs`, `visor-superficie.mjs` | Vistas que viven en su propio módulo. Se importan con `?v=N`; hay que subir N al cambiarlas para saltar la caché de Pages. |
| `app/modulos/` | Lógica compartida por el visor y los flujos. Detalle en la tabla siguiente. |
| `app/generar-*.mjs` | Generadores que corren en Pages: `generar-colores-iceberg` (`iceberg-colores.json`), `generar-pagina-superficie` (`superficie.html`). Son derivados: nunca escriben `registros/`. |
| `.github/workflows/` | Los tres flujos. |
| `.github/*.mjs` | Los scripts que ejecutan los flujos. |
| `registros/` | Todos los datos publicados. Ver `datos.md`. |
| `cuenta/` | Proyecto Cimiento (registro de operaciones). Su propio README. No forma parte del cálculo del Observatorio. |
| `identidad/`, `img/`, `*.jpg` | Imágenes del sitio. |
| `pruebas/` | Pruebas sin red. `node --test pruebas/*.mjs`. |

## Módulos de `app/modulos/`
| Módulo | Papel |
|---|---|
| `velas`, `registro-motor`, `registro-serie`, `registro-universo`, `universo-binance`, `activos`, `exclusiones`, `retirar-eur` | Ingesta de velas diarias: universo de activos, consulta a Binance, escritura mensual, exclusiones (stablecoins USD y casos revisados). |
| `sincronizar-registros` | La «pasada»: compara el registro local con el repositorio, regenera derivados y prepara el commit. Es el módulo más grande. |
| `ciclo-diario` | Define el último día cerrado (`ultimoCerrado`) y el margen tras el cierre UTC. |
| `catalogo`, `activos-info`, `activos-curados.json`, `vigencia`, `lectura-latina` | Catálogo publicado por mercado: nombre, tipo, capitalización y fichas. La capa curada a mano es `activos-curados.json`. |
| `iceberg`, `indicadores`, `indicadores-rotulos`, `colores-lectura` | Indicadores propios (iceberg: cuántos activos cierran en alza y a la baja por día), series de miedo y codicia, rótulos y colores únicos. |
| `pre-calculado` | Lectura del día, iceberg de la ventana y ranking de 24 h, calculados antes de publicar. |
| `persistencia`, `visor-rachas-datos` | Persistencia (promedio de puestos) y cálculos de velas diarias para rachas. |
| `campana-carrera`, `campana-serie`, `campana-orden` | Campaña: carrera diaria, series y orden. Ver `visor.md`. |
| `inventario-dias` | Días registrados por activo (`registros/inventario/`). |
| `completar-vip`, `canonico-lectura`, `registro-intradia`, `intradia-datos`, `intradia-fuente`, `intradia-cierre`, `intradia-reintentos`, `barra-movil` | Lectura intradiaria y la «barra móvil» de 24 h. |
| `navegacion-observatorio`, `fechas-visor` | Utilidades del visor. |
| `reporte`, `fechas-aviso` | Restos del bot de Slack. Siguen solo porque `pruebas/caja.mjs` los importa. No intervienen en la nube. |

## Cosas que conviene saber (verificadas en el código)
- Los módulos conservan la forma de una orden de bot: los flujos construyen un `ctx` mínimo y llaman a `registrar(ctx)` (ver `.github/actualizacion-diaria.mjs`).
- Si un comentario del código no coincide con `flujos-github.md`, vale `flujos-github.md`, comprobado contra los archivos `.yml`.
- **Marcas de ingesta locales:** el motor escribe sus marcas de avance en un directorio temporal de la corrida; no suben al repositorio.
- **Hora del cierre:** `ultimoCerrado(ahora)` resta un margen y retrocede un día; la ingesta falla (y no publica) si el registro llega solo hasta un día anterior al objetivo.

### VIP núcleo
`app/modulos/nucleo.mjs` calcula y lee el VIP núcleo 54 campañas, de 7 a 60 días (`registros/nucleo/`); `completar-vip.mjs`, `registro-cripto.mjs` y `campana-balance.mjs` lo usan.
