// Pausa duradera de la fuente intradiaria, independiente de la cola de publicación.
// Un reinicio nunca elude Retry-After. Sin plazo válido se requiere revisar el estado.
import fs from 'node:fs';
import path from 'node:path';
import { guardarEstado } from './registro-motor.mjs';

const ruta = (raiz) => path.join(raiz, '..', '.estado-intradia', 'fuente-pausa.json');
export function pausaFuente(raiz) {
  let j;
  try { j = JSON.parse(fs.readFileSync(ruta(raiz), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw Error('Pausa de fuente ilegible; no consulto hasta revisar su estado.'); }
  if (j.version !== 1 || ![429, 418].includes(j.status) || !(j.hasta === null || (Number.isFinite(j.hasta) && Number.isFinite(new Date(j.hasta).getTime())))) throw Error('Pausa de fuente inválida; no consulto hasta revisar su estado.');
  return j;
}
export function plazoReintento(valor, ahora) {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const v = valor.trim();
  if (/^\d+$/.test(v)) {
    const hasta = ahora + Number(v) * 1000;
    return Number.isSafeInteger(hasta) && Number.isFinite(new Date(hasta).getTime()) ? hasta : null;
  }
  if (!/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(v)) return null;
  const fecha = Date.parse(v);
  return Number.isFinite(fecha) && new Date(fecha).toUTCString() === v && fecha > ahora ? fecha : null;
}
export function fetchConPausa(raiz, fetchImpl, ahora = Date.now) {
  return async (...args) => {
    const pausa = pausaFuente(raiz);
    if (pausa && (pausa.hasta === null || pausa.hasta > ahora())) throw Error(pausa.hasta === null
      ? `Fuente pausada por Binance HTTP ${pausa.status}, sin plazo válido; requiere revisión.`
      : `Fuente pausada por Binance HTTP ${pausa.status} hasta ${new Date(pausa.hasta).toISOString()}.`);
    const r = await fetchImpl(...args);
    if ([429, 418].includes(r.status)) {
      const hasta = plazoReintento(r.headers?.get?.('retry-after'), ahora());
      guardarEstado(ruta(raiz), { version: 1, status: r.status, hasta });
      throw Error(hasta === null ? `Binance HTTP ${r.status}; fuente pausada sin plazo válido, requiere revisión.`
        : `Binance HTTP ${r.status}; fuente pausada hasta ${new Date(hasta).toISOString()}.`);
    }
    return r;
  };
}
