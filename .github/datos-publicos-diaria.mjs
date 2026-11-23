// Fuente oficial de solo lectura para los datos de mercado de la diaria en Actions.
// No redirige otros hosts, métodos, APIs privadas ni la clasificación de productos.
const RUTAS = new Set(['/api/v3/exchangeInfo', '/api/v3/klines']);
export function fetchDatosPublicos(fetchImpl) {
  return (entrada, opciones) => {
    const u=new URL(typeof entrada==='string'||entrada instanceof URL?entrada:entrada.url);
    const metodo=String(opciones?.method || entrada?.method || 'GET').toUpperCase();
    if(u.origin==='https://api.binance.com' && RUTAS.has(u.pathname) && metodo==='GET') {
      u.hostname='data-api.binance.vision';
      return fetchImpl(entrada instanceof Request?new Request(u,entrada):u.toString(),opciones);
    }
    return fetchImpl(entrada,opciones);
  };
}
