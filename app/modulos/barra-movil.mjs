// Modulo barra movil: «@Hugo barra» consulta a Binance el ticker de 24 h de los stocks y
// dibuja la frontera suben/bajan de la ventana MOVIL (las ultimas 24 h hasta el instante de
// la consulta, no el dia cerrado en UTC que cuenta el iceberg). Nace del estudio horario de
// candidatos (decision del usuario, 20-nov-2026: dos tandas equilibradas, menor proceso y
// recursos, sin construir un registro propio ni reconstruir nada; la barra acompana al
// iceberg de stocks para ver moverse la frontera durante el dia).
//
// Una sola consulta por tanda al endpoint /api/v3/ticker/24hr con la lista de simbolos
// (documentacion oficial de Binance: maximo 100 simbolos por consulta; la ventana es movil
// y la cierra Binance al responder, sin endTime propio). La particion es estable: universo
// ordenado, mitad y mitad (113 -> 57 + 56); cada activo consulta siempre en su tanda.
//
// Regla del plano: la misma del iceberg publicado (decision del usuario, 20-nov-2026: «solo
// es perdida o no», sin tercera categoria): lastPrice >= openPrice cuenta como sube.
// Ojo: app/modulos/iceberg.mjs (modulo viejo de la serie mensual) no cuenta el plano en
// ningun lado; contradice esa decision y no es el origen del iceberg publicado (lo calcula
// pre-calculado.mjs con cero = verde). Pendiente de unificar; aqui manda la decision.
//
// Instantanea: un archivo de texto vivo, UN dato por linea, desechable (decision del
// usuario, 20-nov-2026: almacenamiento temporal); se pisa atomico en cada consulta. NO es
// un registro del historico: no guarda series ni reconstruye ventanas pasadas.
// Publicacion al visor: pendiente de decision (frecuencia de generacion y de subida); la
// sincronizacion diaria todavia no recoge esta carpeta (esRutaPre no la conoce).
//
// Movimiento entre lecturas (decision del usuario, 20-nov-2026: «quiero ver cuando la
// cuestion realmente esta aumentando, no cuando la referencia bajo»): el verde de la
// ventana es una POSICION (cierre sobre apertura), no una direccion; una sola lectura no
// puede decir cual de los dos extremos se movio. Por eso la instantanea guarda por activo
// su ultimo precio y el cierre de su ventana, y cada consulta compara con la lectura
// ANTERIOR por simbolo. La frontera es la misma regla del dueno que en la barra y el
// ranking («solo es perdida o no», sin tercera categoria): el que no bajo cuenta verde.
// Si el cierre de la ventana de un activo no avanzo entre las dos lecturas, la respuesta
// no ofrece un cierre mas nuevo: no acredita que no hubiera operaciones ni que el precio
// este quieto; cuenta aparte como «sin cierre nuevo» y no entra en la frontera, como el
// sin dato. Sin lectura previa comparable no se escribe el bloque de movimiento (lo que
// falta se muestra como que falta, no se inventa).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CARPETA_BARRA = 'barra-24h';
export const ARCHIVO_BARRA = 'actual_barra';
export const RUTA_BARRA = `registros/pre-calculado/stock/${CARPETA_BARRA}/${ARCHIVO_BARRA}`;

// Ruta oficial de la consulta publica. El documento de Binance (rest-api.md) pide usar
// https://data-api.binance.vision para las APIs que SOLO leen datos publicos de mercado, como
// esta; api.binance.com responde 451 (ubicacion restringida) desde algunas redes. La Debian
// puede seguir con api.binance.com si alli responde: se cambia con HUGO_BARRA_HOST, sin tocar codigo.
const HOST_POR_DEFECTO = 'https://api.binance.com';
const MAX_SIMBOLOS = 100; // tope documentado del endpoint; la particion en dos ya queda muy por debajo.

// El simbolo del stock tokenizado en Binance: CODIGO + B + USDT (la misma regla que aplica
// registro-motor.mjs al registrar; aqui no hay baja de activos, solo consulta).
export const simboloStock = (codigo) => `${codigo}BUSDT`;

// El universo es el del registro de velas: una carpeta por stock bajo velas-24h/stock/.
// Ordenado para que la particion y las tandas sean estables de una consulta a otra.
export function universoBarra(dirVelas) {
  const dir = path.join(dirVelas, 'stock');
  let nombres = [];
  try { nombres = fs.readdirSync(dir); } catch { return []; }
  return nombres.filter((n) => {
    try { return fs.lstatSync(path.join(dir, n)).isDirectory(); } catch { return false; }
  }).sort();
}

