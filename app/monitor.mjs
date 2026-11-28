// Monitor de VIPs dentro del mismo shell que Mercado (sin recargar): entrar(contenedor, opciones) y salir().
// Fuentes y reglas son las de siempre (núcleo, catálogo, intradía, historial-monitor y Binance WS); no se duplican en otro lado.
const CSS = `
  .monitor-vip {
    --fondo: #10141a;
    --panel: #181e27;
    --borde: #262f3b;
    --texto: #e8edf3;
    --tenue: #8b98a8;
    --verde: #2ecc71;
    --rojo: #e74c3c;
  }
  .monitor-vip, .monitor-vip * { box-sizing: border-box; }
  .monitor-vip {
    margin: 0;
    background: var(--fondo);
    color: var(--texto);
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 15px;
  }
  .monitor-vip .mv-cab {
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--borde);
  }
  .monitor-vip h1 { font-size: 18px; margin: 0 0 4px; }
  .monitor-vip .estado { text-align: left; font-style: normal; color: var(--tenue); font-size: 13px; line-height: 1.5; }
  .monitor-vip .punto { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; background: var(--tenue); }
  .monitor-vip .punto.vivo { background: var(--verde); }
  .monitor-vip .punto.caido { background: var(--rojo); }
  .monitor-vip main { max-width: 720px; margin: 0 auto; padding: 8px 12px 40px; }
  .monitor-vip h2 {
    font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
    color: var(--tenue); margin: 22px 4px 6px;
  }
  .monitor-vip table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--borde); border-radius: 8px; overflow: hidden; }
  .monitor-vip td,.monitor-vip th { padding: 8px 10px; text-align: right; border-bottom: 1px solid var(--borde); }
  .monitor-vip th { font-size: 12px; color: var(--tenue); font-weight: 600; }
  .monitor-vip td:first-child,.monitor-vip th:first-child { text-align: left; }
  .monitor-vip tr:last-child td { border-bottom: none; }
  .monitor-vip .codigo { font-weight: 700; }
  .monitor-vip .nombre { color: var(--tenue); font-size: 12px; }
  .monitor-vip .sube { color: var(--verde); }
  .monitor-vip .baja { color: var(--rojo); }
  .monitor-vip .igual { color: var(--tenue); }
  .monitor-vip .var { font-variant-numeric: tabular-nums; font-weight: 600; }
  .monitor-vip .precio { font-variant-numeric: tabular-nums; }
  .monitor-vip .pie { color: var(--tenue); font-size: 12px; margin-top: 24px; line-height: 1.6; padding: 0 4px; }
  .monitor-vip a { color: #6ab0f3; text-decoration: none; }
  .monitor-vip .aviso { background: var(--panel); border: 1px solid var(--borde); border-radius: 8px; padding: 10px 12px; margin-top: 16px; color: var(--tenue); font-size: 13px; }
  .monitor-vip .barra-fecha { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 4px 0; font-size: 13px; color: var(--tenue); }
  .monitor-vip .barra-fecha input { background: var(--panel); color: var(--texto); border: 1px solid var(--borde); border-radius: 6px; padding: 6px 8px; font: inherit; color-scheme: dark; }
  .monitor-vip .barra-fecha button { background: var(--panel); color: var(--texto); border: 1px solid var(--borde); border-radius: 6px; padding: 6px 10px; font: inherit; cursor: pointer; }
  .monitor-vip .barra-fecha button[aria-pressed="true"] { border-color: #6ab0f3; color: #6ab0f3; }
  .monitor-vip .hist-nota { background: var(--panel); border: 1px solid var(--borde); border-radius: 8px; padding: 10px 12px; margin-top: 12px; color: var(--tenue); font-size: 13px; line-height: 1.55; }
  .monitor-vip .hist-nota b { color: var(--texto); font-weight: 600; }
  .monitor-vip .hist-nota + section h2,.monitor-vip .var { white-space: nowrap; }
  .monitor-vip .etiqueta { display: inline-block; border: 1px solid var(--borde); border-radius: 4px; padding: 0 6px; font-size: 12px; color: var(--texto); }
`;
const HTML = `<header class="mv-cab">
  <h1>Monitor de VIPs</h1>
  <div class="estado">
    <span id="estado-vivo"><span id="punto" class="punto"></span><span id="conexion">iniciando…</span> · <span id="ultimo">sin datos aún</span><br>
    Base: primera lectura del día (00:00 UTC) del Observatorio · revisión cada 5 s<br></span>
    <span id="estado-historial" style="display:none"><span class="punto"></span>Historial · día cerrado, datos guardados (no en vivo)<br></span>
    <span id="reloj"></span>
  </div>
</header>
<main>
  <div id="aviso" class="aviso" style="display:none"></div>
  <div class="barra-fecha">
    <label for="fecha">Día cerrado</label>
    <input id="fecha" type="date" min="2026-09-30" aria-label="Elegir un día cerrado del historial">
    <button id="en-vivo" type="button" aria-pressed="true">En vivo</button>
  </div>
  <div id="historia" style="display:none"></div>
  <section id="grupos"></section>
  <div class="pie">
    Solo lectura. Precios en vivo de Binance por WebSocket; la referencia del día es la primera lectura
    que guarda el Observatorio en este repositorio (si falta, la apertura de la vela de las 00:00 UTC de Binance).
    Sin compras, sin ventas, sin claves.
    <a class="mv-volver" href="">Volver al Observatorio</a>.
  </div>
</main>
`;
let contenedor = null, RAIZ = '/', grupoFiltro = null, alCambiarDia = () => {};
let temporizadores = [], cerrado = true, liberar = () => {}, opcionesDia = null;
const $ = (id) => contenedor.querySelector('#' + id);
const temporizar = (f, ms) => { const t = setInterval(f, ms); temporizadores.push(t); return t; };
const aplazar = (f, ms) => { if (cerrado) return 0;  const t = setTimeout(f, ms); temporizadores.push(t); return t; };


