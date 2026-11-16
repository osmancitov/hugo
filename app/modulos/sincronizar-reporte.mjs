// Un reporte de sincronizacion (manual o automatica): un solo mensaje, editado con el avance y el resultado.
// Con event va al hilo del comando; con canal va al canal de avisos sin hilo.
export async function crearReporteSync({client,token,event,canal,inicio,ahora=Date.now,esperar=ms=>new Promise(r=>setTimeout(r,ms)),intervalo=5000}) {
 const channel=event?event.channel:canal;
 const hilo=event?event.thread_ts||event.ts:undefined;
 const m=await client.chat.postMessage({token,channel,...(hilo?{thread_ts:hilo}:{}),text:inicio||'Sincronizacion en curso: comparando registros locales con GitHub. Los archivos no estan confirmados en la rama hasta el resultado final.'});
 if(!m?.ts)throw Error('Slack no devolvio referencia del reporte de sincronizacion.');
 let ultimo=ahora();
 const editar=async text=>{await client.chat.update({token,channel,ts:m.ts,text});ultimo=ahora();};
 return {
  progreso:async text=>{if(ahora()-ultimo<intervalo)return;await editar(`Sincronizacion en curso. ${text}`);},
  final:async text=>{const falta=intervalo-(ahora()-ultimo);if(falta>0)await esperar(falta);await editar(text);}
 };
}
