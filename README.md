[Lobby](https://github.com/osmancitov/osmancitov.github.io/blob/main/README.md) · [Destilería](https://github.com/osmancitov/destileria/blob/main/README.md) · [Taller](https://github.com/osmancitov/taller/blob/main/README.md) · [Journal](https://github.com/osmancitov/journal/blob/main/README.md) · [Capilla](https://github.com/osmancitov/capilla/blob/main/README.md) · [Sala de máquinas](https://github.com/osmancitov/maquinas/blob/main/README.md) · [Social](https://github.com/osmancitov/social/blob/main/README.md) · [Tesorería](https://github.com/osmancitov/tesoreria/blob/main/README.md) · **Observatorio Bursátil**

# Observatorio Bursátil

Visor público de mercado (Pages), con sus registros, la lectura horaria y la puesta al día diaria que corren en GitHub Actions. El nombre «hugo» queda solo en la URL y en el nombre de este repositorio.

El bot de Slack que corría en una Debian se retiró de este repositorio: ya no hay `app/app.mjs`, ni sus módulos de Slack, ni su configuración de ejemplo. Qué hace hoy la nube está en [manual/operacion-nube.md](manual/operacion-nube.md).

## Proyecto Cimiento

[Aprender el oficio y construir las herramientas](https://osmancitov.github.io/hugo/cuenta/), del aporte inicial a las operaciones más recientes.

## Contenido
- `index.html`: el visor.
- `app/modulos/`: los módulos que usan el visor y los flujos (`velas`, `registro-motor`, `registro-serie`, `registro-intradia`, `sincronizar-registros`, `ciclo-diario`, `campana-*`, `activos*`, `barra-movil`, etc.), más `reporte` y `fechas-aviso`, que siguen porque las pruebas de esos módulos las usan.
- `.github/workflows/`: lectura horaria, actualización diaria y publicación de Pages.
- `manual/operacion-nube.md`: operación vigente de la nube.
- `manual/manual-hugo.md`: manual del antiguo bot; se conserva como referencia histórica.

## Fuera del repositorio
Claves, `node_modules/` y cualquier dato local. Nunca se publican.

## Pruebas sin red
`node --test pruebas/*.mjs` (dos pruebas del visor tienen fallos conocidos: «superficie tiene entrada estática…» y «los rótulos visibles de los icebergs…»).
