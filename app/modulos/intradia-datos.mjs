// Datos intradiarios compartidos por el registro y el visor. Sin disco ni red.
export const BASE_INTRADIA = 'registros/intradia/stock';
export const RUTA_INDICE = `${BASE_INTRADIA}/indice.json`;
export const diaUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
export const rutaDia = (dia) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || diaUTC(Date.parse(dia)) !== dia) throw Error('Día UTC inválido.');
  return `${BASE_INTRADIA}/${dia}.json`;
};
export const esRutaIntradia = (r) => r === RUTA_INDICE || /^registros\/intradia\/stock\/\d{4}-\d{2}-\d{2}\.json$/.test(r);
export function leerDia(texto, validar = () => {}) {
  const j = JSON.parse(texto);
  if (j.version !== 1 || !Array.isArray(j.lecturas)) throw Error('Registro intradiario desconocido.');
  rutaDia(j.dia);
  let anterior = -1;
  const referencias = new Map();
  const referenciaDia = diaUTC(Date.parse(j.dia) - 86400000);
  for (const l of j.lecturas) {
    const t = Date.parse(l.generada);
    if (!Number.isFinite(t) || t <= anterior || diaUTC(t) !== j.dia || typeof l.texto !== 'string' || !l.texto.startsWith('#')) throw Error('Lecturas repetidas, fuera de orden o de otro día.');
    const m = l.texto.match(/^generada: (.+)$/m);
    if (!m || Date.parse(m[1]) !== t) throw Error('El instante no coincide con la lectura.');
    if (l.texto.match(/^dia_ref: (.+)$/m)?.[1] !== referenciaDia) throw Error('Referencia diaria de otro día.');
    for (const linea of l.texto.split('\n')) {
      const a = /^([A-Z0-9]+) dia_cierre: (.+)$/.exec(linea);
      if (!a || a[2] === 'sin dato') continue;
      const ref = Number(a[2]);
      if (!Number.isFinite(ref) || ref <= 0) throw Error('Cierre diario no positivo.');
      if (referencias.has(a[1]) && referencias.get(a[1]) !== ref) throw Error('La referencia fija cambió dentro del día.');
      referencias.set(a[1], ref);
    }
    validar(l.texto);
    anterior = t;
  }
  return j;
}
export function unirDias(local, remoto, validar) {
  const a = leerDia(local, validar), b = leerDia(remoto, validar);
  if (a.dia !== b.dia) throw Error('No mezclo días distintos.');
  const mapa = new Map(b.lecturas.map((l) => [l.generada, l]));
  for (const l of a.lecturas) {
    const previa = mapa.get(l.generada);
    if (previa && previa.texto !== l.texto) throw Error('Conflicto: una lectura ya registrada cambió.');
    mapa.set(l.generada, l);
  }
  const lecturas = [...mapa.values()].sort((x, y) => Date.parse(x.generada) - Date.parse(y.generada));
  // Instantes equivalentes escritos de distinta forma tampoco se duplican.
  const texto = JSON.stringify({ version: 1, dia: a.dia, lecturas }) + '\n';
  leerDia(texto, validar);
  return texto;
}
export function leerIndice(texto) {
  const j = JSON.parse(texto);
  if (j.version !== 1 || !Array.isArray(j.dias) || !j.dias.length) throw Error('Índice intradiario vacío o desconocido.');
  if (j.dias.some((d, i) => { rutaDia(d); return i > 0 && d <= j.dias[i - 1]; })) throw Error('Índice intradiario fuera de orden.');
  if (!Number.isFinite(Date.parse(j.ultima)) || !j.dias.includes(diaUTC(Date.parse(j.ultima)))) throw Error('Última lectura fuera del índice.');
  return j;
}
export function unirIndices(a, b) {
  const x = leerIndice(a), y = leerIndice(b);
  return JSON.stringify({ version: 1, dias: [...new Set([...x.dias, ...y.dias])].sort(), ultima: Date.parse(x.ultima) > Date.parse(y.ultima) ? x.ultima : y.ultima }) + '\n';
}
// Alturas desde precio / cierre fijo, nunca sumando porcentajes sucesivos.
// No se unen días UTC: al cambiar el día cambia la referencia.
export function terrenoDia(lecturas, parsear) {
  const barras = lecturas.map((l) => parsear(l.texto));
  const codigos = [...new Set(barras.flatMap((b) => [...(b?.activos?.keys() || [])]))].sort();
  const puntos = barras.map((b) => codigos.map((c) => {
    const a = b?.activos?.get(c);
    const precio = Number(a?.ultimo), ref = Number(a?.dia_cierre);
    if (!a || !Number.isFinite(precio) || !Number.isFinite(ref) || precio <= 0 || ref <= 0) return null;
    const previa = Number(a.previo);
    return { codigo: c, altura: (precio / ref - 1) * 100, precio, referencia: ref,
      movimiento: ['sube', 'igual', 'baja'].includes(a.mov) && Number.isFinite(previa) && previa > 0 ? (precio / previa - 1) * 100 : null,
      cierre: a.cierre, generada: b.generada };
  }));
  return { codigos, barras, puntos };
}
