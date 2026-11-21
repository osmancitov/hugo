// Criterio visual único. No cambia precios ni el formato de los conteos guardados.
export const COLORES_LECTURA = Object.freeze({ rojo: '#b73d40', gris: '#9aa0ac', verde: '#25855c' });
export const TINTAS_LECTURA = Object.freeze({ rojo: '#ed7477', gris: '#9aa0ac', verde: '#45b381' });
export const ETIQUETAS_LECTURA = Object.freeze([{ texto: 'Subió', color: TINTAS_LECTURA.verde }, { texto: 'Igual', color: TINTAS_LECTURA.gris }, { texto: 'Bajó', color: TINTAS_LECTURA.rojo }]);
export const LEYENDA_LECTURA = ETIQUETAS_LECTURA.map(e => e.texto).join(' · ');
export const estadoMovimiento = (n) => n === null || !Number.isFinite(n) ? null : n === 0 ? 'gris' : n > 0 ? 'verde' : 'rojo';
export const colorMovimiento = (n) => COLORES_LECTURA[estadoMovimiento(n)] ?? null;
export const claseMovimiento = (n) => ({ rojo: 'negativo', gris: 'igual', verde: 'positivo' }[estadoMovimiento(n)] ?? '');
export function separarConteos(subenConIguales, bajan, iguales) {
  if (![subenConIguales, bajan, iguales].every(n => Number.isInteger(n) && n >= 0) || iguales > subenConIguales) throw Error('Conteos visuales incompatibles');
  return { rojos: bajan, grises: iguales, verdes: subenConIguales - iguales, total: subenConIguales + bajan };
}
export function textoConteos(suben, bajan, iguales) {
  const c = separarConteos(suben, bajan, iguales);
  return `Rojos ${c.rojos} · Grises ${c.grises} · Verdes ${c.verdes}`;
}
export function separarSerieIceberg(puntos, detalle) {
  return puntos.map(([ts, sub, baj]) => {
    const c = detalle[String(ts)];
    if (!c || c[0] !== sub || c[1] !== baj) throw Error('Detalle visual del iceberg no corresponde al registro');
    const v = separarConteos(sub, baj, c[2]);
    return [ts, v.verdes, v.rojos, v.grises];
  });
}

export function cifrasConteos(suben,bajan,iguales) {
 const c=separarConteos(suben,bajan,iguales);
 return [{valor:c.rojos,color:TINTAS_LECTURA.rojo,fondo:COLORES_LECTURA.rojo,nombre:'Bajaron'},{valor:c.grises,color:TINTAS_LECTURA.gris,fondo:COLORES_LECTURA.gris,nombre:'Iguales'},{valor:c.verdes,color:TINTAS_LECTURA.verde,fondo:COLORES_LECTURA.verde,nombre:'Subieron'}];
}
