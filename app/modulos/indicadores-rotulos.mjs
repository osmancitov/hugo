// Rotulos visibles de cada indicador: UNA sola definicion en el repositorio (decision del
// usuario, 19-nov-2026: el nombre se cambia en un solo sitio y vale para menu, graficos y
// reportes). Lo importa el bot para sus reportes y el visor para el menu y los graficos;
// nadie mas escribe nombres a mano. Viaja como .mjs porque el instalador de GitHub copia
// los modulos .mjs (un .json quedaba fuera y los reportes caian a las claves tecnicas).
export default {
  'feargreedchart-bolsa': 'Fear & Greed Index (Stock)',
  'alternative-fear-greed': 'Fear & Greed Index (Cripto)',
  // Iceberg: el nombre provisional que le dio el usuario (20-nov-2026), hasta mudarlo si
  // encuentra un indicador ya hecho con otro nombre. Uno por mercado; dentro de su espacio
  // se llama simplemente «Iceberg», porque el mercado ya está indicado (decisión del usuario,
  // 20-nov-2026).
  'iceberg-stock': 'Iceberg',
  'iceberg-cripto': 'Iceberg',
};
