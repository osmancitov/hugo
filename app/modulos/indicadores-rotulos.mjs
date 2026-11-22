// Rotulos visibles de cada indicador: UNA sola definicion en el repositorio (decision del
// usuario, 19-nov-2026: el nombre se cambia en un solo sitio y vale para menu, graficos y
// reportes). Lo importa el bot para sus reportes y el visor para el menu y los graficos;
// Fear and greed: mismo nombre en los dos mercados, sin «Index» ni sufijo (decision del
// usuario, 22-nov-2026).
// nadie mas escribe nombres a mano. Viaja como .mjs porque el instalador de GitHub copia
// los modulos .mjs (un .json quedaba fuera y los reportes caian a las claves tecnicas).
export default {
  'feargreedchart-bolsa': 'Fear and greed',
  'alternative-fear-greed': 'Fear and greed',
  // Iceberg: el nombre provisional que le dio el usuario (20-nov-2026), hasta mudarlo si
  // encuentra un indicador ya hecho con otro nombre. Uno por mercado; dentro de su espacio
  // se llama «Iceberg 2D», porque el mercado ya está indicado (renombrado por el usuario,
  // 22-nov-2026, junto con «Superficie 3D»).
  'iceberg-stock': 'Iceberg 2D',
  'iceberg-cripto': 'Iceberg 2D',
};