// Dos tandas equilibradas (decision del usuario, 20-nov-2026, su ejemplo 65+65): la primera
// se lleva el sobrante cuando el universo es impar. Estable: mismo universo, misma particion.
export function particionar(codigos) {
  const n = codigos.length;
  const mitad = Math.ceil(n / 2);
  return [codigos.slice(0, mitad), codigos.slice(mitad)];
}

// Una tanda: una consulta con su lista de simbolos. Error explicito si Binance no responde
// bien: una respuesta mala NO equivale a una barra vacia.
export async function consultarTanda(codigos, { fetchImpl = fetch, host = HOST_POR_DEFECTO } = {}) {
  if (!codigos.length) return [];
  if (codigos.length > MAX_SIMBOLOS) throw new Error(`Tanda de ${codigos.length} simbolos; el maximo documentado es ${MAX_SIMBOLOS}.`);
  const lista = encodeURIComponent(JSON.stringify(codigos.map(simboloStock)));
  const r = await fetchImpl(`${host}/api/v3/ticker/24hr?symbols=${lista}`, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'hugo' } });
  const cuerpo = await r.text();
  if (!r.ok) throw new Error(`Binance HTTP ${r.status}; no equivale a una barra vacia.`);
  let datos;
  try { datos = JSON.parse(cuerpo); } catch { throw new Error('Binance no devolvio JSON; no equivale a una barra vacia.'); }
  if (!Array.isArray(datos)) throw new Error('Respuesta de Binance sin lista de tickers; no equivale a una barra vacia.');
  return datos;
}

// La barra: cuantos stocks suben y cuantos bajan en la ventana movil, con lo que Binance
// declaro (openTime/closeTime de cada ticker) y la dispersion de los cierres en milisegundos.
// No hay una ventana comun: cada activo trae la suya y sus cierres difieren; la instantanea
// guarda el rango de cierres (cierreMin, fin) y el menor inicio, sin presentarlos como un
// solo corte. Sin dato (falta el ticker o los precios no se leen) se cuenta aparte y no
// entra en la frontera.
export function calcularBarra(tandas, universo) {
  const tickers = tandas.flat();
  let suben = 0, bajan = 0, sinDato = 0, inicio = null, fin = null, minCierre = null, maxCierre = null;
  const activos = [];
  for (const t of tickers) {
    const apertura = parseFloat(t?.openPrice), ultimo = parseFloat(t?.lastPrice);
    if (!Number.isFinite(apertura) || !Number.isFinite(ultimo)) { sinDato++; continue; }
    if (ultimo >= apertura) suben++; else bajan++;
    const o = Number(t.openTime), c = Number(t.closeTime);
    if (Number.isFinite(o)) inicio = inicio === null ? o : Math.min(inicio, o);
    if (Number.isFinite(c)) {
      fin = fin === null ? c : Math.max(fin, c);
      minCierre = minCierre === null ? c : Math.min(minCierre, c);
      maxCierre = maxCierre === null ? c : Math.max(maxCierre, c);
    }
    // Por activo, para la comparacion con la proxima lectura: su ultimo precio (texto tal
    // cual vino, sin recomponer) y el cierre de SU ventana. Sin ellos no hay movimiento.
    const simbolo = String(t?.symbol || '');
    const codigo = simbolo.endsWith('BUSDT') ? simbolo.slice(0, -5) : simbolo;
    activos.push({ codigo, ultimo, ultimoTexto: String(t.lastPrice), cierre: Number.isFinite(c) ? c : null });
  }
  const respondieron = new Set(tickers.map((t) => t?.symbol)).size;
  return {
    inicio, fin, cierreMin: minCierre,
    dispersionMs: minCierre === null ? null : maxCierre - minCierre,
    consultados: universo.length,
    respondieron,
    conDato: suben + bajan,
    sinDato: sinDato + Math.max(0, universo.length - respondieron),
    suben, bajan,
    activos,
  };
}

