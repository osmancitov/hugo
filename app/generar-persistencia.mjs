// Derivado de publicación, sin escribir ni reordenar registros históricos.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepararPersistenciaGlobal } from './modulos/persistencia.mjs';
import { validarMes, DIA, corteUTC } from './modulos/visor-rachas-datos.mjs';
export function generarPersistencia(raiz, ahora = Date.now()) {
  const corte = corteUTC(ahora), fin = corte - DIA, inicio = Math.max(Date.UTC(2026,7,1),fin-89*DIA);
  const entradas=[];
  for(const clase of ['stock','cripto']) {
    const catalogo=JSON.parse(fs.readFileSync(path.join(raiz,'registros/catalogo',clase),'utf8'));
    for(const activo of catalogo.activos) {
      const filas=[];
      for(const mes of activo.meses) {
        const desde=Date.UTC(2000+Number(mes.slice(0,2)),Number(mes.slice(2))-1,1);
        const hasta=Date.UTC(2000+Number(mes.slice(0,2)),Number(mes.slice(2)),1);
        if(hasta<=inicio || desde>fin)continue;
        const archivo=path.join(raiz,'registros/velas-24h',clase,activo.codigo,mes+'_'+activo.codigo);
        const datos=JSON.parse(fs.readFileSync(archivo,'utf8'));
        // Si existe vela del día en curso, no se usa para la clasificación cerrada.
        filas.push(...validarMes(datos.filter(f=>f[0]<corte),mes,corte));
      }
      entradas.push({activo:{...activo,clase},filas});
    }
  }
  const listas=prepararPersistenciaGlobal(entradas,{inicio,fin});
  const salida={corte:fin,ventana:{inicio,fin,cantidad:90,unidad:'d'},activos:listas.global.map(({id,sumaPuestos,carreras,promedio})=>({id,sumaPuestos,carreras,promedio}))};
  fs.writeFileSync(path.join(raiz,'persistencia-90d.json'),JSON.stringify(salida)+'\n');
  return salida;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)generarPersistencia(path.resolve(new URL('..',import.meta.url).pathname));
