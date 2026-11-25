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
    const base=l.texto.match(/^dia_base: (.+)$/m)?.[1];
    for (const linea of l.texto.split('\n')) {
      const a = /^([\p{L}\p{N}]+) dia_cierre: (.+)$/u.exec(linea);
      if (!a || a[2] === 'sin dato') continue;
      const ref = Number(a[2]);
      if (!Number.isFinite(ref) || ref <= 0) throw Error('Cierre diario no positivo.');
      if (referencias.has(`${base??'historica'}:${a[1]}`) && referencias.get(`${base??'historica'}:${a[1]}`) !== ref) throw Error('La referencia fija cambió dentro del día.');
      referencias.set(`${base??'historica'}:${a[1]}`, ref);
    }
    if(base && (diaUTC(Date.parse(base))!==j.dia || Date.parse(base)>t)) throw Error('Base intradiaria fuera del día o posterior a la foto.');
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
// Alturas desde el primer precio REAL del día, sin depender de velas diarias.
// Una única toma forma un perfil cero, no un tramo temporal ni otra captura.
export function terrenoDia(lecturas, parsear) {
  const barras = lecturas.map((l) => parsear(l.texto));
  const codigos = [...new Set(barras.flatMap((b) => [...(b?.activos?.keys() || [])]))].sort();
  const base = barras[0];
  const puntos = barras.map((b, j) => codigos.map((c) => {
    const a = b?.activos?.get(c), origen = base?.activos?.get(c);
    const precio = Number(a?.ultimo), ref = Number(origen?.ultimo);
    if (!a || !origen || !Number.isFinite(precio) || !Number.isFinite(ref) || precio <= 0 || ref <= 0) return null;
    const anterior = Number(barras[j - 1]?.activos?.get(c)?.ultimo);
    const sinCierre=j>0&&Number.isFinite(a.cierre)&&Number.isFinite(barras[j-1]?.activos?.get(c)?.cierre)&&a.cierre<=barras[j-1].activos.get(c).cierre;
    const movimiento = j === 0 ? 0 : sinCierre ? null : Number.isFinite(anterior) && anterior > 0 ? (precio / anterior - 1) * 100 : null;
    return { codigo: c, altura: (precio / ref - 1) * 100, precio, referencia: ref,
      movimiento, cierre: a.cierre, generada: b.generada };
  }));
  return { codigos, barras, puntos };
}

const instanteCierre=x=>typeof x==='number'?x:Date.parse(x);

// Referencias del día mostrado, incluidas sus lecturas históricas sin reescribirlas.
export function contextualizarBarra(actual, inicial, previa = inicial) {
  if (!actual || !inicial) return actual;
  const b = { ...actual, activos: new Map([...actual.activos].map(([c,a])=>[c,{...a}])) };
  const d={ref:diaUTC(inicial.generada-86400000),base:inicial.generada,suben:0,bajan:0,iguales:0,sinDato:0};
  const m={comparadaCon:previa.generada,suben:0,bajan:0,iguales:0,sinCierreNuevo:0,sinPrevia:0};
  for(const [c,a] of b.activos){
    const precio=Number(a.ultimo),ref=inicial.activos.get(c),ant=previa.activos.get(c);
    const n=Number(ref?.ultimo),v=Number(ant?.ultimo);
    a.ultimoN=precio;a.dia_cierre=ref?.ultimoTexto??ref?.ultimo??'sin dato';a.diaCierreN=Number.isFinite(n)&&n>0?n:null;
    if(a.diaCierreN===null)d.sinDato++;else if(precio>=n){d.suben++;if(precio===n)d.iguales++;}else d.bajan++;
    a.previo=ant?.ultimoTexto??ant?.ultimo??'sin dato';a.previoN=Number.isFinite(v)&&v>0?v:null;
    if(a.previoN===null){a.mov='sin_previa';m.sinPrevia++;}
    else if(actual.generada!==inicial.generada && Number.isFinite(instanteCierre(a.cierre)) && Number.isFinite(instanteCierre(ant?.cierre)) && instanteCierre(a.cierre)<=instanteCierre(ant.cierre)){a.mov='sin_cierre_nuevo';m.sinCierreNuevo++;}
    else if(precio>=v){a.mov=precio===v?'igual':'sube';m.suben++;if(precio===v)m.iguales++;}
    else{a.mov='baja';m.bajan++;}
  }
  d.sinDato+=b.consultados-b.activos.size;b.dia=d;b.movimiento=m;
  return b;
}
export function lecturasConFrontera(registro,siguiente){
  const lecturas=[...registro.lecturas];
  if(siguiente?.lecturas.length){
    const limite=Date.parse(registro.dia)+86400000,primera=siguiente.lecturas[0];
    // Solo la lectura de frontera real, dentro del primer minuto. No llamar24a01.
    if(Date.parse(siguiente.dia)===limite&&Date.parse(primera.generada)>=limite&&Date.parse(primera.generada)<limite+60000)lecturas.push(primera);
  }
  return {...registro,lecturas};
}
export function diaVisible(indice,ultimo){
  const pos=indice.dias.indexOf(ultimo.dia);
  return ultimo.lecturas.length<2&&pos>0?indice.dias[pos-1]:ultimo.dia;
}
