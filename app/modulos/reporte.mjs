// La caja unica de reportes de Hugo. Todo aviso de un trabajo sale de aqui, para que ningun
// comando remiende sus propios mensajes. Dos formas, misma regla: avisar al empezar, editar el
// mismo mensaje con ritmo regulado (sin inundar el hilo) y cerrar con el resultado ahi mismo.
//
// - crearReporte: UN mensaje por trabajo lento (sincronizacion, actualiza, ...). Con event va al
//   hilo del comando; con canal va al canal de avisos. progreso edita como mucho cada `intervalo`;
//   final espera el ritmo y deja el resultado en ese mismo mensaje.
// - crearReporteSync: crearReporte con los textos propios de la sincronizacion.
// - crearAvisador: el reporte del registro de velas: UN solo mensaje por recorrido, editado con
//   lo que va ocurriendo (decisión del usuario, 21-nov-2026: «que edite el mismo mensaje y vaya
//   poniendo en él lo que va ocurriendo», porque la lista de activos quedaba muy larga; sustituye
//   para este reporte la de 18-nov-2026 de un mensaje por activo). Meses y aviso de activo no
//   tocan Slack: se acumulan en memoria y viajan en el avance. Al cerrar cada activo, el mensaje
//   muestra su bloque: titulo del activo, una línea por mes y una de cierre (decisión del
//   usuario, 18-nov-2026: «usa una línea para cada cosa», «sin tanta verbosidad»). El reporte
//   NUNCA hace esperar al motor: los cierres se acumulan en memoria y el mensaje se edita como
//   mucho cada 5 segundos con lo último (la acumulación local de 18-nov-2026 se conserva; el
//   volcado ahora es una edición). Una edición fallida no frena nada: la entrega siguiente lleva
//   lo último. Errores y aviso final salen garantizados como mensajes propios, tras dejar el
//   progreso al día. Si el recorrido se corta y retoma en otro arranque, el progreso sigue en
//   un mensaje nuevo (la referencia del anterior no se guarda), sin repetir consultas.
export async function crearReporte({client,token,event,canal,hilo:hiloOpt,inicio,mensajeTs,prefijo='',ahora=Date.now,esperar=ms=>new Promise(r=>setTimeout(r,ms)),intervalo=5000}) {
 const channel=event?event.channel:canal;
 const hilo=event?event.thread_ts||event.ts:hiloOpt;
 const m=mensajeTs?{ts:mensajeTs}:await client.chat.postMessage({token,channel,...(hilo?{thread_ts:hilo}:{}),text:inicio});
 if(!m?.ts)throw Error('Slack no devolvio referencia del reporte.');
 let ultimo=ahora();
 const editar=async text=>{await client.chat.update({token,channel,ts:m.ts,text});ultimo=ahora();};
 return {
  progreso:async text=>{if(ahora()-ultimo<intervalo)return;await editar(`${prefijo}${text}`);},
  final:async text=>{const falta=intervalo-(ahora()-ultimo);if(falta>0)await esperar(falta);await editar(text);}
 };
}

export function crearReporteSync({inicio,prefijo,...resto}={}) {
 return crearReporte({
  ...resto,
  inicio:inicio||'Sincronizacion en curso: comparando registros locales con GitHub. Los archivos no estan confirmados en la rama hasta el resultado final.',
  prefijo:prefijo??'Sincronizacion en curso. ',
 });
}

// Abre el hilo de un trabajo y devuelve su referencia. No envia mensajes por cada consulta.
export async function abrirHilo({client,token,canal,texto}) {
 const m=await client.chat.postMessage({token,channel:canal,text:texto});
 if(!m?.ts)throw Error('Slack no devolvio referencia del hilo.');
 return m.ts;
}

// Los ojitos: toda mencion recibe de inmediato un mensaje 👀 y la primera respuesta del comando
// edita ese mismo mensaje en vez de abrir otro. Se instala una sola vez (app.mjs) envolviendo
// postMessage: el primer mensaje al hilo de la mencion se convierte en edicion de los ojitos;
// todo lo demas (avisos de canal, preguntas de 👍, mensajes siguientes) pasa igual que antes.
export function crearOjos({client,token}) {
 const pendientes=new Map(); // canal|hilo -> ts del mensaje 👀 a la espera de respuesta
 const clave=(channel,hilo)=>`${channel}|${hilo||''}`;
 const publicar=client.chat.postMessage.bind(client.chat);
 client.chat.postMessage=async m=>{
  const k=clave(m.channel,m.thread_ts);
  const ts=m.thread_ts&&pendientes.get(k);
  if(ts){pendientes.delete(k);await client.chat.update({token:m.token||token,channel:m.channel,ts,text:m.text});return{ts};}
  return publicar(m);
 };
 return {
  anunciar:async event=>{
   const hilo=event.thread_ts||event.ts;
   const m=await publicar({token,channel:event.channel,thread_ts:hilo,text:'👀'});
   if(m?.ts)pendientes.set(clave(event.channel,hilo),m.ts);
   return m?.ts?{channel:event.channel,ts:m.ts}:null;
  }
 };
}

