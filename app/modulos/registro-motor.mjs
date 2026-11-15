// Motor unico de registra: un activo o una lista, meses UTC hacia atras y avance durable.
// No envia ordenes ni usa claves. La integracion decide quien puede iniciar una orden.
import fs from 'node:fs';
import path from 'node:path';
import { CLASES, CODIGO_OK } from './activos.mjs';

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
  const estados=['en-curso','pausado','terminado'];
  if (j.version!==1 || !CLASES.includes(j.clase) || !Array.isArray(j.codigos) || !j.codigos.length || j.codigos.length>500 || j.codigos.some(c=>!CODIGO_OK.test(c)) || new Set(j.codigos).size!==j.codigos.length || !Number.isInteger(j.indice) || j.indice<0 || j.indice>j.codigos.length || !estados.includes(j.estado) || !Number.isInteger(j.mes) || j.mes>inicial || j.mes<anterior(Date.UTC(2006,10,1)) || new Date(j.mes).getUTCDate()!==1 || j.mes%86400000!==0 || typeof j.channel!=='string' || !j.channel || typeof j.thread_ts!=='string' || !j.thread_ts || !j.conteo || ['guardados','existentes','activos'].some(k=>!Number.isInteger(j.conteo[k])||j.conteo[k]<0)) throw new Error('El avance guardado no tiene un formato valido; se conserva sin tocar.');
  if ((j.indice===j.codigos.length)!==(j.estado==='terminado')) throw new Error('Avance inconsistente; se conserva sin tocar.');
  return j;
}
function validarVelas(datos, mes) {
  if (!Array.isArray(datos)) throw new Error('Binance no devolvio una lista de velas; no equivale a un mes vacio.');
  let ultimo=-1;
  for (const v of datos) {
    if (!Array.isArray(v) || v.length!==12 || !Number.isSafeInteger(v[0]) || v[0]<mes || v[0]>=siguiente(mes) || v[0]%86400000!==0 || v[0]<=ultimo || v[6]!==v[0]+86400000-1) throw new Error('Velas invalidas, repetidas o fuera del mes UTC; no guardo esa respuesta.');
    ultimo=v[0];
  }
}
function resumen(j) { return `${j.conteo.activos}/${j.codigos.length} activos terminados; ${j.conteo.guardados} meses nuevos y ${j.conteo.existentes} existentes comprobados.`; }

