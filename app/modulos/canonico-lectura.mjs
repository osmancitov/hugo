// Lectura y validación del registro VIP canónico de un día cerrado. Sin dependencias de Node: lo usa también el visor.
const H = 3600000;
export function leerCanonico(texto, dia = null) {
  const j = JSON.parse(texto);
  if (j.version !== 1 || j.canonico !== true || !/^\d{4}-\d{2}-\d{2}$/.test(j.dia) || (dia && j.dia !== dia)) throw Error('Registro canónico desconocido.');
  if (!Array.isArray(j.lecturas) || j.lecturas.length < 2) throw Error('Registro canónico sin lecturas.');
  const t0 = Date.parse(j.dia);
  let ant = -1;
  for (const l of j.lecturas) {
    const t = Date.parse(l.generada);
    const h = (t - t0) / H;
    if (!Number.isInteger(h) || h < 0 || h > 24 || t <= ant) throw Error('Canónico: lecturas fuera de orden o de otro día.');
    if (typeof l.texto !== 'string' || !l.texto.startsWith('#')) throw Error('Canónico: lectura ilegible.');
    const m = l.texto.match(/^generada: (.+)$/m);
    if (!m || Date.parse(m[1]) !== t) throw Error('Canónico: el instante no coincide con la lectura.');
    ant = t;
  }
  if (j.lecturas.length !== 25 && !j.incompleto) throw Error('Canónico: debe traer 25 puntos (00:00 a 24:00).');
  return j;
}