export function crearAvisador({client,token,ahora=Date.now,esperar=ms=>new Promise(r=>setTimeout(r,ms)),intervalo=1500}) {
 let cola=Promise.resolve(),ultimo=-Infinity;
 const mensajes=new Map(); // canal|hilo -> {ts,texto,sucio,editado}
 const clave=(channel,hilo)=>`${channel}|${hilo||''}`;
 const enviar=fn=>{
  const tarea=cola.then(async()=>{const falta=intervalo-(ahora()-ultimo);if(falta>0)await esperar(falta);ultimo=ahora();return fn();});
  cola=tarea.catch(()=>{});return tarea;
 };
 const derecho=fn=>{const tarea=cola.then(fn);cola=tarea.catch(()=>{});return tarea;};
 // Editar nunca frena el motor: en estricto (cierres y avisos garantizados) el fallo se propaga
 // como antes lo hacia el volcado; en el cierre de un activo solo deja lo pendiente para la
 // proxima entrega.
 const editar=async(k,destino,estricto=false)=>{
  const m=mensajes.get(k);
  if(!m||!m.sucio)return;
  m.sucio=false;m.editado=ahora();
  try{await derecho(()=>client.chat.update({token,...destino,ts:m.ts,text:m.texto}));}
  catch(e){m.sucio=true;if(estricto)throw e;console.error('Edicion del reporte del registro:',e.message);}
 };
 const vaciar=async()=>{for(const k of mensajes.keys()){const [channel,thread_ts]=k.split('|');await editar(k,{channel,thread_ts:thread_ts||undefined},true);}};
 return async(j,text,meta={})=>{
  if(meta.tipo==='consulta')return;
  if(meta.tipo==='activo') {
   if(!j.reporte||j.reporte.indice!==j.indice||j.reporte.codigo!==j.codigos[j.indice]) j.reporte={indice:j.indice,codigo:j.codigos[j.indice],titulo:text,meses:{}};
   return;
  }
  if(meta.tipo==='mes') {
   const r=j.reporte;
   if(!r||!r.meses)throw Error('Falta el reporte del activo en memoria; no duplico el mensaje.');
   r.meses[String(meta.mes)]=meta.linea;return;
  }
  if(meta.tipo==='fin-activo') {
   const r=j.reporte;
   if(!r||!r.meses)throw Error('Falta el reporte del activo en memoria; no duplico el mensaje.');
   r.fin=meta.linea;
   const cuerpo=[r.titulo,...Object.values(r.meses),r.fin].filter(Boolean).join('\n');
   if(cuerpo.length>35000)throw Error('El reporte supera el tamano seguro; el avance se conserva.');
   const destino={channel:j.channel,thread_ts:j.thread_ts||j.ts};
   const k=clave(destino.channel,destino.thread_ts);
   const m=mensajes.get(k);
   if(!m) {
    // Primer cierre del recorrido: se publica el mensaje; si falla, el motor pausa y lo retoma.
    const ts=await enviar(async()=>{const r0=await client.chat.postMessage({token,...destino,text:cuerpo});if(!r0?.ts)throw Error('Slack no devolvio referencia del reporte.');return r0.ts;});
    mensajes.set(k,{ts,texto:cuerpo,sucio:false,editado:ahora()});
    return 'publicado';
   }
   m.texto=cuerpo;m.sucio=true;
   if(ahora()-m.editado<5000)return 'acumulado'; // ventana de acumulacion: el motor sigue sin esperar
   await editar(k,destino);
   return m.sucio?'acumulado':'editado';
  }
  await vaciar(); // errores y cierres dejan el progreso al dia y salen como mensajes propios
  await enviar(()=>client.chat.postMessage({token,channel:j.channel,thread_ts:j.thread_ts||j.ts,text}));
 };
}
