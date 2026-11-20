// Pre-cálculos diarios (decisión del usuario, 20-nov-2026): Hugo deja listos la Lectura del día,
// el ranking de la jornada y el iceberg de la ventana ANTES de publicar los registros, para que el
// visor no repita el recorrido completo de las velas en cada visita. El paso corre dentro de la
// pasada de sincronización, después de las velas y los indicadores y antes del commit único: velas
// y pre-cálculos suben juntos y el visor nunca lee velas nuevas con lectura vieja.
//
// Carpetas (estructura creada y confirmada por el usuario, 20-nov-2026):
//   registros/pre-calculado/<stock|cripto>/lectura-dia-90d/<AAMMDD>_lectura-dia
//   registros/pre-calculado/<stock|cripto>/iceberg-90d/<AAMMDD_inicio>-<AAMMDD_fin>_iceberg
//   registros/ranking-24h/<stock|cripto>/<AAMMDD>_ranking-24h
// El nombre de la carpeta lleva la configuración (tipo de cálculo y duración): variantes como
// iceberg-60d o una futura escala horaria (90h, solo prevista) conviven sin cambiar código.
//
// Ventana (decisión del usuario, 20-nov-2026): una DURACIÓN (cantidad + unidad), con corte común
// al final de la última vela UTC cerrada e inicio = corte − (duración − 1): 90 días cuentan ambos
// extremos (19-nov menos 89 días = 22-ago, el ejemplo confirmado); los huecos del registro no
// desplazan el inicio. Un archivo por día y mercado y cálculo, conservado sin sobrescribir el del
// día anterior; el nombre lleva los extremos REALES del período calculado.
//
// Definiciones (decisión del usuario, 20-nov-2026): en la barra y en el ranking el cero cuenta
// como verde («solo es pérdida o no»: rojo si cierra por debajo de su apertura, verde si cierra
// igual o por encima; sin tercera categoría). Las métricas de la Lectura del día (racha, variación
// acumulada, G/P y cambios de dirección) son las mismas definiciones de la vista Variación,
// calculadas sobre la ventana y no sobre el historial completo. El orden usa siempre el valor
// completo, nunca el redondeado de mostrar. Nada se inventa ni se rellena: un día sin velas no
// tiene fila y un activo sin velas en la ventana no aparece.
import fs from 'node:fs';
import path from 'node:path';
import { CLASES, EXCLUIDOS } from './activos.mjs';
import { DIA, PISO_DIA, aammDe } from './indicadores.mjs';
import { leerIceberg } from './iceberg.mjs';
import { resumir, razonVariacion, cambiosDireccion } from '../../visor-rachas-datos.mjs';

export const UNIDADES = { d: DIA }; // días; la escala horaria (90h) queda solo prevista
export const CALCULOS = [
  { carpeta: 'lectura-dia-90d', calculo: 'lectura-dia', cantidad: 90, unidad: 'd' },
  { carpeta: 'iceberg-90d', calculo: 'iceberg', cantidad: 90, unidad: 'd' },
];
export const CARPETA_RANKING = 'ranking-24h';

export const RUTA_PRE = /^registros\/pre-calculado\/(stock|cripto)\/(lectura-dia|iceberg)-(\d+)([a-z])\/([0-9a-zA-Z-]+)_(lectura-dia|iceberg)$/;
export const RUTA_RANKING = /^registros\/ranking-24h\/(stock|cripto)\/\d{6}_ranking-24h$/;
export const esRutaPre = (rel) => RUTA_PRE.test(rel) || RUTA_RANKING.test(rel);

const aammddDe = (ts) => new Date(ts).toISOString().slice(2, 10).replace(/-/g, '');

// Extremos reales de la ventana: fin = último día UTC cerrado; inicio = fin − (duración − 1), sin
// bajar del piso del registro (los huecos no desplazan el inicio).
export function ventana(ahora, cantidad, unidad) {
  const paso = UNIDADES[unidad];
  if (!paso || !Number.isInteger(cantidad) || cantidad < 1) throw Error('Ventana no válida');
  const fin = Math.floor(ahora / DIA) * DIA - DIA;
  return { inicio: Math.max(fin - (cantidad - 1) * paso, PISO_DIA), fin };
}