// Movimiento entre dos lecturas (decision del usuario, 20-nov-2026): por simbolo, el ultimo
// precio de ahora contra el de la lectura anterior, solo cuando la ventana trae un cierre
// mas nuevo. Cero cuenta verde («solo es perdida o no», la misma regla de la barra y el
// ranking, sin tercera categoria). Cierre sin avanzar = sin cierre nuevo: la respuesta no
// ofrece uno mas reciente (no prueba que no hubiera operaciones); fuera de la frontera.
// Sin previa legible = sin previa, nunca inventada. Devuelve null cuando no hay NINGUN
// activo previo con que comparar (primera lectura o instantanea vieja sin detalle): en ese
// caso el bloque de movimiento no se escribe.
export function calcularMovimiento(actuales, previos) {
  if (!previos || !previos.size) return null;
  let suben = 0, bajan = 0, iguales = 0, sinCierreNuevo = 0, sinPrevia = 0;
  for (const a of actuales) {
    const p = previos.get(a.codigo);
    if (!p || !Number.isFinite(p.ultimo) || p.cierre === null) { sinPrevia++; continue; }
    if (a.cierre === null || a.cierre <= p.cierre) { sinCierreNuevo++; continue; }
    if (a.ultimo >= p.ultimo) { suben++; if (a.ultimo === p.ultimo) iguales++; } else bajan++;
  }
  // suben es la frontera del dueno («solo es perdida o no»: el que no bajo, verde) e
  // INCLUYE los iguales; iguales los cuenta aparte para que el verde no afirme aumento.
  return { suben, bajan, iguales, sinCierreNuevo, sinPrevia };
}

const iso = (ms) => (ms === null ? 'sin dato' : new Date(ms).toISOString());
const deIso = (s) => {
  if (s === 'sin dato') return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) throw new Error(`Fecha ilegible en la instantanea: ${s}.`);
  return ms;
};

// Instantanea en texto, un dato por linea. Se pisa entera en cada consulta: es desechable.
// El bloque de movimiento solo sale cuando hubo lectura anterior comparable; las lineas por
// activo (CODIGO ultimo / CODIGO cierre) son la unica memoria que se conserva: la previa
// para la proxima comparacion.
export function formatearBarra(barra, ahora = Date.now()) {
  const lineas = [
    '# Barra movil de las ultimas 24 h de los stocks (ventana movil de Binance, no el dia cerrado del iceberg).',
    '# Archivo vivo y desechable: cada consulta lo pisa entero; no es un registro del historico.',
    `generada: ${new Date(ahora).toISOString()}`,
    `inicio: ${iso(barra.inicio)}`,
    `cierre_min: ${iso(barra.cierreMin)}`,
    `fin: ${iso(barra.fin)}`,
    `dispersion_ms: ${barra.dispersionMs === null ? 'sin dato' : barra.dispersionMs}`,
    `consultados: ${barra.consultados}`,
    `con_dato: ${barra.conDato}`,
    `sin_dato: ${barra.sinDato}`,
    `suben: ${barra.suben}`,
    `bajan: ${barra.bajan}`,
  ];
  const m = barra.movimiento;
  if (m) {
    lineas.push(
      '# Movimiento del ultimo precio de cada activo contra la lectura anterior, solo con cierre nuevo (posicion medida, no promesa; el verde incluye los iguales):',
      `comparada_con: ${iso(barra.comparadaCon)}`,
      `mov_suben: ${m.suben}`,
      `mov_bajan: ${m.bajan}`,
      `mov_iguales: ${m.iguales}`,
      `mov_sin_cierre_nuevo: ${m.sinCierreNuevo}`,
      `mov_sin_previa: ${m.sinPrevia}`,
    );
  }
  lineas.push('# Por activo (para comparar con la proxima consulta): ultimo precio y cierre de su ventana.');
  for (const a of [...(barra.activos || [])].sort((x, y) => x.codigo < y.codigo ? -1 : x.codigo > y.codigo ? 1 : 0)) {
    lineas.push(`${a.codigo} ultimo: ${a.ultimoTexto}`);
    lineas.push(`${a.codigo} cierre: ${iso(a.cierre)}`);
  }
  lineas.push('');
  return lineas.join('\n');
}

