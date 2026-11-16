// Un reporte manual de sincronizacion: inicio inmediato, ediciones espaciadas y resultado en el mismo mensaje.
export async function crearReporteSync({client,token,event,ahora=Date.now,esperar=ms=>new Promise(r=>setTimeout(r,ms)),intervalo=5000}) {
 const channel=event.channel;
 const m=await client.chat.postMessage({token,channel,thread_ts:event.thread_ts||event.ts,text:'Sincronizacion en curso: comparando registros locales con GitHub. Los archivos no estan confirmados en la rama hasta el resultado final.'});
 if(!m?.ts)throw Error('Slack no devolvio referencia del reporte de sincronizacion.');
 let ultimo=ahora();
 const editar=async text=>{await client.chat.update({token,channel,ts:m.ts,text});ultimo=ahora();};
 return {
  progreso:async text=>{if(ahora()-ultimo<intervalo)return;await editar(`Sincronizacion en curso. ${text}`);},
  final:async text=>{const falta=intervalo-(ahora()-ultimo);if(falta>0)await esperar(falta);await editar(text);}
 };
}
