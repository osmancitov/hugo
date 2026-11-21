// Antes de tomar el día nuevo: referencias diarias cerradas y disponibles, no una demora supuesta.
import fs from 'node:fs';
import path from 'node:path';
import { universoBarra, simboloStock, cierreVelaDiaAnterior } from './barra-movil.mjs';
import { DIA, inicioMes, validarSerie, compararSeries, publicarSerie } from './registro-serie.mjs';

export async function asegurarCierreDiario({ dirVelas, host = 'https://api.binance.com', fetchImpl = fetch, ahora = Date.now,
  esperar = ms => new Promise(r => setTimeout(r, ms)), comprobar = () => {}, informar = async () => {} } = {}) {
  const dia = Math.floor(ahora() / DIA) * DIA, ref = dia - DIA, mes = inicioMes(ref);
  const universo = universoBarra(dirVelas);
  if (!universo.length) throw Error('No hay stocks para comprobar el cierre diario.');
  const faltantes = () => universo.filter(c => cierreVelaDiaAnterior(dirVelas, c, ref) === null);
  let pendientes = faltantes(), rondas = 0;
  if (!pendientes.length) return { ref, rondas, activos: universo.length };
  const base = new URL(host);
  if (base.protocol !== 'https:') throw Error('La fuente de cierre diario debe usar HTTPS.');
  const json = async url => {
    comprobar();
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'hugo' } });
    if (!r.ok) throw Error(`No pude comprobar cierre diario: Binance HTTP ${r.status}.`);
    return r.json();
  };
  while (pendientes.length) {
    comprobar();
    if (Math.floor(ahora() / DIA) * DIA !== dia) throw Error('Cambió el día mientras esperaba el cierre; no tomo una foto atrasada.');
    rondas++;
    // No se confía en el reloj local para declarar que la vela de Binance ya cerró.
    const reloj = await json(new URL('/api/v3/time', base));
    if (!Number.isSafeInteger(reloj.serverTime)) throw Error('Hora de Binance ilegible; no supongo cierre.');
    if (reloj.serverTime >= dia) for (const codigo of pendientes) {
      comprobar();
      const url = new URL('/api/v3/klines', base);
      url.search = new URLSearchParams({ symbol: simboloStock(codigo), interval: '1d', startTime: String(mes), endTime: String(dia - 1), limit: '1000' });
      const datos = await json(url);
      validarSerie(datos, mes, Math.min(dia, reloj.serverTime));
      if (!datos.some(v => v[0] === ref && v[6] === dia - 1 && Number(v[4]) > 0)) continue;
      const f = new Date(ref), aamm = `${String(f.getUTCFullYear() % 100).padStart(2,'0')}${String(f.getUTCMonth()+1).padStart(2,'0')}`;
      const archivo = path.join(dirVelas, 'stock', codigo, `${aamm}_${codigo}`);
      let anterior = null;
      try { anterior = fs.readFileSync(archivo); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const modo = anterior === null ? 'nuevo' : compararSeries(JSON.parse(anterior), datos, mes, dia);
      comprobar();
      if (modo === 'nuevo' || modo === 'ampliar') publicarSerie(archivo, Buffer.from(JSON.stringify(datos) + '\n'), anterior);
    }
    pendientes = faltantes();
    if (pendientes.length) {
      await informar(`Esperando cierre diario: faltan ${pendientes.length} de ${universo.length}. Compruebo de nuevo en 1 min; aún no tomé la foto.`);
      await esperar(60000);
    }
  }
  return { ref, rondas, activos: universo.length };
}
