import { REVISADOS_NO_USD } from './exclusiones.mjs';
// Catalogo completo, solo lectura. Reutiliza la clasificacion de activos.
import { CODIGO_OK, EXCLUIDOS, esBStock, limpiarNombre } from './activos.mjs';
export async function listarUniverso({ fetchImpl = fetch } = {}) {
  const pedir = async (url, permitirAusencia = false) => {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'hugo' } });
    const j = await r.json();
    if (!r.ok && !(permitirAusencia && r.status === 400 && j?.code === -1121)) throw Error(`Catalogo: HTTP ${r.status}; no interpreto bajas.`);
    return j;
  };
  const exchange = await pedir('https://api.binance.com/api/v3/exchangeInfo');
  const productos = await pedir('https://www.binance.com/bapi/asset/v2/public/asset-service/product/get-products?includeEtf=true');
  if (!Array.isArray(exchange?.symbols) || exchange.symbols.length < 100 || !Array.isArray(productos?.data) || productos.data.length < 100) throw Error('Catalogo vacio o incompleto; no interpreto bajas.');
  const porSimbolo = new Map();
  for (const p of productos.data) {
    if (typeof p.s !== 'string' || porSimbolo.has(p.s)) throw Error('Productos invalidos o repetidos; no interpreto bajas.');
    porSimbolo.set(p.s,p);
  }
  const vistos = new Map(), activos = { stock: [], cripto: [] }, revisar = [], nombres = { stock: {}, cripto: {} };
  for (const s of exchange.symbols) {
    if (typeof s.symbol !== 'string' || typeof s.status !== 'string' || typeof s.baseAsset !== 'string' || typeof s.quoteAsset !== 'string' || vistos.has(s.symbol)) throw Error('Lista de pares invalida o repetida; no interpreto bajas.');
    vistos.set(s.symbol,s);
    if (s.status !== 'TRADING' || s.quoteAsset !== 'USDT') continue;
    if (s.symbol !== `${s.baseAsset}USDT`) throw Error('Par inconsistente; no interpreto bajas.');
    if (EXCLUIDOS.has(s.baseAsset)) continue;
    const p = porSimbolo.get(s.symbol);
    if (!p) throw Error('Faltan productos de pares activos; no interpreto bajas.');
    const marcado = Array.isArray(p.tags) && p.tags.includes('bStocks');
    const nombreStock = /bstocks\s*[)）]\s*$/i.test(String(p.an || ''));
    if (marcado !== nombreStock) throw Error('Clasificacion bStocks incoherente; no interpreto bajas.');
    const clase = esBStock(p) ? 'stock' : 'cripto';
    if (marcado && !s.baseAsset.endsWith('B')) throw Error('Base bStocks incoherente; no interpreto bajas.');
    const codigo = marcado ? s.baseAsset.slice(0,-1) : s.baseAsset;
    if (!CODIGO_OK.test(codigo) || (clase === 'cripto' && EXCLUIDOS.has(codigo))) continue;
    if (clase==='cripto' && !REVISADOS_NO_USD.has(codigo) && /usd|stable/i.test(`${codigo} ${p.an || ''} ${(p.tags || []).join(' ')}`)) revisar.push(codigo);
    activos[clase].push(codigo);
    // Nombre ya validado en este cotejo: el motor lo reutiliza y no vuelve a pedir la ficha por activo.
    nombres[clase][codigo] = marcado ? limpiarNombre(p.an) : String(p.an || '');
  }
  for (const clase of ['stock','cripto']) {
    activos[clase].sort();
    if (new Set(activos[clase]).size !== activos[clase].length) throw Error('Codigos repetidos; no interpreto bajas.');
  }
  return { activos, vistos, pedir, revisar, nombres };
}
