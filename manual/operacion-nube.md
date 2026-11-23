---
id: operacion-nube
type: manual
---
# Operación de la nube de Hugo

Documento de referencia, escrito el 23-nov-2026 tras dejar a Hugo (el bot de la Debian) sin registros ni consultas de activos. Describe lo que hace hoy la nube, leído del código y de los flujos de este repositorio. Lo que no se puede ver desde el repositorio está marcado como "no verificado aquí".

## Reparto de responsabilidades
- **Nube (GitHub Actions + Pages)**: lectura horaria, puesta al día diaria, publicación del visor. Es la única que produce datos de mercado.
- **Hugo en la Debian**: bot de Slack. Órdenes vigentes: `estado`, `ayuda`, `hola`, `enviar`, `borrar hilo`, `actualiza`, `stop`, `restart`. No registra, no sincroniza, no dibuja radiografías. Su manual es `manual/manual-hugo.md`.
- **Disparo por reloj de Google (Apps Script)**: los flujos solo tienen `workflow_dispatch`, sin cron en GitHub. Quien los lanza es un script de Google fuera de este repositorio. Su configuración (horas, cuenta, token) no está aquí y no se pudo leer desde este repositorio. Constancia del seguimiento del 22-nov-2026 (nota del trabajo previo, no comprobada directamente en Google): se activó un disparador existente cada 5 minutos, encadenado a la diaria entre las 00:05 y las 00:14 UTC, con control de fecha para no repetir. Indicios coherentes en este repositorio: commits horarios de Actions a los :08 de cada hora UTC y una diaria con commit 0af46b9 (22-nov). Para ver o cambiar los disparadores hay que entrar al proyecto de Apps Script de la cuenta de Google del dueño.

## Flujos (`.github/workflows/`)
### 1. Lectura horaria (`lectura-horaria.yml`)
- Script: `.github/lectura-horaria.mjs`; cola en `cola-horaria.mjs`; publicación con `recombinar-horaria.mjs` y `confirmar-horaria.mjs`.
- Toma la lectura a la hora en punto UTC y guarda el instante real de consulta (nunca una hora forzada). Si el repositorio ya trae la lectura de esa hora, no toma otra.
- Publica con commits "Guardar lectura horaria de las HH:MM UTC desde Actions", autor y committer `Osmancito <osmanvielma@gmail.com>`. Hasta 5 intentos: antes de cada uno trae `origin/main`, recombina la cola (el remoto manda por hora) y empuja.
- Si el push falla, la cola queda en la caché de Actions (`.estado-intradia`) y se reintenta en la siguiente corrida. Una pausa por límite 429 también viaja en esa caché.
- Entrada manual: `intrahora` (verdadero) toma la lectura ya, con su instante real, aunque la hora ya tenga una. Es una prueba manual: usar solo con permiso del dueño.
- Salida: `registros/intradia/stock/AAAA-MM-DD.json` (un archivo por día UTC) y `registros/intradia/stock/indice.json` (campo `ultima`).

### 2. Puesta al día diaria (`actualizacion-diaria.yml`)
- Script: `.github/actualizacion-diaria.mjs`, con `contexto-diaria.mjs` y `datos-publicos-diaria.mjs` (solo lectura de la fuente oficial de datos públicos).
- Pensada para dispararse entre las 00:05 y las 00:14 UTC, con la vela diaria cerrada. Idempotente: si el día ya está cubierto y publicado, no cambia nada; si hubo noches sin correr, alcanza los días pendientes.
- Regenera velas, indicadores, pre-cálculos y catálogo, y publica. Al terminar pide a Pages que republique el visor.
- Salida: `registros/velas-24h`, `registros/pre-calculado`, `registros/catalogo`, `registros/iceberg-*`, `registros/ranking-24h`, y los datos de miedo y codicia (`registros/alternative-fear-greed` para cripto, `registros/feargreedchart-bolsa` para bolsa).
- Aviso de inicio y resultado a Slack: por la app oficial de GitHub, no por Hugo.

### 3. Visor (`pages.yml`)
- Se ejecuta con cada push a `main` que cambie algo fuera de `registros/intradia/stock/**` y de `registros/pre-calculado/stock/barra-24h/actual_barra`, y a demanda. Por eso las lecturas horarias no republican el visor; la diaria sí lo pide.
- Genera la entrada de superficie, persistencia y colores del iceberg, y publica el sitio estático desde la raíz del repositorio (`index.html`).

## Código compartido (no borrar)
Los flujos importan módulos de `app/modulos/`: `barra-movil`, `ciclo-diario`, `intradia-datos`, `intradia-fuente`, `registro-intradia`, `registro-motor`, `sincronizar-registros`, `velas`, y por medio de la pasada `indicadores`, `pre-calculado` y `catalogo` (este importa `ACTIVOS_INFO` de `radiografias`). Hugo ya no los carga como órdenes (`app/app.mjs`), pero siguen siendo código de la nube. Antes de quitar o renombrar cualquiera, comprobar los imports de `.github/*.mjs`.

## Operación y comprobaciones
- **Que la hora corrió**: buscar en `git log` un commit "Guardar lectura horaria de las HH:MM UTC desde Actions" por hora. Debe tocar solo `registros/intradia/stock/`. Una hora puede demorar o saltarse; la lectura guarda su hora real.
- **Que la diaria corrió**: commit de la puesta al día tras las 00:05 UTC y el día nuevo en `registros/velas-24h`. Los reportes de inicio y resultado llegan a Slack por la app de GitHub.
- **Una corrida falló**: ver la pestaña Actions del repositorio; relanzar con `workflow_dispatch`. La diaria es idempotente y la horaria retoma su cola desde la caché.
- **Cambiar el horario de disparo**: se hace en el Apps Script de Google, no aquí (no verificado aquí).
- **Identidad de commits**: todos los commits usan `osmanvielma@gmail.com` como autor y committer.

## Límites conocidos
- Fear&Greed de bolsa: primera validación en la diaria del 25-nov-2026 (según el seguimiento de esta limpieza).
- La carpeta `registros/` del repositorio es la única copia publicada; la Debian ya no mantiene copia propia.
