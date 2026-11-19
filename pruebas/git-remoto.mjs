// Remoto git de mentira para las pruebas de sincronizacion: un repo bare en un temporal,
// alcanzado por file://, con los archivos del registro que cada prueba quiera en main.
// El transporte es git de verdad (clone/fetch/push locales), sin red ni GitHub.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function crearRemoto(archivos = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-remoto-'));
  const bare = path.join(root, 'remoto.git');
  const trabajo = path.join(root, 'trabajo');
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Prueba', GIT_AUTHOR_EMAIL: 'p@p', GIT_COMMITTER_NAME: 'Prueba', GIT_COMMITTER_EMAIL: 'p@p' };
  const g = (args, cwd) => execFileSync('git', args, { cwd, env, maxBuffer: 64 * 1024 * 1024 });
  g(['init', '--bare', '--quiet', '--initial-branch=main', bare], root);
  g(['init', '--quiet', '--initial-branch=main', trabajo], root);
  g(['remote', 'add', 'origin', 'file://' + bare], trabajo);
  fs.writeFileSync(path.join(trabajo, 'README.md'), 'prueba\n');
  for (const [rel, contenido] of Object.entries(archivos)) {
    const p = path.join(trabajo, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, contenido);
  }
  g(['add', '-A'], trabajo);
  g(['commit', '--quiet', '-m', 'base'], trabajo);
  g(['push', '--quiet', 'origin', 'HEAD:main'], trabajo);
  return {
    url: 'file://' + bare,
    bare,
    root,
    // Contenido actual de main en el remoto: { ruta: texto }
    arbol() {
      const sal = g(['-c', 'core.quotePath=false', 'ls-tree', '-r', '--name-only', 'main'], bare).toString().trim().split('\n').filter(Boolean);
      const out = {};
      for (const r of sal) out[r] = g(['cat-file', 'blob', `main:${r}`], bare).toString();
      return out;
    },
    commits() { return g(['log', '--format=%H %an <%ae> %s', 'main'], bare).toString().trim().split('\n'); },
    // Un avance ajeno: otro clon empuja un commit a main (provoca non-fast-forward en la pasada).
    avanceAjeno(rel, contenido) {
      const otro = path.join(root, 'otro-' + Date.now());
      g(['clone', '--quiet', 'file://' + bare, otro], root);
      const p = path.join(otro, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, contenido);
      g(['add', '-A'], otro);
      g(['commit', '--quiet', '-m', 'ajeno'], otro);
      g(['push', '--quiet', 'origin', 'HEAD:main'], otro);
    },
    // El remoto deja de aceptar pushes (permisos), como un 403/422 de GitHub.
    bloquearEscritura() { fs.chmodSync(bare, 0o555); },
    desbloquearEscritura() { fs.chmodSync(bare, 0o755); },
    destruir() { try { fs.chmodSync(bare, 0o755); } catch { /* nunca se bloqueo */ } fs.rmSync(root, { recursive: true, force: true }); },
  };
}
