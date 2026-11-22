// Cola intradiaria de las corridas de Actions, compartida por la toma
// (lectura-horaria.mjs) y la publicación (recombinar-horaria.mjs).
// Regla de coexistencia con la Debian: el remoto manda por hora. Al combinar la
// cola con origin/main recién traído, una lectura pendiente cuya hora el remoto
// ya cubre se retira de la cola; nunca se pisa lo publicado. La cola y la pausa
// 429 viajan en la caché de Actions (.estado-intradia), como en la Debian en disco.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { RUTA_BARRA } from '../app/modulos/barra-movil.mjs';
import { pendientesIntradia, combinarIntradiaPorHora, reconstruirIndice } from '../app/modulos/registro-intradia.mjs';
import { leerIndice, RUTA_INDICE } from '../app/modulos/intradia-datos.mjs';
import { guardarEstado } from '../app/modulos/registro-motor.mjs';

export const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'registros');
export const REPO = path.join(RAIZ, '..');
export const COLA = path.join(RAIZ, '..', '.estado-intradia');
export const COLA_JSON = path.join(COLA, 'pendientes.json');
const ex = promisify(execFile);
const git = async (args) => (await ex('git', args, { cwd: REPO, timeout: 60000 })).stdout;

export const salida = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); console.log(`${k}=${v}`); };
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
export const leerOpcional = (r) => { try { return fs.readFileSync(r, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };

export const traerRemoto = () => git(['fetch', '--quiet', 'origin', 'main']);
export async function leerRemoto(rel) {
  try { return await git(['show', `origin/main:${rel}`]); }
  catch { return null; }
}
export async function ultimaRemota() {
  const indice = await leerRemoto(RUTA_INDICE);
  if (indice === null) return null;
  try { return Date.parse(leerIndice(indice).ultima); } catch { return null; }
}

// Materializa la cola COMBINADA con origin/main (no con la copia de trabajo, que
// puede ser más vieja). Prioridad del remoto por hora: una lectura pendiente cuya
// hora el remoto ya cubre se retira de la cola. Se llama antes de cada intento de
// publicación, así un avance del remoto entre intentos nunca reintroduce lecturas.
export async function materializarCola() {
  const pendientes = pendientesIntradia(RAIZ);
  if (!Object.keys(pendientes).length) return {};
  const resultado = {};
  for (const [rel, texto] of Object.entries(pendientes)) {
    if (rel === RUTA_INDICE) continue; // se reconstruye abajo
    const r = combinarIntradiaPorHora(rel, texto, await leerRemoto(rel));
    if (r.retiradas.length) console.log(`El remoto ya cubre ${r.retiradas.length} lectura(s) pendiente(s) (${r.retiradas.join(', ')}); las retiro de la cola (el remoto manda por hora).`);
    resultado[rel] = r.texto;
  }
  // Índice coherente con lo conservado: unión de días y última más reciente entre
  // remoto y cola filtrada. Si la cola no aporta nada, queda el índice del remoto.
  const indice = reconstruirIndice(resultado, await leerRemoto(RUTA_INDICE));
  if (indice !== null) resultado[RUTA_INDICE] = indice;
  guardarEstado(COLA_JSON, { version: 1, archivos: resultado });
  for (const [rel, texto] of Object.entries(resultado)) guardarEstado(path.join(RAIZ, rel.slice('registros/'.length)), JSON.parse(texto));
  return resultado;
}
