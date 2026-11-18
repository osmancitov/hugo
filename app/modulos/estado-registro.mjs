// Consulta de solo lectura: fechas de las velas locales y publicacion en GitHub.
// La fecha de escritura local puede ser una descarga, no una consulta a Binance.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CLASES, CODIGO_OK, EXCLUIDOS } from './activos.mjs';
import { validarSerie, mesDeRuta } from './registro-serie.mjs';

const dia = t => new Date(t).toISOString().slice(0, 10);
export const fechaLocal = t => new Date(t - 4 * 3600000).toISOString().slice(0, 19).replace('T', ' ') + ' UTC-4';
async function entradas(dir) {
  try { return await fs.readdir(dir, { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
export async function leerCobertura(base) {
  const activos = [], errores = [];
  let archivos = 0, escritura = 0;
  for (const clase of CLASES) {
    for (const a of await entradas(path.join(base, clase))) {
      if (!a.isDirectory() || !CODIGO_OK.test(a.name) || (clase === 'cripto' && EXCLUIDOS.has(a.name))) continue;
      let ultimo = null, encontrados = 0;
      for (const f of await entradas(path.join(base, clase, a.name))) {
        if (!/^\d{4}_/u.test(f.name)) continue;
        encontrados++;
        const ruta = path.join(base, clase, a.name, f.name);
        try {
          if (!f.isFile() || f.name.slice(5) !== a.name) throw Error('archivo no normal o nombre distinto del activo');
          const mes = mesDeRuta(f.name), st = await fs.lstat(ruta);
          if (st.size === 0 || st.size > 5 * 1024 * 1024) throw Error('tamano no valido');
          const datos = validarSerie(JSON.parse(await fs.readFile(ruta, 'utf8')), mes);
          if (!datos.length) throw Error('serie vacia');
          archivos++;
          escritura = Math.max(escritura, st.mtimeMs);
          ultimo = Math.max(ultimo ?? 0, datos.at(-1)[0]);
        } catch { errores.push(`${clase}/${a.name}/${f.name}`); }
      }
      const registro = { clase, codigo: a.name, ultimo };
      if (!encontrados) errores.push(`${clase}/${a.name}: sin archivos mensuales`);
      if (ultimo !== null) activos.push(registro);
    }
  }
  return { activos, errores, archivos, escritura };
}
export async function ultimaPublicacion(repo, fetchImpl = fetch) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw Error('repositorio no configurado');
  const url = new URL(`https://api.github.com/repos/${repo}/commits`);
  url.searchParams.set('sha', 'main');
  url.searchParams.set('path', 'registros/velas-24h');
  url.searchParams.set('per_page', '1');
  const r = await fetchImpl(url.href, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'hugo', Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw Error(`GitHub HTTP ${r.status}`);
  const lista = await r.json();
  if (!Array.isArray(lista)) throw Error('respuesta no valida');
  if (!lista.length) return null;
  const c = lista[0], fecha = Date.parse(c.commit?.committer?.date);
  if (!Number.isFinite(fecha) || !/^[a-f0-9]{40}$/.test(c.sha) || typeof c.html_url !== 'string' || !c.html_url.startsWith(`https://github.com/${repo}/commit/`)) throw Error('commit no valido');
  return { fecha, sha: c.sha, url: c.html_url };
}
function coberturaTexto(c) {
  const lineas = ['*Estado del registro local*', `${c.activos.length} activos con datos: ${CLASES.map(clase => `${c.activos.filter(a => a.clase === clase).length} ${clase}`).join(', ')}. ${c.archivos} archivos mensuales validos.`];
  const grupos = new Map();
  for (const a of c.activos) {
    const d = dia(a.ultimo);
    if (!grupos.has(d)) grupos.set(d, []);
    grupos.get(d).push(`${a.clase}/${a.codigo}`);
  }
  for (const [d, lista] of [...grupos].sort((a,b) => b[0].localeCompare(a[0])).slice(0, 8)) {
    lineas.push(`Ultima vela: ${d} UTC - ${lista.length} activo(s)${grupos.size > 1 ? ` (${lista.slice(0,4).join(', ')}${lista.length > 4 ? ', ...' : ''})` : ''}.`);
  }
  if (grupos.size > 8) lineas.push(`Hay ${grupos.size - 8} fechas de cobertura adicionales mas antiguas.`);
  if (!c.activos.length) lineas.push('No encontre velas validas de activos en la carpeta local.');
  if (c.errores.length) lineas.push(`Atencion: ${c.errores.length} archivo(s) o carpeta(s) no verificables; cobertura incompleta. Revisar: ${c.errores.slice(0,3).join(', ')}${c.errores.length > 3 ? ', ...' : ''}.`);
  if (c.escritura) lineas.push(`Ultima escritura local: ${fechaLocal(c.escritura)} (puede ser una descarga por sincronizacion).`);
  lineas.push('La ultima vela indica el dia mas reciente guardado por activo; no certifica que no falten dias anteriores.');
  return lineas;
}
export function registrar(ctx) {
  ctx.comando(/^\s*estado\s+(?:del\s+)?registro\s*[.!?]*\s*$/i, async event => {
    const base = process.env.HUGO_VELAS_DIR || ctx.conf.HUGO_VELAS_DIR || path.join(os.homedir(), 'Documents', 'hugo', 'registros', 'velas-24h');
    const lineas = [];
    try { lineas.push(...coberturaTexto(await leerCobertura(base))); }
    catch { lineas.push('No pude comprobar la cobertura local. No la doy por actualizada.'); }
    try {
      const avance = process.env.HUGO_REGISTRO_ESTADO || ctx.conf.HUGO_REGISTRO_ESTADO || path.join(os.homedir(), '.local', 'share', 'hugo-registro', 'estado.json');
      const archivo = path.join(path.dirname(avance), 'universo.json');
      try {
        const u = JSON.parse(await fs.readFile(archivo, 'utf8'));
        if(u.version !== 1 || !u.clases) throw Error('formato');
        for (const [clase,c] of Object.entries(u.clases)) {
          if(!CLASES.includes(clase) || !Array.isArray(c.retirados) || c.retirados.some(x=>!CODIGO_OK.test(x)) || !Number.isFinite(c.comprobado)) throw Error('formato');
          const retirados=c.retirados.filter(x=>!(clase==='cripto' && EXCLUIDOS.has(x)));
          lineas.push(`Catalogo ${clase} cotejado: ${fechaLocal(c.comprobado)}. Retirados sin actualizar: ${retirados.length}${retirados.length ? ` (${retirados.join(', ')})` : ''}.`);
        }
      } catch(e) { if(e.code!=='ENOENT') throw e; lineas.push('Todavia no hay un cotejo completo del universo guardado.'); }
    } catch { lineas.push('No pude verificar el catalogo de activos retirados.'); }
    try {
      const c = await ultimaPublicacion(process.env.HUGO_GITHUB || ctx.conf.HUGO_GITHUB || '');
      lineas.push(c ? `Ultima actualizacion publicada de registros en GitHub: ${fechaLocal(c.fecha)}. <${c.url}|Commit ${c.sha.slice(0,7)}>` : 'GitHub no tiene publicaciones de registros en main.');
    } catch { lineas.push('No pude verificar la ultima publicacion de registros en GitHub.'); }
    lineas.push('Publicacion, escritura local y consulta al mercado son cosas distintas. La hora de la ultima consulta a Binance no se guarda; sincronizar no consulta el mercado. Esta orden no actualiza datos.');
    await ctx.app.client.chat.postMessage({ token: ctx.botToken, channel: event.channel, thread_ts: event.thread_ts || event.ts, text: lineas.join('\n') });
  }, { nombre: 'consultar el estado del registro' });
}
export const _prueba = { coberturaTexto };
