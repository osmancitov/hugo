// Saldo realizado: se reconoce cada movimiento al cierre registrado.
export function ventanasCerradas(records){
 const ordered=records.map((r,i)=>({...r,position:i})).sort((a,b)=>a.date.localeCompare(b.date)||b.position-a.position);
 const end=ordered.at(-1).date;
 const at=iso=>ordered.filter(r=>r.date<=iso).reduce((sum,r)=>sum+Math.round(r.change*100),0)/100;
 const date=new Date(end+'T12:00:00Z');
 const cutoff=(unit,n)=>{const d=new Date(date);if(unit==='month'){const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}else d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10)};
 const current=at(end);
 return [['Día','day',1],['Semana','day',7],['Mes','month',1]].map(([label,unit,n])=>{
  const start=cutoff(unit,n),base=at(start);
  return {label,start,end,base,current,percent:base?Math.round((current/base-1)*100):null,approximate:ordered.some(r=>r.date>start&&r.date<=end&&r.approximate)};
 });
}
export const fechaBreve=iso=>{const [,m,d]=iso.split('-').map(Number);return `${d} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m-1]}`};
