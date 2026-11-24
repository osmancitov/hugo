// Continuidad del registro (pedido del usuario, 24-nov-2026): un activo que ya venía registrando
// no puede perder un día UTC. Esta comprobación mira, por activo, desde su primera vela hasta el
// último día cerrado, y devuelve cada día que falta. No rellena ni tolera huecos: los señala para
// corregirlos en la pesquisa que los produjo. Solo lee los archivos mensuales de velas-24h.
import fs from 'node:fs';
import path from 'node:path';

const DIA = 86400000;
const fechaDia = (t) => new Date(t).toISOString().slice(0, 10);

function fechasDe(dirActivo) {
  const dias = new Set();
  for (const archivo of fs.readdirSync(dirActivo)) {
    if (!/^\d{4}_[\p{L}\p{N}]{1,15}$/u.test(archivo)) continue;
    for (const vela of JSON.parse(fs.readFileSync(path.join(dirActivo, archivo), 'utf8'))) dias.add(vela[0]);
  }
  return dias;
}

// hasta: medianoche UTC del último día cerrado (incluido). Devuelve [{ clase, codigo, desde, faltan: ['AAAA-MM-DD'] }].
export function auditarContinuidad(dirVelas, hasta) {
  if (!Number.isSafeInteger(hasta) || hasta % DIA) throw Error('El último día cerrado debe ser una medianoche UTC.');
  const huecos = [];
  for (const clase of fs.readdirSync(dirVelas)) {
    const dirClase = path.join(dirVelas, clase);
    if (!fs.statSync(dirClase).isDirectory()) continue;
    for (const codigo of fs.readdirSync(dirClase).sort()) {
      const dirActivo = path.join(dirClase, codigo);
      if (!fs.statSync(dirActivo).isDirectory()) continue;
      const dias = fechasDe(dirActivo);
      if (!dias.size) continue;
      const desde = Math.min(...dias);
      const faltan = [];
      for (let t = desde; t <= hasta; t += DIA) if (!dias.has(t)) faltan.push(fechaDia(t));
      if (faltan.length) huecos.push({ clase, codigo, desde: fechaDia(desde), faltan });
    }
  }
  return huecos;
}

// Texto para el registro de la corrida: cada activo con sus fechas, sin acotar ni resumir.
export function textoHuecos(huecos, hasta) {
  const lineas = huecos.map((h) => `- ${h.clase}:${h.codigo} (registra desde ${h.desde}): falta ${h.faltan.join(', ')}`);
  return `Hay ${huecos.length} activo(s) con días sin registro hasta el ${fechaDia(hasta)}:\n${lineas.join('\n')}`;
}
