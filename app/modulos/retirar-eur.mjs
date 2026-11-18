import { EXCLUIDOS } from './exclusiones.mjs';
// Retirada local de activos excluidos solicitada: solo archivos propios de registros y graficas.
// La sincronizacion excluye estos activos antes de comparar, incluso si queda algo por revisar.
import fs from 'node:fs';
import path from 'node:path';
export function retirarExcluidos(base, graficas, codigos=EXCLUIDOS) {
  let quitados = 0;
  for (const codigo of codigos) for (const [raiz, patron] of [[base, new RegExp(`^\\d{4}_${codigo}$`, 'u')], [graficas, new RegExp(`^(${codigo}_radiografia\\.png|\\.${codigo}_radiografia\\.sha256)$`, 'u')]]) {
    const claseDir = path.join(raiz, 'cripto');
    try { if (!fs.lstatSync(claseDir).isDirectory() || fs.lstatSync(claseDir).isSymbolicLink()) throw Error('No pude retirar el activo excluido: carpeta de clase no normal.'); }
    catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    const dir = path.join(claseDir, codigo);
    let st;
    try { st = fs.lstatSync(dir); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    if (!st.isDirectory() || st.isSymbolicLink()) throw Error('No pude retirar el activo excluido: carpeta no normal.');
    const nombres = fs.readdirSync(dir);
    for (const n of nombres) {
      const p = path.join(dir, n);
      if (!patron.test(n) || !fs.lstatSync(p).isFile()) throw Error('No pude retirar el activo excluido: hay archivos no reconocidos; revisar antes de borrar.');
    }
    for (const n of nombres) { fs.unlinkSync(path.join(dir, n)); quitados++; }
    fs.rmdirSync(dir);
  }
  return quitados;
}

export const retirarEUR = (base, graficas) => retirarExcluidos(base, graficas, ['EUR']);
