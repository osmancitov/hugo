// Paso diario de la Campaña: tras la ingesta y la pasada de publicación (que dejan las velas en main),
// alinea el clon con main, genera los días de carrera 90d que falten (más la serie) y los sube en un
// commit (autor y committer Osmancito). Sin días nuevos no hace nada. Idempotente por contenido.
import { execFileSync } from 'node:child_process';
import { generarCarreras } from '../app/modulos/campana-carrera.mjs';
import { ultimoCerrado } from '../app/modulos/ciclo-diario.mjs';
import { escribirSerie, VENTANAS, archivoSerie } from '../app/modulos/campana-serie.mjs';
import path from 'node:path';
import fs from 'node:fs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const id = ['-c', 'user.name=Osmancito', '-c', 'user.email=osmanvielma@gmail.com'];
const raiz = process.cwd();
git('fetch', '--quiet', 'origin', 'main');
git('checkout', '--quiet', '--force', '-B', 'main', 'origin/main'); // las velas locales de la corrida ya viven en main
const hasta = ultimoCerrado(Date.now());
const escritos = VENTANAS.flatMap((ventana) => generarCarreras({ raiz, hasta, ventana }).escritos);
const serieDir = path.join(raiz, 'registros', 'categorias');
for (const v of VENTANAS) if (!fs.existsSync(path.join(serieDir, archivoSerie(v)))) escribirSerie(serieDir, v);
git('add', 'registros/categorias');
if (!git('status', '--porcelain', 'registros/categorias')) { console.log('Campaña: sin días nuevos que registrar.'); process.exit(0); }
git(...id, 'commit', '--quiet', '-m', `Campaña 90d: carrera de ${escritos.length ? [...new Set(escritos.map((n) => n.split('-')[1].slice(0, 6)))].join(', ') : 'serie'}`);
// La lectura horaria también sube a main: si la punta se movió, se rebasa y se reintenta (máx. 3 veces).
for (let i = 1; ; i++) {
  try { git('push', 'origin', 'HEAD:main'); break; } catch (e) {
    if (i >= 3) throw e;
    git('fetch', '--quiet', 'origin', 'main');
    git(...id, 'rebase', 'origin/main');
  }
}
console.log(`Campaña: ${escritos.length} día(s) nuevos subidos a main: ${escritos.join(', ') || 'solo serie'}.`);
