// Carrera 90d de cada día cerrado, con potencia, constancia y grupo (Campaña). Una sola fuente de reglas:
// los puestos salen de prepararPersistenciaGlobal (la misma carrera del visor) y las velas se validan con
// validarMes. Un archivo por día `<inicio>-<fin>_carrera-90d`, que nunca se reescribe si ya existe.
// Clasificado = las 90 velas de la ventana. Sin denominador (ni días a la baja) no se inventa nada: se detiene.
import fs from 'node:fs';
import path from 'node:path';
import { prepararPersistenciaGlobal } from './persistencia.mjs';
import { validarMes } from './visor-rachas-datos.mjs';
import { escribirSerie, SUFIJO } from './campana-serie.mjs';

export const DIA = 86400000;
export const PRIMERA_CARRERA = Date.UTC(2026, 9, 29); // primera ventana de 90 días completa desde el 1-ago-2026
export const PISO = Date.UTC(2026, 7, 1);
const d = (ms) => new Date(ms).toISOString().slice(0, 10);
const c6 = (ms) => d(ms).slice(2).replace(/-/g, '');
export const nombreCarrera = (fin) => `${c6(Math.max(PISO, fin - 89 * DIA))}-${c6(fin)}${SUFIJO}`;

const ENCABEZADO = (ini, fin) => ({
  ventana: { inicio: d(ini), fin: d(fin), cantidad: 90, unidad: 'd' },
  dia_primera_carrera_90d: d(PRIMERA_CARRERA),
  clasificados: 'activos con las 90 carreras de la ventana (90 de 90 días con vela)',
  coeficientes: { potencia: 'suma de variaciones diarias positivas / |suma de variaciones diarias negativas|; variación diaria = cierre/apertura-1, en %', constancia: 'días con variación>0 / días con variación<0 (los de 0 exacto no cuentan en ninguno)', corte: '>=1' },
  grupos: { premium: 'potencia>=1 y constancia>=1', potentes: 'potencia>=1 y constancia<1', constantes: 'constancia>=1 y potencia<1', rezagados: 'potencia<1 y constancia<1' },
  estado_reglas_grupos: 'Confirmado por el usuario (Slack 1795567441.535389 y 1795567481.623419): premium ambos>=1; potentes potencia>=1 y constancia<1; constantes constancia>=1 y potencia<1; rezagados ambos<1.',
});

export function grupoDe(potencia, constancia) {
  return potencia >= 1 && constancia >= 1 ? 'premium' : potencia >= 1 ? 'potentes' : constancia >= 1 ? 'constantes' : 'rezagados';
}

// Escribe en `salida` los días que faltan entre PRIMERA_CARRERA y `hasta` (ms UTC del último día cerrado).
export function generarCarreras({ raiz, hasta, salida = path.join(raiz, 'registros', 'categorias') }) {
  const faltan = [];
  for (let fin = PRIMERA_CARRERA; fin <= hasta; fin += DIA) if (!fs.existsSync(path.join(salida, nombreCarrera(fin)))) faltan.push(fin);
  if (!faltan.length) return { escritos: [] };
  fs.mkdirSync(salida, { recursive: true });
  const cat = Object.fromEntries(['stock', 'cripto'].map((m) => [m, JSON.parse(fs.readFileSync(path.join(raiz, 'registros/catalogo', m), 'utf8'))]));
  const leerMes = (m, a, mes) => JSON.parse(fs.readFileSync(path.join(raiz, 'registros/velas-24h', m, a.codigo, `${mes}_${a.codigo}`), 'utf8'));
  const rets = new Map();
  for (const m of ['stock', 'cripto']) for (const a of cat[m].activos) {
    const mapa = new Map();
    for (const mes of a.meses) for (const v of leerMes(m, a, mes)) if (Number(v[1]) > 0 && Number(v[4]) > 0) mapa.set(v[0], (Number(v[4]) / Number(v[1]) - 1) * 100);
    rets.set(m + ':' + a.codigo, mapa);
  }
  const escritos = [];
  for (const fin of faltan) {
    const ini = Math.max(PISO, fin - 89 * DIA), corte = fin + DIA, entradas = [];
    for (const m of ['stock', 'cripto']) for (const a of cat[m].activos) {
      const filas = [];
      for (const mes of a.meses) {
        const y = 2000 + Number(mes.slice(0, 2)), mm = Number(mes.slice(2));
        const desde = Date.UTC(y, mm - 1, 1), hasta2 = Date.UTC(y, mm, 1);
        if (hasta2 <= ini || desde > fin) continue;
        const datos = leerMes(m, a, mes).filter((f) => f[0] < corte);
        if (datos.length) filas.push(...validarMes(datos, mes, corte)); // un mes sin velas aún no participa
      }
      entradas.push({ activo: { ...a, clase: m }, filas });
    }
    const lst = prepararPersistenciaGlobal(entradas, { inicio: ini, fin });
    const clasif = [], fuera = [];
    lst.global.forEach(({ id, sumaPuestos, carreras, promedio }, i) => {
      const mapa = rets.get(id); let pos = 0, neg = 0, dp = 0, dn = 0, n = 0;
      for (let t = ini; t <= fin; t += DIA) { if (!mapa.has(t)) continue; n++; const r = mapa.get(t); if (r > 0) { pos += r; dp++; } else if (r < 0) { neg += r; dn++; } }
      if (n !== carreras) throw Error(`Las carreras no cuadran para ${id} el ${d(fin)}`);
      if (carreras !== 90) { fuera.push({ id, carreras }); return; }
      if (!dn || !neg) throw Error(`Sin días a la baja para ${id} el ${d(fin)}: no hay denominador y no se inventa regla`);
      const potencia = pos / Math.abs(neg), constancia = dp / dn;
      clasif.push({ puesto: i + 1, id, carreras, sumaPuestos, promedio: +promedio.toFixed(4), cumple90: true, potencia: +potencia.toFixed(4), constancia: +constancia.toFixed(4), grupo: grupoDe(potencia, constancia) });
    });
    clasif.sort((a, b) => (a.grupo < b.grupo ? -1 : a.grupo > b.grupo ? 1 : a.promedio - b.promedio));
    const f = path.join(salida, nombreCarrera(fin));
    fs.writeFileSync(f + '.tmp', JSON.stringify({ carrera: ENCABEZADO(ini, fin), clasificados: clasif, no_clasificados: fuera }) + '\n');
    fs.renameSync(f + '.tmp', f);
    escritos.push(path.basename(f));
  }
  escribirSerie(salida);
  return { escritos };
}
