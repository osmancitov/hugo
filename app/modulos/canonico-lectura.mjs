// Lectura y validación del registro VIP canónico de un día cerrado. Sin dependencias de Node: lo usa también el visor.
// `ritmo_min` (15 o 60; sin campo = 60, los canónicos del 25-nov-2026): 97 puntos (00:00 a 24:00 cada 15 min) o 25 (cada hora).
export const PUNTOS = { 15: 97, 60: 25 };
export function leerCanonico(texto, dia = null) {
  const j = JSON.parse(texto);
  if (j.version !== 1 || j.canonico !== true || !/^\d{4}-\d{2}-\d{2}$/.test(j.dia) || (dia && j.dia !== dia)) throw Error('Registro canónico desconocido.');
  const ritmo = j.ritmo_min ?? 60;
  if (!PUNTOS[ritmo]) throw Error('Canónico: ritmo desconocido.');
  if (!Array.isArray(j.lecturas) || j.lecturas.length < 2) throw Error('Registro canónico sin lecturas.');
  const t0 = Date.parse(j.dia), paso = ritmo * 60000;
  let ant = -1;
  for (const l of j.lecturas) {
    const t = Date.parse(l.generada);
    const k = (t - t0) / paso;
    if (!Number.isInteger(k) || k < 0 || k > PUNTOS[ritmo] - 1 || t <= ant) throw Error('Canónico: lecturas fuera de orden o de otro día.');
    if (typeof l.texto !== 'string' || !l.texto.startsWith('#')) throw Error('Canónico: lectura ilegible.');
    const m = l.texto.match(/^generada: (.+)$/m);
    if (!m || Date.parse(m[1]) !== t) throw Error('Canónico: el instante no coincide con la lectura.');
    ant = t;
  }
  if (j.lecturas.length !== PUNTOS[ritmo] && !j.incompleto) throw Error(`Canónico: debe traer ${PUNTOS[ritmo]} puntos (00:00 a 24:00).`);
  return j;
}
