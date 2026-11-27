# Monitor VIP de arranque

Una sola pantalla en la terminal con todos los VIP del núcleo a la vez, con lecturas
muy veloces, para la jugada manual de la noche: ver quién arranca sobre el cero,
marcar lo que compraste a mano en la app, y que el monitor grite cuándo vender.

**No toca tu cuenta.** Solo lee precios públicos de Binance (el mismo host de datos
que usa Hugo, `data-api.binance.vision`) y el núcleo público de este repositorio.
No necesita claves, ni pip, ni instalar nada: Python 3 pelado.

## Arrancar

Desde la carpeta del repo (`~/Documents/hugo` o donde lo tengas):

```
git pull
python3 bot-vip/monitor_vip.py
```

Para dejarlo listo **antes** de que salga la lista (la diaria la publica entre
8:05 y 8:21 p. m.), lánzalo temprano con:

```
python3 bot-vip/monitor_vip.py --esperar-nucleo
```

Él solito espera a que aparezca el núcleo nuevo y arranca. El **cero** de cada
VIP es su precio en el momento en que arranca el monitor.

## Lo que ves

- Una fila por VIP que va **sobre el cero**: precio, cero y % arriba.
- Los que van por debajo quedan escondidos (pulsa `t` si los quieres ver).
- `<< CANDIDATO >>` cuando uno cruza el cero hacia arriba.
- Una `*` en los que marcaste compra, con tu % desde tu precio.

## Mientras corre (escribe y Enter)

- `c DODO` — marcar que compraste DODO al precio actual (`c DODO 0.0412` si quieres el exacto)
- `v DODO` — marcar que vendiste; muestra el resultado
- `t` — ver también los que van bajo el cero
- `q` — salir (guarda el estado)

Avisos de venta (con campana) sobre lo que marcaste como comprado:

- **cayó por debajo del cero** — soltar, no irse para abajo con él
- **objetivo logrado** — llegó a la ganancia fijada (desde tu precio de compra)

## Ajustes

- `--intervalo 5` — segundos entre lecturas (defecto 10)
- `--objetivo 2.5` — % de ganancia para el aviso de venta (defecto 2)
- `--mercados cripto` — solo cripto, solo `stock`, o ambos (defecto ambos)

Ojo con la comisión (~0,1 % por lado): objetivos por debajo de ~0,3 % se los comen
las fees de ida y vuelta.

## Si se va la luz

El estado (ceros, compras marcadas) queda en `estado-vip.json` en la carpeta donde
lo corriste. Al abrirlo de nuevo retoma todo; los ceros originales se conservan.
Los eventos quedan también en `~/.local/log/monitor-vip.log`.
