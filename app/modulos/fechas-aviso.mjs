// Solo texto de Slack: nunca cambia archivos, claves, fechas de consulta ni registros.
const meses=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
export function fechasAviso(texto){
 if(typeof texto!=='string')return texto;
 return texto.split(/(```[\s\S]*?```|`[^`\n]*`|https?:\/\/\S+|(?:[\w.~/-]+\/)[\w./-]+)/g).map((parte,i)=>{
  if(i%2)return parte;
  return parte.replace(/\b(\d{4})-(\d{2})-(\d{2})(T(?=\d{2}:)|\b)/g,(original,y,m,d,t)=>{
   const n=Number(m),dia=Number(d),fecha=new Date(`${y}-${m}-${d}T00:00:00Z`);
   if(n<1||n>12||!dia||!Number.isFinite(fecha.getTime())||fecha.getUTCMonth()+1!==n||fecha.getUTCDate()!==dia)return original;
   return `${meses[n-1]} ${dia}${t?' ':''}`;
  });
 }).join('');
}
