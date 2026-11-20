// Cálculos de velas diarias. No consulta precios ni rellena días ausentes.
export const DIA = 86400000;
export const corteUTC = (ahora = Date.now()) => Math.floor(ahora / DIA) * DIA;
export function validarMes(filas, mes, corte = corteUTC()) {
  if (!/^\d{4}$/.test(mes)) throw Error('Mes no válido');
  const y = 2000 + Number(mes.slice(0, 2)), m = Number(mes.slice(2)) - 1;
  if (m < 0 || m > 11 || !Array.isArray(filas) || !filas.length) throw Error('Mes vacío o no válido');
  const desde = Date.UTC(y, m, 1), hasta = Date.UTC(y, m + 1, 1);
  let anterior = -1;
  for (const f of filas) {
    if (!Array.isArray(f) || f.length !== 12 || !Number.isSafeInteger(f[0]) || f[0] % DIA || f[0] < desde || f[0] >= hasta || f[0] <= anterior || f[6] !== f[0] + DIA - 1 || f[6] >= corte) throw Error('Velas abiertas, repetidas o fuera de fecha');
    const [o, h, l, c] = f.slice(1, 5).map(Number);
    if (f.slice(1, 5).some(x => x === '' || x === null) || ![o,h,l,c].every(x => Number.isFinite(x) && x > 0) || h < Math.max(o,c,l) || l > Math.min(o,c,h)) throw Error('Precios no válidos');
    anterior = f[0];
  }
  return filas;
}
export function resumir(filas, inicioConocido = false) {
  if (!filas.length) throw Error('Sin velas');
  let anteriores = -1;
  for (const f of filas) {
    if (f[0] <= anteriores) throw Error('Fechas repetidas o desordenadas');
    anteriores = f[0];
  }
  const ultima = filas.at(-1);
  const rango = (Number(ultima[2]) - Number(ultima[3])) / Number(ultima[1]) * 100;
  const variacion = (Number(ultima[4]) / Number(ultima[1]) - 1) * 100;
  const ratioUltima = Number(ultima[4]) / Number(ultima[1]);
  const direccion = ratioUltima > 1 ? 1 : ratioUltima < 1 ? -1 : 0;
  let dias = 0, primeraApertura = Number(ultima[1]), motivo = '', siguiente = ultima[0] + DIA;
  if (direccion !== 0) for (let i = filas.length - 1; i >= 0; i--) {
    const f = filas[i];
    if (f[0] !== siguiente - DIA) { motivo = 'hueco en los días registrados'; break; }
    const ratio = Number(f[4]) / Number(f[1]);
    if (ratio === 1 || (ratio > 1 ? 1 : -1) !== direccion) break;
    dias++; primeraApertura = Number(f[1]); siguiente = f[0];
    if (i === 0) motivo = inicioConocido ? 'inicio del registro disponible' : 'faltan meses anteriores';
  }
  return { fecha: ultima[0], variacion, rango, dias, direccion, acumulado: dias ? (Number(ultima[4]) / primeraApertura - 1) * 100 : 0, limitada: Boolean(motivo), motivo };
}
// Equilibrio G/P: la razón de variación de la radiografía (md/radiografia-de-variacion.md),
// calculada igual y sobre el mismo período: todo el registro del activo. La variación de cada
// vela es la de su cierre frente a su apertura, como en la gráfica. Un día que cierra igual
// que abre no cuenta. Sin días rojos no hay división posible (Infinity); sin días verdes, 0.
export function razonVariacion(filas) {
  let verde = 0, roja = 0;
  for (const f of filas) {
    const r = (Number(f[4]) / Number(f[1]) - 1) * 100;
    if (r > 0) verde += r; else if (r < 0) roja -= r;
  }
  return { verde, roja, razon: roja > 0 ? verde / roja : verde > 0 ? Infinity : 0 };
}
export function separar(resultados) {
  const validos = resultados.filter(x => x.datos);
  const fecha = validos.length ? Math.max(...validos.map(x => x.datos.fecha)) : null;
  return { fecha, comparables: validos.filter(x => x.datos.fecha === fecha), atrasados: validos.filter(x => x.datos.fecha !== fecha), errores: resultados.filter(x => !x.datos) };
}
