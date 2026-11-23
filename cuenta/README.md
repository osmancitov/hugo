# Estado de cuenta

`movimientos.json` conserva el registro y sus datos conocidos. `generar.mjs` produce `index.html` y `estado-de-cuenta.md`; la publicación de Pages lo ejecuta antes de empaquetar. La vista omite horas y pendientes por decisión de Osmancito, sin borrar esos datos de la fuente.

`ventanas.mjs` calcula el saldo realizado acumulando movimientos cerrados hasta cada fecha de corte. No valora posiciones abiertas. Usa el último cierre registrado como extremo: un día, siete días y un mes calendario hacia atrás. Si no hay movimiento en un corte, conserva el saldo realizado acumulado hasta ese día. Los porcentajes se redondean al entero, no las operaciones. El día actual incluye todos sus cierres. Las cifras aproximadas siguen marcadas en los datos y se indican una vez en la vista.

La ilustración propia es `recorrido.jpg`, sin recorte ni redimensionamiento y comprimida al 75 %. Es también la imagen de preview de la página.

Pruebas: `node --test pruebas/estado-de-cuenta.mjs`, desde la raíz del repositorio.