export function crearMotor({ base, archivoEstado, resolver, fetchImpl=fetch, avisar, activas=new Map() }) {
  let ocupado=false;
  const guardar=(j)=>guardarEstado(archivoEstado(),j);
  const avisarFin=async(j)=>{await avisar(j,`Registro terminado. ${resumen(j)} Los archivos locales quedan pendientes de la sincronizacion habitual con GitHub.`);j.notificado=true;guardar(j);};
  async function correr(j) {
    const id='registro-historial';
    activas.set(id,{que:'registrar historial',desde:Date.now()});
    try {
      j.estado='en-curso';delete j.error;guardar(j);
      await avisar(j,`Registro en curso: ${j.clase}, ${j.codigos.length} activo(s). Retomo en ${j.codigos[j.indice]}, ${etiqueta(j.mes)}. ${resumen(j)}`);
      while(j.indice<j.codigos.length) {
        const codigo=j.codigos[j.indice];
        activas.set(id,{que:`registrar ${codigo}, ${etiqueta(j.mes)} (${j.indice+1}/${j.codigos.length})`,desde:Date.now()});
        const res=await resolver(j.clase,codigo);
        if(!res.ok) throw new Error(res.motivo);
        await avisar(j,`Activo ${j.indice+1}/${j.codigos.length}: ${codigo}${res.nombre ? `, ${res.nombre}`:''} (${j.clase}; corte UTC).`);
        let terminado=false;
        while(!terminado) {
          const meses=(2026-new Date(j.mes).getUTCFullYear())*12+9-new Date(j.mes).getUTCMonth();
          if(meses>=LIMITE) throw new Error(`Tope de seguridad: ${LIMITE} meses para ${codigo}; no doy su historial por terminado.`);
          const mes=j.mes;
          const destino=path.join(base(),j.clase,codigo,`${yymm(mes)}_${codigo}`);
          activas.set(id,{que:`registrar ${codigo}, ${etiqueta(mes)} (${j.indice+1}/${j.codigos.length})`,desde:Date.now()});
          await avisar(j,`Consulto ${codigo}, ${etiqueta(mes)} (${j.indice+1}/${j.codigos.length}; corte UTC).`);
          const t=Date.now();
          const r=await fetchImpl(`https://api.binance.com/api/v3/klines?symbol=${res.simbolo}&interval=1d&startTime=${mes}&endTime=${siguiente(mes)-1}&limit=1000`,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'hugo'}});
          const cuerpo=await r.text();
          if(!r.ok) throw new Error(`Binance HTTP ${r.status}; no equivale a un mes vacio.`);
          let datos;try{datos=JSON.parse(cuerpo);}catch{throw new Error('Binance no devolvio JSON; no equivale a un mes vacio.');}
          validarVelas(datos,mes);
          const consultaMs=Date.now()-t;
          const existe=fs.existsSync(destino);
          // Releer antes de saltar: un definitivo truncado por el corte no cuenta como mes completo.
          if(existe) {
            let previo;try{previo=JSON.parse(leerNormal(destino));}catch{throw new Error(`Archivo existente ilegible o incompleto: ${destino}. Lo conservo sin pisar.`);}
            if(JSON.stringify(previo)!==JSON.stringify(datos)) throw new Error(`Conflicto con Binance en ${destino}. No sobrescribo el archivo local.`);
          }
          if(!datos.length) {
            if(existe) throw new Error(`Archivo vacio existente: ${destino}. Lo conservo para revisar, no doy el activo por terminado.`);
            j.indice++;j.mes=inicial;j.conteo.activos++;terminado=true;
            if(j.indice===j.codigos.length) {j.estado='terminado';j.notificado=false;}
            guardar(j);
            await avisar(j,`${codigo}: ${etiqueta(mes)} sin velas. Historial terminado; ${j.indice}/${j.codigos.length} activos.${j.indice<j.codigos.length ? ` Sigo con ${j.codigos[j.indice]}.`:''}`);
          } else {
            const inicioGuardado=Date.now();
            if(!existe) {
              const tmp=escribirTemporal(destino,cuerpo);
              // Enlace sin reemplazar: protege tambien ante una sincronizacion concurrente.
              fs.linkSync(tmp,destino);syncDir(path.dirname(destino));fs.rmSync(tmp);syncDir(path.dirname(destino));
              j.conteo.guardados++;
            } else j.conteo.existentes++;
            j.mes=anterior(mes);guardar(j);
            const ndias=new Date(siguiente(mes)-1).getUTCDate();
            const dias=new Set(datos.map(v=>new Date(v[0]).getUTCDate()));
            const faltan=Array.from({length:ndias},(_,i)=>i+1).filter(n=>!dias.has(n));
            await avisar(j,`${codigo}, ${etiqueta(mes)}: ${datos.length} velas ${existe?'ya existentes, comprobadas contra Binance':'guardadas'} en ${destino}. ${faltan.length?`Mes parcial; faltan los dias ${faltan.join(', ')}.`:`Mes completo: ${ndias}/${ndias} dias.`} Consulta ${dur(consultaMs)}, guardado y avance ${dur(Date.now()-inicioGuardado)}. Sigo con ${etiqueta(j.mes)}.`);
          }
        }
      }
      await avisarFin(j);
    } catch(e) {
      // Si ya se termino, solo falta el aviso. No volver a consultar una cola completada.
      if(j.estado!=='terminado') {j.estado='pausado';j.error=String(e.message).slice(0,1000);}
      try{guardar(j);}catch(err){console.error('No pude guardar avance del registro:',err.message);}
      try{await avisar(j,`Registro detenido en ${j.codigos[j.indice]||'el aviso final'}, ${etiqueta(j.mes)}: ${e.message} Lo guardado se conserva. ${resumen(j)} Corrige la causa y pide registra continuar.`);}catch(err){console.error('No pude avisar del registro detenido:',err.message);}
    } finally {activas.delete(id);}
  }
  async function iniciar({clase,codigos,event,continuar=false,arranque=false}) {
    if(ocupado) {if(!arranque)await avisar(event,'Ya estoy registrando un historial; no inicio otro.');return;}
    ocupado=true;
    try {
      const estadoAbs=path.resolve(archivoEstado()),baseAbs=path.resolve(base());
      if(estadoAbs===baseAbs || estadoAbs.startsWith(baseAbs+path.sep)) throw new Error('El avance privado debe quedar fuera de la carpeta de registros que se sincroniza con GitHub.');
      let j;
      try{j=leerEstado(archivoEstado());}catch(e){if(!arranque)await avisar(event,`No puedo leer el avance: ${e.message}. No lo sustituyo.`);else throw new Error(`No puedo leer el avance de registra: ${e.message}`);return;}
      if(arranque) {
        if(!j)return;
        if(j.estado==='terminado') {if(!j.notificado)await avisarFin(j);return;}
        if(j.estado==='pausado') {await avisar(j,`Registro pausado en ${j.codigos[j.indice]}, ${etiqueta(j.mes)}: ${j.error||'requiere revision'}. Pide registra continuar cuando se corrija la causa.`);return;}
      } else if(continuar) {
        if(!j || j.estado==='terminado') {await avisar(event,'No hay un registro pendiente que continuar.');return;}
      } else {
        if(j && j.estado!=='terminado') {
          const mismo=j.clase===clase && JSON.stringify(j.codigos)===JSON.stringify(codigos);
          if(!mismo) {await avisar(event,`Hay un registro pendiente en ${j.codigos[j.indice]}, ${etiqueta(j.mes)}. No lo sustituyo. Usa registra continuar.`);return;}
        } else {
          j={version:1,estado:'en-curso',clase,codigos,indice:0,mes:inicial,channel:event.channel,thread_ts:event.thread_ts||event.ts,conteo:{guardados:0,existentes:0,activos:0},notificado:false};
          guardar(j); // antes de consultar o guardar el primer mes
        }
      }
      await correr(j);
    } catch(e) {
      if(arranque) throw e;
      await avisar(event,`No pude iniciar el registro: ${e.message}. No sustituyo el avance guardado.`);
    } finally {ocupado=false;}
  }
  return {iniciar};
}
