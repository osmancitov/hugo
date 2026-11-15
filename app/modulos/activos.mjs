// Modulo activos: traduce el CODIGO VISIBLE de un activo (el de la bolsa de valores o del cripto: NVDA, SPCX, BTC)
// al instrumento de Binance que se usa SOLO al consultar. Lo ven el usuario y los archivos: el codigo. Lo ve la
// consulta: el par. Es una biblioteca (sin registrar): la usan los modulos que consultan Binance, sin copiar su logica.
// Regla (no una tabla por activo):
//   - Codigo en el catalogo de bStocks (activos-catalogo.mjs) -> token = codigo + "B", par = token + "USDT".
//   - Codigo fuera del catalogo -> par directo = codigo + "USDT".
//   - Siempre se comprueba en vivo contra Binance: el par existe, esta TRADING, cotiza en USDT y su activo base es el esperado.
//   - Si cabria mas de un instrumento (el codigo es un tokenizado y tambien un cripto con su propio par), no se elige:
//     se rechaza con aviso. Si solo existe CODIGO+B sin estar en el catalogo, tampoco se asume que sea tokenizado.
import { TOKENIZADAS } from './activos-catalogo.mjs';

const API = 'https://api.binance.com';
export const CODIGO_OK = /^[A-Z0-9]{2,15}$/;

export const esTokenizada = (codigo) => Object.hasOwn(TOKENIZADAS, codigo);
export const nombreCatalogo = (codigo) => (esTokenizada(codigo) ? TOKENIZADAS[codigo] : null);

// Consulta un par. Devuelve el objeto del par o null si Binance dice que no existe; lanza ante red u otra respuesta ajena.
async function consultarPar(simbolo, { api, fetchImpl }) {
  const r = await fetchImpl(`${api}/api/v3/exchangeInfo?symbol=${simbolo}`, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'hugo' } });
  const cuerpo = await r.text();
  let info;
  try { info = JSON.parse(cuerpo); } catch { throw new Error(`la respuesta de validacion no fue JSON (HTTP ${r.status})`); }
  if (info && info.code === -1121) return null; // simbolo inexistente
  if (!info || !Array.isArray(info.symbols)) throw new Error(`Binance respondio al validar: ${String((info && (info.msg || info.message)) || cuerpo.slice(0, 120))}`);
  return info.symbols.find((s) => s.symbol === simbolo) || null;
}

const activo = (s, base) => !!s && s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.baseAsset === base;

// Devuelve { ok: true, codigo, simbolo, tipo: 'tokenizado'|'directo' } o { ok: false, motivo }.
export async function resolverActivo(codigoEntrada, opciones = {}) {
  const o = { api: opciones.api || API, fetchImpl: opciones.fetchImpl || fetch };
  const codigo = String(codigoEntrada || '').trim().toUpperCase();
  if (!CODIGO_OK.test(codigo)) return { ok: false, motivo: `\u00ab${codigoEntrada}\u00bb no parece un codigo de activo.` };
  const directo = `${codigo}USDT`;
  const token = `${codigo}BUSDT`;
  if (esTokenizada(codigo)) {
    const [sT, sD] = [await consultarPar(token, o), await consultarPar(directo, o)];
    const tokenOk = activo(sT, `${codigo}B`);
    const directoOk = activo(sD, codigo);
    if (tokenOk && directoOk) return { ok: false, motivo: `${codigo} es ambiguo: existe como acci\u00f3n tokenizada (${token}) y tambi\u00e9n como activo propio (${directo}). No elijo por mi cuenta; hay que decidir c\u00f3mo distinguirlos.` };
    if (tokenOk) return { ok: true, codigo, simbolo: token, tipo: 'tokenizado' };
    return { ok: false, motivo: `${codigo} est\u00e1 en el cat\u00e1logo de tokenizadas pero su par ${token} no est\u00e1 activo (TRADING en USDT) en Binance; no lo sustituyo por otro instrumento.` };
  }
  const sD = await consultarPar(directo, o);
  if (activo(sD, codigo)) return { ok: true, codigo, simbolo: directo, tipo: 'directo' };
  const sT = await consultarPar(token, o);
  if (activo(sT, `${codigo}B`)) return { ok: false, motivo: `${codigo} no est\u00e1 en el cat\u00e1logo de tokenizadas y no tiene par propio activo; existe ${token}, pero no doy por hecho que sea el tokenizado de ${codigo}. Hay que a\u00f1adirlo al cat\u00e1logo si lo es.` };
  return { ok: false, motivo: `No encuentro ${codigo} en Binance contra USDT (ni como activo propio ni como tokenizado). No guardo nada.` };
}
