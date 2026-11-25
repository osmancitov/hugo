// Serie de la Campaña 90d: junta los archivos diarios `<inicio>-<fin>_carrera-90d` en un solo archivo
// compacto que lee el visor (una lectura en vez de decenas). Solo reordena datos ya calculados:
// no recalcula puestos, potencia ni constancia. Un activo sin punto ese día (no clasificado) queda en null.
import fs from 'node:fs';
import path from 'node:path';

export const SUFIJO = '_carrera-90d';
export const ARCHIVO_SERIE = 'serie' + SUFIJO;

export function construirSerie(dir) {
  const archivos = fs.readdirSync(dir).filter((f) => /^\d{6}-\d{6}_carrera-90d$/.test(f)).sort((a, b) => a.slice(7, 13).localeCompare(b.slice(7, 13)));
  if (!archivos.length) throw Error('Sin archivos de carrera 90d');
  const dias = archivos.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const fechas = dias.map((d) => d.carrera.ventana.fin);
  const activos = {};
  dias.forEach((d, i) => {
    for (const a of d.clasificados) {
      (activos[a.id] ||= new Array(dias.length).fill(null))[i] = [a.puesto, a.potencia, a.constancia];
    }
  });
  return { carrera: { ventana: 90, unidad: 'd', punto: '[puesto, potencia, constancia]; null = sin las 90 velas ese día' }, fechas, ultimo: archivos.at(-1), activos };
}

export function escribirSerie(dir) {
  const s = construirSerie(dir);
  fs.writeFileSync(path.join(dir, ARCHIVO_SERIE), JSON.stringify(s) + '\n');
  return s;
}