// Lee las velas locales de un mercado: Map(código → filas ordenadas dentro del piso y el corte).
// Mismo recorrido que el iceberg: registros/velas-24h/<clase>/<ACTIVO>/<AAMM>_<ACTIVO>.
function leerMercado(dirVelas, clase, corte) {
  const mercado = new Map();
  const dirClase = path.join(dirVelas, clase);
  let activos = [];
  try { activos = fs.readdirSync(dirClase, { withFileTypes: true }); } catch { return mercado; }
  for (const a of activos) {
    if (!a.isDirectory() || (clase === 'cripto' && EXCLUIDOS.has(a.name))) continue;
    const dirActivo = path.join(dirClase, a.name);
    const filas = [];
    for (const n of fs.readdirSync(dirActivo)) {
      const m = n.match(/^(\d{4})_(.+)$/);
      if (!m || m[2] !== a.name) continue;
      let mes;
      try { mes = JSON.parse(fs.readFileSync(path.join(dirActivo, n), 'utf8')); } catch { continue; }
      if (!Array.isArray(mes)) continue;
      for (const f of mes) {
        if (!Array.isArray(f) || f.length < 5) continue;
        const ts = Number(f[0]);
        if (!Number.isSafeInteger(ts) || ts % DIA !== 0 || ts < PISO_DIA || ts >= corte) continue;
        filas.push(f);
      }
    }
    if (filas.length) mercado.set(a.name, filas.sort((x, y) => x[0] - y[0]));
  }
  return mercado;
}

