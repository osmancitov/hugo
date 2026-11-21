// Fechas de presentación UTC. Los identificadores y valores de formularios conservan ISO.
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
export function fechaLegibleUTC(valor) {
 const fecha = new Date(typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor+'T00:00:00Z' : valor);
 if (!Number.isFinite(fecha.getTime())) return 'sin fecha';
 return `${fecha.getUTCDate()} ${MESES[fecha.getUTCMonth()]} ${fecha.getUTCFullYear()}`;
}
