import { fechaLegibleUTC } from './app/modulos/fechas-visor.mjs';
import { validarMes, resumir, separar, corteUTC, DIA, razonVariacion, cambiosDireccion } from './app/modulos/visor-rachas-datos.mjs';
const RAW = 'https://raw.githubusercontent.com/osmancitov/hugo/main';
const PISO_TS = Date.UTC(2026, 7, 1); // el mismo piso del registro que usa el bot (PISO_DIA)
const aammdd = (ts) => new Date(ts).toISOString().slice(2, 10).replace(/-/g, '');
const aamm = (ts) => aammdd(ts).slice(0, 4);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fecha = fechaLegibleUTC;
const fechaCorta = t => { const f = new Date(t); return f.getUTCDate() + ' ' + MESES[f.getUTCMonth()]; };
const pct = n => (n > 0 ? '+' : '') + n.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Solo presentación: redondeo simétrico; ±0,5 se muestra ±1 y los ceros no llevan signo.
export const enteroPorcentaje = n => Math.sign(n) * Math.round(Math.abs(n));
export const clasePorcentaje = n => enteroPorcentaje(n) === 0 ? 'igual' : n < 0 ? 'negativo' : 'positivo';
export const porcentajeEntero = n => { const v = enteroPorcentaje(n); return v === 0 ? '0' : (v > 0 ? '+' : '') + v.toLocaleString('es'); };
const pct0 = porcentajeEntero;
const texto = (tag, valor, clase = '') => { const n = document.createElement(tag); n.textContent = valor; if (clase) n.className = clase; return n; };
let pendiente, ultimo, clase = 'todos', orden = 'gp', direccionRacha = 'todas';
async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(25000), cache: 'no-cache' });
  if (!r.ok) throw Error('No se pudo leer GitHub (HTTP ' + r.status + ')');
  return r.json();
}

// La Lectura del día y el ranking de la jornada los calcula Hugo una vez al día dentro de la
// sincronización (decisión del usuario, 20-nov-2026): un archivo por día y mercado en
// registros/pre-calculado/<mercado>/lectura-dia-90d/ y registros/ranking-24h/<mercado>/.
// Se pide el del último día cerrado y, si la pasada aún no lo subió, el de hasta dos días
// antes; sin archivo, el visor calcula la misma ventana desde los registros (ver cargar).
export function ventanaDelDia(cantidad = 90) {
  const fin = corteUTC() - DIA;
  return { inicio: Math.max(fin - (cantidad - 1) * DIA, PISO_TS), fin, cantidad, unidad: 'd' };
}
async function leerLecturaPre(mercado) {
  for (let d = 0; d <= 2; d++) {
    const fin = corteUTC() - DIA - d * DIA;
    const r = await fetch(`${RAW}/registros/pre-calculado/${mercado}/lectura-dia-90d/${aammdd(fin)}_lectura-dia`, { cache: 'no-cache' });
    if (r.ok) { const pre = await r.json(); if (pre && pre.activos && pre.ventana) return pre; }
  }
  return null;
}
async function leerRankingPre(mercado, fin) {
  const r = await fetch(`${RAW}/registros/ranking-24h/${mercado}/${aammdd(fin)}_ranking-24h`, { cache: 'no-cache' });
  return r.ok ? r.json() : null;
}

// Puestos únicos: desde el 22-nov-2026 el usuario pide mayores subidas primero.
// Se ordena por variación real, nunca por el entero visible; empate exacto por código.
// El archivo conserva su formato y orden de almacenamiento, sin reescribir históricos.
export function puestosDelDia(ranking, activos, corte) {
  const puestos = new Map();
  const delDia = Array.isArray(ranking) && ranking.length
    ? ranking.map(([cod, variacion]) => [cod, variacion])
    : Object.entries(activos).filter(([, d]) => d.fecha === corte).map(([cod,d]) => [cod,d.variacion]);
  delDia.sort((a,b) => b[1]-a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  delDia.forEach(([cod],i) => puestos.set(cod,i+1));
  return puestos;
}
export function resultadoDesdeLectura(activo, pre, puestos) {
  const d = pre.activos[activo.codigo];
  if (!d) return { activo, error: 'Sin lectura en la ventana' };
  return { activo, datos: { ...d, gp: d.gp === null ? Infinity : d.gp, puesto: puestos.get(activo.codigo) ?? null } };
}

// Meses aamm que toca una ventana, para el repliegue: solo se piden esos archivos por activo.
export function mesesVentana(inicio, fin) {
  const out = [];
  let t = Date.UTC(new Date(inicio).getUTCFullYear(), new Date(inicio).getUTCMonth(), 1);
  while (t <= fin) { out.push(aamm(t)); t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1); }
  return out;
}

