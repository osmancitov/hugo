// Paso diario de la Campaña: tras la ingesta y la pasada de publicación (que dejan las velas en main),
// alinea el clon con main, genera los días de carrera 90d que falten (más la serie) y los sube en un
// commit (autor y committer Osmancito). Sin días nuevos no hace nada. Idempotente por contenido.
import { execFileSync } from 'node:child_process';
import { generarCarreras, DIA } from '../app/modulos/campana-carrera.mjs';
import { ultimoCerrado } from '../app/modulos/ciclo-diario.mjs';
import { escribirSerie } from '../app/modulos/campana-serie.mjs';
import path from 'node:path';
import fs from 'node:fs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const id = ['-c', 'user.name=Osmancito', '-c', 'user.email=osmanvielma@gmail.com'];
const raiz = process.cwd();
git('fetch', '--quiet', 'origin', 'main');
git('checkout', '--quiet', '--force', '-B', 'main', 'origin/main'); // las velas locales de la corrida ya viven en main
const hasta = ultimoCerrado(Date.now());
const { escritos } = generarCarreras({ raiz, hasta });
const serieDir = path.join(raiz, 'registros', 'categorias');
if (!escritos.length && !fs.existsSync(path.join(serieDir, 'serie_carrera-90d'))) escribirSerie(serieDir);
git('add', 'registros/categorias');
if (!git('status', '--porcelain', 'registros/categorias')) { console.log('Campaña: sin días nuevos que registrar.'); process.exit(0); }
git(...id, 'commit', '--quiet', '-m', `Campaña 90d: carrera de ${escritos.length ? escritos.map((n) => n.split('-')[1].slice(0, 6)).join(', ') : 'serie'}`);
git('push', 'origin', 'HEAD:main');
console.log(`Campaña: ${escritos.length} día(s) nuevos subidos a main: ${escritos.join(', ') || 'solo serie'}.`);
