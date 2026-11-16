// Motor unico de registra: un activo o una lista, meses UTC hacia atras y avance durable.
// No envia ordenes ni usa claves. La integracion decide quien puede iniciar una orden.
import fs from 'node:fs';
import path from 'node:path';
import { CLASES, CODIGO_OK } from './activos.mjs';
import { cierreUTC, inicioMes, compararSeries, validarSerie, publicarSerie } from './registro-serie.mjs';

export const CERO = Date.UTC(2026, 10, 1);
const LIMITE = 240;
const anterior = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1); };
const siguiente = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1); };
const etiqueta = (t) => new Date(t).toLocaleDateString('es',{month:'long',year:'numeric',timeZone:'UTC'});
const yymm = (t) => new Date(t).toISOString().slice(2,7).replace('-','');
const inicial = anterior(CERO);
const dur = (t) => `${(t/1000).toFixed(2)} s`;

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
export function leerEstado(archivo) {
  if (!fs.existsSync(archivo)) return null;
  const j=JSON.parse(leerNormal(archivo));
  if(j.version===1) {j.version=2;j.hasta=CERO;j.inicial=inicial;j.conteo.ampliados=0;} // reanuda el corte antiguo sin inventar dias
  const estados=['en-curso','pausado','terminado'];
  if (j.version!==2 || !Number.isInteger(j.hasta) || j.hasta%86400000!==0 || !Number.isInteger(j.inicial) || j.inicial!==inicioMes(j.hasta-1) || !CLASES.includes(j.clase) || !Array.isArray(j.codigos) || !j.codigos.length || j.codigos.length>500 || j.codigos.some(c=>!CODIGO_OK.test(c)) || new Set(j.codigos).size!==j.codigos.length || !Number.isInteger(j.indice) || j.indice<0 || j.indice>j.codigos.length || !estados.includes(j.estado) || !Number.isInteger(j.mes) || j.mes>j.inicial || (j.inicial-j.mes)>241*32*86400000 || new Date(j.mes).getUTCDate()!==1 || j.mes%86400000!==0 || typeof j.channel!=='string' || !j.channel || typeof j.thread_ts!=='string' || !j.thread_ts || !j.conteo || ['guardados','existentes','activos','ampliados'].some(k=>!Number.isInteger(j.conteo[k])||j.conteo[k]<0)) throw new Error('El avance guardado no tiene un formato valido; se conserva sin tocar.');
  if ((j.indice===j.codigos.length)!==(j.estado==='terminado')) throw new Error('Avance inconsistente; se conserva sin tocar.');
  return j;
}
function resumen(j) { return `${j.conteo.activos}/${j.codigos.length} activos terminados; ${j.conteo.guardados} meses nuevos, ${j.conteo.existentes} existentes comprobados y ${j.conteo.ampliados||0} meses ampliados.`; }

