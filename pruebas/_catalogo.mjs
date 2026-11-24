// Ayuda de pruebas: escribe registros/catalogo/<mercado> a partir de las carpetas de velas que
// ya existan bajo <dirRaiz>/velas-24h, como lo hace la pasada antes de los cálculos.
import fs from 'node:fs';
import path from 'node:path';

export function catalogoDeCarpetas(dirRaiz, { excluir = [] } = {}) {
  for (const clase of ['stock', 'cripto']) {
    const base = path.join(dirRaiz, 'velas-24h', clase);
    let codigos = [];
    try { codigos = fs.readdirSync(base).filter((c) => fs.statSync(path.join(base, c)).isDirectory() && !excluir.includes(c)); } catch {}
    if (!codigos.length) codigos = ['ZZZ']; // un mercado sin velas aun tiene catálogo (no vacío)
    fs.mkdirSync(path.join(dirRaiz, 'catalogo'), { recursive: true });
    fs.writeFileSync(path.join(dirRaiz, 'catalogo', clase), JSON.stringify({ mercado: clase, generado: 'prueba', activos: codigos.sort().map((codigo) => ({ codigo, nombre: codigo, meses: ['2611'] })) }));
  }
}
