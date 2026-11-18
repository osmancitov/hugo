import fs from 'node:fs/promises';
import path from 'node:path';
import { CODIGO_OK, FIAT } from './activos.mjs';
import { listarUniverso } from './universo-binance.mjs';
export async function prepararUniverso({clase,base,archivo,fetchImpl=fetch}) {
  let previo = null;
  try {
    previo = JSON.parse(await fs.readFile(archivo,'utf8'));
    if (previo.version !== 1 || typeof previo.clases !== 'object') throw Error('formato');
    for (const c of Object.values(previo.clases)) if (!Array.isArray(c.activos) || !Array.isArray(c.retirados) || [...c.activos,...c.retirados].some(x => !CODIGO_OK.test(x))) throw Error('formato');
  } catch (e) { if(e.code !== 'ENOENT') throw Error('No puedo leer el catalogo guardado; lo conservo sin sustituir.'); }
  let carpetas = [];
  try { carpetas = (await fs.readdir(path.join(base,clase),{withFileTypes:true})).filter(e=>e.isDirectory()&&CODIGO_OK.test(e.name)&&!FIAT.has(e.name)).map(e=>e.name); }
  catch(e){if(e.code!=='ENOENT')throw e;}
  const conocidos = new Set([...(previo?.clases[clase]?.activos || []),...(previo?.clases[clase]?.retirados || []),...carpetas].filter(c=>!FIAT.has(c)));
  const u = await listarUniverso({fetchImpl}), actuales = u.activos[clase];
  if (!actuales.length) throw Error('El universo de esa clase esta vacio; no sustituyo el catalogo ni interpreto bajas.');
  if (actuales.length > 500) throw Error('El universo supera los 500 activos por lote; no lo recorto ni registro una lista parcial.');
  const actualesSet = new Set(actuales), retirados = [...conocidos].filter(c=>!actualesSet.has(c));
  // Un simbolo ausente de una respuesta completa puede ser una lista parcial.
  // Confirmar ausencia individual: un par aun TRADING invalida el cotejo entero.
  for (const c of retirados) {
    const simbolo = `${c}${clase==='stock'?'B':''}USDT`;
    const observado = u.vistos.get(simbolo);
    if (observado?.status === 'TRADING') throw Error('Un activo previo sigue TRADING pero cambio su clasificacion; requiere revision, no interpreto baja.');
    if (!u.vistos.has(simbolo)) {
      let j;
      try { j = await u.pedir(`https://api.binance.com/api/v3/exchangeInfo?symbol=${encodeURIComponent(simbolo)}`, true); }
      catch { throw Error('No pude confirmar un par ausente; no interpreto bajas.'); }
      if (j?.code !== -1121) throw Error('Lista posiblemente parcial: par ausente no confirmado; no interpreto bajas.');
    }
  }
  const activosPrevios = previo?.clases[clase]?.activos || carpetas;
  const bajas = activosPrevios.filter(c=>!FIAT.has(c)&&!actualesSet.has(c));
  if (activosPrevios.length>=10 && bajas.length>Math.max(3,Math.floor(activosPrevios.length*0.2))) throw Error('Baja masiva inesperada (mas del 20%); requiere revision, no sustituyo el catalogo.');
  const altas = actuales.filter(c=>!conocidos.has(c));
  const reactivados = actuales.filter(c=>(previo?.clases[clase]?.retirados || []).includes(c));
  const lista = xs => xs.length ? xs.join(', ') : 'ninguna';
  const texto = `Cotejo de ${clase} con Binance: ${actuales.length} activos elegibles.\nAltas: ${altas.length} (${lista(altas)}). Se incorporan a este lote.\nBajas nuevas: ${bajas.length} (${lista(bajas)}). Conservo sus historiales, no los actualizo.\nReactivados: ${reactivados.length} (${lista(reactivados)}).\nLos codigos excluidos permanecen fuera. Esta orden actualiza todo el universo de ${clase}; no opera activos.`;
  const siguiente = {version:1,clases:{...(previo?.clases||{}),[clase]:{comprobado:Date.now(),activos:actuales,retirados}}};
  return {codigos:actuales,texto,guardar:async()=>{
    await fs.mkdir(path.dirname(archivo),{recursive:true});
    const tmp=archivo+'.tmp';await fs.writeFile(tmp,JSON.stringify(siguiente),{mode:0o600});await fs.rename(tmp,archivo);
  }};
}