async function cargar(catalogo, progreso) {
  const corte = corteUTC();
  const resultados = new Array(catalogo.length);
  const origen = {}, ventanaPorMercado = {};
  await Promise.all(['stock', 'cripto'].map(async (mercado) => {
    const indices = [];
    catalogo.forEach((e, i) => { if (e.clase === mercado) indices.push(i); });
    if (!indices.length) return;
    const pre = await leerLecturaPre(mercado).catch(() => null);
    if (pre) {
      ventanaPorMercado[mercado] = pre.ventana;
      const ranking = await leerRankingPre(mercado, pre.corte).catch(() => null);
      const puestos = puestosDelDia(ranking, pre.activos, pre.corte);
      for (const i of indices) resultados[i] = resultadoDesdeLectura(catalogo[i], pre, puestos);
      origen[mercado] = 'archivo';
      return;
    }
    // Repliegue honesto: la misma ventana de 90 días, calculada en la visita desde los meses
    // que la tocan; no se recorre el registro completo ni se muestra otra definición.
    const ventana = ventanaDelDia();
    const { inicio, fin } = ventana;
    ventanaPorMercado[mercado] = ventana;
    const meses = mesesVentana(inicio, fin);
    const porCodigo = {};
    let cursor = 0, hechos = 0;
    async function trabajador() {
      while (cursor < indices.length) {
        const i = indices[cursor++], e = catalogo[i];
        try {
          let filas = [];
          for (const mes of meses) {
            try {
              filas.push(...validarMes(await json(`${RAW}/registros/velas-24h/${mercado}/${encodeURIComponent(e.codigo)}/${mes}_${encodeURIComponent(e.codigo)}`), mes, corte));
            } catch { /* mes ausente o inválido: el hueco queda, no se rellena */ }
          }
          filas = filas.filter((f) => f[0] >= inicio && f[0] <= fin).sort((a, b) => a[0] - b[0]);
          if (!filas.length) throw Error('Sin lectura en la ventana');
          const datos = resumir(filas);
          datos.gp = razonVariacion(filas).razon;
          datos.cambios = cambiosDireccion(filas);
          resultados[i] = { activo: e, datos };
          porCodigo[e.codigo] = datos;
        } catch (err) { resultados[i] = { activo: e, error: err.message }; }
        progreso(++hechos, indices.length, e.codigo);
      }
    }
    await Promise.all(Array.from({ length: 6 }, trabajador));
    const puestos = puestosDelDia(null, porCodigo, fin);
    for (const i of indices) if (resultados[i].datos) resultados[i].datos.puesto = puestos.get(catalogo[i].codigo) ?? null;
    origen[mercado] = 'visor';
  }));
  return { resultados, corte, origen, ventanaPorMercado };
}

function textoFuente(origen) {
  const nombre = { stock: 'Stocks', cripto: 'Cripto' };
  const parte = (m) => origen[m] === 'archivo' ? null : `${nombre[m]}: calculada por el visor (archivo del día aún no publicado)`;
  const notas = ['stock', 'cripto'].map(parte).filter(Boolean);
  if (!notas.length) return 'Lectura del día precalculada por Hugo en la sincronización diaria.';
  if (notas.length === 2) return 'Lectura calculada por el visor desde los registros: los archivos del día aún no están publicados.';
  return 'Lectura del día. ' + notas[0] + '.';
}

