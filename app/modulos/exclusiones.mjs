// Exclusiones por identidad y finalidad verificadas el 18-nov-2026.
// No se infieren del precio ni de las letras USD. USDT como cotizacion sigue permitido.
export const FIAT = new Map([['EUR', 'el euro']]);
export const STABLES_USD = new Map([
  ['USDC', 'https://www.circle.com/usdc'],
  ['FDUSD', 'https://www.firstdigitallabs.com/fdusd'],
  ['TUSD', 'https://www.tusd.io/'],
  ['USD1', 'https://docs.worldlibertyfinancial.com/usd1-token/what-is-usd1'],
  ['RLUSD', 'https://ripple.com/products/stablecoin/'],
  ['XUSD', 'https://www.straitsx.com/blog-post/xusd-is-now-listed-on-binance'],
  ['U', 'https://www.u.tech/resources/white-paper/'],
  ['USDE', 'https://docs.ethena.fi/overview/how-usde-works'],
  ['USDS', 'https://www.binance.com/en/square/post/303508954059490'],
  ['USDT', 'https://www.binance.com/en/square/post/42859'],
]);
export const EXCLUIDOS = new Set([...FIAT.keys(), ...STABLES_USD.keys()]);
// Casos revisados que NO pertenecen a esta exclusion de stablecoins USD.
// FRAX es el ex-FXS; BFUSD/RWUSD son productos de rendimiento; EURI/KGST tienen otro anclaje.
export const REVISADOS_NO_USD = new Set(['FRAX', 'BFUSD', 'RWUSD', 'EURI', 'KGST', 'USTC']);
