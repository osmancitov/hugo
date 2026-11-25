// Parámetro Campaña de cada activo: raíz((P² + C²) / 2). Vale 1 con P=1 y C=1; una potencia o constancia
// alta puede compensar a la otra, y con ambas bajo 1 nunca llega a 1. Las listas de campaña se ordenan por él,
// de mayor a menor dentro de cada grupo. No cambia la clasificación ni la escala de las gráficas.
// Empate exacto: el puesto de la carrera, y por último el id, para que el orden sea siempre el mismo.
export const campana = (a) => Math.sqrt((a.potencia ** 2 + a.constancia ** 2) / 2);
export const comparar = (a, b) => campana(b) - campana(a) || a.puesto - b.puesto || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const ordenarCampana = (items) => [...items].sort(comparar);