const RAW = 'https://raw.githubusercontent.com/osmancitov/hugo/main/';
const HOSTS_WS = ['wss://data-stream.binance.vision/stream', 'wss://stream.binance.com:9443/stream'];
const REVISION_MS = 5000;
const RECARGA_MS = 15 * 60 * 1000;
function montar() {


// estado: Map codigo -> {codigo, nombre, grupo, simbolo, base, fuenteBase, precio, ultimoDato}
const estado = new Map();
let ws = null, indiceHost = 0, esperaReintento = 2000, temporizadorReintento = null;
let ultimoMensaje = 0;
let diaUTC = hoyUTC();

function hoyUTC() { return new Date().toISOString().slice(0, 10); }

function fmtPrecio(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function fmtVariacion(v) {
  if (!Number.isFinite(v)) return { texto: '—', clase: 'igual' };
  const signo = v > 0 ? '+' : '';
  const clase = v > 0.004 ? 'sube' : v < -0.004 ? 'baja' : 'igual';
  const flecha = v > 0.004 ? '▲ ' : v < -0.004 ? '▼ ' : '';
  return { texto: flecha + signo + v.toFixed(2) + ' %', clase };
}

async function traerJSON(ruta) {
  const r = await fetch(RAW + ruta + '?v=' + Date.now());
  if (!r.ok) throw new Error(ruta + ': HTTP ' + r.status);
  return r.json();
}

// Lee las líneas "CODIGO ultimo: precio" de una lectura de la barra móvil.
function preciosDeLectura(texto) {
  const mapa = new Map();
  for (const linea of texto.split('\n')) {
    const m = /^([A-Z0-9]+) ultimo: ([0-9.]+)$/.exec(linea.trim());
    if (m) mapa.set(m[1], Number(m[2]));
  }
  return mapa;
}

async function cargarTodo() {
  const [nucStock, nucCripto, catStock, catCripto] = await Promise.all([
    traerJSON('registros/nucleo/stock/actual_nucleo'),
    traerJSON('registros/nucleo/cripto/actual_nucleo'),
    traerJSON('registros/catalogo/stock'),
    traerJSON('registros/catalogo/cripto'),
  ]);
  const infoStock = new Map(catStock.activos.map(a => [a.codigo, a]));
  const infoCripto = new Map(catCripto.activos.map(a => [a.codigo, a]));

  estado.clear();
  for (const codigo of nucStock.nucleo) {
    const info = infoStock.get(codigo) || {};
    estado.set(codigo, {
      codigo,
      nombre: info.nombre || codigo,
      grupo: info.tipo === 'empresa' ? 'Empresas' : 'Fondos',
      simbolo: codigo + 'BUSDT',
      base: null, fuenteBase: null, precio: null, ultimoDato: null,
    });
  }
  for (const codigo of nucCripto.nucleo) {
    const info = infoCripto.get(codigo) || {};
    estado.set(codigo, {
      codigo,
      nombre: info.nombre || codigo,
      grupo: 'Cripto',
      simbolo: codigo + 'USDT',
      base: null, fuenteBase: null, precio: null, ultimoDato: null,
    });
  }

  // Base del día: primera lectura guardada por el Observatorio (00:00 UTC aprox.).
  // Semilla de precio: última lectura guardada, hasta que llegue el dato en vivo.
  const aviso = $('aviso');
  aviso.style.display = 'none';
  for (const mercado of ['stock', 'cripto']) {
    try {
      const intra = await traerJSON('registros/intradia/' + mercado + '/' + diaUTC + '.json');
      const primera = preciosDeLectura(intra.lecturas[0].texto);
      const ultima = preciosDeLectura(intra.lecturas[intra.lecturas.length - 1].texto);
      for (const a of estado.values()) {
        if ((mercado === 'stock') !== a.simbolo.endsWith('BUSDT')) continue;
        if (primera.has(a.codigo)) { a.base = primera.get(a.codigo); a.fuenteBase = 'observatorio'; }
        if (ultima.has(a.codigo)) a.precio = ultima.get(a.codigo);
      }
    } catch (e) {
      aviso.style.display = '';
      aviso.textContent = 'Aún no está la primera lectura de hoy (' + diaUTC + '); la base aparece en cuanto el Observatorio la guarde o llegue la vela del día por el vivo.';
    }
  }
  pintar();
  rellenarBasesPorVela();
}

// Para los activos sin base en el registro del Observatorio, intenta la vela diaria de
// Binance (apertura 00:00 UTC) por REST. Si el navegador no puede leer esa API (CORS o
// ubicación), no pasa nada: la misma vela llega por el vivo en cuanto haya una operación.
async function rellenarBasesPorVela() {
  const HOSTS_REST = ['https://api.binance.com', 'https://data-api.binance.vision'];
  for (const a of estado.values()) {
    if (a.base !== null) continue;
    for (const host of HOSTS_REST) {
      try {
        const r = await fetch(host + '/api/v3/klines?symbol=' + a.simbolo + '&interval=1d&limit=1');
        if (!r.ok) break;
        const k = await r.json();
        const apertura = Number(k?.[0]?.[1]);
        if (Number.isFinite(apertura) && apertura > 0) { a.base = apertura; a.fuenteBase = 'vela'; }
        break;
      } catch (e) { /* prueba el siguiente host */ }
    }
  }
  pintar();
}

function conectar() {
  if (cerrado) return;
  if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  const flujos = [];
  for (const a of estado.values()) {
    const s = a.simbolo.toLowerCase();
    flujos.push(s + '@miniTicker', s + '@kline_1d');
  }
  const host = HOSTS_WS[indiceHost % HOSTS_WS.length];
  indiceHost++;
  const url = host + '?streams=' + flujos.join('/');
  const conexion = $('conexion');
  conexion.textContent = 'conectando…';
  ws = new WebSocket(url);
  ws.onopen = () => {
    esperaReintento = 2000;
    ultimoMensaje = Date.now();
    conexion.textContent = 'en vivo';
    $('punto').className = 'punto vivo';
  };
  ws.onmessage = (ev) => {
    ultimoMensaje = Date.now();
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    const d = m.data;
    if (!d || !d.s) return;
    let a = null;
    for (const x of estado.values()) if (x.simbolo === d.s) { a = x; break; }
    if (!a) return;
    if (d.e === '24hrMiniTicker') {
      a.precio = Number(d.c);
      a.ultimoDato = Date.now();
    } else if (d.e === 'kline') {
      a.precio = Number(d.k.c);
      a.ultimoDato = Date.now();
      if (a.base === null) { a.base = Number(d.k.o); a.fuenteBase = 'vela'; }
      // Si la vela abierta es de un día nuevo, el día UTC cambió: recargar bases.
      const diaVela = new Date(d.k.t).toISOString().slice(0, 10);
      if (diaVela !== diaUTC) { diaUTC = diaVela; recargar(); }
    }
  };
  ws.onclose = () => {
    $('punto').className = 'punto caido';
    conexion.textContent = 'reconectando…';
    clearTimeout(temporizadorReintento);
    temporizadorReintento = aplazar(conectar, esperaReintento);
    esperaReintento = Math.min(esperaReintento * 2, 30000);
  };
  ws.onerror = () => { try { ws.close(); } catch (e) {} };
}

let recargando = false;
async function recargar() {
  if (recargando) return;
  recargando = true;
  try { await cargarTodo(); } catch (e) { /* se reintenta en el próximo ciclo */ }
  recargando = false;
}

function pintar() {
  if (diaHistorial) return; // el historial no se pisa con el repintado en vivo
  const cont = $('grupos');
  cont.innerHTML = '';
  for (const grupo of ['Empresas', 'Fondos', 'Cripto']) {
    if (grupoFiltro && grupo.toLowerCase() !== grupoFiltro) continue;
    const filas = [...estado.values()].filter(a => a.grupo === grupo);
    if (!filas.length) continue;
    filas.sort((x, y) => {
      const vx = Number.isFinite(x.base) && Number.isFinite(x.precio) ? (x.precio / x.base - 1) : -Infinity;
      const vy = Number.isFinite(y.base) && Number.isFinite(y.precio) ? (y.precio / y.base - 1) : -Infinity;
      return vy - vx;
    });
    const sec = document.createElement('section');
    const h = document.createElement('h2');
    h.textContent = grupo + ' (' + filas.length + ')';
    sec.appendChild(h);
    const tabla = document.createElement('table');
    tabla.innerHTML = '<tr><th>Activo</th><th>Precio (USDT)</th><th>Desde 00:00 UTC</th></tr>';
    for (const a of filas) {
      const v = Number.isFinite(a.base) && Number.isFinite(a.precio) ? (a.precio / a.base - 1) * 100 : NaN;
      const f = fmtVariacion(v);
      const tr = document.createElement('tr');
      const mercado = a.grupo === 'Cripto' ? 'cripto' : 'stock';
      const destino = mercado === 'cripto'
        ? RAIZ + 'mercado/cripto/' + encodeURIComponent(a.codigo) + '/'
        : RAIZ + 'mercado/stock/' + encodeURIComponent(a.codigo) + '/';
      const enlaceActivo = document.createElement('a');
      enlaceActivo.className = 'codigo';
      enlaceActivo.href = destino;
      enlaceActivo.textContent = a.codigo;
      const celdaActivo = document.createElement('td');
      celdaActivo.append(enlaceActivo, document.createTextNode(' '));
      const nombreActivo = document.createElement('span');
      nombreActivo.className = 'nombre';
      nombreActivo.textContent = a.nombre;
      celdaActivo.appendChild(nombreActivo);
      tr.appendChild(celdaActivo);
      const celdaPrecio = document.createElement('td');
      celdaPrecio.className = 'precio';
      celdaPrecio.textContent = fmtPrecio(a.precio);
      const celdaVariacion = document.createElement('td');
      celdaVariacion.className = 'var ' + f.clase;
      celdaVariacion.textContent = f.texto;
      tr.append(celdaPrecio, celdaVariacion);
      tabla.appendChild(tr);
    }
    sec.appendChild(tabla);
    cont.appendChild(sec);
  }
  const ahora = new Date();
  $('reloj').textContent =
    'Revisado ' + ahora.toLocaleTimeString('es-VE') + ' · ' + diaUTC + ' UTC';
}

// Vigilante: un socket colgado no siempre avisa. Si no llega ningún dato en 90 s
// (hay 60 flujos abiertos; silencio total tan largo es conexión muerta, no mercado quieto),
// se cierra y la lógica de onclose reconecta. El estado se ve en la cabecera.
temporizar(() => {
  const ahora = new Date();
  const segundos = ultimoMensaje ? Math.floor((Date.now() - ultimoMensaje) / 1000) : null;
  $('ultimo').textContent =
    segundos === null ? 'sin datos aún' : segundos < 5 ? 'último dato ahora' : 'último dato hace ' + segundos + ' s';
  if (ws && Date.now() - ultimoMensaje > 90000) {
    $('conexion').textContent = 'sin datos; reconectando…';
    $('punto').className = 'punto caido';
    try { ws.close(); } catch (e) {}
  }
}, 5000);

// ---- Historial de días cerrados (registros/historial-monitor) ----
// Jornada D = lista VIP núcleo calculada al cierre de D-1 + variación de la vela diaria de D (00:00 a 23:59:59 UTC).
let diaHistorial = null;
const cacheHist = new Map();
let catalogosHist = null;

async function mesHistorial(mercado, iso) {
  const mes = iso.slice(2, 4) + iso.slice(5, 7), k = mercado + mes;
  if (!cacheHist.has(k)) cacheHist.set(k, traerJSON('registros/historial-monitor/' + mercado + '/' + mes));
  try { return await cacheHist.get(k); } catch (e) { cacheHist.delete(k); throw e; }
}

function enlaceFicha(mercado, codigo, texto) {
  const a = document.createElement('a');
  a.href = RAIZ + 'mercado/' + mercado + '/' + encodeURIComponent(codigo) + '/';
  a.textContent = texto;
  return a;
}

async function mostrarHistorial(iso) {
  const caja = $('historia');
  const barraVivo = $('en-vivo');
  diaHistorial = iso;
  $('estado-vivo').style.display = 'none';
  $('estado-historial').style.display = '';
  barraVivo.setAttribute('aria-pressed', 'false');
  $('grupos').style.display = 'none';
  caja.style.display = '';
  caja.textContent = 'Cargando ' + iso + '…';
  try {
    const idx = await traerJSON('registros/historial-monitor/stock/indice');
    if (iso < idx.desde || iso > idx.hasta) throw new Error('Sin historial para ' + iso + ' (hay del ' + idx.desde + ' al ' + idx.hasta + ').');
    if (!catalogosHist) {
      const [cs, cc] = await Promise.all([traerJSON('registros/catalogo/stock'), traerJSON('registros/catalogo/cripto')]);
      catalogosHist = { stock: new Map(cs.activos.map(a => [a.codigo, a])), cripto: new Map(cc.activos.map(a => [a.codigo, a])) };
    }
    const datos = {};
    for (const m of ['stock', 'cripto']) datos[m] = (await mesHistorial(m, iso)).dias[iso];
    if (diaHistorial !== iso) return; // el usuario cambió de día mientras cargaba
    if (!datos.stock || !datos.cripto) throw new Error('No hay jornada guardada para ' + iso + '.');
    caja.textContent = '';
    const origenes = new Set([datos.stock.lista.origen, datos.cripto.lista.origen]);
    const grupos = { Empresas: [], Fondos: [], Cripto: [] };
    for (const mercado of ['stock', 'cripto']) {
      for (const [codigo, ap, apertura, cierre, variacion, minimo, maximo] of datos[mercado].activos) {
        const info = catalogosHist[mercado].get(codigo) || {};
        const g = mercado === 'cripto' ? 'Cripto' : info.tipo === 'empresa' ? 'Empresas' : 'Fondos';
        grupos[g].push({ mercado, codigo, nombre: info.nombre || codigo, ap, cierre, variacion, minimo, maximo });
      }
    }
    const resultadoGrupo = () => { // con un grupo elegido, el resumen cuenta solo ese grupo (no los ajenos)
      const nombre = grupoFiltro[0].toUpperCase() + grupoFiltro.slice(1);
      const v = grupos[nombre].map(f => f.variacion).filter(Number.isFinite);
      const media = v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
      return ['Resultado del día: ', nombre.toLowerCase() + ' ' + v.filter(x => x > 0.004).length + ' suben, ' + v.filter(x => x < -0.004).length + ' bajan (media ' + fmtVariacion(media).texto + ')', '. Media simple de las variaciones de la lista de este grupo.'];
    };
    const nota = document.createElement('div');
    nota.className = 'hist-nota';
    const lineas = [
      ['Jornada ', iso + ' (UTC)', ', cómo quedó al cierre del día.'],
      ['Lista: ', 'VIP al cierre del ' + datos.stock.lista.cierre, ', el día anterior a la jornada (no usa datos del propio día).'],
      ['Procedencia de la lista: ', origenes.size === 1 && origenes.has('guardado') ? 'guardada' : 'reconstruida', origenes.size === 1 && origenes.has('guardado')
        ? ' (núcleo publicado ese cierre).'
        : ' hoy con la regla actual de 54 campañas (fijada el 27-nov-2026) y las velas guardadas. Antes no existía esa lista en el Monitor.'],
      ['Rendimiento: ', 'vela diaria guardada', ', de las 00:00 a las 23:59:59 UTC. Mín / Máx: el punto más bajo y más alto del día respecto a la misma apertura (sin hora ni orden).'],
      grupoFiltro ? resultadoGrupo() : ['Resultado del día: ', 'acciones y fondos ' + datos.stock.resumen.suben + ' suben, ' + datos.stock.resumen.bajan + ' bajan (media ' + fmtVariacion(datos.stock.resumen.media).texto + ')', '; cripto ' + datos.cripto.resumen.suben + ' suben, ' + datos.cripto.resumen.bajan + ' bajan (media ' + fmtVariacion(datos.cripto.resumen.media).texto + '). Media simple de las variaciones de la lista.'],
      ['Universo: ', 'activos del catálogo con velas guardadas', '; no es el universo completo de Binance.'],
    ];
    for (const [a, b, c] of lineas) {
      const d = document.createElement('div');
      d.appendChild(document.createTextNode(a));
      const strong = document.createElement('b'); strong.textContent = b; d.appendChild(strong);
      d.appendChild(document.createTextNode(c));
      nota.appendChild(d);
    }
    caja.appendChild(nota);
    for (const g of ['Empresas', 'Fondos', 'Cripto']) {
      if (grupoFiltro && g.toLowerCase() !== grupoFiltro) continue;
      const filas = grupos[g];
      if (!filas.length) continue;
      filas.sort((x, y) => y.variacion - x.variacion);
      const mercado = g === 'Cripto' ? 'cripto' : 'stock';
      const sec = document.createElement('section');
      const h = document.createElement('h2');
      h.textContent = g + ' (' + filas.length + ')';
      sec.appendChild(h);
      const tabla = document.createElement('table');
      const cab = document.createElement('tr');
      for (const t of ['Activo', 'Av.', 'Cierre (USDT)', 'Día', 'Mín / Máx']) { const th = document.createElement('th'); th.textContent = t; cab.appendChild(th); }
      tabla.appendChild(cab);
      for (const f of filas) {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        const c = enlaceFicha(f.mercado, f.codigo, f.codigo); c.className = 'codigo';
        td1.appendChild(c);
        const nm = document.createElement('span'); nm.className = 'nombre'; nm.textContent = ' ' + f.nombre; td1.appendChild(nm);
        const td2 = document.createElement('td'); td2.textContent = f.ap === 54 ? '1' : f.ap >= 54 ? '1' : ('.' + String(Math.round(f.ap / 54 * 100)).padStart(2, '0'));
        const td3 = document.createElement('td'); td3.className = 'precio'; td3.textContent = fmtPrecio(f.cierre);
        const v = fmtVariacion(f.variacion);
        const td4 = document.createElement('td'); td4.className = 'var ' + v.clase; td4.textContent = v.texto;
        const td5 = document.createElement('td'); td5.className = 'var';
        td5.title = 'Mínimo y máximo del día respecto a la misma apertura (00:00 UTC) de la variación';
        if (f.minimo == null || f.maximo == null) td5.textContent = '—';
        else {
          const lo = document.createElement('span'); lo.className = 'baja'; lo.textContent = fmtVariacion(f.minimo).texto;
          const hi = document.createElement('span'); hi.className = 'sube'; hi.textContent = fmtVariacion(f.maximo).texto;
          td5.append(lo, document.createTextNode(' / '), hi);
        }
        tr.append(td1, td2, td3, td4, td5); tabla.appendChild(tr);
      }
      sec.appendChild(tabla);
      caja.appendChild(sec);
    }
    if (datos.stock.resumen.suben + datos.stock.resumen.bajan + datos.stock.resumen.iguales === 0 && datos.stock.activos.length === 0) {
      const d = document.createElement('div'); d.className = 'aviso'; d.textContent = 'Sin acciones ni fondos en la lista de ese día.'; caja.appendChild(d);
    }
    $('reloj').textContent = 'Historial: ' + iso + ' UTC (día cerrado)';
  } catch (e) {
    caja.textContent = '';
    const d = document.createElement('div'); d.className = 'aviso'; d.textContent = e.message; caja.appendChild(d);
  }
}

function volverEnVivo() {
  diaHistorial = null;
  $('estado-vivo').style.display = '';
  $('estado-historial').style.display = 'none';
  $('en-vivo').setAttribute('aria-pressed', 'true');
  $('fecha').value = '';
  $('historia').style.display = 'none';
  $('grupos').style.display = '';
  pintar();
}

(async function iniciarHistorial() {
  const diaInicial = opcionesDia;
  const campo = $('fecha');
  try {
    const idx = await traerJSON('registros/historial-monitor/stock/indice');
    campo.min = idx.desde; campo.max = idx.hasta;
  } catch (e) { campo.disabled = true; campo.title = 'Historial no disponible'; }
  campo.addEventListener('change', () => { if (campo.value) mostrarHistorial(campo.value); else volverEnVivo(); alCambiarDia(campo.value || null); });
  $('en-vivo').addEventListener('click', () => { volverEnVivo(); alCambiarDia(null); });
  if (diaInicial) { campo.value = diaInicial; mostrarHistorial(diaInicial); }
})();

(async function iniciar() {
  try {
    await cargarTodo();
  } catch (e) {
    const aviso = $('aviso');
    aviso.style.display = '';
    aviso.textContent = 'No pude cargar las listas del Observatorio: ' + e.message;
    return;
  }
  conectar();
  temporizar(pintar, REVISION_MS);
  temporizar(recargar, RECARGA_MS);
  temporizar(() => {
    if (hoyUTC() !== diaUTC) { diaUTC = hoyUTC(); recargar(); }
  }, 60000);
  pintar();
})();


  liberar = () => { try { if (ws) { ws.onclose = null; ws.close(); } } catch (e) {} };
}

export function entrar(cont, opciones = {}) {
  salir();
  contenedor = cont; RAIZ = opciones.RAIZ || '/'; grupoFiltro = opciones.grupo || null; opcionesDia = opciones.dia || null;
  alCambiarDia = opciones.alCambiarDia || (() => {}); cerrado = false;
  if (!document.getElementById('monitor-vip-css')) { const st = document.createElement('style'); st.id = 'monitor-vip-css'; st.textContent = CSS; document.head.append(st); }
  cont.classList.add('monitor-vip'); cont.innerHTML = HTML;
  cont.querySelector('.mv-volver').href = RAIZ;
  montar();
}
export function salir() {
  cerrado = true; liberar();
  for (const t of temporizadores) { clearInterval(t); clearTimeout(t); }
  temporizadores = [];
  if (contenedor) { contenedor.classList.remove('monitor-vip'); contenedor.replaceChildren(); contenedor = null; }
}
