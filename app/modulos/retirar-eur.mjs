// Retirada local de EUR solicitada: solo archivos propios de registros y graficas.
// La sincronizacion excluye fiat antes de comparar, incluso si queda algo por revisar.
import fs from 'node:fs';
import path from 'node:path';
export function retirarEUR(base, graficas) {
  let quitados = 0;
  for (const [raiz, patron] of [[base, /^\d{4}_EUR$/], [graficas, /^(EUR_radiografia\.png|\.EUR_radiografia\.sha256)$/]]) {
    const claseDir = path.join(raiz, 'cripto');
    try { if (!fs.lstatSync(claseDir).isDirectory() || fs.lstatSync(claseDir).isSymbolicLink()) throw Error('No pude retirar EUR: carpeta de clase no normal.'); }
    catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    const dir = path.join(claseDir, 'EUR');
    let st;
    try { st = fs.lstatSync(dir); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    if (!st.isDirectory() || st.isSymbolicLink()) throw Error('No pude retirar EUR: carpeta no normal.');
    const nombres = fs.readdirSync(dir);
    for (const n of nombres) {
      const p = path.join(dir, n);
      if (!patron.test(n) || !fs.lstatSync(p).isFile()) throw Error('No pude retirar EUR: hay archivos no reconocidos; revisar antes de borrar.');
    }
    for (const n of nombres) { fs.unlinkSync(path.join(dir, n)); quitados++; }
    fs.rmdirSync(dir);
  }
  return quitados;
}
