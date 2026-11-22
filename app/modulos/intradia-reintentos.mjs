// Un ciclo: nunca recaptura una foto ya guardada. Las esperas no bloquean el proceso.
export async function recuperarCiclo({capturar,publicar,esperar,ahora=Date.now,pausa=()=>null,detenido=()=>false,avisar=async()=>{},maximo=5}){
 let foto=null,ultimo;
 for(let intento=1;intento<=maximo;intento++){
  if(detenido())throw Error('Lectura detenida a pedido; no reintento.');
  try{
   if(!foto)foto=await capturar();
   else {foto.publicacion=await publicar();delete foto.pendiente;}
   if(foto.pendiente)throw Error(foto.pendiente);
   return foto;
  }catch(e){
   ultimo=e;if(foto)e.fotoGuardada=true;
   const p=pausa();
   if(detenido()||intento===maximo||(p&&p.hasta===null)||(!foto&&!p&&!/HTTP 5\d\d|fetch failed|network|timeout|timed out|ECONN|ENOTFOUND|ETIMEDOUT|conexi|sin red|en curso/i.test(e.message)))throw e;
   const demora=Math.max(60000,p?.hasta? p.hasta-ahora():0);
   await avisar({intento,maximo,demora,error:e.message,guardada:Boolean(foto)});
   await esperar(demora);
  }
 }
 throw ultimo;
}
