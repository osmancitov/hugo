// Un mensaje por activo, con ediciones reguladas. No envia mensajes por cada consulta.
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
