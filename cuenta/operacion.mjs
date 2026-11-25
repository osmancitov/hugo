// Una operación: compra y venta con todo el saldo, sin comisión aparte.
// El usuario da el saldo final y el precio de compra; la venta se calcula para que cuadre.
// La comisión ya va dentro de ese saldo final: no se suma ni se descuenta otra vez.
const c2 = n => Math.round(n * 100) / 100;
export function cuadrarOperacion({ saldoPrevio, compra, saldoFinal }) {
  for (const [k, v] of Object.entries({ saldoPrevio, compra, saldoFinal })) if (!Number.isFinite(v) || v <= 0) throw Error(`${k} debe ser un número positivo`);
  const exacta = compra * saldoFinal / saldoPrevio;
  // Menos decimales que den el mismo saldo al centavo; así el precio queda lo más corto posible.
  for (let d = 2; d <= 8; d++) {
    const venta = Number(exacta.toFixed(d));
    if (c2(saldoPrevio * venta / compra) === c2(saldoFinal)) {
      return { venta, decimales: d, change: c2(saldoFinal - saldoPrevio), percent: c2((saldoFinal / saldoPrevio - 1) * 100), balance: c2(saldoFinal) };
    }
  }
  throw Error('No hay un precio de venta que cuadre con ese saldo final');
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function etiquetaFecha(iso) { const [, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]}`; }
export function nuevoRegistro({ anteriores, activo, codigo, mercado, compra, saldoFinal, fecha, horaCompra, horaVenta, fechaCompra }) {
  const saldoPrevio = anteriores[0].balance;
  const r = cuadrarOperacion({ saldoPrevio, compra, saldoFinal });
  const reg = { date: fecha, label: etiquetaFecha(fecha), asset: activo };
  if (codigo) { reg.codigo = codigo; reg.mercado = mercado; }
  Object.assign(reg, { change: r.change, balance: r.balance, percent: r.percent, buy: compra, sell: r.venta, buy_time: horaCompra, buy_date: fechaCompra || fecha, sell_date: fecha, sell_time: horaVenta, balance_confirmed: true });
  if (r.decimales !== 2) reg.price_decimals = r.decimales;
  return reg;
}
