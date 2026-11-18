import { validarMes, resumir, separar, corteUTC, DIA } from './visor-rachas-datos.mjs';
const API = 'https://api.github.com/repos/osmancitov/hugo';
const BASE = 'https://raw.githubusercontent.com/osmancitov/hugo';
const fecha = t => new Date(t).toISOString().slice(0,10);
const pct = n => (n > 0 ? '+' : '') + n.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
const texto = (tag, valor, clase = '') => { const n = document.createElement(tag); n.textContent = valor; if (clase) n.className = clase; return n; };
let pendiente, ultimo, revision = '', clase = 'todos', orden = 'variacion', soloRacha = false;
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
        let filas = [], datos;
        for (let j = 0; j < lista.length; j++) {
          const mes = lista[j];
          const url = BASE + '/' + revision + '/registros/velas-24h/' + e.clase + '/' + encodeURIComponent(e.codigo) + '/' + mes + '_' + encodeURIComponent(e.codigo);
          const nuevas = validarMes(await json(url), mes, corte);
          filas = nuevas.concat(filas);
          datos = resumir(filas, j === lista.length - 1);
          if (!datos.limitada || datos.motivo !== 'faltan meses anteriores' || j === lista.length - 1) break;
        }
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
  const nota = texto('p', 'Última vela diaria cerrada publicada, no cotizaciones en vivo. Una racha negativa no anuncia un rebote.', 'rachas-nota');
  const controles = texto('div', '', 'rachas-controles');
  const selector = document.createElement('select'); selector.setAttribute('aria-label', 'Clase de activos');
  for (const [v,t] of [['todos','Todos'],['cripto','Cripto'],['stock','Stocks']]) { const o = texto('option',t); o.value=v; selector.append(o); } selector.value=clase;
  const clasificar = document.createElement('select'); clasificar.setAttribute('aria-label','Orden de la lista');
  for (const [v,t] of [['variacion','Variación: menor a mayor'],['subida','Variación: mayor a menor'],['dias','Racha: más días primero'],['acumulado','Cambio completo de racha: menor a mayor']]) { const o=texto('option',t); o.value=v; clasificar.append(o); } clasificar.value=orden;
  const etiqueta = texto('label',''); const check = document.createElement('input'); check.type='checkbox'; check.checked=soloRacha; etiqueta.append(check, document.createTextNode(' Solo con racha negativa'));
  const recargar=texto('button','Actualizar lectura','boton');
  const estado=texto('p','Leyendo registros publicados…','rachas-nota'); estado.setAttribute('role','status');
  const fuente=texto('p','','rachas-nota');
  const cuerpo=document.createElement('div'); cuerpo.className='rachas-cuerpo';
  const reglas=document.createElement('details'); reglas.className='rachas-reglas'; reglas.append(texto('summary','Cómo leer los datos'));
  reglas.append(texto('p','Variación = (cierre / apertura - 1) × 100 de una vela 1d UTC, como en la gráfica. La racha cuenta días UTC consecutivos con cierre menor que apertura; una vela plana o positiva la corta.'));
  reglas.append(texto('p','Cambio de la racha = (último cierre / apertura de la primera vela negativa - 1) × 100. Incluye los cambios de precio entre velas; por eso puede ser positivo aunque las velas sean negativas. No es la suma de las variaciones diarias.'));
  reglas.append(texto('p','≥ y * indican una racha limitada por un hueco o por el inicio del registro: se muestran solo los días y el cambio de precio del tramo observado, no el total desconocido. No se rellenan huecos. Los datos atrasados y los errores quedan fuera del orden principal.'));
  controles.append(selector,clasificar,etiqueta,recargar);
  contenedor.append(titulo,nota,controles,estado,fuente,reglas,cuerpo);
  function pintar() {
    if (!ultimo || !contenedor.isConnected) return;
    const todos=ultimo.resultados.filter(x=>clase==='todos'||x.activo.clase===clase);
    const partes=separar(todos), q=consulta().toLowerCase();
    const coincide=x=>!q||[x.activo.codigo,x.activo.nombre,x.activo.lectura||''].some(t=>t.toLowerCase().includes(q));
    const visibles=partes.comparables.filter(coincide).filter(x=>!soloRacha||x.datos.dias>0);
    visibles.sort((a,b)=> {
      const x=a.datos,y=b.datos;
      const d=orden==='subida'?y.variacion-x.variacion:orden==='dias'?y.dias-x.dias:orden==='acumulado'?(Number(x.limitada)-Number(y.limitada)||x.acumulado-y.acumulado):x.variacion-y.variacion;
      return d || a.activo.clase.localeCompare(b.activo.clase) || a.activo.codigo.localeCompare(b.activo.codigo);
    });
    cuerpo.replaceChildren();
    estado.textContent=partes.fecha===null?'No hay datos comparables.':`Jornada de referencia: ${fecha(partes.fecha)} UTC · ${partes.comparables.length}/${todos.length} activos con esa vela · ${visibles.length} visibles.`;
    if (partes.fecha!==null && partes.fecha < ultimo.corte-DIA) estado.textContent+=' El registro está atrasado respecto al último día cerrado en UTC.';
    fuente.replaceChildren(document.createTextNode('Una sola revisión de registros: '));
    const link=texto('a',ultimo.revision.slice(0,7)); link.href='https://github.com/osmancitov/hugo/commit/'+ultimo.revision; link.target='_blank'; link.rel='noopener'; fuente.append(link);
    const caja=texto('div','','rachas-tabla-caja'); const tabla=document.createElement('table'); tabla.className='rachas-tabla';
    const cab=document.createElement('thead'); const tr=document.createElement('tr');
    for(const t of ['Activo','Variación diaria','Días negativos','Cambio en la racha']) { const th=texto('th',t); th.scope='col'; tr.append(th); } cab.append(tr);
    const body=document.createElement('tbody');
    for (const x of visibles) {
      const e=x.activo,d=x.datos, r=document.createElement('tr'), a=texto('a',e.codigo); a.href='#/a/'+e.clase+'/'+encodeURIComponent(e.codigo); a.className='activo-fila rachas-enlace';
      const id=texto('td',''); id.append(a,texto('span',e.nombre+' · '+e.clase,'rachas-nombre'));
      const v=texto('td',pct(d.variacion),d.variacion<0?'negativo':d.variacion>0?'positivo':'');
      const dias=texto('td',(d.limitada?'≥ ':'')+d.dias); const acum=texto('td',d.dias?pct(d.acumulado)+(d.limitada?' *':''):'-');
      if(d.limitada) { dias.append(texto('small',d.motivo,'rachas-limite')); acum.title='Cambio del tramo observado: '+d.motivo; }
      r.append(id,v,dias,acum); body.append(r);
    }
    tabla.append(cab,body); caja.append(tabla); cuerpo.append(caja);
    if(!visibles.length) cuerpo.append(texto('p','Ningún activo coincide con los filtros.','vacio'));
    const incidencias=partes.atrasados.concat(partes.errores).filter(coincide);
    if(incidencias.length) {
      const det=document.createElement('details'); det.className='rachas-incidencias'; det.append(texto('summary',`${partes.atrasados.length} atrasados · ${partes.errores.length} sin lectura válida (fuera del orden)`));
      const ul=document.createElement('ul'); for(const x of incidencias) ul.append(texto('li',x.activo.codigo+' · '+x.activo.clase+': '+(x.datos?'última vela '+fecha(x.datos.fecha)+' UTC':x.error))); det.append(ul); cuerpo.append(det);
    }
  }
  selector.onchange=()=>{clase=selector.value;pintar();}; clasificar.onchange=()=>{orden=clasificar.value;pintar();}; check.onchange=()=>{soloRacha=check.checked;pintar();};
  async function iniciar(forzar=false) {
    recargar.disabled=true;
    if(forzar) {ultimo=null;pendiente=null;cuerpo.replaceChildren();}
    try {
      if(!pendiente) pendiente=cargar(catalogo,(n,total)=>{ if(estado.isConnected) estado.textContent=`Leyendo ${n}/${total} activos de una misma revisión…`; });
      ultimo=await pendiente; pintar();
    } catch(err) {pendiente=null;estado.textContent='No pude completar la lectura: '+err.message+'. No se muestra un orden parcial como completo.';}
    finally {recargar.disabled=false;}
  }
  recargar.onclick=()=>iniciar(true); iniciar();
  return pintar;
}