export function montarRachas(contenedor, catalogo, consulta, mercado = null, buscador = null, filtroActivos = () => true) {
  if (mercado) clase = mercado; // espacio por mercado (decisión del usuario, 20-nov-2026): el selector de clase no aplica; el catálogo llega completo y la lectura se reutiliza al cambiar de espacio
  // Sin título propio (decisión del usuario, 20-nov-2026): el título combinado del espacio (p. ej. «Stocks Variación») ya corona la vista.
  const nota = texto('p', 'Lectura del día sobre la ventana de 90 días terminada en la última vela cerrada; no cotizaciones en vivo. Una racha, al alza o a la baja, no anuncia lo que viene después.', 'rachas-nota');
  const controles = texto('div', '', 'rachas-controles');
  const selector = document.createElement('select'); selector.setAttribute('aria-label', 'Clase de activos');
  for (const [v,t] of [['todos','Todos'],['cripto','Cripto'],['stock','Stocks']]) { const o = texto('option',t); o.value=v; selector.append(o); } selector.value=clase;
  if (mercado) selector.hidden = true;
  const clasificar = document.createElement('select'); clasificar.setAttribute('aria-label','Orden de la lista');
  for (const [v,t] of [['gp','G/P'],['ranking','Día'],['cambios','Oscilación'],['rango','Rango diario'],['dias','Racha'],['subida','Variación acumulada']]) { const o=texto('option',t); o.value=v; clasificar.append(o); } clasificar.value=orden;
  const filtroRacha = document.createElement('select'); filtroRacha.setAttribute('aria-label','Dirección de la racha');
  // G/P y Día muestran la lista completa: sin filtro de racha heredado de otro modo.
  // Día conserva los puestos diarios, sin recortes por dirección (22-nov-2026).
  function pintarFiltroRacha() {
    const soloTodas = orden==='gp' || orden==='ranking';
    filtroRacha.hidden = soloTodas;
    const ops = soloTodas ? [['todas','Rachas: todas']] : [['todas','Rachas: todas'],['bajan','Solo rachas a la baja'],['suben','Solo rachas al alza']];
    filtroRacha.replaceChildren();
    for (const [v,t] of ops) { const o=texto('option',t); o.value=v; filtroRacha.append(o); }
    if (soloTodas) direccionRacha='todas';
    filtroRacha.value=direccionRacha;
  }
  pintarFiltroRacha();
  const recargar=texto('button','Actualizar lectura','boton');
  const estado=texto('p','Preparando la lectura…','rachas-nota'); estado.setAttribute('role','status');
  let avanceNum=null, avanceBarra=null, avanceCod=null;
  function avanzar(n,total,codigo,leyenda='Analizando los registros') {
    if(!estado.isConnected) return;
    if(!avanceNum) {
      estado.className='rachas-cargando';
      avanceNum=texto('strong','','rachas-cargando-cifra');
      avanceCod=document.createTextNode('');
      const barra=texto('span','','rachas-cargando-barra'); avanceBarra=texto('span',''); barra.append(avanceBarra);
      estado.replaceChildren(document.createTextNode(leyenda), document.createElement('br'), avanceNum, document.createTextNode(' activos'), avanceCod, barra);
    }
    avanceNum.textContent=n+'/'+total;
    avanceCod.textContent=codigo?' · '+codigo:'';
    avanceBarra.style.width=(n/total*100)+'%';
  }
  function finCarga() { avanceNum=avanceBarra=avanceCod=null; estado.className='rachas-nota'; }
  // Sin repaso de presentación (decisión del usuario, 20-nov-2026): la lectura ya viene
  // analizada por Hugo y la tabla sale directo; la barra de avance queda solo para el
  // repliegue en vivo, que sí trabaja en la visita.
  const fuente=texto('p','','rachas-nota');
  const cuerpo=document.createElement('div'); cuerpo.className='rachas-cuerpo';
  const reglas=document.createElement('details'); reglas.className='rachas-reglas'; reglas.append(texto('summary','Cómo leer los datos'));
  reglas.append(texto('p','Lectura del día: Hugo deja calculadas estas métricas cada día sobre la ventana de 90 días. Si el archivo del día aún no está publicado, el visor calcula la misma ventana en la visita.'));
  reglas.append(texto('p','Activo: el código del activo; su fila abre su gráfica habitual.'));
  reglas.append(texto('p','R %: rango diario, la amplitud de la última vela: lo que separa su máximo de su mínimo, como porcentaje de su apertura.'));
  reglas.append(texto('p','Racha: días seguidos cerrando en la misma dirección; el sentido lo da el color. ≥ y * avisan de que pudo ser más larga, cortada por un hueco en los datos o por el inicio de la ventana.'));
  reglas.append(texto('p','A %: variación acumulada, el cambio del precio durante la racha, desde la apertura del primer día hasta el cierre del último, con su signo.'));
  reglas.append(texto('p','Los porcentajes enteros que redondean a cero se muestran como 0 en gris, sin signo. ±0,5 redondea a ±1. El orden usa el valor real, no el redondeado.'));
  reglas.append(texto('p','G/P: la razón de variación sobre la ventana de la lectura: la suma de las variaciones porcentuales de los días verdes dividida entre la magnitud de la suma de las de los rojos. Sin días rojos muestra ∞ y ordena primero; sin días verdes, 0.'));
  reglas.append(texto('p','OSC: oscilación, cambios de dirección en la ventana: cada vez que un día verde sigue a uno rojo o al revés.'));
  reglas.append(texto('p','Día: posición única por variación de la jornada (cierre frente a apertura), de la mayor subida a la mayor caída; un empate exacto se ordena por código.'));
  controles.append(selector,clasificar,filtroRacha,recargar);
  if (buscador) controles.appendChild(buscador); // la misma pieza de búsqueda, junto a la tabla que filtra
  contenedor.append(nota,controles,estado,fuente,reglas,cuerpo);
  function pintar() {
    if (!ultimo || !contenedor.isConnected) return;
    const todos=ultimo.resultados.filter(x=>(clase==='todos'||x.activo.clase===clase)&&filtroActivos(x.activo));
    const partes=separar(todos), q=consulta().toLowerCase();
    const coincide=x=>!q||[x.activo.codigo,x.activo.nombre,x.activo.lectura||''].some(t=>t.toLowerCase().includes(q));
    const visibles=partes.comparables.filter(coincide).filter(x=>direccionRacha==='todas'||(direccionRacha==='bajan'?x.datos.direccion<0:x.datos.direccion>0));
    visibles.sort((a,b)=> {
      const x=a.datos,y=b.datos;
      const total=(u,v)=>Number(u.limitada)-Number(v.limitada)||u.acumulado-v.acumulado;
      const gp=v=>v.gp===Infinity?Number.MAX_VALUE:Math.round(v.gp*100)/100; // un solo valor, a dos decimales, para ordenar y mostrar
      const d=orden==='subida'?total(y,x):orden==='dias'?y.dias-x.dias:orden==='cambios'?y.cambios-x.cambios:orden==='rango'?y.rango-x.rango:orden==='ranking'?(x.puesto??Number.MAX_VALUE)-(y.puesto??Number.MAX_VALUE):orden==='gp'?gp(y)-gp(x):total(x,y);
      return d || a.activo.clase.localeCompare(b.activo.clase) || a.activo.codigo.localeCompare(b.activo.codigo);
    });
    cuerpo.replaceChildren();
    finCarga();
    const v=ultimo.ventanaPorMercado[clase]||ultimo.ventanaPorMercado.stock||ultimo.ventanaPorMercado.cripto;
    estado.textContent=partes.fecha===null?'No hay datos comparables.':`Jornada de referencia: ${fecha(partes.fecha)} UTC · ventana ${fechaCorta(v.inicio)} → ${fechaCorta(v.fin)} · ${partes.comparables.length}/${todos.length} activos con esa vela · ${visibles.length} visibles.`;
    if (partes.fecha!==null && partes.fecha < ultimo.corte-DIA) estado.textContent+=' El registro está atrasado respecto al último día cerrado en UTC.';
    fuente.textContent=textoFuente(ultimo.origen);
    const caja=texto('div','','rachas-tabla-caja'); const tabla=document.createElement('table'); tabla.className='rachas-tabla';
    const cab=document.createElement('thead'); const tr=document.createElement('tr');
    for(const t of (orden==='ranking'?['#','Activo','R %','Racha','A %','G/P','OSC']:['Activo','R %','Racha','A %','G/P','OSC'])) { const th=texto('th',t); th.scope='col'; if(t==='Activo') th.className='col-activo'; tr.append(th); } cab.append(tr);
    const body=document.createElement('tbody');
    for (const x of visibles) {
      const e=x.activo,d=x.datos, r=document.createElement('tr'), a=texto('a',e.codigo); a.href='#/a/'+e.clase+'/'+encodeURIComponent(e.codigo); a.className='activo-fila rachas-enlace';
      const id=texto('td','','col-activo'); id.append(a,texto('span',e.nombre+' · '+e.clase,'rachas-nombre'));
      const dias=texto('td',(d.limitada?'≥ ':'')+d.dias,d.direccion>0?'positivo':d.direccion<0?'negativo':'');
      const acum=texto('td',d.dias?pct0(d.acumulado)+(d.limitada?' *':''):pct0(0),clasePorcentaje(d.dias ? d.acumulado : 0));
      if(d.limitada) { id.append(texto('small',d.motivo,'rachas-limite')); acum.title='Variación del tramo observado: '+d.motivo; } // la nota va bajo el nombre: en la celda de la racha se partía letra a letra
      const rango=texto('td',Math.round(d.rango).toLocaleString('es'));
      const gp=texto('td',d.gp===Infinity?'∞':(Math.round(d.gp*100)/100).toLocaleString('es',{minimumFractionDigits:2,maximumFractionDigits:2}));
      if(d.gp===Infinity) gp.title='Sin días rojos en la ventana: el equilibrio no tiene fin.';
      const cam=texto('td',String(d.cambios));
      if(orden==='ranking') r.append(texto('td',d.puesto==null?'—':String(d.puesto)));
      r.append(id,rango,dias,acum,gp,cam); body.append(r);
    }
    tabla.append(cab,body); caja.append(tabla); cuerpo.append(caja);
    if(!visibles.length) cuerpo.append(texto('p','Ningún activo coincide con los filtros.','vacio'));
    const incidencias=partes.atrasados.concat(partes.errores).filter(coincide);
    if(incidencias.length) {
      const det=document.createElement('details'); det.className='rachas-incidencias'; det.append(texto('summary',`${partes.atrasados.length} atrasados · ${partes.errores.length} sin lectura válida (fuera del orden)`));
      const ul=document.createElement('ul'); for(const x of incidencias) ul.append(texto('li',x.activo.codigo+' · '+x.activo.clase+': '+(x.datos?'última vela '+fecha(x.datos.fecha)+' UTC':x.error))); det.append(ul); cuerpo.append(det);
    }
  }
  selector.onchange=()=>{clase=selector.value;pintar();}; clasificar.onchange=()=>{orden=clasificar.value;pintarFiltroRacha();pintar();}; filtroRacha.onchange=()=>{direccionRacha=filtroRacha.value;pintar();};
  async function iniciar(forzar=false) {
    recargar.disabled=true;
    if(forzar) {ultimo=null;pendiente=null;cuerpo.replaceChildren();}
    try {
      if(!pendiente) pendiente=cargar(catalogo,avanzar);
      ultimo=await pendiente;
      pintar();
    } catch(err) {pendiente=null;finCarga();estado.textContent='No pude completar la lectura: '+err.message+'. No se muestra un orden parcial como completo.';}
    finally {recargar.disabled=false;}
  }
  recargar.onclick=()=>iniciar(true); iniciar();
  return pintar;
}