// Escritura atómica y sin pisar (la regla del registro): idéntico → 'igual'; distinto ya
// existente → 'conflicto' y no se toca; nuevo → 'escrito'.
function escribirPre(destino, texto) {
  if (fs.existsSync(destino)) {
    return fs.readFileSync(destino, 'utf8') === texto ? 'igual' : 'conflicto';
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const tmp = destino + '.tmp';
  fs.writeFileSync(tmp, texto);
  fs.renameSync(tmp, destino);
  return 'escrito';
}

// --- Validadores de los archivos publicados (descarga y subida los exigen, como el registro) ---

// Lectura del día: { corte, ventana: { cantidad, unidad, inicio, fin }, activos: { CODIGO: métricas } }.
export function leerLectura(texto) {
  let datos;
  try { datos = JSON.parse(texto); } catch { throw new Error('Lectura del día ilegible.'); }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error('Lectura del día con forma inesperada.');
  const v = datos.ventana || {};
  if (!Number.isInteger(v.cantidad) || !UNIDADES[v.unidad]) throw new Error('Ventana de la lectura no válida.');
  for (const ts of [datos.corte, v.inicio, v.fin]) {
    if (!Number.isSafeInteger(ts) || ts % DIA !== 0 || ts < PISO_DIA) throw new Error('Fecha de la lectura fuera de forma.');
  }
  if (v.inicio > v.fin) throw new Error('Ventana de la lectura invertida.');
  if (!datos.activos || typeof datos.activos !== 'object' || Array.isArray(datos.activos)) throw new Error('Lectura sin lista de activos.');
  for (const [cod, m] of Object.entries(datos.activos)) {
    if (!m || typeof m !== 'object') throw new Error(`Métricas de ${cod} con forma inesperada.`);
    if (!Number.isSafeInteger(m.fecha) || m.fecha % DIA !== 0) throw new Error(`Fecha de ${cod} fuera de forma.`);
    if (!Number.isSafeInteger(m.dias) || m.dias < 0 || ![1, -1, 0].includes(m.direccion)) throw new Error(`Racha de ${cod} fuera de forma.`);
    if (m.direccion === 0 && m.dias !== 0) throw new Error(`Racha de ${cod} fuera de forma.`); // sin dirección solo con racha 0 (última vela plana)
    for (const k of ['acumulado', 'rango', 'variacion', 'cambios']) {
      if (typeof m[k] !== 'number' || Number.isNaN(m[k])) throw new Error(`Métrica ${k} de ${cod} fuera de forma.`);
    }
    // gp es null cuando la ventana no tuvo días rojos (la razón tiende a infinito y JSON no la guarda).
    if (m.gp !== null && (typeof m.gp !== 'number' || Number.isNaN(m.gp))) throw new Error(`Métrica gp de ${cod} fuera de forma.`);
  }
  return datos;
}

// Ranking de la jornada: [[CODIGO, variacionDelDia], ...] ordenado por variación completa,
// de la mayor caída a la mayor subida. Cada activo ocupa una posición única, sin ambigüedad
// (decisión del usuario, 20-nov-2026): el puesto es su lugar en la lista y un empate exacto en
// la variación se ordena por código.
export function leerRanking(texto) {
  let datos;
  try { datos = JSON.parse(texto); } catch { throw new Error('Ranking ilegible.'); }
  if (!Array.isArray(datos)) throw new Error('Ranking con forma inesperada; no es una lista.');
  let previo = -Infinity, codPrevio = '';
  for (const f of datos) {
    if (!Array.isArray(f) || f.length !== 2 || typeof f[0] !== 'string' || !f[0]) throw new Error('Fila de ranking con forma inesperada.');
    if (typeof f[1] !== 'number' || !Number.isFinite(f[1])) throw new Error('Variación de ranking fuera de forma.');
    if (f[1] < previo || (f[1] === previo && f[0] <= codPrevio)) throw new Error('Ranking desordenado.');
    previo = f[1]; codPrevio = f[0];
  }
  return datos;
}

// Valida un archivo pre-calculado según la carpeta de su ruta, para la sincronización.
export function validarPre(buf, rel) {
  const texto = String(buf);
  if (RUTA_RANKING.test(rel)) return leerRanking(texto).length;
  const m = rel.match(RUTA_PRE);
  if (!m) throw new Error('Ruta de pre-cálculo no reconocida.');
  if (m[2] !== m[6]) throw new Error('Nombre de pre-cálculo incoherente con su carpeta.');
  const forma = m[2] === 'iceberg' ? /^\d{6}-\d{6}$/ : /^\d{6}$/;
  if (!forma.test(m[5])) throw new Error('Nombre de pre-cálculo incoherente con su carpeta.');
  return m[2] === 'iceberg' ? leerIceberg(texto).length : leerLectura(texto).corte;
}

// --- Los tres cálculos ---

// Lectura del día: las métricas de la vista Variación por activo, sobre la ventana.
export function calcularLectura(mercado, { inicio, fin }, cantidad, unidad) {
  const activos = {};
  for (const [cod, filas] of mercado) {
    const tramo = filas.filter((f) => f[0] >= inicio && f[0] <= fin);
    if (!tramo.length) continue;
    const r = resumir(tramo);
    const gp = razonVariacion(tramo).razon;
    activos[cod] = {
      fecha: r.fecha, dias: r.dias, direccion: r.direccion, acumulado: r.acumulado,
      limitada: r.limitada, motivo: r.motivo, rango: r.rango, variacion: r.variacion,
      gp: Number.isFinite(gp) ? gp : null, cambios: cambiosDireccion(tramo),
    };
  }
  return { corte: fin, ventana: { cantidad, unidad, inicio, fin }, activos };
}

// Ranking de la jornada: variación del día (cierre frente a apertura) de cada activo con vela
// ese día, de la mayor caída a la mayor subida. Las planas (0 %) son un valor ordinario entre
// rojos y verdes, y cada puesto es único: el empate exacto se ordena por código (decisiones del
// usuario, 20-nov-2026).
export function calcularRanking(mercado, dia) {
  const filas = [];
  for (const [cod, reg] of mercado) {
    const vela = reg.find((f) => f[0] === dia);
    if (!vela) continue;
    filas.push([cod, (Number(vela[4]) / Number(vela[1]) - 1) * 100]);
  }
  return filas.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
}

// Iceberg de la ventana con la regla vigente (decisión del usuario, 20-nov-2026): verde si el
// cierre iguala o supera la apertura, rojo si queda por debajo; cada día sin velas queda sin fila.
export function calcularIcebergVentana(mercado, { inicio, fin }) {
  const porDia = new Map();
  for (const filas of mercado.values()) {
    for (const f of filas) {
      const ts = Number(f[0]);
      if (ts < inicio || ts > fin) continue;
      const apertura = Number(f[1]), cierre = Number(f[4]);
      if (!Number.isFinite(apertura) || !Number.isFinite(cierre)) continue;
      let dia = porDia.get(ts);
      if (!dia) { dia = [ts, 0, 0]; porDia.set(ts, dia); }
      if (cierre >= apertura) dia[1]++; else dia[2]++;
    }
  }
  return [...porDia.values()].sort((x, y) => x[0] - y[0]);
}

// El paso completo: los tres cálculos de cada mercado, un archivo por día y mercado. Devuelve una
// línea corta por cálculo para el reporte (etapa, mercado, período, resultado; archivo y error si
// falla). Nunca pisa un archivo distinto ya existente: lo anota como conflicto y sigue.
export function actualizarPreCalculos({ dirRaiz, ahora = Date.now() }) {
  const dirVelas = path.join(dirRaiz, 'velas-24h');
  const corte = Math.floor(ahora / DIA) * DIA;
  const lineas = [];
  for (const clase of CLASES) {
    const mercado = leerMercado(dirVelas, clase, corte);
    for (const { carpeta, calculo, cantidad, unidad } of CALCULOS) {
      const v = ventana(ahora, cantidad, unidad);
      const periodo = `${aammddDe(v.inicio)}-${aammddDe(v.fin)}`;
      try {
        let nombre, texto, datos = 0;
        if (calculo === 'iceberg') {
          nombre = `${periodo}_iceberg`;
          const serie = calcularIcebergVentana(mercado, v);
          datos = serie.length;
          if (datos) leerIceberg(JSON.stringify(serie));
          texto = JSON.stringify(serie) + '\n';
        } else {
          nombre = `${aammddDe(v.fin)}_lectura-dia`;
          const lectura = calcularLectura(mercado, v, cantidad, unidad);
          datos = Object.keys(lectura.activos).length;
          if (datos) leerLectura(JSON.stringify(lectura));
          texto = JSON.stringify(lectura) + '\n';
        }
        const estado = datos ? escribirPre(path.join(dirRaiz, 'pre-calculado', clase, carpeta, nombre), texto) : 'sin datos';
        lineas.push({ calculo: carpeta, mercado: clase, periodo, estado, archivo: `pre-calculado/${clase}/${carpeta}/${nombre}` });
      } catch (e) {
        lineas.push({ calculo: carpeta, mercado: clase, periodo, estado: 'error', error: e.message, archivo: `pre-calculado/${clase}/${carpeta}` });
      }
    }
    // Ranking de la última jornada cerrada: intervalo diario, no duración de ventana.
    const dia = corte - DIA;
    try {
      const nombre = `${aammddDe(dia)}_ranking-24h`;
      const ranking = calcularRanking(mercado, dia);
      if (ranking.length) leerRanking(JSON.stringify(ranking));
      const estado = ranking.length ? escribirPre(path.join(dirRaiz, CARPETA_RANKING, clase, nombre), JSON.stringify(ranking) + '\n') : 'sin datos';
      lineas.push({ calculo: `${CARPETA_RANKING} (${ranking.length} activos)`, mercado: clase, periodo: aammddDe(dia), estado, archivo: `${CARPETA_RANKING}/${clase}/${nombre}` });
    } catch (e) {
      lineas.push({ calculo: CARPETA_RANKING, mercado: clase, periodo: aammddDe(dia), estado: 'error', error: e.message, archivo: `${CARPETA_RANKING}/${clase}` });
    }
  }
  return { lineas };
}

// Lista local de archivos pre-calculados publicables: [{ rel, ruta, bytes }], para la comparación
// de la sincronización. Solo nombres con la forma acordada.
export function localesPre(dirRaiz) {
  const lista = [];
  const meter = (rel, ruta) => {
    let st;
    try { st = fs.lstatSync(ruta); } catch { return; }
    if (!st.isFile() || st.size === 0 || st.size > 5 * 1024 * 1024) return;
    lista.push({ rel, ruta, bytes: st.size });
  };
  for (const clase of CLASES) {
    for (const { carpeta, calculo } of CALCULOS) {
      const dir = path.join(dirRaiz, 'pre-calculado', clase, carpeta);
      let nombres = [];
      try { nombres = fs.readdirSync(dir); } catch { continue; }
      for (const n of nombres) {
        if (!n.endsWith(`_${calculo}`)) continue;
        const rel = `registros/pre-calculado/${clase}/${carpeta}/${n}`;
        if (esRutaPre(rel)) meter(rel, path.join(dir, n));
      }
    }
    const dirR = path.join(dirRaiz, CARPETA_RANKING, clase);
    let nombresR = [];
    try { nombresR = fs.readdirSync(dirR); } catch { continue; }
    for (const n of nombresR) {
      const rel = `registros/${CARPETA_RANKING}/${clase}/${n}`;
      if (RUTA_RANKING.test(rel)) meter(rel, path.join(dirR, n));
    }
  }
  return lista;
}

// Destino local de una ruta pre-calculada al bajar de GitHub.
export function destinoPre(dirRaiz, rel) {
  return path.join(dirRaiz, ...rel.split('/').slice(1));
}

