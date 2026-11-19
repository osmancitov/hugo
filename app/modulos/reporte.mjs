// La caja unica de reportes de Hugo. Todo aviso de un trabajo sale de aqui, para que ningun
// comando remiende sus propios mensajes. Dos formas, misma regla: avisar al empezar, editar el
// mismo mensaje con ritmo regulado (sin inundar el hilo) y cerrar con el resultado ahi mismo.
//
// - crearReporte: UN mensaje por trabajo lento (sincronizacion, actualiza, ...). Con event va al
//   hilo del comando; con canal va al canal de avisos. progreso edita como mucho cada `intervalo`;
//   final espera el ritmo y deja el resultado en ese mismo mensaje.
// - crearReporteSync: crearReporte con los textos propios de la sincronizacion.
// - crearAvisador: el reporte del registro de velas: UN mensaje por activo, con todos sus meses
//   acumulados (decisión del usuario, 18-nov-2026: «que reporte 1 vez por activo»). Meses y aviso
//   de activo no tocan Slack: se acumulan en memoria y viajan en el avance. Cada cosa en su
//   línea: titulo del activo, una línea por mes y una de cierre (decisión del usuario,
//   18-nov-2026: «usa una línea para cada cosa», «sin tanta verbosidad»). El reporte NUNCA
//   hace esperar al motor: los reportes se acumulan localmente y se vuelcan cada 5 segundos en
//   UN envio por volcado (partido por activos completos solo si el lote supera el tamano
//   seguro), sin pausa ni cola (decisión del usuario, 18-nov-2026: «acumular reportes local por
//   5 segundos y después volcar»). Errores y aviso final salen garantizados y arrastran lo
//   acumulado, para que ningún reporte quede sin salir.
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
 let cola=Promise.resolve(),ultimo=-Infinity,pendientes=[],ultimoVuelco=ahora()-5000;
 const enviar=fn=>{
  const tarea=cola.then(async()=>{const falta=intervalo-(ahora()-ultimo);if(falta>0)await esperar(falta);ultimo=ahora();return fn();});
  cola=tarea.catch(()=>{});return tarea;
 };
 const derecho=fn=>{const tarea=cola.then(fn);cola=tarea.catch(()=>{});return tarea;};
 const volcar=async()=>{
  ultimoVuelco=ahora();
  if(!pendientes.length)return;
  const destino={channel:pendientes[0].channel,thread_ts:pendientes[0].thread_ts};
  const bloques=pendientes.splice(0).map(p=>p.text);
  // Un envio por volcado: los activos del lote van juntos, cada uno identificado con sus
  // lineas. Si el lote supera el tamano seguro, se parte por activos completos.
  const paquetes=[];let actual='';
  for(const b of bloques) {
   if(actual&&actual.length+2+b.length>35000){paquetes.push(actual);actual=b;}
   else actual=actual?actual+'\n\n'+b:b;
  }
  if(actual)paquetes.push(actual);
  for(let i=0;i<paquetes.length;i++) {
   try { await derecho(async()=>{await client.chat.postMessage({token,...destino,text:paquetes[i]});ultimo=ahora();}); }
   catch(e) { pendientes.unshift(...paquetes.slice(i).map(text=>({...destino,text}))); throw e; }
  }
 };
 return async(j,text,meta={})=>{
  if(meta.tipo==='consulta')return;
  if(meta.tipo==='activo') {
   if(!j.reporte||j.reporte.indice!==j.indice||j.reporte.codigo!==j.codigos[j.indice]) j.reporte={indice:j.indice,codigo:j.codigos[j.indice],titulo:text,meses:{}};
   return;
  }
  if(meta.tipo==='mes'||meta.tipo==='fin-activo') {
   const r=j.reporte;
   if(!r||!r.meses)throw Error('Falta el reporte del activo en memoria; no duplico el mensaje.');
   if(meta.tipo==='mes'){r.meses[String(meta.mes)]=meta.linea;return;}
   r.fin=meta.linea;
   const cuerpo=[r.titulo,...Object.values(r.meses),r.fin].filter(Boolean).join('\n');
   if(cuerpo.length>35000)throw Error('El reporte supera el tamano seguro; el avance se conserva.');
   pendientes.push({channel:j.channel,thread_ts:j.thread_ts||j.ts,text:cuerpo});
   if(ahora()-ultimoVuelco<5000)return 'acumulado'; // acumula local; el motor sigue sin esperar
   await volcar();
   return 'volcado';
  }
  await volcar(); // errores y cierres arrastran lo acumulado: ningun reporte queda sin salir
  await enviar(()=>client.chat.postMessage({token,channel:j.channel,thread_ts:j.thread_ts||j.ts,text}));
 };
}