export function crearMotor({ base, archivoEstado, resolver, fetchImpl=fetch, avisar, activas=new Map(), ahora=Date.now }) {
  let ocupado=false;
  const guardar=(j)=>guardarEstado(archivoEstado(),j);
  const notificar=async(j,text,meta)=>{
    if(j.version===2 && ['mes','fin-activo'].includes(meta?.tipo)){j.avisoPendiente={text,meta};guardar(j);}
    await avisar(j,text,meta);
    if(j.version===2){if(['mes','fin-activo'].includes(meta?.tipo))delete j.avisoPendiente;guardar(j);}
  };
  const vaciarAviso=async j=>{if(j.avisoPendiente){const {text,meta}=j.avisoPendiente;await notificar(j,text,meta);}};
  const avisarFin=async(j)=>{await notificar(j,`Registro terminado. ${resumen(j)} Los archivos locales quedan pendientes de la sincronizacion habitual con GitHub.`);j.notificado=true;guardar(j);};
  async function correr(j) {
    const id='registro-historial';
    activas.set(id,{que:'registrar historial',desde:Date.now()});
    try {
      j.estado='en-curso';delete j.error;guardar(j);
      await vaciarAviso(j);
      await notificar(j,`Registro en curso: ${j.clase}, ${j.codigos.length} activo(s). Corte: velas cerradas antes de ${new Date(j.hasta).toISOString()}. Retomo en ${j.codigos[j.indice]}, ${etiqueta(j.mes)}. ${resumen(j)}`);
      while(j.indice<j.codigos.length) {
        const codigo=j.codigos[j.indice];
        activas.set(id,{que:`registrar ${codigo}, ${etiqueta(j.mes)} (${j.indice+1}/${j.codigos.length})`,desde:Date.now()});
        const res=await resolver(j.clase,codigo);
        if(!res.ok) throw new Error(res.motivo);
        await notificar(j,`Activo ${j.indice+1}/${j.codigos.length}: ${codigo}${res.nombre ? `, ${res.nombre}`:''} (${j.clase}; corte UTC).`,{tipo:'activo'});
        let terminado=false;
        while(!terminado) {
          const meses=(new Date(j.inicial).getUTCFullYear()-new Date(j.mes).getUTCFullYear())*12+new Date(j.inicial).getUTCMonth()-new Date(j.mes).getUTCMonth();
          if(meses>=LIMITE) throw new Error(`Tope de seguridad: ${LIMITE} meses para ${codigo}; no doy su historial por terminado.`);
          const mes=j.mes;
          const destino=path.join(base(),j.clase,codigo,`${yymm(mes)}_${codigo}`);
          activas.set(id,{que:`registrar ${codigo}, ${etiqueta(mes)} (${j.indice+1}/${j.codigos.length})`,desde:Date.now()});
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
            if(existe) throw new Error(`Archivo vacio existente: ${destino}. Lo conservo para revisar, no doy el activo por terminado.`);
            j.indice++;j.mes=j.inicial;j.conteo.activos++;terminado=true;
            if(j.indice===j.codigos.length) {j.estado='terminado';j.notificado=false;}
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
            await notificar(j,`${codigo}, ${etiqueta(mes)}: ${datos.length} velas ${modo==='conservar'?'del corte comprobadas; conservo la serie local mas larga sin recortarla':modo==='ampliar'?'actualizadas con dias nuevos, anteriores intactos':existe?'ya existentes, comprobadas contra Binance':'guardadas'} en ${destino}. ${siguiente(mes)>j.hasta?`Mes en curso al corte; solo dias cerrados hasta ${new Date(j.hasta-1).toISOString().slice(0,10)}. `:''}${faltan.length?`Mes parcial; faltan los dias ${faltan.join(', ')}.`:`Mes completo: ${ndias}/${ndias} dias.`} Consulta ${dur(consultaMs)}, guardado y avance ${dur(Date.now()-inicioGuardado)}. Sigo con ${etiqueta(j.mes)}.`,{tipo:'mes',mes,linea:`${yymm(mes)}: ${datos.length} velas; ${modo==='ampliar'?'ampliado':existe?'comprobado':'guardado'}${faltan.length?'; parcial':' completo'}; consulta ${dur(consultaMs)}, disco ${dur(Date.now()-inicioGuardado)}.`});
          }
        }
      }
      await avisarFin(j);
    } catch(e) {
      // Si ya se termino, solo falta el aviso. No volver a consultar una cola completada.
      if(j.estado!=='terminado') {j.estado='pausado';j.error=String(e.message).slice(0,1000);}
      try{guardar(j);}catch(err){console.error('No pude guardar avance del registro:',err.message);}
      try{await notificar(j,`Registro detenido en ${j.codigos[j.indice]||'el aviso final'}, ${etiqueta(j.mes)}: ${e.message} Lo guardado se conserva. ${resumen(j)} Corrige la causa y pide registra continuar.`);}catch(err){console.error('No pude avisar del registro detenido:',err.message);}
    } finally {activas.delete(id);}
  }
  async function iniciar({clase,codigos,event,continuar=false,arranque=false}) {
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
          const mismo=j.clase===clase && JSON.stringify(j.codigos)===JSON.stringify(codigos);
          if(!mismo) {await notificar(event,`Hay un registro pendiente en ${j.codigos[j.indice]}, ${etiqueta(j.mes)}. No lo sustituyo. Usa registra continuar.`);return;}
        } else {
          const hasta=cierreUTC(ahora());
          j={version:2,estado:'en-curso',clase,codigos,indice:0,hasta,inicial:inicioMes(hasta-1),mes:inicioMes(hasta-1),channel:event.channel,thread_ts:event.thread_ts||event.ts,conteo:{guardados:0,existentes:0,activos:0,ampliados:0},notificado:false};
          guardar(j); // antes de consultar o guardar el primer mes
        }
      }
      await correr(j);
    } catch(e) {
      if(arranque) throw e;
      await notificar(event,`No pude iniciar el registro: ${e.message}. No sustituyo el avance guardado.`);
    } finally {ocupado=false;}
  }
  return {iniciar};
}
