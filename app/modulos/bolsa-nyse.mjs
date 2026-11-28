// Estado de la bolsa de Nueva York (sesión regular 9:30 a 16:00, hora de Nueva York) y próxima apertura / cierre, mostrados en UTC-4.
// Calendario: feriados y cierres anticipados de 2026 a 2028 según https://www.nyse.com/trade/hours-calendars (cierre anticipado a las 13:00).
// Solo lunes a viernes: sábados y domingos no hay sesión regular. Fuera de 2026-2028 no hay calendario cargado y no se afirma nada.
const FERIADOS = {
  '2026-01-01': 'Año Nuevo', '2026-01-19': 'Día de Martin Luther King Jr.', '2026-02-16': 'Día de los Presidentes', '2026-04-03': 'Viernes Santo',
  '2026-05-25': 'Día de los Caídos', '2026-06-19': 'Juneteenth', '2026-07-03': 'Día de la Independencia (observado)', '2026-09-07': 'Día del Trabajo',
  '2026-11-26': 'Acción de Gracias', '2026-12-25': 'Navidad',
  '2027-01-01': 'Año Nuevo', '2027-01-18': 'Día de Martin Luther King Jr.', '2027-02-15': 'Día de los Presidentes', '2027-03-26': 'Viernes Santo',
  '2027-05-31': 'Día de los Caídos', '2027-06-18': 'Juneteenth (observado)', '2027-07-05': 'Día de la Independencia (observado)', '2027-09-06': 'Día del Trabajo',
  '2027-11-25': 'Acción de Gracias', '2027-12-24': 'Navidad (observada)',
  '2028-01-17': 'Día de Martin Luther King Jr.', '2028-02-21': 'Día de los Presidentes', '2028-04-14': 'Viernes Santo', '2028-05-29': 'Día de los Caídos',
  '2028-06-19': 'Juneteenth', '2028-07-04': 'Día de la Independencia', '2028-09-04': 'Día del Trabajo', '2028-11-23': 'Acción de Gracias', '2028-12-25': 'Navidad',
};
const CIERRE_ANTICIPADO = new Set(['2026-11-27', '2026-12-24', '2027-11-26', '2028-07-03', '2028-11-24']);
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtNY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function partesNY(t) { const o = {}; for (const p of fmtNY.formatToParts(new Date(t))) o[p.type] = p.value; return o; }
// Instante UTC (ms) de una hora local de Nueva York; el cambio de hora lo resuelve Intl.
function instanteNY(y, m, d, h, mi) {
  for (const desfase of [4, 5]) {
    const t = Date.UTC(y, m - 1, d, h + desfase, mi), p = partesNY(t);
    if (+p.year === y && +p.month === m && +p.day === d && +p.hour === h && +p.minute === mi) return t;
  }
  return null;
}
const dos = (n) => String(n).padStart(2, '0');
function sesionDe(y, m, d) { // {abre, cierra, anticipado} o {motivo}
  const clave = y + '-' + dos(m) + '-' + dos(d), dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 0 || dow === 6) return { motivo: 'fin de semana' };
  if (FERIADOS[clave]) return { motivo: 'feriado', nombre: FERIADOS[clave] };
  const anticipado = CIERRE_ANTICIPADO.has(clave);
  return { abre: instanteNY(y, m, d, 9, 30), cierra: instanteNY(y, m, d, anticipado ? 13 : 16, 0), anticipado };
}
export function horaUTC4(t) { // «lunes 30 nov, 10:30 a. m.»
  const f = new Date(t - 4 * 3600000), h = f.getUTCHours(), mi = f.getUTCMinutes();
  return DIAS[f.getUTCDay()] + ' ' + f.getUTCDate() + ' ' + MESES[f.getUTCMonth()] + ', ' + (h % 12 || 12) + ':' + dos(mi) + (h < 12 ? ' a. m.' : ' p. m.');
}
export function estadoBolsa(ahora = Date.now()) {
  const p = partesNY(ahora), y0 = +p.year;
  if (y0 < 2026 || y0 > 2028) return { sinCalendario: true };
  let dia = Date.UTC(y0, +p.month - 1, +p.day), hoy = null, previa = null;
  for (let k = 0; k < 20; k++) {
    const f = new Date(dia + k * 86400000), y = f.getUTCFullYear(), m = f.getUTCMonth() + 1, d = f.getUTCDate();
    if (y > 2028) return { sinCalendario: true };
    const s = sesionDe(y, m, d);
    if (k === 0) hoy = s;
    if (!s.abre) continue;
    if (k === 0 && ahora >= s.abre && ahora < s.cierra) return { abierta: true, cierra: s.cierra, anticipado: s.anticipado };
    if (s.abre > ahora) return { abierta: false, abre: s.abre, cierra: s.cierra, anticipado: s.anticipado, motivoHoy: k === 0 ? hoy : { motivo: hoy.motivo, nombre: hoy.nombre }, hoy, cierraHoyYa: k === 0 };
  }
  return { sinCalendario: true };
}
export function textoBolsa(e) {
  if (e.sinCalendario) return 'Bolsa de Nueva York: sin calendario cargado para esta fecha (feriados 2026 a 2028).';
  if (e.abierta) return 'Bolsa de Nueva York: abierta · cierra ' + horaUTC4(e.cierra) + ' (UTC-4)' + (e.anticipado ? ' (cierre anticipado)' : '') + '.';
  const h = e.hoy || {};
  let por = 'fuera de horario';
  if (h.motivo === 'fin de semana') por = 'fin de semana: no hay sesión regular los sábados ni los domingos';
  else if (h.motivo === 'feriado') por = 'feriado: ' + h.nombre;
  return 'Bolsa de Nueva York: cerrada (' + por + ') · abre ' + horaUTC4(e.abre) + ' y cierra ' + horaUTC4(e.cierra) + ' (UTC-4)' + (e.anticipado ? ' (cierre anticipado)' : '') + '.';
}
