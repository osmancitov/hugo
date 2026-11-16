// Serie mensual: solo velas diarias cerradas, sin cambiar dias ya registrados.
import fs from 'node:fs';
import path from 'node:path';
export const DIA=86400000;
export const cierreUTC=(t=Date.now())=>Math.floor(t/DIA)*DIA;
export const inicioMes=t=>{const d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);};
export const siguienteMes=t=>{const d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);};
export function validarSerie(datos,mes,hasta=cierreUTC()) {
 if(!Array.isArray(datos))throw Error('La respuesta no es una lista de velas; no equivale a un mes vacio.');
 let anterior=-1;
 for(const v of datos){
  if(!Array.isArray(v)||v.length!==12||!Number.isSafeInteger(v[0])||v[0]<mes||v[0]>=siguienteMes(mes)||v[0]%DIA!==0||v[0]<=anterior||v[6]!==v[0]+DIA-1||v[6]>=hasta)throw Error('Velas invalidas, abiertas, repetidas o fuera del mes UTC.');
  anterior=v[0];
 }
 return datos;
}
export function compararSeries(a,b,mes,hasta=cierreUTC()) {
 validarSerie(a,mes,hasta);validarSerie(b,mes,hasta);
 if(!a.length||!b.length)throw Error('Un archivo mensual vacio no es una serie registrada.');
 const n=Math.min(a.length,b.length);
 for(let i=0;i<n;i++)if(JSON.stringify(a[i])!==JSON.stringify(b[i]))throw Error('Conflicto: cambiaron velas ya registradas o el inicio de la serie.');
 return a.length===b.length?'igual':a.length<b.length?'ampliar':'conservar';
}
export function mesDeRuta(ruta) {
 const m=path.basename(ruta).match(/^(\d{2})(\d{2})_[A-Z0-9]{2,15}$/);
 if(!m||Number(m[2])<1||Number(m[2])>12)throw Error('Nombre de mes invalido.');
 return Date.UTC(2000+Number(m[1]),Number(m[2])-1,1);
}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
// Solo sustituye tras verificar de nuevo que el destino no cambio; sin puntos async entre comparar y publicar.
export function publicarSerie(destino,buf,anterior=null) {
 fs.mkdirSync(path.dirname(destino),{recursive:true});
 const tmp=destino+'.serie-tmp';const fd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,buf);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 try{
  if(anterior===null)fs.linkSync(tmp,destino);
  else {
   if(!fs.lstatSync(destino).isFile()||!fs.readFileSync(destino).equals(anterior))throw Error('El archivo cambio antes de publicar; se conserva para revisar.');
   fs.renameSync(tmp,destino);
  }
  syncDir(path.dirname(destino));
 }finally{fs.rmSync(tmp,{force:true});}
}
