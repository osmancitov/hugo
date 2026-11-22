// Revelado progresivo autorizado para Stocks. Criptos se define aparte.
export function estadoNavegacionStocks(hash) {
  if (!hash || hash === '#/') return { mercado: null, categoria: null, ranking: null };
  const m = hash.match(/^#\/stock(?:\/(empresas|fondos))?(?:\/(capitalizacion|variacion|persistencia))?$/);
  if (!m || (m[2] && !m[1])) return null;
  return { mercado: 'stock', categoria: m[1] || null, ranking: m[2] || null };
}
export function listaStocks(catalogo, categoria) {
  if (!['empresas', 'fondos'].includes(categoria)) return [];
  return catalogo.filter(e => e.clase === 'stock' && (categoria === 'empresas' ? e.tipo === 'empresa' : /^fondo(?:\s|$)/i.test(e.tipo || '')));
}
