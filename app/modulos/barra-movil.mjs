// Modulo barra movil: «@Hugo barra» consulta a Binance el ticker de 24 h de los stocks y
// dibuja la frontera suben/bajan de la ventana MOVIL (las ultimas 24 h hasta el instante de
// la consulta, no el dia cerrado en UTC que cuenta el iceberg). Nace del estudio horario de
// candidatos (decision del usuario, 20-nov-2026: dos tandas equilibradas, menor proceso y
// recursos, sin construir un registro propio ni reconstruir nada. Nacio acompanando al
// iceberg de stocks; desde el 21-nov-2026 se muestra en la Superficie del dia (decision
// del usuario: las vistas no se enlazan, son cosas distintas).
//
// Una consulta por tanda a /api/v3/ticker?windowSize=1d, calculada desde Database.
// Binance cierra al pedirla y redondea el inicio al minuto: 24 h + hasta 59 999 ms.
// Maximo 100 simbolos; peso 4 por simbolo, limitado a 200 por tanda (113 -> 400).
// El limite por IP es compartido con las demas consultas; se conserva la pausa 429/418.
// No se fuerza la hora ni se reconstruyen precios. La particion es estable: universo
// ordenado, mitad y mitad (113 -> 57 + 56); cada activo consulta siempre en su tanda.
//
// Regla del plano: la misma del iceberg publicado (decision del usuario, 20-nov-2026: «solo
// es perdida o no», sin tercera categoria): lastPrice >= openPrice cuenta como sube.
// Ojo: app/modulos/iceberg.mjs (modulo viejo de la serie mensual) no cuenta el plano en
// ningun lado; contradice esa decision y no es el origen del iceberg publicado (lo calcula
// pre-calculado.mjs con cero = verde). Pendiente de unificar; aqui manda la decision.
//
// Cada foto se conserva en el registro intradiario. No se escribe una copia separada.
// Los precios previos se reciben desde la última lectura real del historial local.

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
//
// Primera barra: referencia fija en la primera foto real del día UTC mostrado.
// El origen compara la foto consigo misma, sin inventar precios ni cierres.
// Los cálculos diarios antiguos siguen exportados para leer datos históricos.
import fs from 'node:fs';
import path from 'node:path';
import { esVigente } from './vigencia.mjs';

// Solo migración de instalaciones anteriores; nunca se vuelve a escribir.
export const RUTA_BARRA = 'registros/pre-calculado/stock/barra-24h/actual_barra';

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
  const cuenta = esVigente(dirVelas, 'stock');
  return nombres.filter((n) => cuenta(n)).filter((n) => {
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
  const r = await fetchImpl(`${host}/api/v3/ticker?symbols=${lista}&windowSize=1d`, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'hugo' } });
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
    activos.push({ codigo, ultimo, ultimoTexto: String(t.lastPrice), aperturaTexto: String(t.openPrice), cierre: Number.isFinite(c) ? c : null });
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
  const detalle = new Map(); // codigo -> { previoTexto, resultado }, para la tabla del visor
  for (const a of actuales) {
    const p = previos.get(a.codigo);
    if (!p || !Number.isFinite(p.ultimo) || p.cierre === null) { sinPrevia++; detalle.set(a.codigo, { previoTexto: 'sin dato', resultado: 'sin_previa' }); continue; }
    const previoTexto = p.ultimoTexto ?? String(p.ultimo);
    if (a.cierre === null || a.cierre <= p.cierre) { sinCierreNuevo++; detalle.set(a.codigo, { previoTexto, resultado: 'sin_cierre_nuevo' }); continue; }
    if (a.ultimo >= p.ultimo) {
      const igual = a.ultimo === p.ultimo;
      suben++; if (igual) iguales++;
      detalle.set(a.codigo, { previoTexto, resultado: igual ? 'igual' : 'sube' });
    } else { bajan++; detalle.set(a.codigo, { previoTexto, resultado: 'baja' }); }
  }
  // suben es la frontera del dueno («solo es perdida o no»: el que no bajo, verde) e
  // INCLUYE los iguales; iguales los cuenta aparte para que el verde no afirme aumento.
  return { suben, bajan, iguales, sinCierreNuevo, sinPrevia, detalle };
}

const DIA_MS = 86400000;

