// Iceberg: el primer indicador propio de Hugo (decisión del usuario, 20-nov-2026, «hagamos eso»).
// Por cada día cerrado en UTC cuenta cuántos activos del registro cerraron en alza y cuántos a
// la baja: una barra por día con su trozo verde y su trozo rojo. Una serie por mercado
// (decisión del usuario, 20-nov-2026: experiencia separada por mercado): registros/iceberg-stock
// y registros/iceberg-cripto, como hermanas de las velas y de las demás series. Una vela plana
// (apertura igual al cierre) no cuenta en ninguno de los dos lados, la misma regla que la
// columna C de la vista Variación. Un día sin velas de ese mercado no tiene fila: huecos
// visibles, nunca se rellenan ni se inventan datos, la misma regla del Fear & Greed de bolsa. Cada fila: [ts del día a las 00:00 UTC, subieron,
// bajaron]. Mismo piso del registro (1-ago-2026) y mismo corte: el día UTC en curso nunca
// entra, porque su vela aún no cierra.
// El módulo es independiente a propósito (decisión del usuario, 20-nov-2026): se puede ejecutar
// a mano para probar («haz la lectura») y DESPUÉS el mismo módulo encaja en la sincronización
// diaria, sin una segunda versión del cálculo. Esa conexión y la carpeta definitiva quedaron
// pendientes de cuando vuelva la luz; aquí solo vive el cálculo y su escritura.
import fs from 'node:fs';
import path from 'node:path';
import { CLASES, EXCLUIDOS } from './activos.mjs';
import { DIA, PISO_DIA, aammDe } from './indicadores.mjs';

export const SERIES_ICEBERG = { stock: 'iceberg-stock', cripto: 'iceberg-cripto' };
export const ARCHIVO_ICEBERG = /^\d{4}$/;

// Cuenta un mes de velas de un activo dentro del acumulado día a día.
// Fila de vela: [aperturaMs, apertura, máximo, mínimo, cierre, ...] con precios en texto.
function acumularMes(filas, corte, porDia) {
  for (const f of filas) {
    if (!Array.isArray(f) || f.length < 5) continue;
    const ts = Number(f[0]);
    if (!Number.isFinite(ts) || ts % DIA !== 0 || ts < PISO_DIA || ts >= corte) continue;
    const apertura = Number(f[1]), cierre = Number(f[4]);
    if (!Number.isFinite(apertura) || !Number.isFinite(cierre)) continue;
    if (cierre === apertura) continue; // plana: no cuenta ni arriba ni abajo
    let dia = porDia.get(ts);
    if (!dia) { dia = [ts, 0, 0]; porDia.set(ts, dia); }
    if (cierre > apertura) dia[1]++; else dia[2]++;
  }
}

// Recorre registros/velas-24h/<clase>/<ACTIVO>/<AAMM>_<ACTIVO> y devuelve la serie ordenada
// [[ts, subieron, bajaron], ...] desde el piso hasta el último día UTC cerrado. Con clase se
// limita a ese mercado; sin clase cuenta todo el registro.
export function calcularIceberg(dirVelas, ahora = Date.now(), clase = null) {
  const corte = Math.floor(ahora / DIA) * DIA;
  const porDia = new Map();
  for (const cl of CLASES) {
    if (clase && cl !== clase) continue;
    const dirClase = path.join(dirVelas, cl);
    let activos = [];
    try { activos = fs.readdirSync(dirClase, { withFileTypes: true }); } catch { continue; }
    for (const a of activos) {
      if (!a.isDirectory() || (cl === 'cripto' && EXCLUIDOS.has(a.name))) continue;
      const dirActivo = path.join(dirClase, a.name);
      for (const n of fs.readdirSync(dirActivo)) {
        const m = n.match(/^(\d{4})_(.+)$/);
        if (!m || m[2] !== a.name) continue;
        let filas;
        try { filas = JSON.parse(fs.readFileSync(path.join(dirActivo, n), 'utf8')); } catch { continue; }
        if (!Array.isArray(filas)) continue;
        acumularMes(filas, corte, porDia);
      }
    }
  }
  return [...porDia.values()].sort((x, y) => x[0] - y[0]);
}

// Valida la forma de una serie leída de disco o a punto de escribirse.
export function leerIceberg(texto) {
  let datos;
  try { datos = JSON.parse(texto); } catch { throw new Error('Serie iceberg ilegible.'); }
  if (!Array.isArray(datos)) throw new Error('La serie iceberg no es una lista.');
  let previo = -1;
  for (const f of datos) {
    if (!Array.isArray(f) || f.length !== 3) throw new Error('Fila iceberg con forma inesperada.');
    const [ts, sub, baj] = f;
    if (!Number.isInteger(ts) || ts % DIA !== 0) throw new Error('Fecha iceberg no alineada al día UTC.');
    if (ts < PISO_DIA) throw new Error('Fecha iceberg anterior al piso del registro.');
    if (!Number.isInteger(sub) || sub < 0 || !Number.isInteger(baj) || baj < 0) throw new Error('Conteo iceberg fuera de rango.');
    if (ts <= previo) throw new Error('Fechas iceberg repetidas o desordenadas.');
    previo = ts;
  }
  return datos;
}

// Escribe la serie partida por mes (registros/iceberg/<AAMM>), atómica y sin tocar lo que ya
// dice lo mismo. Devuelve los nombres de archivo escritos.
export function escribirIceberg(dirSalida, puntos) {
  leerIceberg(JSON.stringify(puntos));
  const porMes = new Map();
  for (const f of puntos) {
    const aamm = aammDe(f[0]);
    if (!porMes.has(aamm)) porMes.set(aamm, []);
    porMes.get(aamm).push(f);
  }
  fs.mkdirSync(dirSalida, { recursive: true });
  const escritos = [];
  for (const [aamm, filas] of [...porMes.entries()].sort()) {
    const destino = path.join(dirSalida, aamm);
    const texto = JSON.stringify(filas) + '\n';
    if (fs.existsSync(destino) && fs.readFileSync(destino, 'utf8') === texto) continue;
    const tmp = destino + '.tmp';
    fs.writeFileSync(tmp, texto);
    fs.renameSync(tmp, destino);
    escritos.push(aamm);
  }
  return escritos;
}
