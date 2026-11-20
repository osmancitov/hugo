// Registra: una orden directa para recorrer el historial de uno o varios activos.
// La clase aplica a toda la lista. No hay confirmaciones especiales por clase.
// «registra todo»: el universo completo de las dos clases en una sola orden, stock y luego cripto,
// con un solo corte UTC y el mismo reporte por activo que se va editando.
// Piso opcional: «registra cripto desde 2607 BTC ...» no baja del mes de inicio pedido
// (aamm, como el nombre de los archivos). Sin «desde», el recorrido llega al primer mes vacio.
import os from 'node:os';
import path from 'node:path';
import { resolverActivo, CLASES } from './activos.mjs';
import { crearMotor, leerEstado } from './registro-motor.mjs';
import { prepararUniverso } from './registro-universo.mjs';

export function registrar(ctx) {
  const base=()=>process.env.HUGO_VELAS_DIR || ctx.conf.HUGO_VELAS_DIR || path.join(os.homedir(),'Documents','hugo','registros','velas-24h');
  const archivoEstado=()=>process.env.HUGO_REGISTRO_ESTADO || ctx.conf.HUGO_REGISTRO_ESTADO || path.join(os.homedir(),'.local','share','hugo-registro','estado.json');
  const avisar=ctx.reporte.avisador();
  const motor=crearMotor({base,archivoEstado,resolver:resolverActivo,avisar,activas:ctx.activas,parada:ctx.parada});
  ctx.registroPendiente=()=>motor.pendiente(); // para que «estado» no calle un registro pausado
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
          tramos.push({clase,codigos:u.codigos,nombres:u.nombres});
        }
        return await motor.iniciar({clase:tramos[0].clase,codigos:tramos[0].codigos,nombres:tramos[0].nombres,siguientes:tramos.slice(1),event});
      } catch(e) { return await avisar(event,`No inicie la actualizacion completa: ${e.message}`); }
      finally {cotejando=false;}
    }
    const clase=String(partes.shift()||'').toLowerCase();
    if(!CLASES.includes(clase)) return avisar(event,'Las ordenes de registro son: registra todo (universo completo, stock y cripto), registra stock todos / registra cripto todos (admite «desde AAMM» antes de «todos»), y registra continuar. Activos sueltos ya no se registran a mano: «pon al día» incorpora las altas del cotejo y solo pide los días que faltan. Para retomar un trabajo pendiente: registra continuar.');
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
        return await motor.iniciar({clase,codigos:u.codigos,nombres:u.nombres,event,piso});
      } catch(e) { return await avisar(event,`No inicie la actualizacion completa: ${e.message}`); }
      finally {cotejando=false;}
    }
    if(partes.some(p=>p.toLowerCase()==='todos')) return avisar(event,'Usa todos sin mezclarlo con otros codigos: registra cripto todos, o registra stock todos.');
    return avisar(event,'Ya no registro activos sueltos a mano (decisión del usuario, 18-nov-2026: con el inventario de cobertura, «pon al día» solo pide los días que faltan y el cotejo incorpora las altas). Usa: pon al día, registra todo, registra '+clase+' todos o registra continuar.');
  },{nombre:'registrar velas'});
  // «pon al día»: mismo universo y motor que «registra todo», pero consulta solo lo pendiente y
  // comprueba en disco lo ya guardado. La revisión completa sigue siendo «registra todo».
  // Puesta al dia compartida: la orden manual y la corrida diaria (ciclo-diario.mjs) usan la
  // misma via. Con diaria:true, un trabajo interrumpido DE LA PROPIA corrida (origen 'diaria')
  // se retoma en vez de bloquear; un trabajo pedido a mano no se toca.
  const ponerAlDia=async(event,{diaria=false}={})=>{
    if(cotejando) return avisar(event,'Ya hay un cotejo del universo en curso; no inicio otro registro.');
    const pendiente=leerEstado(archivoEstado());
    if(pendiente && pendiente.estado!=='terminado') {
      if(diaria && pendiente.origen==='diaria') return motor.iniciar({event,continuar:true});
      return avisar(event, diaria
        ? 'Hay un registro pendiente pedido a mano; no lo toco. La puesta al día diaria sigue cuando termine.'
        : 'Hay un registro pendiente; no cambio su lista. Usa registra continuar.');
    }
    cotejando=true;
    try {
      const archivo=path.join(path.dirname(archivoEstado()),'universo.json');
      const tramos=[];
      for(const clase of CLASES) {
        const u=await prepararUniverso({clase,base:base(),archivo});
        // El aviso aceptado de cada clase precede a guardar su catalogo y a descargar velas.
        await avisar(event,u.texto);
        await u.guardar();
        tramos.push({clase,codigos:u.codigos,nombres:u.nombres});
      }
      return await motor.iniciar({clase:tramos[0].clase,codigos:tramos[0].codigos,nombres:tramos[0].nombres,siguientes:tramos.slice(1),event,rapido:true,origen:diaria?'diaria':null});
    } catch(e) { return await avisar(event,`No inicie la puesta al dia: ${e.message}`); }
    finally {cotejando=false;}
  };
  ctx.comando(/^\s*pon\s+al\s+d[ií]a\s*[.!?]*\s*$/i, (event)=>ponerAlDia(event),{nombre:'poner al dia los registros'});
  // Costuras para la corrida diaria (ciclo-diario.mjs).
  ctx.ponerAlDiaDiaria=(event)=>ponerAlDia(event,{diaria:true});
  ctx.registroOcupado=()=>motor.ocupado() || cotejando;
  ctx.registroArchivoEstado=archivoEstado;
  // «descarta registro»: abandona el avance pendiente (pausado o detenido) sin borrar ningún
  // dato guardado; el próximo registro arranca desde cero. Acción destructiva: pide el 👍 del usuario.
  ctx.comando(/^\s*descarta\s+registro\s*[.!?]*\s*$/i, async(event)=>{
    const p=motor.pendienteDescarte();
    if(p.error) return avisar(event,p.error);
    await ctx.confirmar({
      que:'descartar el avance del registro', channel:event.channel, thread_ts:event.thread_ts||event.ts, user:ctx.usuario,
      texto:`Solicitud.\n¿Descarto el avance del registro pendiente en ${p.detalle}? Solo abandono el avance; los datos guardados no se borran. Después el registro arranca desde cero («pon al día» o «registra todo»).`,
      alSi: async()=>{ const r=motor.descartar(); await avisar(event, r.ok?`Avance del registro descartado (${r.detalle}). Los datos guardados se conservan; el próximo registro arranca desde cero.`:r.error); },
      alNo: async()=>{ await avisar(event,'Sin respuesta: conservé el avance del registro.'); },
    });
  },{nombre:'descartar el avance del registro'});
  // El trabajo nuevo solo nace por una orden. Al volver, continua uno ya aceptado.
  ctx.alIniciar(()=>{motor.iniciar({arranque:true}).catch(async e=>{
    console.error('Reanudar registra:',e.message);
    try { await ctx.app.client.chat.postMessage({token:ctx.botToken,channel:ctx.canal,text:`No pude reanudar el registro: ${e.message}. El avance se conserva para revisar.`}); } catch(err) { console.error('Aviso de registro:',err.message); }
  });});
}
