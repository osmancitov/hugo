// Persistencia: promedio simple de puestos en las carreras participadas (22-nov-2026).
// Cada carrera es una fecha UTC con velas cerradas. Sin vela no hay participación.
// El puesto sigue Día: variación real descendente, empate exacto por código.
// El llamante elige el conjunto de participantes y la ventana, sin pesos ni umbrales.
export function calcularPersistencia(mercado, { inicio, fin }) {
  if (!Number.isSafeInteger(inicio) || !Number.isSafeInteger(fin) || inicio > fin) throw Error('Ventana no válida');
  const carreras = new Map(), acumulados = new Map();
  for (const [codigo, filas] of mercado) {
    const fechas = new Set();
    for (const f of filas) {
      const ts = f[0];
      if (ts < inicio || ts > fin) continue;
      const apertura = Number(f[1]), cierre = Number(f[4]);
      if (!Number.isSafeInteger(ts) || ts % 86400000 || !Number.isFinite(apertura) || !Number.isFinite(cierre) || apertura <= 0 || cierre <= 0) throw Error('Vela no válida: ' + codigo);
      if (fechas.has(ts)) throw Error('Participación repetida: ' + codigo);
      fechas.add(ts);
      if (!carreras.has(ts)) carreras.set(ts, []);
      carreras.get(ts).push([codigo, (cierre / apertura - 1) * 100]);
    }
  }
  for (const filas of carreras.values()) {
    filas.sort((a,b) => b[1]-a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    filas.forEach(([codigo], i) => {
      const a = acumulados.get(codigo) || { sumaPuestos: 0, carreras: 0 };
      a.sumaPuestos += i + 1; a.carreras++;
      acumulados.set(codigo, a);
    });
  }
  return new Map([...acumulados].map(([codigo, a]) => [codigo, { ...a, promedio: a.sumaPuestos / a.carreras }]));
}

// Una sola competencia global. Las listas conservan el mismo promedio y orden;
// no vuelven a calcular carreras por mercado o categoría. Identidad mercado:código.
// Los promedios iguales siguen empatados: el código solo estabiliza su presentación.
export function prepararPersistenciaGlobal(entradas, ventana) {
  const mercado = new Map(), activos = new Map();
  for (const { activo, filas } of entradas) {
    if (!['stock', 'cripto'].includes(activo.clase) || !activo.codigo) throw Error('Identidad de activo no válida');
    const id = activo.clase + ':' + activo.codigo;
    if (activos.has(id)) throw Error('Activo repetido: ' + id);
    activos.set(id, activo); mercado.set(id, filas);
  }
  const calculo = calcularPersistencia(mercado, ventana);
  const global = [...calculo].map(([id, datos]) => ({ id, activo: activos.get(id), ...datos }));
  global.sort((a,b) => a.promedio-b.promedio || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const stocks = global.filter(x => x.activo.clase === 'stock');
  return {
    global,
    stocks,
    empresas: stocks.filter(x => x.activo.tipo === 'empresa'),
    fondos: stocks.filter(x => /^fondo(?:\s|$)/i.test(x.activo.tipo || '')),
    criptos: global.filter(x => x.activo.clase === 'cripto'),
  };
}
