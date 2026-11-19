// Motor unico de registra: un activo o una lista, meses UTC hacia atras y avance durable.
// No envia ordenes ni usa claves. La integracion decide quien puede iniciar una orden.
// Piso opcional (j.piso, milisegundos del dia 1 del mes): el activo termina al completar ese mes;
// sin piso, termina en el primer mes vacio como siempre. El piso viaja en el avance: continuar lo conserva.
// Varios tramos (j.siguientes): «registra todo» recorre las clases en secuencia con un solo corte UTC;
// el avance guarda la clase que sigue y un corte entre clases se retoma con continuar, sin repetir lo hecho.
import fs from 'node:fs';
import path from 'node:path';
import { CLASES, CODIGO_OK } from './activos.mjs';
import { cierreUTC, inicioMes, compararSeries, validarSerie, publicarSerie } from './registro-serie.mjs';

export const CERO = Date.UTC(2026, 10, 1);
const LIMITE = 240;
// Piso fijo de toda corrida de registro (decisión del usuario, 18-nov-2026: el registro de todo
// activo arranca el 1 de agosto de 2026, para todos los activos, stock y cripto; sin ventana
// móvil). No se consulta ni se guarda nada anterior; un piso explícito posterior manda.
const PISO_MINIMO = Date.UTC(2026,7,1);
const anterior = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1); };
const siguiente = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1); };
const etiqueta = (t) => new Date(t).toLocaleDateString('es',{month:'long',year:'numeric',timeZone:'UTC'});
const yymm = (t) => new Date(t).toISOString().slice(2,7).replace('-','');
const inicial = anterior(CERO);
const dur = (t) => `${(t/1000).toFixed(2)} s`;

// «pon al día»: dos marcas por activo. _primer-mes (AAMM): bajo ese mes una bajada completa
// llegó al mes vacío; debajo no hay datos. _verificado (AAMM): último mes cerrado ya verificado
// por una corrida con confianza; los meses hasta ahí se confían y no se recorren de nuevo
// (decisión del usuario, 18-nov-2026: la puesta al día revisa solo lo pendiente; la revisión
// completa es «registra todo»). Sin _verificado (migración), valida en disco como antes y la
// escribe al cerrar el activo. Solo se escribe junto a un _primer-mes existente.
const MARCA = '_primer-mes';
const VERIFICADO = '_verificado';
function leerAamm(dir, nombre) {
  try {
    const m = fs.readFileSync(path.join(dir, nombre), 'utf8').trim().match(/^(\d{2})(\d{2})$/);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
    return Date.UTC(2000 + Number(m[1]), Number(m[2]) - 1, 1);
  } catch { return null; }
}
function escribirAamm(dir, nombre, aamm) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const ruta = path.join(dir, nombre);
  const tmp = ruta + '.tmp';
  fs.writeFileSync(tmp, aamm + '\n', { mode: 0o600 });
  fs.renameSync(tmp, ruta);
}
const leerMarca = (dir) => leerAamm(dir, MARCA);
const escribirMarca = (dir, aamm) => escribirAamm(dir, MARCA, aamm);
const leerVerificado = (dir) => leerAamm(dir, VERIFICADO);
const escribirVerificado = (dir, aamm) => escribirAamm(dir, VERIFICADO, aamm);
// Limpieza pedida por el usuario (18-nov-2026): los registros anteriores al piso no se van a
// usar. Borra del disco local los archivos de velas AAMM anteriores al piso, una vez por
// arranque de registro nuevo, y avisa cuántos. No toca marcas ni otros archivos.
function limpiarAnteriores(baseDir,clases) {
 let n=0;const corteAamm=yymm(PISO_MINIMO);
 for(const clase of clases) {
  const raiz=path.join(baseDir,clase);
  let activos;try{activos=fs.readdirSync(raiz,{withFileTypes:true});}catch{continue;}
  for(const a of activos) {
   if(!a.isDirectory())continue;
   const dir=path.join(raiz,a.name);
   let archivos;try{archivos=fs.readdirSync(dir);}catch{continue;}
   for(const f of archivos) {
    const m=/^(\d{4})_/.exec(f);
    if(m&&m[1]<corteAamm){try{fs.rmSync(path.join(dir,f));n++;}catch(e){console.error('No pude borrar',f,e.message);}}
   }
  }
 }
 return n;
}
// Mes cerrado confiable en disco: serie válida según el contrato de siempre y con vela en el
// último día del mes. No exige día 1 ni todos los días naturales (listados a mitad de mes y
// días sin negociación son legítimos).
function serieLocalCompleta(destino, mes, hasta) {
  try {
    const datos = JSON.parse(leerNormal(destino));
    validarSerie(datos, mes, hasta);
    return datos.length > 0 && datos[datos.length - 1][0] === siguiente(mes) - 86400000;
  } catch { return false; }
}