// El cierre de la vela diaria completa del dia UTC anterior: referencia fija de la barra del
// dia (decision del usuario, 21-nov-2026). Dato local del registro de velas (archivo mensual
// AAMM_CODIGO, velas diarias en formato kline de Binance: [aperturaMs, open, high, low,
// close, ...]); se toma k[4], el CIERRE, nunca la apertura. Sin archivo, sin vela de ese dia
// o cierre ilegible: null (el activo cuenta sin dato de esta barra; no se busca una vela mas
// vieja). No hace consultas: la lectura sigue siendo la de dos tandas.
export function cierreVelaDiaAnterior(dirVelas, codigo, refInicio) {
  const f = new Date(refInicio);
  const aamm = `${String(f.getUTCFullYear() % 100).padStart(2, '0')}${String(f.getUTCMonth() + 1).padStart(2, '0')}`;
  let velas;
  try { velas = JSON.parse(fs.readFileSync(path.join(dirVelas, 'stock', codigo, `${aamm}_${codigo}`), 'utf8')); }
  catch { return null; }
  if (!Array.isArray(velas)) return null;
  const v = velas.find((k) => Number(k?.[0]) === refInicio);
  if (!v) return null;
  const texto = String(v[4] ?? '');
  return Number.isFinite(parseFloat(texto)) ? texto : null; // el cierre tal cual vino escrito
}

// La frontera contra el cierre del dia anterior, por simbolo. Cero cuenta verde («solo es
// perdida o no»), con los iguales contados aparte para que el verde no afirme aumento. Los
// activos sin ticker o sin vela local del dia anterior cuentan como sin dato de esta barra.
export function calcularDia(activos, dirVelas, universo, refInicio) {
  let suben = 0, bajan = 0, iguales = 0, sinDato = 0;
  const conPrecio = new Set();
  for (const a of activos) {
    conPrecio.add(a.codigo);
    const texto = cierreVelaDiaAnterior(dirVelas, a.codigo, refInicio);
    a.diaCierreTexto = texto === null ? 'sin dato' : texto; // viaja en la instantanea (tabla del visor)
    if (texto === null) { sinDato++; continue; }
    const cierre = parseFloat(texto);
    if (a.ultimo >= cierre) { suben++; if (a.ultimo === cierre) iguales++; } else bajan++;
  }
  sinDato += universo.length - conPrecio.size;
  return { ref: new Date(refInicio).toISOString().slice(0, 10), suben, bajan, iguales, sinDato };
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
    '# Foto real conservada en el registro intradiario; referencias de inicio del dia independientes de las velas diarias.',
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
  const d = barra.dia;
  if (d) {
    lineas.push(
      d.base === undefined ? '# Referencia diaria anterior (formato historico):' : '# Variacion contra la primera lectura real del dia; dia_ref conserva la clave de compatibilidad:',
      `dia_ref: ${d.ref}`,
      ...(d.base === undefined ? [] : [`dia_base: ${iso(d.base)}`]),
      `dia_suben: ${d.suben}`,
      `dia_bajan: ${d.bajan}`,
      `dia_iguales: ${d.iguales}`,
      `dia_sin_dato: ${d.sinDato}`,
    );
  }
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
  lineas.push('# Por activo (memoria de la proxima comparacion y datos de las tablas del visor): apertura y ultimo precio de la ventana, cierre de su ventana, cierre de la vela del dia anterior y, si hubo comparacion, el precio previo y el resultado medido.');
  for (const a of [...(barra.activos || [])].sort((x, y) => x.codigo < y.codigo ? -1 : x.codigo > y.codigo ? 1 : 0)) {
    lineas.push(`${a.codigo} apertura: ${a.aperturaTexto}`);
    lineas.push(`${a.codigo} ultimo: ${a.ultimoTexto}`);
    lineas.push(`${a.codigo} cierre: ${iso(a.cierre)}`);
    if (barra.dia) lineas.push(`${a.codigo} dia_cierre: ${a.diaCierreTexto ?? 'sin dato'}`);
    if (barra.movimiento) lineas.push(`${a.codigo} previo: ${a.previoTexto ?? 'sin dato'}`, `${a.codigo} mov: ${a.movResultado ?? 'sin_previa'}`);
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
    const a = linea.match(/^([A-Z0-9]+) (apertura|ultimo|cierre|dia_cierre|previo|mov): (.+)$/);
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
      e.ultimoTexto = e.ultimo;
      e.ultimo = ultimo;
      e.cierre = deIso(e.cierre || '');
      if (e.apertura !== undefined && !Number.isFinite(parseFloat(e.apertura))) throw new Error(`Instantanea de barra incoherente (${codigo} sin apertura legible).`);
      if (e.dia_cierre !== undefined && e.dia_cierre !== 'sin dato' && !Number.isFinite(parseFloat(e.dia_cierre))) throw new Error(`Instantanea de barra incoherente (${codigo} sin dia_cierre legible).`);
      if (e.mov !== undefined) {
        if (!['sube', 'baja', 'igual', 'sin_cierre_nuevo', 'sin_previa'].includes(e.mov)) throw new Error(`Instantanea de barra incoherente (${codigo} con mov desconocido).`);
        if (e.previo === undefined || (e.previo !== 'sin dato' && !Number.isFinite(parseFloat(e.previo)))) throw new Error(`Instantanea de barra incoherente (${codigo} con mov pero sin previo legible).`);
      }
    }
  }
  b.activos = activos;
  if (campos.dia_ref !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(campos.dia_ref)) throw new Error('Instantanea de barra incoherente (dia_ref ilegible).');
    const dia = { ref: campos.dia_ref, suben: entero('dia_suben'), bajan: entero('dia_bajan'), iguales: entero('dia_iguales'), sinDato: entero('dia_sin_dato') };
    if (dia.suben + dia.bajan + dia.sinDato !== b.consultados) {
      throw new Error('Instantanea de barra incoherente (el dia anterior no cierra).');
    }
    if (dia.iguales > dia.suben) {
      throw new Error('Instantanea de barra incoherente (los iguales del dia no caben en los que no bajaron).');
    }
    if (campos.dia_base !== undefined) dia.base = deIso(campos.dia_base);
    b.dia = dia;
  }
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

