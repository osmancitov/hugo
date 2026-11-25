// Serie de la Campaña 90d: junta los archivos diarios `<inicio>-<fin>_carrera-90d` en un solo archivo
// compacto que lee el visor (una lectura en vez de decenas). Solo reordena datos ya calculados:
// no recalcula puestos, potencia ni constancia. Un activo sin punto ese día (no clasificado) queda en null.
import fs from 'node:fs';
import path from 'node:path';

export const VENTANAS = [90, 60, 30];
export const sufijo = (n = 90) => `_carrera-${n}d`;
export const archivoSerie = (n = 90) => 'serie' + sufijo(n);
export const MAX_PUNTOS = 90;
export const SUFIJO = sufijo(90);
export const ARCHIVO_SERIE = archivoSerie(90);

export function construirSerie(dir, n = 90) {
  const archivos = fs.readdirSync(dir).filter((f) => new RegExp(`^\\d{6}-\\d{6}${sufijo(n)}$`).test(f)).sort((a, b) => a.slice(7, 13).localeCompare(b.slice(7, 13)));
  if (archivos.length > MAX_PUNTOS) archivos.splice(0, archivos.length - MAX_PUNTOS); // las gráficas muestran los últimos 90 puntos
  if (!archivos.length) throw Error(`Sin archivos de carrera ${n}d`);
  const dias = archivos.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const fechas = dias.map((d) => d.carrera.ventana.fin);
  const activos = {};
  dias.forEach((d, i) => {
    for (const a of d.clasificados) {
      (activos[a.id] ||= new Array(dias.length).fill(null))[i] = [a.puesto, a.potencia, a.constancia];
    }
  });
  return { carrera: { ventana: n, unidad: 'd', punto: '[puesto, potencia, constancia]; null = sin las 90 velas ese día' }, fechas, ultimo: archivos.at(-1), activos };
}

export function escribirSerie(dir, n = 90) {
  const s = construirSerie(dir, n);
  fs.writeFileSync(path.join(dir, archivoSerie(n)), JSON.stringify(s) + '\n');
  return s;
}
