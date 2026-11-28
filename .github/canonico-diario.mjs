// Paso diario del registro VIP horario: tras la campaña (que deja las categorías del cierre en main), reconstruye
// desde cero el día UTC recién cerrado de los VIP del núcleo (stock y cripto; antes del 27-nov-2026, la unión VIP 30/60/90) con velas de 1 h, 25 puntos
// (00:00 a 24:00). Escribe SOLO registros/intradia/<mercado>/canonico/<día>.json: nunca toca los archivos vivos de la
// lectura horaria, así que no hay archivo compartido con ella. Idempotente (si ya existe y es válido no hace nada).
// Uso: node .github/canonico-diario.mjs [--dia AAAA-MM-DD]
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vipAdmitidos, construirCanonico, MARGEN_TOMA_MS } from '../app/modulos/completar-vip.mjs';
import { diaUTC } from '../app/modulos/intradia-datos.mjs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const id = ['-c', 'user.name=Osmancito', '-c', 'user.email=osmanvielma@gmail.com'];
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'registros');
const i = process.argv.indexOf('--dia');
const dia = i > 0 ? process.argv[i + 1] : diaUTC(Date.parse(diaUTC(Date.now())) - 1); // el día UTC que acaba de cerrar
// El despacho de Google llega entre 00:05 y 00:14 UTC, antes de que la vela de 24:00 quede asentada:
// se espera el margen de toma en vez de fallar. Una espera de más de 30 min delataría un despacho fuera de horario.
const fin = Date.parse(dia) + 24 * 3600000;
const espera = fin + MARGEN_TOMA_MS - Date.now();
if (espera > 30 * 60000) throw Error(`El día ${dia} aún no está cerrado y falta más de media hora; no espero tanto.`);
if (espera > 0) {
  console.log(`El día ${dia} se da por cerrado a las ${new Date(fin + MARGEN_TOMA_MS).toISOString().slice(11, 16)} UTC; espero ${(espera / 60000).toFixed(1)} min.`);
  await new Promise((r) => setTimeout(r, espera + 5000));
}
git('fetch', '--quiet', 'origin', 'main');
git('checkout', '--quiet', '--force', '-B', 'main', 'origin/main');
const vip = vipAdmitidos(RAIZ);
const tocados = [];
for (const mercado of ['stock', 'cripto']) {
  const r = await construirCanonico({ raiz: RAIZ, mercado, dia, vip: vip[mercado] });
  console.log(`Canónico ${mercado} ${dia}: ${r.estado}, ${r.activos} activos${r.puntos ? `, ${r.puntos} puntos` : ''}${r.sinVela.length ? `, sin vela: ${r.sinVela.join(' ')}` : ''}`);
  if (r.estado !== 'existe') tocados.push(`registros/intradia/${mercado}/canonico/${dia}.json`);
}
if (!tocados.length) process.exit(0);
git('add', ...tocados);
git(...id, 'commit', '--quiet', '--author=Osmancito <osmanvielma@gmail.com>', '-m', `Registro VIP horario canónico del ${dia}`);
// Solo archivos propios: un rebase nunca choca con la lectura horaria (que escribe otros archivos).
for (let n = 1; ; n++) {
  try { git('push', 'origin', 'HEAD:main'); break; } catch (e) {
    if (n >= 5) throw e;
    git('fetch', '--quiet', 'origin', 'main');
    git(...id, 'rebase', 'origin/main');
  }
}
console.log(`Canónico ${dia} publicado.`);
