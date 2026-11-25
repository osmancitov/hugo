[Lobby](https://github.com/osmancitov/osmancitov.github.io/blob/main/README.md) · [Destilería](https://github.com/osmancitov/destileria/blob/main/README.md) · [Taller](https://github.com/osmancitov/taller/blob/main/README.md) · [Journal](https://github.com/osmancitov/journal/blob/main/README.md) · [Capilla](https://github.com/osmancitov/capilla/blob/main/README.md) · [Sala de máquinas](https://github.com/osmancitov/maquinas/blob/main/README.md) · [Social](https://github.com/osmancitov/social/blob/main/README.md) · [Tesorería](https://github.com/osmancitov/tesoreria/blob/main/README.md) · **Observatorio Bursátil**

# Observatorio Bursátil

Visor público de mercado (Pages), con sus registros, la lectura horaria y la puesta al día diaria que corren en GitHub Actions. El nombre «hugo» queda solo en la URL y en el nombre de este repositorio.

El bot de Slack que corría en una Debian se retiró de este repositorio.

## Documentación (empieza aquí)
- [docs/construccion.md](docs/construccion.md): **la explicación principal**. Cómo se construye y cómo funciona el Observatorio, de cero y en orden, para alguien que no conoce nada. Lo demás es referencia de apoyo.
- [docs/arquitectura.md](docs/arquitectura.md): qué es, flujo de punta a punta, mapa de carpetas y módulos.
- [docs/datos.md](docs/datos.md): cada carpeta de `registros/`, su formato, quién la escribe y quién la lee.
- [docs/flujos-github.md](docs/flujos-github.md): los tres flujos de Actions, el disparo externo y cómo comprobar que corrieron.
- [docs/visor.md](docs/visor.md): rutas, Campaña (regla y campo), nombres con lectura latina y pruebas.
- [docs/reconstruir.md](docs/reconstruir.md): pasos para levantar un Observatorio nuevo desde cero.
- [docs/decisiones.md](docs/decisiones.md): reglas fijadas por el dueño y su origen.

## Proyecto Cimiento

[Aprender el oficio y construir las herramientas](https://osmancitov.github.io/hugo/cuenta/), del aporte inicial a las operaciones más recientes.

## Contenido
- `index.html` y `visor-*.mjs`: el visor.
- `app/modulos/`: módulos que usan el visor y los flujos.
- `.github/`: flujos de GitHub Actions y los scripts que ejecutan.
- `registros/`: todos los datos publicados.
- `docs/`: documentación vigente. `manual/`: documentación anterior, solo histórica.

## Fuera del repositorio
Claves, `node_modules/` y cualquier dato local. Nunca se publican.

## Pruebas sin red
`node --test pruebas/*.mjs` (dos pruebas del visor tienen fallos conocidos: «superficie tiene entrada estática…» y «los rótulos visibles de los icebergs…»).
