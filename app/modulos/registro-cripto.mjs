// Registro horario de cripto (decisión del usuario, 25-nov-2026): empieza con el cambio de día
// del Observatorio (00:00 UTC del 26-nov) y desde el 27-nov-2026 solo lee el VIP núcleo 54 campañas (7 a 60 días);
// antes leía a los admitidos de las campañas 30, 60 y 90.
// Es independiente del registro de stocks: carpeta, índice, script y commit propios.
// No toca el cálculo de las cuatro categorías: solo lee lo que el cierre diario ya publicó.
import { cubeta } from './ritmo-vip.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { leerBarra } from './barra-movil.mjs';
import { leerNucleo } from './nucleo.mjs';
import { leerDia, leerIndice, unirDias, unirIndices, diaUTC } from './intradia-datos.mjs';

// El registro empieza con el cambio de día del Observatorio (reloj UTC): nada se toma antes.
export const INICIO_CRIPTO = Date.parse('2026-11-26T00:00:00Z');
export const BASE_CRIPTO = 'registros/intradia/cripto';
export const RUTA_INDICE_CRIPTO = `${BASE_CRIPTO}/indice.json`;
export const rutaDiaCripto = (dia) => `${BASE_CRIPTO}/${dia}.json`;
export const simboloCripto = (codigo) => `${codigo}USDT`;

const validar = (texto) => {
  const b = leerBarra(texto);
  if (!Number.isFinite(b.generada) || !b.activos.size || !b.dia) throw Error('La lectura no trae instante, activos y referencia diaria.');
  return b;
};

// Universo de cripto = VIP núcleo 54 campañas, de 7 a 60 días (nucleo.mjs). Lanza si falta o está atrasado: sin unión antigua.
export function admitidosCripto(raizRegistros, ahora = Date.now()) {
  return [...leerNucleo(raizRegistros, 'cripto', { ahora }).nucleo].sort();
}

const leerOpc = (r) => { try { return fs.readFileSync(r, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };

// Estado del día para tomar la lectura: referencia (primera del día) y previa.
export function estadoDiaCripto(raiz, ahora) {
  const t = leerOpc(path.join(raiz, '..', rutaDiaCripto(diaUTC(ahora))));
  if (t === null) return { inicialTexto: null, anteriorTexto: null, horas: new Set() };
  const l = leerDia(t, validar).lecturas;
  return { inicialTexto: l[0].texto, anteriorTexto: l.at(-1).texto, horas: new Set(l.map((x) => cubeta(Date.parse(x.generada)))) };
}

// Escribe la lectura en el árbol de trabajo (día e índice). No usa la cola de stocks.
export function guardarLecturaCripto(raiz, texto) {
  const b = validar(texto), generada = new Date(b.generada).toISOString(), dia = diaUTC(b.generada);
  const base = path.join(raiz, '..');
  const rd = path.join(base, rutaDiaCripto(dia)), ri = path.join(base, RUTA_INDICE_CRIPTO);
  const uno = JSON.stringify({ version: 1, dia, lecturas: [{ generada, texto }] }) + '\n';
  const previo = leerOpc(rd);
  const registro = previo === null ? uno : unirDias(uno, previo, validar);
  const idx = JSON.stringify({ version: 1, dias: [dia], ultima: generada }) + '\n';
  const idxPrevio = leerOpc(ri);
  const indice = idxPrevio === null ? idx : unirIndices(idx, idxPrevio);
  leerIndice(indice);
  fs.mkdirSync(path.dirname(rd), { recursive: true });
  fs.writeFileSync(rd, registro); fs.writeFileSync(ri, indice);
  return { lecturas: leerDia(registro, validar).lecturas.length, dia };
}