// La consulta completa: universo del registro, dos tandas, barra, comparacion con la
// lectura anterior recibida del historial; sin previa no se inventa movimiento.
export async function generarBarra({ dirVelas, fetchImpl = fetch, host = HOST_POR_DEFECTO, ahora = Date.now(), anteriorTexto = null, inicialTexto = null } = {}) {
  const universo = universoBarra(dirVelas);
  if (!universo.length) throw new Error('No hay carpetas de stocks en el registro de velas; no invento la barra.');
  let previos = null, comparadaCon = null;
  if (anteriorTexto !== null) {
    const anterior = leerBarra(anteriorTexto);
    if (anterior.activos.size) { previos = anterior.activos; comparadaCon = anterior.generada; }
  }
  const tandas = [];
  for (const tanda of particionar(universo)) tandas.push(await consultarTanda(tanda, { fetchImpl, host }));
  const barra = calcularBarra(tandas, universo);
  // Lectura del día independiente del registro diario: primera foto real como base.
  const inicial = inicialTexto === null ? null : leerBarra(inicialTexto);
  const base = inicial?.activos ?? new Map(barra.activos.map(a=>[a.codigo,a]));
  let suben=0,bajan=0,iguales=0,sinDato=0;
  for(const a of barra.activos){
    const ref=base.get(a.codigo),n=Number(ref?.ultimo);
    a.diaCierreTexto=ref?.ultimoTexto??(ref?String(ref.ultimo):'sin dato');
    if(!Number.isFinite(n)||n<=0)sinDato++;else if(a.ultimo>=n){suben++;if(a.ultimo===n)iguales++;}else bajan++;
  }
  sinDato+=universo.length-barra.activos.length;
  barra.dia={ref:new Date(Math.floor(ahora/DIA_MS)*DIA_MS-DIA_MS).toISOString().slice(0,10),base:inicial?.generada??ahora,suben,bajan,iguales,sinDato};
  // El origen se compara consigo mismo sin modificar precios ni cierres reales.
  const movimiento = previos ? calcularMovimiento(barra.activos, previos) : {
    suben: barra.activos.length, bajan: 0, iguales: barra.activos.length, sinCierreNuevo: 0, sinPrevia: 0,
    detalle: new Map(barra.activos.map(a=>[a.codigo,{previoTexto:a.ultimoTexto,resultado:'igual'}])),
  };
  if (!previos) comparadaCon=ahora;
  if (movimiento) {
    barra.movimiento = movimiento; barra.comparadaCon = comparadaCon;
    for (const a of barra.activos) {
      const d = movimiento.detalle.get(a.codigo);
      if (d) { a.previoTexto = d.previoTexto; a.movResultado = d.resultado; }
    }
  }
  const texto = formatearBarra(barra, ahora);
  return { barra, texto, generada: ahora };
}
