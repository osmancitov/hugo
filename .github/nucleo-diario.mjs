// Paso diario del VIP núcleo 54 campañas, de 7 a 60 días (nucleo.mjs): tras la ingesta y la campaña, calcula el núcleo
// del último día cerrado para stock y cripto, lo guarda en registros/nucleo/<mercado>/ y lo sube en un commit
// (autor y committer Osmancito). Debe correr antes del canónico y de la lectura horaria, que lo leen.
// Idempotente: si el cierre ya tiene núcleo no cambia nada. Sin núcleo válido el paso falla a la vista.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { escribirNucleo } from '../app/modulos/nucleo.mjs';
import { ultimoCerrado } from '../app/modulos/ciclo-diario.mjs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const id = ['-c', 'user.name=Osmancito', '-c', 'user.email=osmanvielma@gmail.com'];
const raiz = path.join(process.cwd(), 'registros');
git('fetch', '--quiet', 'origin', 'main');
git('checkout', '--quiet', '--force', '-B', 'main', 'origin/main');
const cierre = ultimoCerrado(Date.now());
for (const mercado of ['stock', 'cripto']) {
  const j = escribirNucleo({ raiz, mercado, cierre });
  console.log(`Núcleo ${mercado} del cierre ${j.cierre}: ${j.nucleo.length} activos (${j.nucleo.join(', ')}).`);
}
git('add', 'registros/nucleo');
if (!git('status', '--porcelain', 'registros/nucleo')) { console.log('Núcleo: sin cambios que registrar.'); process.exit(0); }
git(...id, 'commit', '--quiet', '--author=Osmancito <osmanvielma@gmail.com>', '-m', `VIP núcleo 54 campañas: cierre ${new Date(cierre).toISOString().slice(0, 10)}`);
for (let i = 1; ; i++) {
  try { git('push', 'origin', 'HEAD:main'); break; } catch (e) {
    if (i >= 5) throw e;
    git('fetch', '--quiet', 'origin', 'main');
    git(...id, 'rebase', 'origin/main');
  }
}
console.log('Núcleo publicado.');
