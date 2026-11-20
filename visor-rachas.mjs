import { validarMes, resumir, separar, corteUTC, DIA, razonVariacion } from './visor-rachas-datos.mjs';
const API = 'https://api.github.com/repos/osmancitov/hugo';
const BASE = 'https://raw.githubusercontent.com/osmancitov/hugo';
const fecha = t => new Date(t).toISOString().slice(0,10);
const pct = n => (n > 0 ? '+' : '') + n.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const texto = (tag, valor, clase = '') => { const n = document.createElement(tag); n.textContent = valor; if (clase) n.className = clase; return n; };
let pendiente, ultimo, revision = '', clase = 'todos', orden = 'gp', direccionRacha = 'todas';
async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(25000), cache: 'no-cache' });
  if (!r.ok) throw Error('No se pudo leer GitHub (HTTP ' + r.status + ')');
  return r.json();
}
async function cargar(catalogo, progreso) {
  const corte = corteUTC();
  const commit = await json(API + '/commits/main');
  if (!/^[0-9a-f]{40}$/.test(commit.sha)) throw Error('Revisión de GitHub no válida');
  revision = commit.sha;
  const arbol = await json(API + '/git/trees/' + revision + '?recursive=1');
  if (arbol.truncated || !Array.isArray(arbol.tree)) throw Error('No se pudo leer el inventario completo');
  const meses = new Map();
  for (const f of arbol.tree) {
    const m = f.path.match(/^registros\/velas-24h\/(stock|cripto)\/([\p{L}\p{N}]{1,15})\/(\d{4})_([\p{L}\p{N}]{1,15})$/u);
    if (f.type !== 'blob' || !m || m[2] !== m[4]) continue;
    const k = m[1] + '/' + m[2];
    if (!meses.has(k)) meses.set(k, []);
    meses.get(k).push(m[3]);
  }
  let cursor = 0, hechos = 0;
  const resultados = new Array(catalogo.length);
  async function trabajador() {
    while (cursor < catalogo.length) {
      const i = cursor++, e = catalogo[i];
      try {
        const lista = (meses.get(e.clase + '/' + e.codigo) || []).sort().reverse();
        if (!lista.length) throw Error('Sin registros publicados');
        // Todos los meses del registro: el equilibrio G/P cubre el período completo, como la radiografía.
        let filas = [];
        for (const mes of lista) {
          const url = BASE + '/' + revision + '/registros/velas-24h/' + e.clase + '/' + encodeURIComponent(e.codigo) + '/' + mes + '_' + encodeURIComponent(e.codigo);
          const nuevas = validarMes(await json(url), mes, corte);
          filas = nuevas.concat(filas);
        }
        const datos = resumir(filas, true);
        datos.gp = razonVariacion(filas).razon;
        resultados[i] = { activo: e, datos };
      } catch (err) { resultados[i] = { activo: e, error: err.message }; }
      progreso(++hechos, catalogo.length);
    }
  }
  await Promise.all(Array.from({length: 6}, trabajador));
  return { resultados, corte, revision };
}
export function montarRachas(contenedor, catalogo, consulta) {
  const titulo = texto('h2', 'Variación y rachas');
  const nota = texto('p', 'Última vela diaria cerrada publicada, no cotizaciones en vivo. Una racha, al alza o a la baja, no anuncia lo que viene después.', 'rachas-nota');
  const controles = texto('div', '', 'rachas-controles');
  const selector = document.createElement('select'); selector.setAttribute('aria-label', 'Clase de activos');
  for (const [v,t] of [['todos','Todos'],['cripto','Cripto'],['stock','Stocks']]) { const o = texto('option',t); o.value=v; selector.append(o); } selector.value=clase;
  const clasificar = document.createElement('select'); clasificar.setAttribute('aria-label','Orden de la lista');
  for (const [v,t] of [['gp','G/P'],['rango','Rango del día ↓'],['rango-asc','Rango del día ↑'],['dias','Racha'],['subida','Variación acumulada ↓'],['variacion','Variación acumulada ↑']]) { const o=texto('option',t); o.value=v; clasificar.append(o); } clasificar.value=orden;
  const filtroRacha = document.createElement('select'); filtroRacha.setAttribute('aria-label','Dirección de la racha');
  for (const [v,t] of [['todas','Rachas: todas'],['bajan','Solo rachas a la baja'],['suben','Solo rachas al alza']]) { const o=texto('option',t); o.value=v; filtroRacha.append(o); } filtroRacha.value=direccionRacha;
  const recargar=texto('button','Actualizar lectura','boton');
  const estado=texto('p','Analizando los registros…','rachas-nota'); estado.setAttribute('role','status');
  let avanceNum=null, avanceBarra=null;
  function avanzar(n,total) {
    if(!estado.isConnected) return;
    if(!avanceNum) {
      estado.className='rachas-cargando';
      avanceNum=texto('strong','','rachas-cargando-cifra');
      const barra=texto('span','','rachas-cargando-barra'); avanceBarra=texto('span',''); barra.append(avanceBarra);
      estado.replaceChildren(document.createTextNode('Analizando los registros'), document.createElement('br'), avanceNum, document.createTextNode(' activos'), barra);
    }
    avanceNum.textContent=n+'/'+total;
    avanceBarra.style.width=(n/total*100)+'%';
  }
  function finCarga() { avanceNum=avanceBarra=null; estado.className='rachas-nota'; }
  const fuente=texto('p','','rachas-nota');
  const cuerpo=document.createElement('div'); cuerpo.className='rachas-cuerpo';
  const reglas=document.createElement('details'); reglas.className='rachas-reglas'; reglas.append(texto('summary','Cómo leer los datos'));
  reglas.append(texto('p','Activo: el código del activo; su fila abre su gráfica habitual.'));
  reglas.append(texto('p','R %: rango del día, la amplitud de la última vela: lo que separa su máximo de su mínimo, como porcentaje de su apertura.'));
  reglas.append(texto('p','Racha: días seguidos cerrando en la misma dirección; el sentido lo da el color. ≥ y * avisan de que pudo ser más larga, cortada por un hueco en los datos o por el inicio del registro.'));
  reglas.append(texto('p','A %: variación acumulada, el cambio del precio durante la racha, desde la apertura del primer día hasta el cierre del último, con su signo.'));
  reglas.append(texto('p','G/P: la razón de variación de la radiografía, sobre todo el registro del activo: la suma de las variaciones porcentuales de los días verdes dividida entre la magnitud de la suma de las de los días rojos. Sin días rojos muestra ∞ y ordena primero; sin días verdes, 0.'));
  controles.append(selector,clasificar,filtroRacha,recargar);
  contenedor.append(titulo,nota,controles,estado,fuente,reglas,cuerpo);
  function pintar() {
    if (!ultimo || !contenedor.isConnected) return;
    const todos=ultimo.resultados.filter(x=>clase==='todos'||x.activo.clase===clase);
    const partes=separar(todos), q=consulta().toLowerCase();
    const coincide=x=>!q||[x.activo.codigo,x.activo.nombre,x.activo.lectura||''].some(t=>t.toLowerCase().includes(q));
    const visibles=partes.comparables.filter(coincide).filter(x=>direccionRacha==='todas'||(direccionRacha==='bajan'?x.datos.direccion<0:x.datos.direccion>0));
    visibles.sort((a,b)=> {
      const x=a.datos,y=b.datos;
      const total=(u,v)=>Number(u.limitada)-Number(v.limitada)||u.acumulado-v.acumulado;
      const gp=v=>v.gp===Infinity?Number.MAX_VALUE:Math.round(v.gp*100)/100; // un solo valor, a dos decimales, para ordenar y mostrar
      const d=orden==='subida'?total(y,x):orden==='dias'?y.dias-x.dias:orden==='rango'?y.rango-x.rango:orden==='rango-asc'?x.rango-y.rango:orden==='gp'?gp(y)-gp(x):total(x,y);
      return d || a.activo.clase.localeCompare(b.activo.clase) || a.activo.codigo.localeCompare(b.activo.codigo);
    });
    cuerpo.replaceChildren();
    finCarga();
    estado.textContent=partes.fecha===null?'No hay datos comparables.':`Jornada de referencia: ${fecha(partes.fecha)} UTC · ${partes.comparables.length}/${todos.length} activos con esa vela · ${visibles.length} visibles.`;
    if (partes.fecha!==null && partes.fecha < ultimo.corte-DIA) estado.textContent+=' El registro está atrasado respecto al último día cerrado en UTC.';
    fuente.replaceChildren(document.createTextNode('Una sola revisión de registros: '));
    const link=texto('a',ultimo.revision.slice(0,7)); link.href='https://github.com/osmancitov/hugo/commit/'+ultimo.revision; link.target='_blank'; link.rel='noopener'; fuente.append(link);
    const caja=texto('div','','rachas-tabla-caja'); const tabla=document.createElement('table'); tabla.className='rachas-tabla';
    const cab=document.createElement('thead'); const tr=document.createElement('tr');
    for(const t of ['Activo','R %','Racha','A %','G/P']) { const th=texto('th',t); th.scope='col'; tr.append(th); } cab.append(tr);
    const body=document.createElement('tbody');
    for (const x of visibles) {
      const e=x.activo,d=x.datos, r=document.createElement('tr'), a=texto('a',e.codigo); a.href='#/a/'+e.clase+'/'+encodeURIComponent(e.codigo); a.className='activo-fila rachas-enlace';
      const id=texto('td',''); id.append(a,texto('span',e.nombre+' · '+e.clase,'rachas-nombre'));
      const dias=texto('td',(d.limitada?'≥ ':'')+d.dias,d.direccion>0?'positivo':d.direccion<0?'negativo':'');
      const acum=texto('td',d.dias?pct(d.acumulado)+(d.limitada?' *':''):pct(0),d.dias?(d.acumulado<0?'negativo':d.acumulado>0?'positivo':''):'');
      if(d.limitada) { dias.append(texto('small',d.motivo,'rachas-limite')); acum.title='Variación del tramo observado: '+d.motivo; }
      const rango=texto('td',d.rango.toLocaleString('es',{minimumFractionDigits:2,maximumFractionDigits:2}));
      const gp=texto('td',d.gp===Infinity?'∞':(Math.round(d.gp*100)/100).toLocaleString('es',{minimumFractionDigits:2,maximumFractionDigits:2}));
      if(d.gp===Infinity) gp.title='Sin días rojos en el registro: el equilibrio no tiene fin.';
      r.append(id,rango,dias,acum,gp); body.append(r);
    }
    tabla.append(cab,body); caja.append(tabla); cuerpo.append(caja);
    if(!visibles.length) cuerpo.append(texto('p','Ningún activo coincide con los filtros.','vacio'));
    const incidencias=partes.atrasados.concat(partes.errores).filter(coincide);
    if(incidencias.length) {
      const det=document.createElement('details'); det.className='rachas-incidencias'; det.append(texto('summary',`${partes.atrasados.length} atrasados · ${partes.errores.length} sin lectura válida (fuera del orden)`));
      const ul=document.createElement('ul'); for(const x of incidencias) ul.append(texto('li',x.activo.codigo+' · '+x.activo.clase+': '+(x.datos?'última vela '+fecha(x.datos.fecha)+' UTC':x.error))); det.append(ul); cuerpo.append(det);
    }
  }
  selector.onchange=()=>{clase=selector.value;pintar();}; clasificar.onchange=()=>{orden=clasificar.value;pintar();}; filtroRacha.onchange=()=>{direccionRacha=filtroRacha.value;pintar();};
  async function iniciar(forzar=false) {
    recargar.disabled=true;
    if(forzar) {ultimo=null;pendiente=null;cuerpo.replaceChildren();}
    try {
      if(!pendiente) pendiente=cargar(catalogo,avanzar);
      ultimo=await pendiente; pintar();
    } catch(err) {pendiente=null;finCarga();estado.textContent='No pude completar la lectura: '+err.message+'. No se muestra un orden parcial como completo.';}
    finally {recargar.disabled=false;}
  }
  recargar.onclick=()=>iniciar(true); iniciar();
  return pintar;
}