function syncDir(dir) { const fd=fs.openSync(dir,'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function escribirTemporal(destino, texto) {
  fs.mkdirSync(path.dirname(destino), {recursive:true, mode:0o700});
  const tmp=destino+'.tmp';
  // El temporal es privado del motor, no un enlace a otro archivo.
  const fd=fs.openSync(tmp, fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW,0o600);
  try { fs.writeFileSync(fd,texto); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return tmp;
}
export function guardarEstado(archivo, trabajo) {
  const tmp=escribirTemporal(archivo,JSON.stringify(trabajo)+'\n');
  fs.renameSync(tmp,archivo); syncDir(path.dirname(archivo));
}
function leerNormal(archivo) {
  if (!fs.lstatSync(archivo).isFile()) throw new Error(`No es un archivo normal: ${archivo}`);
  return fs.readFileSync(archivo,'utf8');
}
const tramoValido=t=>t && CLASES.includes(t.clase) && Array.isArray(t.codigos) && t.codigos.length && t.codigos.length<=500 && !t.codigos.some(c=>!CODIGO_OK.test(c)) && new Set(t.codigos).size===t.codigos.length;
export function leerEstado(archivo) {
  if (!fs.existsSync(archivo)) return null;
  const j=JSON.parse(leerNormal(archivo));
  if(j.version===1) {j.version=2;j.hasta=CERO;j.inicial=inicial;j.conteo.ampliados=0;} // reanuda el corte antiguo sin inventar dias
  if(j.siguientes==null) j.siguientes=[]; // los avances de una sola clase no la traen
  const estados=['en-curso','pausado','terminado'];
  if (j.version!==2 || !Number.isInteger(j.hasta) || j.hasta%86400000!==0 || !Number.isInteger(j.inicial) || j.inicial!==inicioMes(j.hasta-1) || !CLASES.includes(j.clase) || !Array.isArray(j.codigos) || !j.codigos.length || j.codigos.length>500 || j.codigos.some(c=>!CODIGO_OK.test(c)) || new Set(j.codigos).size!==j.codigos.length || !Number.isInteger(j.indice) || j.indice<0 || j.indice>j.codigos.length || !estados.includes(j.estado) || !Number.isInteger(j.mes) || j.mes>j.inicial || (j.inicial-j.mes)>241*32*86400000 || new Date(j.mes).getUTCDate()!==1 || j.mes%86400000!==0 || !(j.piso==null || (Number.isInteger(j.piso) && j.piso%86400000===0 && new Date(j.piso).getUTCDate()===1 && j.piso<=j.inicial && (j.inicial-j.piso)<=241*32*86400000)) || typeof j.channel!=='string' || !j.channel || typeof j.thread_ts!=='string' || !j.thread_ts || !j.conteo || ['guardados','existentes','activos','ampliados'].some(k=>!Number.isInteger(j.conteo[k])||j.conteo[k]<0) || (j.rapido!=null && typeof j.rapido!=='boolean') || !Array.isArray(j.siguientes) || j.siguientes.length>CLASES.length || !j.siguientes.every(tramoValido) || (j.total!=null && (!Number.isInteger(j.total) || j.total<j.codigos.length))) throw new Error('El avance guardado no tiene un formato valido; se conserva sin tocar.');
  j.rapido=!!j.rapido;
  const enBorde=j.siguientes.length>0 && j.indice===j.codigos.length && (j.estado==='en-curso'||j.estado==='pausado');
  if (!enBorde && (j.indice===j.codigos.length)!==(j.estado==='terminado')) throw new Error('Avance inconsistente; se conserva sin tocar.');
  return j;
}
function resumen(j) { const total=j.total||j.codigos.length; return `${j.conteo.activos}/${total} activos terminados; ${j.conteo.guardados} meses nuevos, ${j.conteo.existentes} existentes comprobados y ${j.conteo.ampliados||0} meses ampliados.`; }

export function crearMotor({ base, archivoEstado, resolver, fetchImpl=fetch, avisar, activas=new Map(), parada={n:0}, ahora=Date.now }) {
  let ocupado=false;
  // stop o restart suben parada.n: el recorrido frena limpio y queda pausado para registra continuar.
  const pedida=(marca)=>parada.n!==marca;
  const errorParada=()=>{const e=new Error('Detenido a pedido (stop o restart).');e.detenido=true;return e;};
  const guardar=(j)=>guardarEstado(archivoEstado(),j);
  const notificar=async(j,text,meta)=>{
    if(j.version===2 && ['mes','fin-activo'].includes(meta?.tipo)){j.avisoPendiente={text,meta};guardar(j);}
    const salio=await avisar(j,text,meta);
    // Un fin-activo acumulado aun no salio: su aviso pendiente se conserva hasta el vuelco.
    if(j.version===2){if(['mes','fin-activo'].includes(meta?.tipo)&&salio!=='acumulado')delete j.avisoPendiente;guardar(j);}
  };
  const vaciarAviso=async j=>{if(j.avisoPendiente){const {text,meta}=j.avisoPendiente;await notificar(j,text,meta);}};
  const avisarFin=async(j)=>{await notificar(j,`Registro terminado. ${resumen(j)} Los archivos locales quedan pendientes de la sincronizacion habitual con GitHub.`);j.notificado=true;guardar(j);};
  async function correr(j) {
    const id='registro-historial';
    const marca=parada.n;
    activas.set(id,{que:'registrar historial',desde:Date.now(),largo:true});
    try {
      j.estado='en-curso';delete j.error;guardar(j);
      const pisoEf=j.piso!=null?Math.max(j.piso,PISO_MINIMO):PISO_MINIMO;
      await vaciarAviso(j);
      await notificar(j,`Registro en curso: ${j.clase}, ${j.codigos.length} activo(s)${j.siguientes.length?`, y luego ${j.siguientes.map(t=>t.clase).join(', ')}`:''}. Corte: velas cerradas antes de ${new Date(j.hasta).toISOString()}. Tramo: no bajo de ${etiqueta(pisoEf)}. Retomo en ${j.codigos[j.indice]||j.codigos[j.codigos.length-1]}, ${etiqueta(j.mes)}. ${resumen(j)}`);
      while(true) {
      while(j.indice<j.codigos.length) {
        if(pedida(marca))throw errorParada();
        const codigo=j.codigos[j.indice];
        activas.set(id,{que:`registrar ${codigo}, ${etiqueta(j.mes)} (${j.indice+1}/${j.codigos.length})`,desde:Date.now(),largo:true});
        const res=await resolver(j.clase,codigo);
        if(!res.ok) throw new Error(res.motivo);
        await notificar(j,`Activo ${j.indice+1}/${j.codigos.length}: ${codigo}${res.nombre ? `, ${res.nombre}`:''} (${j.clase}).`,{tipo:'activo'});
        const dirActivo=path.join(base(),j.clase,codigo);
        let pisoVerificado=j.rapido?leerMarca(dirActivo):null, verificado=j.rapido?leerVerificado(dirActivo):null, confianza=true;
        let terminado=false;
        const finConfiable=async(limite)=>{
          j.indice++;j.mes=j.inicial;j.conteo.activos++;terminado=true;
          if(j.indice===j.codigos.length && !j.siguientes.length) {j.estado='terminado';j.notificado=false;}
          try { escribirVerificado(dirActivo, yymm(anterior(j.inicial))); } catch(e) { console.error('No pude escribir la marca de verificado:', e.message); }
          await notificar(j,`${codigo}: verificado hasta ${etiqueta(limite)}; lo anterior ya estaba comprobado. ${j.indice}/${j.codigos.length} activos.${j.indice<j.codigos.length ? ` Sigo con ${j.codigos[j.indice]}.`:''}`,{tipo:'fin-activo',linea:`Verificado hasta ${etiqueta(limite)}. ${j.indice}/${j.codigos.length} activos.`});
        };
        while(!terminado) {
          if(pedida(marca))throw errorParada();
          if(j.mes<pisoEf) {
            j.indice++;j.mes=j.inicial;j.conteo.activos++;terminado=true;
            if(j.indice===j.codigos.length && !j.siguientes.length) {j.estado='terminado';j.notificado=false;}
            try { escribirMarca(dirActivo, yymm(pisoEf)); } catch(e) { console.error('No pude escribir la marca de primer mes:', e.message); }
            try { if(!j.rapido || confianza) escribirVerificado(dirActivo, yymm(anterior(j.inicial))); } catch(e) { console.error('No pude escribir la marca de verificado:', e.message); }
            await notificar(j,`${codigo}: tramo desde ${etiqueta(pisoEf)} cubierto; no bajo mas. ${j.indice}/${j.codigos.length} activos.${j.indice<j.codigos.length ? ` Sigo con ${j.codigos[j.indice]}.`:''}`,{tipo:'fin-activo',linea:`Tramo desde ${etiqueta(pisoEf)} cubierto. ${j.indice}/${j.codigos.length} activos.`});
            continue;
          }
          const meses=(new Date(j.inicial).getUTCFullYear()-new Date(j.mes).getUTCFullYear())*12+new Date(j.inicial).getUTCMonth()-new Date(j.mes).getUTCMonth();
          if(meses>=LIMITE) throw new Error(`Tope de seguridad: ${LIMITE} meses para ${codigo}; no doy su historial por terminado.`);
          const mes=j.mes;
          const destino=path.join(base(),j.clase,codigo,`${yymm(mes)}_${codigo}`);
          if(j.rapido) {
            // Meses ya verificados por una corrida anterior con confianza: se confían, no se recorren.
            if(confianza && verificado!=null && mes<=verificado) { await finConfiable(verificado); continue; }
            // Piso verificado: debajo de la marca ya lo comprobó una bajada completa.
            if(confianza && pisoVerificado && mes<pisoVerificado) { await finConfiable(pisoVerificado); continue; }
            // Mes cerrado con archivo local completo: se comprueba en disco, sin consulta.
            // El mes en curso nunca se salta. Sin marca, la bajada valida en disco hasta el
            // archivo más viejo y la primera consulta sin archivo fija la frontera.
            if(confianza && mes!==j.inicial && fs.existsSync(destino) && serieLocalCompleta(destino,mes,j.hasta)) {
              j.mes=anterior(mes);j.conteo.existentes++;
              await notificar(j,`${codigo}, ${etiqueta(mes)}: comprobado en disco, sin consulta. Sigo con ${etiqueta(j.mes)}.`,{tipo:'mes',mes,linea:`${yymm(mes)}: en disco.`});
              continue;
            }
          }
          activas.set(id,{que:`registrar ${codigo}, ${etiqueta(mes)} (${j.indice+1}/${j.codigos.length})`,desde:Date.now(),largo:true});
          await notificar(j,`Consulto ${codigo}, ${etiqueta(mes)} (${j.indice+1}/${j.codigos.length}; corte UTC).`,{tipo:'consulta'});
          const t=Date.now();
          const r=await fetchImpl(`https://api.binance.com/api/v3/klines?symbol=${res.simbolo}&interval=1d&startTime=${mes}&endTime=${Math.min(siguiente(mes),j.hasta)-1}&limit=1000`,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'hugo'}});
          const cuerpo=await r.text();
          if(!r.ok) throw new Error(`Binance HTTP ${r.status}; no equivale a un mes vacio.`);
          let datos;try{datos=JSON.parse(cuerpo);}catch{throw new Error('Binance no devolvio JSON; no equivale a un mes vacio.');}
          validarSerie(datos,mes,j.hasta);
          const consultaMs=Date.now()-t;
          const existe=fs.existsSync(destino);
          let modo='nuevo', previoBuf=null;
          if(existe) {
            let previo;try{previoBuf=Buffer.from(leerNormal(destino));previo=JSON.parse(previoBuf);}catch{throw new Error(`Archivo existente ilegible o incompleto: ${destino}. Lo conservo sin pisar.`);}
            modo=compararSeries(previo,datos,mes,cierreUTC(ahora()));
          }
          if(!datos.length) {
            if(siguiente(mes)>j.hasta && !existe) {
              j.mes=anterior(mes);
              await notificar(j,`${codigo}: ${etiqueta(mes)} aun no tiene velas cerradas al corte. No doy su historial por terminado; sigo con ${etiqueta(j.mes)}.`,{tipo:'mes',mes,linea:`${yymm(mes)}: sin velas cerradas al corte; sigo atras.`});
              continue;
            }
            // Hueco inesperado: vacío por encima del piso verificado. No se esconde ni se
            // confía hacia abajo: se avisa y se sigue bajando con consultas hasta el vacío real.
            if(j.rapido && confianza && pisoVerificado && mes>=pisoVerificado) {
              confianza=false;j.mes=anterior(mes);
              await notificar(j,`${codigo}: ${etiqueta(mes)} salio vacio por encima del piso verificado (${etiqueta(pisoVerificado)}); posible hueco. Sigo comprobando con consultas hasta ${etiqueta(j.mes)}.`,{tipo:'mes',mes,linea:`${yymm(mes)}: vacio inesperado sobre el piso; sigo.`});
              continue;
            }
            if(existe) throw new Error(`Archivo vacio existente: ${destino}. Lo conservo para revisar, no doy el activo por terminado.`);
            try { escribirMarca(path.dirname(destino), yymm(siguiente(mes))); } catch(e) { console.error('No pude escribir la marca de primer mes:', e.message); }
            // La bajada llegó al vacío con todo verificado (en rápido, solo si no hubo huecos):
            // los meses hasta el último cerrado quedan confiables para la próxima puesta al día.
            try { if(!j.rapido || confianza) escribirVerificado(path.dirname(destino), yymm(anterior(j.inicial))); } catch(e) { console.error('No pude escribir la marca de verificado:', e.message); }
            j.indice++;j.mes=j.inicial;j.conteo.activos++;terminado=true;
            if(j.indice===j.codigos.length && !j.siguientes.length) {j.estado='terminado';j.notificado=false;}
            await notificar(j,`${codigo}: ${etiqueta(mes)} sin velas. Historial terminado; ${j.indice}/${j.codigos.length} activos.${j.indice<j.codigos.length ? ` Sigo con ${j.codigos[j.indice]}.`:''}`,{tipo:'fin-activo',linea:`Historial terminado: ${etiqueta(mes)} sin velas. ${j.indice}/${j.codigos.length} activos.`});
          } else {
            const inicioGuardado=Date.now();
            if(modo==='nuevo') {publicarSerie(destino,Buffer.from(cuerpo));j.conteo.guardados++;}
            else if(modo==='ampliar') {publicarSerie(destino,Buffer.from(cuerpo),previoBuf);j.conteo.ampliados=(j.conteo.ampliados||0)+1;}
            else j.conteo.existentes++;
            j.mes=anterior(mes);
            const ndias=new Date(siguiente(mes)-1).getUTCDate();
            const dias=new Set(datos.map(v=>new Date(v[0]).getUTCDate()));
            const faltan=Array.from({length:ndias},(_,i)=>i+1).filter(n=>!dias.has(n));
            await notificar(j,`${codigo}, ${etiqueta(mes)}: ${datos.length} velas ${modo==='conservar'?'del corte comprobadas; conservo la serie local mas larga sin recortarla':modo==='ampliar'?'actualizadas con dias nuevos, anteriores intactos':existe?'ya existentes, comprobadas contra Binance':'guardadas'} en ${destino}. ${siguiente(mes)>j.hasta?`Mes en curso al corte; solo dias cerrados hasta ${new Date(j.hasta-1).toISOString().slice(0,10)}. `:''}${faltan.length?`Mes parcial; faltan los dias ${faltan.join(', ')}.`:`Mes completo: ${ndias}/${ndias} dias.`} Consulta ${dur(consultaMs)}, guardado y avance ${dur(Date.now()-inicioGuardado)}. Sigo con ${etiqueta(j.mes)}.`,{tipo:'mes',mes,linea:`${yymm(mes)}: ${datos.length} velas${faltan.length?'; parcial':''}${modo==='ampliar'?'; ampliado':existe?'':'; nuevo'}.`});
          }
        }
      }
      if(!j.siguientes.length) break;
      if(pedida(marca))throw errorParada();
      const tramo=j.siguientes.shift();
      await notificar(j,`Termine ${j.clase} (${j.codigos.length} activos). Sigo con ${tramo.clase}: ${tramo.codigos.length} activo(s), con el mismo corte UTC. ${resumen(j)}`);
      j.clase=tramo.clase;j.codigos=tramo.codigos;j.indice=0;j.mes=j.inicial;j.reporte=null;guardar(j);
      }
      await avisarFin(j);
    } catch(e) {
      // Si ya se termino, solo falta el aviso. No volver a consultar una cola completada.
      if(j.estado!=='terminado') {j.estado='pausado';j.error=String(e.message).slice(0,1000);}
      try{guardar(j);}catch(err){console.error('No pude guardar avance del registro:',err.message);}
      if(e.detenido) {
        try{await notificar(j,`Registro detenido a pedido en ${j.codigos[j.indice]||'el aviso final'}, ${etiqueta(j.mes)}. Lo guardado se conserva y el avance queda listo: pide registra continuar para retomarlo. ${resumen(j)}`);}catch(err){console.error('No pude avisar del registro detenido:',err.message);}
      } else {
        try{await notificar(j,`Registro detenido en ${j.codigos[j.indice]||'el aviso final'}, ${etiqueta(j.mes)}: ${e.message} Lo guardado se conserva. ${resumen(j)} Corrige la causa y pide registra continuar.`);}catch(err){console.error('No pude avisar del registro detenido:',err.message);}
      }
    } finally {activas.delete(id);}
  }
  async function iniciar({clase,codigos,siguientes=[],event,piso=null,continuar=false,arranque=false,rapido=false}) {
    if(ocupado) {if(!arranque)await notificar(event,'Ya estoy registrando un historial; no inicio otro.');return;}
    ocupado=true;
    try {
      const estadoAbs=path.resolve(archivoEstado()),baseAbs=path.resolve(base());
      if(estadoAbs===baseAbs || estadoAbs.startsWith(baseAbs+path.sep)) throw new Error('El avance privado debe quedar fuera de la carpeta de registros que se sincroniza con GitHub.');
      let j;
      try{j=leerEstado(archivoEstado());}catch(e){if(!arranque)await notificar(event,`No puedo leer el avance: ${e.message}. No lo sustituyo.`);else throw new Error(`No puedo leer el avance de registra: ${e.message}`);return;}
      if(j && j.hasta>cierreUTC(ahora()))throw new Error('El corte guardado esta en el futuro; revisa el reloj o el avance.');
      if(j?.estado==='terminado' && (j.avisoPendiente||!j.notificado)){await vaciarAviso(j);await avisarFin(j);if(continuar||arranque)return;}
      if(arranque) {
        if(!j)return;
        if(j.estado==='terminado') {await vaciarAviso(j);if(!j.notificado)await avisarFin(j);return;}
        if(j.estado==='pausado') {await notificar(j,`Registro pausado en ${j.codigos[j.indice]}, ${etiqueta(j.mes)}: ${j.error||'requiere revision'}. Pide registra continuar cuando se corrija la causa.`);return;}
      } else if(continuar) {
        if(!j || j.estado==='terminado') {await notificar(event,'No hay un registro pendiente que continuar.');return;}
      } else {
        if(j && j.estado!=='terminado') {
          const mismo=j.clase===clase && JSON.stringify(j.codigos)===JSON.stringify(codigos) && JSON.stringify(j.siguientes||[])===JSON.stringify(siguientes||[]) && (j.piso??null)===(piso??null) && !!j.rapido===!!rapido;
          if(!mismo) {await notificar(event,`Hay un registro pendiente en ${j.codigos[j.indice]}, ${etiqueta(j.mes)}. No lo sustituyo. Usa registra continuar.`);return;}
        } else {
          if(!Array.isArray(siguientes) || !siguientes.every(tramoValido)) {await notificar(event,'La lista de clases siguientes no es valida; no inicie el registro.');return;}
          const hasta=cierreUTC(ahora());
          if(piso!=null && piso>inicioMes(hasta-1)) {await notificar(event,'El mes de inicio pedido es posterior al mes en curso del corte; no inicie el registro.');return;}
          j={version:2,estado:'en-curso',rapido:!!rapido,clase,codigos,siguientes:siguientes.map(t=>({clase:t.clase,codigos:[...t.codigos]})),total:codigos.length+siguientes.reduce((n,t)=>n+t.codigos.length,0),piso:piso??null,indice:0,hasta,inicial:inicioMes(hasta-1),mes:inicioMes(hasta-1),channel:event.channel,thread_ts:event.thread_ts||event.ts,conteo:{guardados:0,existentes:0,activos:0,ampliados:0},notificado:false};
          guardar(j); // antes de consultar o guardar el primer mes
          const borrados=limpiarAnteriores(base(),[clase,...siguientes.map(t=>t.clase)]);
          if(borrados) await notificar(event,`Limpieza pedida por el usuario: ${borrados} archivo(s) de velas anteriores a ${etiqueta(PISO_MINIMO)} borrados del disco local; no se vuelven a buscar.`);
        }
      }
      await correr(j);
    } catch(e) {
      if(arranque) throw e;
      await notificar(event,`No pude iniciar el registro: ${e.message}. No sustituyo el avance guardado.`);
    } finally {ocupado=false;}
  }
  // «descarta registro»: abandona el avance guardado sin tocar los datos. Dos pasos para que
  // la confirmación pregunte con el detalle real y el borrado revalide justo antes de actuar.
  // pendiente() es solo lectura: lo usa el comando «estado» para no callar un registro pausado.
  const detallePendiente=(j)=>`${j.codigos[j.indice]||'?'}, ${etiqueta(j.mes)} (${j.indice}/${j.codigos.length} activos${j.rapido?', puesta al día':''})`;
  function pendiente() {
    let j;
    try{j=leerEstado(archivoEstado());}catch{return null;}
    if(!j || j.estado==='terminado') return null;
    return detallePendiente(j);
  }
  function pendienteDescarte() {
    if(ocupado) return {error:'Estoy registrando un historial; detenlo con stop y luego descarta el avance.'};
    let j;
    try{j=leerEstado(archivoEstado());}catch(e){return {error:`No puedo leer el avance: ${e.message}. Lo conservo.`};}
    if(!j || j.estado==='terminado') return {error:'No hay un registro pendiente que descartar.'};
    return {detalle:detallePendiente(j)};
  }
  function descartar() {
    if(ocupado) return {error:'Estoy registrando un historial; no descarto el avance en curso.'};
    let j;
    try{j=leerEstado(archivoEstado());}catch(e){return {error:`No puedo leer el avance: ${e.message}. Lo conservo.`};}
    if(!j || j.estado==='terminado') return {error:'No hay un registro pendiente que descartar.'};
    const detalle=detallePendiente(j);
    fs.rmSync(archivoEstado(), {force:true});
    return {ok:true, detalle};
  }
  return {iniciar, pendiente, pendienteDescarte, descartar};
}
