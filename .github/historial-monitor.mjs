// Paso diario del historial del Monitor (historial-monitor.mjs): agrega la jornada recién cerrada, con la lista
// del núcleo del cierre anterior y el rendimiento de la vela del día, y lo sube en un commit (autor y committer
// Osmancito). Debe correr después de nucleo-diario. Idempotente: no reescribe jornadas guardadas.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { actualizarHistorial, isoDia } from '../app/modulos/historial-monitor.mjs';
import { ultimoCerrado } from '../app/modulos/ciclo-diario.mjs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const id = ['-c', 'user.name=Osmancito', '-c', 'user.email=osmanvielma@gmail.com'];
const raiz = path.join(process.cwd(), 'registros');
git('fetch', '--quiet', 'origin', 'main');
git('checkout', '--quiet', '--force', '-B', 'main', 'origin/main');
const hasta = isoDia(ultimoCerrado(Date.now()));
for (const mercado of ['stock', 'cripto']) {
  const nuevos = actualizarHistorial({ raiz, mercado, hasta });
  console.log(`Historial ${mercado} hasta ${hasta}: ${nuevos.length} jornada(s) nueva(s)${nuevos.length ? ` (${nuevos[0]}${nuevos.length > 1 ? ' a ' + nuevos[nuevos.length - 1] : ''})` : ''}.`);
}
git('add', 'registros/historial-monitor');
if (!git('status', '--porcelain', 'registros/historial-monitor')) { console.log('Historial del Monitor: sin cambios que registrar.'); process.exit(0); }
git(...id, 'commit', '--quiet', '--author=Osmancito <osmanvielma@gmail.com>', '-m', `Historial del Monitor: jornadas hasta ${hasta}`);
for (let i = 1; ; i++) {
  try { git('push', 'origin', 'HEAD:main'); break; } catch (e) {
    if (i >= 5) throw e;
    git('fetch', '--quiet', 'origin', 'main');
    git(...id, 'rebase', 'origin/main');
  }
}
console.log('Historial del Monitor publicado.');