// Lee y valida una instantanea; sirve de validador cuando la sincronizacion la recoja.
// Ademas de los agregados devuelve el detalle por activo (Map codigo -> {ultimo, cierre}),
// que es la previa de la proxima comparacion. Si hay detalle por activo, debe cubrir
// exactamente a los con dato, ni uno mas ni uno menos; sin lineas por activo la
// instantanea sigue siendo valida (formato anterior al movimiento entre lecturas), pero no
// sirve de previa. El bloque de movimiento, cuando esta, debe cerrar: suben + bajan +
// sin cierre nuevo + sin previa = con dato.
export function leerBarra(texto) {
  const campos = {};
  const activos = new Map();
  for (const linea of String(texto).split('\n')) {
    const m = linea.match(/^([a-z_]+): (.*)$/);
    if (m) { campos[m[1]] = m[2]; continue; }
    const a = linea.match(/^([A-Z0-9]+) (ultimo|cierre): (.+)$/);
    if (a) {
      if (activos.has(a[1]) && activos.get(a[1])[a[2]] !== undefined) throw new Error(`Instantanea de barra incoherente (${a[1]} repetido).`);
      const e = activos.get(a[1]) || {};
      e[a[2]] = a[3];
      activos.set(a[1], e);
    }
  }
  const entero = (k) => {
    const n = Number(campos[k]);
    if (!Number.isInteger(n) || n < 0) throw new Error(`Instantanea de barra incoherente (${k}).`);
    return n;
  };
  const b = {
    generada: deIso(campos.generada || ''),
    inicio: deIso(campos.inicio || ''),
    cierreMin: deIso(campos.cierre_min || ''),
    fin: deIso(campos.fin || ''),
    dispersionMs: campos.dispersion_ms === 'sin dato' ? null : entero('dispersion_ms'),
    consultados: entero('consultados'),
    conDato: entero('con_dato'),
    sinDato: entero('sin_dato'),
    suben: entero('suben'),
    bajan: entero('bajan'),
  };
  if (b.suben + b.bajan !== b.conDato || b.conDato + b.sinDato !== b.consultados) {
    throw new Error('Instantanea de barra incoherente (las cuentas no cierran).');
  }
  if (activos.size) {
    if (activos.size !== b.conDato) throw new Error('Instantanea de barra incoherente (el detalle por activo no cubre a los con dato).');
    for (const [codigo, e] of activos) {
      const ultimo = parseFloat(e.ultimo);
      if (!Number.isFinite(ultimo)) throw new Error(`Instantanea de barra incoherente (${codigo} sin ultimo legible).`);
      e.ultimo = ultimo;
      e.cierre = deIso(e.cierre || '');
    }
  }
  b.activos = activos;
  if (campos.comparada_con !== undefined) {
    const mov = {
      comparadaCon: deIso(campos.comparada_con),
      suben: entero('mov_suben'),
      bajan: entero('mov_bajan'),
      iguales: campos.mov_iguales === undefined ? null : entero('mov_iguales'), // ausente en instantaneas previas al desglose
      sinCierreNuevo: entero('mov_sin_cierre_nuevo'),
      sinPrevia: entero('mov_sin_previa'),
    };
    if (mov.suben + mov.bajan + mov.sinCierreNuevo + mov.sinPrevia !== b.conDato) {
      throw new Error('Instantanea de barra incoherente (el movimiento no cierra).');
    }
    if (mov.iguales !== null && mov.iguales > mov.suben) {
      throw new Error('Instantanea de barra incoherente (los iguales no caben en los que no bajaron).');
    }
    b.movimiento = mov;
  }
  return b;
}

// La instantanea en la sincronizacion: ruta unica conocida. Archivo vivo como el catalogo
// (lo regenera cada consulta y el local gana); NO es un pre-calculo de un dia, que seria
// conflicto al diferir y no se pisaria nunca.
export const esRutaBarra = (rel) => rel === RUTA_BARRA;
export const validarBarra = (buf) => leerBarra(String(buf)).conDato;

