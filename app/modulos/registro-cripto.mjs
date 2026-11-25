// Registro horario de cripto (decisión del usuario, 25-nov-2026): empieza con el cambio de día
// del Observatorio (00:00 UTC del 26-nov) y solo lee a los admitidos: los que no quedan
// Rezagados en alguna de las tres campañas (30, 60 o 90 días), cada activo una sola vez.
// Es independiente del registro de stocks: carpeta, índice, script y commit propios.
// No toca el cálculo de las cuatro categorías: solo lee lo que el cierre diario ya publicó.
import fs from 'node:fs';
import path from 'node:path';
import { leerBarra } from './barra-movil.mjs';
import { esVigente } from './vigencia.mjs';
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

// Último archivo de cada campaña publicado por el cierre diario (nombres AAMMDD-AAMMDD_carrera-Nd).
export function admitidosCripto(raizRegistros) {
  const dir = path.join(raizRegistros, 'categorias');
  const codigos = new Set();
  for (const n of [30, 60, 90]) {
    const archivos = fs.readdirSync(dir).filter((f) => new RegExp(`^\\d{6}-\\d{6}_carrera-${n}d$`).test(f)).sort();
    if (!archivos.length) throw Error(`No hay categorías de la campaña de ${n} días; no invento el universo.`);
    const j = JSON.parse(fs.readFileSync(path.join(dir, archivos.at(-1)), 'utf8'));
    if (!Array.isArray(j.clasificados)) throw Error(`Categorías de ${n} días ilegibles.`);
    for (const a of j.clasificados) if (typeof a.id === 'string' && a.id.startsWith('cripto:') && a.grupo !== 'rezagados') codigos.add(a.id.slice(7));
  }
  const vigente = esVigente(path.join(raizRegistros, 'velas-24h'), 'cripto');
  return [...codigos].filter((c) => vigente(c)).sort();
}

const leerOpc = (r) => { try { return fs.readFileSync(r, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };

// Estado del día para tomar la lectura: referencia (primera del día) y previa.
export function estadoDiaCripto(raiz, ahora) {
  const t = leerOpc(path.join(raiz, '..', rutaDiaCripto(diaUTC(ahora))));
  if (t === null) return { inicialTexto: null, anteriorTexto: null, horas: new Set() };
  const l = leerDia(t, validar).lecturas;
  return { inicialTexto: l[0].texto, anteriorTexto: l.at(-1).texto, horas: new Set(l.map((x) => Math.floor(Date.parse(x.generada) / 3600000))) };
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
