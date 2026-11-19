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
// Inventario persistente de cobertura (decisión del usuario, 18-nov-2026, nota de voz): el
// sistema sabe qué hay sin contar de nuevo. _cobertura guarda la FECHA (AAAA-MM-DD, UTC) del
// último día hasta el que el registro del activo está completo; la puesta al día la consulta
// y pide solo los días que falten, sin releer ni revalidar archivos. Si algo falta o cambió,
// se detecta al usarlo (conflicto en la sincronización) y se repara entonces: no se
// reconstruye por temor. Solo la escribe una corrida con confianza que constató el mes en
// curso con datos y los meses anteriores cubiertos (marca o la propia corrida). Nunca
// retrocede. No se sincroniza: es conocimiento local, como las demás marcas.
const COBERTURA = '_cobertura';
const DIA = 86400000;
const fechaDia = (t) => new Date(t).toISOString().slice(0, 10);
function leerCobertura(dir) {
  try {
    const t = fs.readFileSync(path.join(dir, COBERTURA), 'utf8').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
    const ms = Date.parse(t + 'T00:00:00Z');
    return Number.isFinite(ms) && fechaDia(ms) === t ? ms : null;
  } catch { return null; }
}
function escribirCobertura(dir, hastaDiaMs) {
  const previo = leerCobertura(dir);
  if (previo != null && previo >= hastaDiaMs) return; // un inventario mayor ya escrito manda
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const ruta = path.join(dir, COBERTURA);
  const tmp = ruta + '.tmp';
  fs.writeFileSync(tmp, fechaDia(hastaDiaMs) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, ruta);
}
// Limpieza pedida por el usuario (18-nov-2026, notas de voz): los registros anteriores al
// piso no se van a usar, y el extremo superior se recorta UNA VEZ al 17-nov-2026 inclusive
// UTC para uniformar la base (unos activos habían sumado la vela del 18 y otros no) y
// comprobar que la puesta al día añade el 18 a todos. Ese techo NO es permanente: lo que la
// fuente cierre desde el 18 se acumula normal y jamás se vuelve a recortar.
// Al arrancar un registro nuevo: borra del disco local los archivos AAMM anteriores al piso
// (siempre) y, solo la primera vez (marca _recorte-techo en la base), borra los archivos
// posteriores a 2611 y recorta las velas posteriores al 17 dentro de los archivos de ese
// mes; si el recorte deja un noviembre sin velas (activos nuevos que solo tenían el 18),
// borra el archivo para que el motor lo baje completo, y ese saneamiento de noviembre vacío
// corre en todo arranque, con o sin marca. Avisa cuánto quitó. No toca _primer-mes,
// _verificado ni otros archivos. Un archivo ilegible o intocable se conserva y se avisa por
// consola.
const TECHO_RECO = Date.UTC(2026,10,18); // exclusivo: la última vela conservada es la del 17-nov-2026
const MARCA_RECO = '_recorte-techo';
function limpiarFueraDelTramo(baseDir,clases) {
 let archivos=0,velas=0;const pisoAamm=yymm(PISO_MINIMO),techoAamm=yymm(Date.UTC(2026,10,1));
 let techoHecho=false;try{techoHecho=fs.readFileSync(path.join(baseDir,MARCA_RECO),'utf8').trim()==='2611';}catch{}
 for(const clase of clases) {
  const raiz=path.join(baseDir,clase);
  let activos;try{activos=fs.readdirSync(raiz,{withFileTypes:true});}catch{continue;}
  for(const a of activos) {
   if(!a.isDirectory())continue;
   const dir=path.join(raiz,a.name);
   let nombres;try{nombres=fs.readdirSync(dir);}catch{continue;}
   for(const f of nombres) {
    const m=/^(\d{4})_/.exec(f);
    if(!m)continue;
    const ruta=path.join(dir,f);
    if(m[1]<pisoAamm||(!techoHecho&&m[1]>techoAamm)){try{fs.rmSync(ruta);archivos++;}catch(e){console.error('No pude borrar',f,e.message);}continue;}
    if(m[1]===techoAamm) {
     let datos;try{datos=JSON.parse(leerNormal(ruta));}catch(e){console.error('No pude recortar',f,e.message);continue;}
     if(!Array.isArray(datos))continue;
     // Un noviembre sin velas (el recorte dejó vacíos a los activos nuevos que solo tenían
     // el 18) no es una serie registrada: se borra y el motor lo vuelve a bajar completo.
     // Esto corre en TODO arranque, con o sin marca, para sanar los restos del recorte único.
     if(datos.length===0){try{fs.rmSync(ruta);archivos++;}catch(e){console.error('No pude borrar',f,e.message);}continue;}
     if(techoHecho)continue;
     const quedan=datos.filter(v=>!Array.isArray(v)||typeof v[0]!=='number'||v[0]<TECHO_RECO);
     if(quedan.length===datos.length)continue;
     if(quedan.length===0){try{fs.rmSync(ruta);archivos++;}catch(e){console.error('No pude borrar',f,e.message);}continue;}
     try{const tmp=escribirTemporal(ruta,JSON.stringify(quedan)+'\n');fs.renameSync(tmp,ruta);syncDir(dir);velas+=datos.length-quedan.length;}catch(e){console.error('No pude recortar',f,e.message);}
    }
   }
  }
 }
 // Sin base de velas no hay nada que recortar ni directorio que crear; la marca espera.
 if(!techoHecho&&fs.existsSync(baseDir)){try{const tmp=escribirTemporal(path.join(baseDir,MARCA_RECO),'2611\n');fs.renameSync(tmp,path.join(baseDir,MARCA_RECO));syncDir(baseDir);}catch(e){console.error('No pude marcar el recorte del techo',e.message);}}
 return {archivos,velas};
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
        let cobertura=j.rapido?leerCobertura(dirActivo):null, datoEnCurso=false;
        let terminado=false;
        const finPorInventario=async(mes)=>{
          j.indice++;j.mes=j.inicial;j.conteo.activos++;terminado=true;
          if(j.indice===j.codigos.length && !j.siguientes.length) {j.estado='terminado';j.notificado=false;}
          try { escribirVerificado(dirActivo, yymm(anterior(j.inicial))); } catch(e) { console.error('No pude escribir la marca de verificado:', e.message); }
          try { if(datoEnCurso && (!j.rapido || confianza)) escribirCobertura(dirActivo, j.hasta-DIA); } catch(e) { console.error('No pude escribir la cobertura:', e.message); }
          await notificar(j,`${codigo}: al dia hasta ${fechaDia(j.hasta-DIA)}; desde ${etiqueta(mes)} hacia atras ya estaba completo segun el inventario. ${j.indice}/${j.codigos.length} activos.${j.indice<j.codigos.length ? ` Sigo con ${j.codigos[j.indice]}.`:''}`,{tipo:'fin-activo',linea:`Al dia hasta ${fechaDia(j.hasta-DIA)}; inventario desde ${etiqueta(mes)}. ${j.indice}/${j.codigos.length} activos.`});
        };
        const finConfiable=async(limite)=>{
          j.indice++;j.mes=j.inicial;j.conteo.activos++;terminado=true;
          if(j.indice===j.codigos.length && !j.siguientes.length) {j.estado='terminado';j.notificado=false;}
          try { escribirVerificado(dirActivo, yymm(anterior(j.inicial))); } catch(e) { console.error('No pude escribir la marca de verificado:', e.message); }
          try { if(datoEnCurso && (!j.rapido || confianza)) escribirCobertura(dirActivo, j.hasta-DIA); } catch(e) { console.error('No pude escribir la cobertura:', e.message); }
          await notificar(j,`${codigo}: verificado hasta ${etiqueta(limite)}; lo anterior ya estaba comprobado. ${j.indice}/${j.codigos.length} activos.${j.indice<j.codigos.length ? ` Sigo con ${j.codigos[j.indice]}.`:''}`,{tipo:'fin-activo',linea:`Verificado hasta ${etiqueta(limite)}. ${j.indice}/${j.codigos.length} activos.`});
        };
        while(!terminado) {
          if(pedida(marca))throw errorParada();
          if(j.mes<pisoEf) {
            j.indice++;j.mes=j.inicial;j.conteo.activos++;terminado=true;
            if(j.indice===j.codigos.length && !j.siguientes.length) {j.estado='terminado';j.notificado=false;}
            try { escribirMarca(dirActivo, yymm(pisoEf)); } catch(e) { console.error('No pude escribir la marca de primer mes:', e.message); }
            try { if(!j.rapido || confianza) escribirVerificado(dirActivo, yymm(anterior(j.inicial))); } catch(e) { console.error('No pude escribir la marca de verificado:', e.message); }
            try { if(datoEnCurso && (!j.rapido || confianza)) escribirCobertura(dirActivo, j.hasta-DIA); } catch(e) { console.error('No pude escribir la cobertura:', e.message); }
            await notificar(j,`${codigo}: tramo desde ${etiqueta(pisoEf)} cubierto; no bajo mas. ${j.indice}/${j.codigos.length} activos.${j.indice<j.codigos.length ? ` Sigo con ${j.codigos[j.indice]}.`:''}`,{tipo:'fin-activo',linea:`Tramo desde ${etiqueta(pisoEf)} cubierto. ${j.indice}/${j.codigos.length} activos.`});
            continue;
          }
          const meses=(new Date(j.inicial).getUTCFullYear()-new Date(j.mes).getUTCFullYear())*12+new Date(j.inicial).getUTCMonth()-new Date(j.mes).getUTCMonth();
          if(meses>=LIMITE) throw new Error(`Tope de seguridad: ${LIMITE} meses para ${codigo}; no doy su historial por terminado.`);
          const mes=j.mes;
          const destino=path.join(base(),j.clase,codigo,`${yymm(mes)}_${codigo}`);
          if(j.rapido) {
            // Inventario de cobertura (ancla operativa cuando existe): el registro ya está
            // completo hasta _cobertura. Los meses cubiertos no se reconsultan ni se releen;
            // solo se piden los días desde el último día cubierto hasta el corte, aunque el
            // atraso cruce varios meses. Si el archivo del mes en curso desapareció, cae a la
            // consulta y lo reconstruye. Un vacío inesperado apaga la confianza y la
            // cobertura no avanza sobre huecos.
            const finEsperado=Math.min(siguiente(mes),j.hasta)-DIA;
            if(confianza && cobertura!=null && cobertura>=finEsperado) {
              if(mes===j.inicial && fs.existsSync(destino)) {
                j.indice++;j.mes=j.inicial;j.conteo.activos++;j.conteo.existentes++;terminado=true;
                if(j.indice===j.codigos.length && !j.siguientes.length) {j.estado='terminado';j.notificado=false;}
                try { escribirVerificado(dirActivo, yymm(anterior(j.inicial))); } catch(e) { console.error('No pude escribir la marca de verificado:', e.message); }
                await notificar(j,`${codigo}: completo hasta ${fechaDia(cobertura)} segun el inventario; nada que pedir. ${j.indice}/${j.codigos.length} activos.${j.indice<j.codigos.length ? ` Sigo con ${j.codigos[j.indice]}.`:''}`,{tipo:'fin-activo',linea:`Completo hasta ${fechaDia(cobertura)}; sin consultas. ${j.indice}/${j.codigos.length} activos.`});
                continue;
              }
              if(mes!==j.inicial) { await finPorInventario(mes); continue; }
            }
            // Meses ya verificados por una corrida anterior con confianza: se confían, no se recorren.
            // (Solo sin inventario: con _cobertura presente, ella manda y el atraso se consulta.)
            if(confianza && cobertura==null && verificado!=null && mes<=verificado) { await finConfiable(verificado); continue; }
            // Piso verificado: debajo de la marca ya lo comprobó una bajada completa.
            if(confianza && cobertura==null && pisoVerificado && mes<pisoVerificado) { await finConfiable(pisoVerificado); continue; }
            // Mes cerrado con archivo local completo: se comprueba en disco, sin consulta.
            // El mes en curso nunca se salta. Sin marca, la bajada valida en disco hasta el
            // archivo más viejo y la primera consulta sin archivo fija la frontera.
            if(confianza && cobertura==null && mes!==j.inicial && fs.existsSync(destino) && serieLocalCompleta(destino,mes,j.hasta)) {
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
            try { if(datoEnCurso && (!j.rapido || confianza)) escribirCobertura(path.dirname(destino), j.hasta-DIA); } catch(e) { console.error('No pude escribir la cobertura:', e.message); }
            j.indice++;j.mes=j.inicial;j.conteo.activos++;terminado=true;
            if(j.indice===j.codigos.length && !j.siguientes.length) {j.estado='terminado';j.notificado=false;}
            await notificar(j,`${codigo}: ${etiqueta(mes)} sin velas. Historial terminado; ${j.indice}/${j.codigos.length} activos.${j.indice<j.codigos.length ? ` Sigo con ${j.codigos[j.indice]}.`:''}`,{tipo:'fin-activo',linea:`Historial terminado: ${etiqueta(mes)} sin velas. ${j.indice}/${j.codigos.length} activos.`});
          } else {
            const inicioGuardado=Date.now();
            if(modo==='nuevo') {publicarSerie(destino,Buffer.from(cuerpo));j.conteo.guardados++;}
            else if(modo==='ampliar') {publicarSerie(destino,Buffer.from(cuerpo),previoBuf);j.conteo.ampliados=(j.conteo.ampliados||0)+1;}
            else j.conteo.existentes++;
            if(mes===j.inicial) {
              datoEnCurso=true;
              // Mes en curso constatado con datos. La cobertura solo se fija al corte si lo
              // anterior ya está cubierto de verdad: con inventario, solo si él mismo cubre el
              // mes anterior completo; sin inventario, solo _verificado (que avala hasta su mes;
              // _primer-mes NO avala los meses entre su piso y aquí: se recorren). Si el atraso
              // cruza meses o hay un hueco, la bajada sigue y la cobertura no avanza sobre él.
              try { if (confianza && (cobertura==null ? (verificado!=null && verificado>=anterior(j.inicial)) : cobertura>=j.inicial-DIA)) escribirCobertura(dirActivo, j.hasta-DIA); } catch(e) { console.error('No pude escribir la cobertura:', e.message); }
            }
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
          const limpia=limpiarFueraDelTramo(base(),[clase,...siguientes.map(t=>t.clase)]);
          if(limpia.archivos||limpia.velas) await notificar(event,`Limpieza pedida por el usuario: ${limpia.archivos} archivo(s) de velas anteriores a ${etiqueta(PISO_MINIMO)} o posteriores a noviembre de 2026 borrados del disco local${limpia.velas?` y ${limpia.velas} vela(s) de noviembre posteriores al 17 recortadas (recorte único para uniformar la base)`:''}. Lo anterior a agosto no se vuelve a buscar; la puesta al día completa desde el 18.`);
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