// Escritura atomica (temporal + renombrado) pisando la anterior: es un archivo vivo.
// Devuelve la ruta relativa dentro del repo.
export function escribirBarra(dirRegistros, texto) {
  const dir = path.join(dirRegistros, 'pre-calculado', 'stock', CARPETA_BARRA);
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, ARCHIVO_BARRA);
  const tmp = `${destino}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, texto);
  fs.renameSync(tmp, destino);
  return RUTA_BARRA;
}

// La consulta completa: universo del registro, dos tandas, barra, comparacion con la
// lectura anterior guardada en la propia instantanea (si la hay y es legible; si no, no se
// compara ni se inventa) e instantanea nueva en disco.
export async function generarBarra({ dirVelas, fetchImpl = fetch, host = HOST_POR_DEFECTO, ahora = Date.now() } = {}) {
  const universo = universoBarra(dirVelas);
  if (!universo.length) throw new Error('No hay carpetas de stocks en el registro de velas; no invento la barra.');
  const dirRegistros = path.dirname(dirVelas);
  let previos = null, comparadaCon = null;
  try {
    const anterior = leerBarra(fs.readFileSync(path.join(dirRegistros, 'pre-calculado', 'stock', CARPETA_BARRA, ARCHIVO_BARRA), 'utf8'));
    if (anterior.activos.size) { previos = anterior.activos; comparadaCon = anterior.generada; }
  } catch { /* sin instantanea previa legible: esta lectura no compara, solo guarda */ }
  const tandas = [];
  for (const tanda of particionar(universo)) tandas.push(await consultarTanda(tanda, { fetchImpl, host }));
  const barra = calcularBarra(tandas, universo);
  const movimiento = calcularMovimiento(barra.activos, previos);
  if (movimiento) { barra.movimiento = movimiento; barra.comparadaCon = comparadaCon; }
  const texto = formatearBarra(barra, ahora);
  const rel = escribirBarra(dirRegistros, texto);
  return { barra, texto, rel, generada: ahora };
}

// --- La orden ---

// Fecha y hora completas con segundos y su desfase, como le gustan al usuario
// («HH:MM:SS UTC-4», 20-nov-2026). Caracas no cambia de horario.
const TZ = 'America/Caracas';
const fechaHora = (ms) => {
  const f = new Intl.DateTimeFormat('es', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ms));
  const h = new Intl.DateTimeFormat('es', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(ms));
  return `${f} ${h} UTC-4`;
};

export function registrar(ctx) {
  const { app, botToken } = ctx;
  const dirVelas = () => process.env.HUGO_VELAS_DIR || ctx.conf.HUGO_VELAS_DIR || path.join(os.homedir(), 'Documents', 'hugo', 'registros', 'velas-24h');
  ctx.comando(/^\s*barra\s*[.!?]*\s*$/i, async (event) => {
    const hilo = event.thread_ts || event.ts;
    const decir = (text) => app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: hilo, text });
    try {
      const host = process.env.HUGO_BARRA_HOST || ctx.conf.HUGO_BARRA_HOST || HOST_POR_DEFECTO;
      const { barra, rel, generada } = await generarBarra({ dirVelas: dirVelas(), host });
      const l = [
        `Barra móvil 24 h (stocks), consultada ahora a Binance:`,
        `· Suben ${barra.suben} · bajan ${barra.bajan} (${barra.conDato} con dato de ${barra.consultados}).`,
      ];
      l.push(`· Consulta: ${fechaHora(generada)}.`);
      if (barra.cierreMin !== null && barra.fin !== null) l.push(`· Cierres de la ventana entre ${fechaHora(barra.cierreMin)} y ${fechaHora(barra.fin)} (cada activo trae el suyo).`);
      if (barra.movimiento) {
        const m = barra.movimiento;
        l.push(`· Desde la lectura anterior (${fechaHora(barra.comparadaCon)}): suben ${m.suben} · bajan ${m.bajan} (${m.suben + m.bajan} con cierre nuevo; el que no bajó cuenta verde${m.iguales === null ? '' : `, iguales: ${m.iguales}`}).`);
        if (m.sinCierreNuevo) l.push(`· Sin cierre nuevo: ${m.sinCierreNuevo} (la respuesta no ofrece uno más reciente; fuera de la frontera, como el sin dato).`);
        if (m.sinPrevia) l.push(`· Sin lectura previa: ${m.sinPrevia} (fuera de la frontera, no inventados).`);
      }
      if (barra.dispersionMs !== null) l.push(`· Dispersión entre cierres de la ventana: ${barra.dispersionMs} ms.`);
      if (barra.sinDato) l.push(`· Sin dato: ${barra.sinDato} (fuera de la frontera, no inventados).`);
      l.push(`· Instantánea guardada en ${rel} (archivo vivo, se pisa en cada consulta).`);
      await decir(l.join('\n'));
    } catch (e) {
      await decir(`No pude consultar la barra: ${e.message}`);
    }
  }, { nombre: 'barra' });
}
