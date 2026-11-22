const texto=(tag,valor,clase='')=>{const e=document.createElement(tag);e.textContent=valor;if(clase)e.className=clase;return e;};
export async function montarPersistencia(contenedor,catalogo,seleccion,consulta,buscador) {
  const nota=texto('p','Persistencia · promedio simple de puestos diarios en una competencia global. Menor promedio, mejor posición. Sin vela no hay participación.','rachas-nota');
  const estado=texto('p','Preparando Persistencia…','rachas-nota');estado.setAttribute('role','status');
  const cuerpo=texto('div','','rachas-cuerpo');
  contenedor.append(nota,buscador,estado,cuerpo);
  let filas=[];
  function pintar(){
    const q=consulta().toLowerCase();
    const visibles=filas.filter(x=>!q||[x.activo.codigo,x.activo.nombre].some(s=>s.toLowerCase().includes(q)));
    cuerpo.replaceChildren();
    const caja=texto('div','','rachas-tabla-caja'),tabla=document.createElement('table');tabla.className='rachas-tabla';
    const cab=document.createElement('thead'),tr=document.createElement('tr');
    for(const t of ['#','Activo','Promedio','Carreras','Global','Stocks'])tr.append(texto('th',t));cab.append(tr);
    const body=document.createElement('tbody');
    for(const x of visibles){
      const r=document.createElement('tr'),id=texto('td','','col-activo'),a=texto('a',x.activo.codigo,'activo-fila rachas-enlace');
      a.href='#/a/'+x.activo.clase+'/'+encodeURIComponent(x.activo.codigo);id.append(a,texto('span',x.activo.nombre,'rachas-nombre'));
      r.append(texto('td',String(x.puestoLista)),id,texto('td',x.promedio.toLocaleString('es',{minimumFractionDigits:2,maximumFractionDigits:2})),texto('td',String(x.carreras)),texto('td',String(x.puestoGlobal)),texto('td',x.puestoStocks==null?'—':String(x.puestoStocks)));body.append(r);
    }
    tabla.append(cab,body);caja.append(tabla);cuerpo.append(caja);
    if(!visibles.length)cuerpo.append(texto('p','Ningún activo coincide con la búsqueda.','vacio'));
  }
  try{
    const r=await fetch('persistencia-90d.json',{cache:'no-cache'});if(!r.ok)throw Error('archivo aún no publicado');const j=await r.json();
    if(!j.ventana||!Array.isArray(j.activos))throw Error('archivo no válido');
    const porId=new Map(catalogo.map(a=>[a.clase+':'+a.codigo,a]));
    let nStocks=0;
    const global=j.activos.map((d,i)=>({...d,activo:porId.get(d.id),puestoGlobal:i+1})).filter(x=>x.activo).map(x=>({...x,puestoStocks:x.activo.clase==='stock'?++nStocks:null}));
    filas=global.filter(x=>seleccion(x.activo)).map((x,i)=>({...x,puestoLista:i+1}));
    estado.textContent='Ventana '+new Date(j.ventana.inicio).toISOString().slice(0,10)+' → '+new Date(j.ventana.fin).toISOString().slice(0,10)+' UTC · '+global.length+' participantes globales · '+filas.length+' en esta lista. El promedio usa sus carreras participadas; no se recalcula al filtrar.';
    pintar();
  }catch(e){estado.textContent='No pude completar Persistencia: '+e.message+'. No se muestra un ranking parcial.';}
  return pintar;
}
