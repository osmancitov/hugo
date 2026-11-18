// Registra: una orden directa para recorrer el historial de uno o varios activos.
// La clase aplica a toda la lista. No hay confirmaciones especiales por clase.
// «registra todo»: el universo completo de las dos clases en una sola orden, stock y luego cripto,
// con un solo corte UTC y el mismo reporte por activo que se va editando.
// Piso opcional: «registra cripto desde 2607 BTC ...» no baja del mes de inicio pedido
// (aamm, como el nombre de los archivos). Sin «desde», el recorrido llega al primer mes vacio.
import os from 'node:os';
import path from 'node:path';
import { resolverActivo, CLASES, CODIGO_OK } from './activos.mjs';
import { crearMotor, leerEstado } from './registro-motor.mjs';
import { prepararUniverso } from './registro-universo.mjs';
import { crearAvisador } from './registro-avisos.mjs';

export function registrar(ctx) {
  const base=()=>process.env.HUGO_VELAS_DIR || ctx.conf.HUGO_VELAS_DIR || path.join(os.homedir(),'Documents','hugo','registros','velas-24h');
  const archivoEstado=()=>process.env.HUGO_REGISTRO_ESTADO || ctx.conf.HUGO_REGISTRO_ESTADO || path.join(os.homedir(),'.local','share','hugo-registro','estado.json');
  const avisar=crearAvisador({client:ctx.app.client,token:ctx.botToken});
  const motor=crearMotor({base,archivoEstado,resolver:resolverActivo,avisar,activas:ctx.activas,parada:ctx.parada});
  let cotejando = false;
  ctx.comando(/^\s*registr\w*(?:\s|$)/i, async(event,texto)=>{
    if(cotejando) return avisar(event,'Ya hay un cotejo del universo en curso; no inicio otro registro.');
    const partes=texto.trim().replace(/[.!?]+$/,'').split(/[\s,;]+/);
    partes.shift();
    if(partes.length===1 && partes[0].toLowerCase()==='continuar') return motor.iniciar({event,continuar:true});
    if(partes.length && partes[0].toLowerCase()==='todo') {
      if(partes.length!==1) return avisar(event,'«registra todo» no admite codigos ni «desde»: recorre todo el universo, stock primero y cripto despues.');
      cotejando=true;
      try {
        const pendiente=leerEstado(archivoEstado());
        if(pendiente && pendiente.estado!=='terminado') return await avisar(event,'Hay un registro pendiente; no cambio su lista. Usa registra continuar.');
        const archivo=path.join(path.dirname(archivoEstado()),'universo.json');
        const tramos=[];
        for(const clase of CLASES) {
          const u=await prepararUniverso({clase,base:base(),archivo});
          // El aviso aceptado de cada clase precede a guardar su catalogo y a descargar velas.
          await avisar(event,u.texto);
          await u.guardar();
          tramos.push({clase,codigos:u.codigos});
        }
        return await motor.iniciar({clase:tramos[0].clase,codigos:tramos[0].codigos,siguientes:tramos.slice(1),event});
      } catch(e) { return await avisar(event,`No inicie la actualizacion completa: ${e.message}`); }
      finally {cotejando=false;}
    }
    const clase=String(partes.shift()||'').toLowerCase();
    if(!CLASES.includes(clase)) return avisar(event,'Indica la clase y uno o varios codigos: registra stock NVDA SPCX, o registra cripto BTC ETH. Para todo el universo en una orden: registra todo. Para retomar un trabajo pendiente: registra continuar.');
    // «desde AAMM» solo vale al principio de la lista, antes de los codigos.
    let piso=null;
    if(partes.length && partes[0].toLowerCase()==='desde') {
      partes.shift();
      const m=String(partes.shift()||'');
      if(!/^\d{4}$/.test(m) || Number(m.slice(2))<1 || Number(m.slice(2))>12) return avisar(event,'Tras «desde» va el mes de inicio como aamm (2607 = julio de 2026): registra cripto desde 2607 BTC ETH. No inicie el registro.');
      piso=Date.UTC(2000+Number(m.slice(0,2)),Number(m.slice(2))-1,1);
    }
    if(partes.some(p=>p.toLowerCase()==='desde')) return avisar(event,'«desde AAMM» solo va al principio de la lista: registra cripto desde 2607 BTC ETH. No inicie el registro.');
    if(partes.length===1 && partes[0].toLowerCase()==='todos') {
      cotejando=true;
      try {
        const pendiente=leerEstado(archivoEstado());
        if(pendiente && pendiente.estado!=='terminado') return await avisar(event,'Hay un registro pendiente; no cambio su lista. Usa registra continuar.');
        const archivo=path.join(path.dirname(archivoEstado()),'universo.json');
        const u=await prepararUniverso({clase,base:base(),archivo});
        // El aviso aceptado precede a guardar el catalogo y a descargar velas.
        await avisar(event,u.texto);
        await u.guardar();
        return await motor.iniciar({clase,codigos:u.codigos,event,piso});
      } catch(e) { return await avisar(event,`No inicie la actualizacion completa: ${e.message}`); }
      finally {cotejando=false;}
    }
    if(partes.some(p=>p.toLowerCase()==='todos')) return avisar(event,'Usa todos sin mezclarlo con codigos: registra cripto todos, o registra stock todos.');
    const codigos=partes.map(p=>p.toUpperCase());
    if(!codigos.length || codigos.length>500 || codigos.some(c=>!CODIGO_OK.test(c))) return avisar(event,'Falta una lista valida de codigos (hasta 500, separados por espacios o comas). No inicie el registro.');
    if(new Set(codigos).size!==codigos.length) return avisar(event,'Hay codigos repetidos en la lista. Quitalos para conservar un orden claro; no inicie el registro.');
    return motor.iniciar({clase,codigos,event,piso});
  },{nombre:'registrar velas',delegable:true});
  // El trabajo nuevo solo nace por una orden. Al volver, continua uno ya aceptado.
  ctx.alIniciar(()=>{motor.iniciar({arranque:true}).catch(async e=>{
    console.error('Reanudar registra:',e.message);
    try { await ctx.app.client.chat.postMessage({token:ctx.botToken,channel:ctx.canal,text:`No pude reanudar el registro: ${e.message}. El avance se conserva para revisar.`}); } catch(err) { console.error('Aviso de registro:',err.message); }
  });});
}
