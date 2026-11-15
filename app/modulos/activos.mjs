// Modulo activos: traduce el CODIGO VISIBLE de un activo (el de la bolsa de valores o del cripto: NVDA, SPCX, BTC)
// al instrumento de Binance que se usa SOLO al consultar. Lo ven el usuario y los archivos: el codigo. Lo ve la
// consulta: el par. Es una biblioteca (sin registrar): la usan los modulos que consultan Binance, sin copiar su logica.
// La CLASE la dice la orden (registra stock X / registra cripto X): no se busca ni se adivina entre clases. No hay tabla ni
// lista por activo: todo se comprueba en vivo contra Binance en cada orden.
//   Identidad del instrumento (API documentada, exchangeInfo): el par existe, esta TRADING, cotiza en USDT y su activo base
//   es exactamente el esperado.
//   - stock: la accion tokenizada de la bolsa de valores. Par CODIGO+B+USDT (base CODIGOB); solo vale si Binance lo etiqueta
//     bStocks en su lista publica de productos (campo "tags", y su nombre termina en "(bStocks)").
//   - cripto: par CODIGO+USDT (base CODIGO) y que Binance NO lo etiquete bStocks (si lo etiqueta, es una accion tokenizada
//     y se rechaza con la orden correcta: base exacta sola no basta, p. ej. NVDAB existe como par).
//   Si falla la clasificacion (red, respuesta ajena), la orden se detiene: no se adivina.
// Limite conocido: la lista de productos (bapi) es la API publica interna de la web de Binance, no la documentada del
// Spot ni estable; no hay una clasificacion documentada. Si dejara de servirla, las ordenes se detienen con aviso claro.
// Las clases tambien definen las carpetas del registro (velas-24h/<clase>/<CODIGO>/): una sola fuente para velas y sync.
export const CODIGO_OK = /^[A-Z0-9]{2,15}$/;
export const CLASES = ['stock', 'cripto'];

const API = 'https://api.binance.com';
const WEB = 'https://www.binance.com';
const VIGENCIA_MS = 10 * 60 * 1000;
let cacheProductos = null; // { t, porSimbolo }

async function pedirJSON(url, fetchImpl, que) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'hugo' } });
  const cuerpo = await r.text();
  try { return JSON.parse(cuerpo); } catch { throw new Error(`${que}: la respuesta no fue JSON (HTTP ${r.status})`); }
}

// Consulta un par en exchangeInfo. Devuelve el par o null si Binance dice que no existe; lanza ante red u otra respuesta ajena.
async function consultarPar(simbolo, { api, fetchImpl }) {
  const info = await pedirJSON(`${api}/api/v3/exchangeInfo?symbol=${simbolo}`, fetchImpl, 'validacion');
  if (info && info.code === -1121) return null; // simbolo inexistente
  if (!info || !Array.isArray(info.symbols)) throw new Error(`Binance respondio al validar: ${String((info && (info.msg || info.message)) || '').slice(0, 120)}`);
  return info.symbols.find((s) => s.symbol === simbolo) || null;
}

const vigente = (s, base) => !!s && s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.baseAsset === base;

// Producto en la lista publica de Binance (con su etiqueta de tipo y nombre). Lanza si no se puede leer.
async function productoDe(simbolo, { web, fetchImpl }) {
  if (!cacheProductos || Date.now() - cacheProductos.t > VIGENCIA_MS) {
    const j = await pedirJSON(`${web}/bapi/asset/v2/public/asset-service/product/get-products?includeEtf=true`, fetchImpl, 'clasificacion');
    if (!j || !Array.isArray(j.data) || j.data.length < 100) throw new Error('clasificacion: Binance no devolvio la lista de productos');
    cacheProductos = { t: Date.now(), porSimbolo: new Map(j.data.map((p) => [p.s, p])) };
  }
  return cacheProductos.porSimbolo.get(simbolo) || null;
}

const esBStock = (p) => !!p && Array.isArray(p.tags) && p.tags.includes('bStocks') && /bstocks\s*[)）]\s*$/i.test(String(p.an || ''));
const limpiarNombre = (an) => String(an || '').replace(/\s*[(（]\s*bStocks\s*[)）]\s*$/i, '').trim();

// Devuelve { ok: true, clase, codigo, simbolo, nombre? } o { ok: false, motivo }.
export async function resolverActivo(clase, codigoEntrada, opciones = {}) {
  const o = { api: opciones.api || API, web: opciones.web || WEB, fetchImpl: opciones.fetchImpl || fetch };
  if (!CLASES.includes(clase)) return { ok: false, motivo: `Falta la clase: usa \`registra stock ${codigoEntrada}\` o \`registra cripto ${codigoEntrada}\`.` };
  const codigo = String(codigoEntrada || '').trim().toUpperCase();
  if (!CODIGO_OK.test(codigo)) return { ok: false, motivo: `\u00ab${codigoEntrada}\u00bb no parece un codigo de activo.` };
  if (clase === 'stock') {
    const simbolo = `${codigo}BUSDT`;
    if (!vigente(await consultarPar(simbolo, o), `${codigo}B`)) return { ok: false, motivo: `No encuentro la acci\u00f3n tokenizada ${codigo} (${simbolo}) activa en Binance.` };
    const producto = await productoDe(simbolo, o);
    if (!esBStock(producto)) return { ok: false, motivo: `${simbolo} existe, pero Binance no lo etiqueta como bStocks; no es una acci\u00f3n tokenizada de ${codigo}.` };
    return { ok: true, clase, codigo, simbolo, nombre: limpiarNombre(producto.an) };
  }
  const simbolo = `${codigo}USDT`;
  if (!vigente(await consultarPar(simbolo, o), codigo)) return { ok: false, motivo: `No encuentro el cripto ${codigo} (${simbolo}) activo en Binance.` };
  const producto = await productoDe(simbolo, o);
  if (esBStock(producto)) return { ok: false, motivo: `${simbolo} es una acci\u00f3n tokenizada (\u00ab${producto.an}\u00bb), no un cripto. Para ella usa \`registra stock ${codigo.replace(/B$/, '')}\`.` };
  return { ok: true, clase, codigo, simbolo, nombre: producto ? String(producto.an || '') : '' };
}
