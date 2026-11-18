// La caja unica de reportes de Hugo. Todo aviso de un trabajo sale de aqui, para que ningun
// comando remiende sus propios mensajes. Dos formas, misma regla: avisar al empezar, editar el
// mismo mensaje con ritmo regulado (sin inundar el hilo) y cerrar con el resultado ahi mismo.
//
// - crearReporte: UN mensaje por trabajo lento (sincronizacion, actualiza, ...). Con event va al
//   hilo del comando; con canal va al canal de avisos. progreso edita como mucho cada `intervalo`;
//   final espera el ritmo y deja el resultado en ese mismo mensaje.
// - crearReporteSync: crearReporte con los textos propios de la sincronizacion.
// - crearAvisador: el reporte del registro de velas: UN mensaje por activo que se va editando con
//   sus meses (nunca un mensaje por consulta), con cola regulada entre publicaciones y ediciones.
export async function crearReporte({client,token,event,canal,hilo:hiloOpt,inicio,prefijo='',ahora=Date.now,esperar=ms=>new Promise(r=>setTimeout(r,ms)),intervalo=5000}) {
 const channel=event?event.channel:canal;
 const hilo=event?event.thread_ts||event.ts:hiloOpt;
 const m=await client.chat.postMessage({token,channel,...(hilo?{thread_ts:hilo}:{}),text:inicio});
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

// Un mensaje por activo, con ediciones reguladas. No envia mensajes por cada consulta.
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
 const enviar=fn=>{
  const tarea=cola.then(async()=>{const falta=intervalo-(ahora()-ultimo);if(falta>0)await esperar(falta);ultimo=ahora();return fn();});
  cola=tarea.catch(()=>{});return tarea;
 };
 const editar=async(j,r)=>{
  const text=[r.titulo,`Corte UTC: ${new Date(j.hasta).toISOString()}. Solo velas cerradas.`,...Object.values(r.meses),r.fin||''].filter(Boolean).join('\n');
  if(text.length>35000)throw Error('El reporte supera el tamano seguro; el avance se conserva.');
  await enviar(()=>client.chat.update({token,channel:j.channel,ts:r.ts,text}));
 };
 return async(j,text,meta={})=>{
  if(meta.tipo==='consulta')return;
  if(meta.tipo==='activo') {
   let r=j.reporte;
   if(!r||r.indice!==j.indice||r.codigo!==j.codigos[j.indice]) {
    r={indice:j.indice,codigo:j.codigos[j.indice],titulo:text,meses:{}};
    const m=await enviar(()=>client.chat.postMessage({token,channel:j.channel,thread_ts:j.thread_ts||j.ts,text:`${text}\nCorte UTC: ${new Date(j.hasta).toISOString()}. Solo velas cerradas.`}));
    if(!m?.ts)throw Error('Slack no devolvio referencia del reporte del activo.');
    r.ts=m.ts;j.reporte=r;
   } else await editar(j,r);
   return;
  }
  if(meta.tipo==='mes'||meta.tipo==='fin-activo') {
   const r=j.reporte;
   if(!r?.ts||!r.meses)throw Error('Falta la referencia del reporte del activo; no duplico el mensaje.');
   if(meta.tipo==='mes')r.meses[String(meta.mes)]=meta.linea;
   else r.fin=meta.linea;
   await editar(j,r);return;
  }
  await enviar(()=>client.chat.postMessage({token,channel:j.channel,thread_ts:j.thread_ts||j.ts,text}));
 };
}
