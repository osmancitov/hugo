// Modulo activos: traduce el CODIGO VISIBLE de un activo (el de la bolsa de valores o del cripto: NVDA, SPCX, BTC)
// al instrumento de Binance que se usa SOLO al consultar. Lo ven el usuario y los archivos: el codigo. Lo ve la
// consulta: el par. Es una biblioteca (sin registrar): la usan los modulos que consultan Binance, sin copiar su logica.
// No hay tabla ni lista por activo: todo se comprueba en vivo contra Binance en cada orden.
//   Identidad del instrumento (API documentada, exchangeInfo): el par existe, esta TRADING, cotiza en USDT y su activo
//   base es exactamente el esperado.
//   - CODIGO+USDT con base CODIGO: es el activo mismo; se acepta sin clasificar nada.
//   - CODIGO+B+USDT con base CODIGOB: solo vale como accion tokenizada si Binance la etiqueta bStocks en su lista publica de
//     productos (campo "tags", y su nombre termina en "(bStocks)"). Sin etiqueta no se asume que la B signifique tokenizado.
//   - Si el codigo resuelve a dos instrumentos (un bStock y un cripto con el mismo codigo, p. ej. STX), no se elige: se
//     rechaza con aviso. Si falla la clasificacion (red, respuesta ajena), se detiene la orden; no se adivina.
// Limite conocido: la lista de productos (bapi) es la API publica interna de la web de Binance, no la documentada del
// Spot; no hay una clasificacion documentada. Si dejara de servirla, el efecto es detener los tokenizados con aviso claro
// (los activos directos no dependen de ella).
export const CODIGO_OK = /^[A-Z0-9]{2,15}$/;

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

// Devuelve { ok: true, codigo, simbolo, tipo: 'tokenizado'|'directo', nombre? } o { ok: false, motivo }.
export async function resolverActivo(codigoEntrada, opciones = {}) {
  const o = { api: opciones.api || API, web: opciones.web || WEB, fetchImpl: opciones.fetchImpl || fetch };
  const codigo = String(codigoEntrada || '').trim().toUpperCase();
  if (!CODIGO_OK.test(codigo)) return { ok: false, motivo: `\u00ab${codigoEntrada}\u00bb no parece un codigo de activo.` };
  const directo = `${codigo}USDT`;
  const conB = `${codigo}BUSDT`;
  const directoOk = vigente(await consultarPar(directo, o), codigo);
  const conBOk = vigente(await consultarPar(conB, o), `${codigo}B`);
  let producto = null;
  if (conBOk) producto = await productoDe(conB, o); // solo se clasifica si hay un candidato con B
  const tokenizado = conBOk && esBStock(producto);
  if (directoOk && tokenizado) return { ok: false, motivo: `${codigo} es ambiguo: existe como acci\u00f3n tokenizada (${conB}, \u00ab${producto.an}\u00bb) y tambi\u00e9n como activo propio (${directo}). No elijo por mi cuenta.` };
  if (tokenizado) return { ok: true, codigo, simbolo: conB, tipo: 'tokenizado', nombre: limpiarNombre(producto.an) };
  if (directoOk) return { ok: true, codigo, simbolo: directo, tipo: 'directo' };
  if (conBOk) return { ok: false, motivo: `${codigo} no tiene par propio activo y existe ${conB}, pero Binance no lo etiqueta como bStocks; no doy por hecho que la B signifique tokenizado.` };
  return { ok: false, motivo: `No encuentro ${codigo} en Binance contra USDT (ni como activo propio ni como tokenizado).` };
}
