// Derivado visual durante publicación. Nunca escribe ni reemplaza registros históricos.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXCLUIDOS } from './modulos/activos.mjs';
import { DIA, PISO_DIA } from './modulos/indicadores.mjs';
import { esVigente } from './modulos/vigencia.mjs';
export function detalleIguales(dirVelas, clase, ahora = Date.now()) {
 const dias = {}, corte = Math.floor(ahora / DIA) * DIA;
 const dir = path.join(dirVelas, clase);
 const cuenta = esVigente(dirVelas, clase);
 for (const a of fs.readdirSync(dir,{withFileTypes:true})) {
  if (!a.isDirectory() || (clase === 'cripto' && EXCLUIDOS.has(a.name)) || !cuenta(a.name)) continue;
  const carpeta = path.join(dir,a.name);
  for (const archivo of fs.readdirSync(carpeta)) {
   if (!/^\d{4}_.+$/.test(archivo) || archivo.slice(5) !== a.name) continue;
   const filas = JSON.parse(fs.readFileSync(path.join(carpeta,archivo),'utf8'));
   for (const f of filas) {
    const ts=Number(f[0]), apertura=Number(f[1]), cierre=Number(f[4]);
    if (!Number.isSafeInteger(ts) || ts % DIA || ts < PISO_DIA || ts >= corte || !Number.isFinite(apertura) || !Number.isFinite(cierre)) continue;
    const d=dias[ts]??=[0,0,0];
    if(cierre>=apertura)d[0]++;else d[1]++;
    if(cierre===apertura)d[2]++;
   }
  }
 }
 return dias;
}
export function generarDetalles(raiz) {
 const salida={};
 for(const clase of ['stock','cripto']){
  salida[clase]=detalleIguales(path.join(raiz,'registros/velas-24h'),clase);
  const pre=path.join(raiz,'registros/pre-calculado',clase,'iceberg-90d');
  if(fs.existsSync(pre))for(const n of fs.readdirSync(pre)){
   if(!n.endsWith('_iceberg'))continue;
   for(const [ts,sub,baj] of JSON.parse(fs.readFileSync(path.join(pre,n),'utf8'))){
    const d=salida[clase][ts];
    if(!d || d[0]!==sub || d[1]!==baj)throw Error(`Detalle no coincide con ${clase}/${n}/${ts}`);
   }
  }
 }
 fs.writeFileSync(path.join(raiz,'iceberg-colores.json'),JSON.stringify(salida)+'\n');
 return salida;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)generarDetalles(path.resolve(new URL('..',import.meta.url).pathname));
