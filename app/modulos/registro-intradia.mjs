// Registro intradiario: conserva lecturas reales, sin reconstruir precios anteriores.
// Reutiliza la toma de barra y el transporte de sincronizar-registros. Sin frecuencia por defecto.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { guardarEstado } from './registro-motor.mjs';
import { generarBarra, leerBarra, escribirBarra, RUTA_BARRA } from './barra-movil.mjs';
import { fetchConPausa, pausaFuente } from './intradia-fuente.mjs';
import { diaUTC, rutaDia, RUTA_INDICE, esRutaIntradia, leerDia, leerIndice, unirDias, unirIndices } from './intradia-datos.mjs';

const archivoLocal = (raiz, rel) => path.join(raiz, rel.slice('registros/'.length));
const colaLocal = (raiz) => path.join(raiz, '..', '.estado-intradia', 'pendientes.json');
const validar = (texto) => {
  const b = leerBarra(texto);
  if (!Number.isFinite(b.generada) || !b.activos.size || !b.dia) throw Error('La lectura no trae instante, activos y referencia diaria.');
  return b;
};
function leerOpcional(ruta) {
  try { return fs.readFileSync(ruta, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export function pendientesIntradia(raiz) {
  const texto = leerOpcional(colaLocal(raiz));
  if (texto === null) return {};
  const j = JSON.parse(texto);
  if (j.version !== 1 || !j.archivos || typeof j.archivos !== 'object' || Array.isArray(j.archivos)) throw Error('Cola intradiaria ilegible; la conservo.');
  for (const [rel, texto] of Object.entries(j.archivos)) {
    if ((!esRutaIntradia(rel) && rel !== RUTA_BARRA) || typeof texto !== 'string') throw Error('Ruta ajena en la cola intradiaria.');
    validarArchivoIntradia(rel, texto);
  }
  return j.archivos;
}
// Primero se guarda la intención completa con fsync. Si hay corte, se repite la escritura
// exacta desde esta cola, sin volver a consultar Binance ni perder la lectura.
function materializar(raiz, archivos) {
  for (const [rel, texto] of Object.entries(archivos)) {
    const destino = archivoLocal(raiz, rel);
    if (rel === RUTA_BARRA) escribirBarra(raiz, texto);
    else guardarEstado(destino, JSON.parse(texto));
  }
}
function encolar(raiz, archivos) {
  guardarEstado(colaLocal(raiz), { version: 1, archivos });
  materializar(raiz, archivos);
}
export function recuperarIntradia(raiz) {
  const archivos = pendientesIntradia(raiz);
  materializar(raiz, archivos);
  return archivos;
}
export function validarArchivoIntradia(rel, texto) {
  if (rel === RUTA_BARRA) return validar(texto);
  if (rel === RUTA_INDICE) return leerIndice(texto);
  if (!esRutaIntradia(rel)) throw Error('No publico una ruta ajena al registro intradiario.');
  const j = leerDia(texto, validar);
  if (rutaDia(j.dia) !== rel || !j.lecturas.length) throw Error('El día no coincide con su archivo o está vacío.');
  return j;
}
export function combinarArchivoIntradia(rel, local, remoto) {
  validarArchivoIntradia(rel, local);
  if (remoto === null) return local;
  validarArchivoIntradia(rel, remoto);
  if (rel === RUTA_INDICE) return unirIndices(local, remoto);
  if (rel === RUTA_BARRA) {
    const a = validar(local), b = validar(remoto);
    if (a.generada === b.generada && local !== remoto) throw Error('Conflicto en la instantánea de la misma lectura.');
    return a.generada >= b.generada ? local : remoto;
  }
  return unirDias(local, remoto, validar);
}
export function guardarLectura(raiz, texto) {
  const b = validar(texto), generada = new Date(b.generada).toISOString(), dia = diaUTC(b.generada), rel = rutaDia(dia);
  const pendientes = recuperarIntradia(raiz);
  const previo = leerOpcional(archivoLocal(raiz, rel));
  const uno = JSON.stringify({ version: 1, dia, lecturas: [{ generada, texto }] }) + '\n';
  const registro = previo === null ? uno : unirDias(uno, previo, validar);
  const indicePrevio = leerOpcional(archivoLocal(raiz, RUTA_INDICE));
  const indice = JSON.stringify({ version: 1, dias: [dia], ultima: generada }) + '\n';
  const actual = leerOpcional(archivoLocal(raiz, RUTA_BARRA));
  const archivos = { ...pendientes, [rel]: registro,
    [RUTA_INDICE]: indicePrevio === null ? indice : unirIndices(indice, indicePrevio),
    [RUTA_BARRA]: combinarArchivoIntradia(RUTA_BARRA, texto, actual) };
  encolar(raiz, archivos);
  return { rel, lecturas: leerDia(registro, validar).lecturas.length, rutas: Object.keys(archivos) };
}
// Confirma solo la versión enviada. Si entró otra lectura, su cola sigue pendiente.
export function confirmarIntradia(raiz, enviados, publicados = enviados) {
  const actuales = pendientesIntradia(raiz);
  for (const [rel, texto] of Object.entries(enviados)) {
    if (actuales[rel] === texto) {
      const combinado = combinarArchivoIntradia(rel, texto, publicados[rel] ?? null);
      materializar(raiz, { [rel]: combinado });
      delete actuales[rel];
    }
  }
  guardarEstado(colaLocal(raiz), { version: 1, archivos: actuales });
}
export function intervaloIntradia(valor) {
  if (valor === undefined || valor === null || valor === '' || valor === '0') return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 5 || n > 1440) throw Error('HUGO_INTRADIA_MINUTOS debe ser un entero de 5 a 1440; sin valor queda apagado.');
  return n;
}
// Hitos del reloj UTC: para 5 minutos, 00, 05, 10... de cada hora.
// Siempre futuro: arranque/reinicio o ciclo lento no reconstruyen hitos perdidos.
export function siguienteHitoUTC(ahora, minutos) {
  if (!Number.isFinite(ahora) || !Number.isInteger(minutos) || minutos < 5 || minutos > 1440) throw Error('Reloj intradiario inválido.');
  const d = new Date(ahora), medianoche = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const paso = minutos * 60000;
  return Math.min(medianoche + 86400000, medianoche + (Math.floor((ahora - medianoche) / paso) + 1) * paso);
}
export function registrar(ctx) {
  const dirVelas = () => process.env.HUGO_VELAS_DIR || ctx.conf.HUGO_VELAS_DIR || path.join(os.homedir(), 'Documents', 'hugo', 'registros', 'velas-24h');
  const raiz = () => path.dirname(dirVelas());
  const ahora = ctx.ahora || Date.now;
  let ocupado = false, ultima = null, error = null, proxima = null;
  let minutos = null;
  try { minutos = intervaloIntradia(process.env.HUGO_INTRADIA_MINUTOS ?? ctx.conf.HUGO_INTRADIA_MINUTOS); }
  catch (e) { error = e.message; console.error(error); }
  const publicar = async () => {
    const archivos = recuperarIntradia(raiz());
    if (!Object.keys(archivos).length) return { commit: null, subidos: [] };
    if (!ctx.publicarIntradia) throw Error('El transporte incremental no está cargado; el registro queda pendiente.');
    const r = await ctx.publicarIntradia(archivos);
    confirmarIntradia(raiz(), archivos, r.archivos);
    return r;
  };
  const tomar = async (opciones = {}) => {
    if (ocupado || ctx.sincronizacionEnCurso?.()) throw Error('Hay una lectura o sincronización en curso; no inicio otra.');
    ocupado = true;
    ctx.activas?.set('intradia', { que: 'lectura y publicación intradiaria', desde: ahora(), largo: true });
    const parada = ctx.parada?.n;
    try {
      recuperarIntradia(raiz());
      // La única instantánea heredada se conserva tal como existe. Su comparada_con no
      // permite reconstruir otra foto; no se rellena el pasado.
      const heredada = leerOpcional(archivoLocal(raiz(), RUTA_BARRA));
      if (heredada !== null) guardarLectura(raiz(), heredada);
      const r = await generarBarra({ dirVelas: dirVelas(), host: process.env.HUGO_BARRA_HOST || ctx.conf.HUGO_BARRA_HOST,
        ...opciones, fetchImpl: fetchConPausa(raiz(), opciones.fetchImpl || fetch, ahora), guardarInstantanea: false, ahora: opciones.ahora ?? ahora() });
      if (ctx.parada?.n !== parada) throw Error('Lectura detenida a pedido; no guardé la consulta nueva.');
      r.registro = guardarLectura(raiz(), r.texto);
      ultima = r.generada;
      if (opciones.publicar !== false) {
        try { r.publicacion = await publicar(); error = null; }
        catch (e) { error = e.message; r.pendiente = e.message; }
      }
      return r;
    } finally { ocupado = false; ctx.activas?.delete('intradia'); }
  };
  ctx.tomarBarra = tomar; // La orden barra y el reloj pasan por el mismo registro.
  ctx.intradiaInfo = () => {
    let guardada = ultima, pendientes = null, problema = error, pausa = null;
    try {
      const indice = leerOpcional(archivoLocal(raiz(), RUTA_INDICE));
      if (indice !== null) guardada = Date.parse(leerIndice(indice).ultima);
      pendientes = Object.keys(pendientesIntradia(raiz())).length;
      pausa = pausaFuente(raiz());
    } catch (e) { problema = e.message; }
    return { minutos, proxima, ultima: guardada, pendientes, error: problema, ocupado, retencion: null, pausa };
  };
  ctx.reintentarIntradia = async () => {
    if (ocupado) throw Error('Hay una lectura intradiaria en curso.');
    ocupado = true;
    try { const r = await publicar(); error = null; return r; }
    finally { ocupado = false; }
  };
  const decir = (e, text) => ctx.app.client.chat.postMessage({ token: ctx.botToken, channel: e.channel, thread_ts: e.thread_ts || e.ts, text });
  ctx.comando(/^\s*intradia\s+estado\s*[.!?]*\s*$/i, (e) => {
    const info = ctx.intradiaInfo();
    const lineas = [`Lectura intradiaria automática: ${minutos === null ? 'apagada (sin frecuencia elegida)' : `cada ${minutos} minutos`}.`];
    if (info.proxima !== null) lineas.push(`Próximo inicio programado: ${new Date(info.proxima).toISOString().slice(0, 19).replace('T', ' ')} UTC (publicación posterior).`);
    if (info.ultima !== null) lineas.push(`Última guardada: ${new Date(info.ultima).toISOString().slice(0, 19).replace('T', ' ')} UTC.`);
    if (info.pendientes !== null) lineas.push(`Archivos pendientes de publicar: ${info.pendientes}.`);
    if (info.pausa && (info.pausa.hasta === null || info.pausa.hasta > ahora())) lineas.push(info.pausa.hasta === null ? `Fuente pausada por HTTP ${info.pausa.status}, sin plazo válido; requiere revisión.` : `Fuente pausada hasta ${new Date(info.pausa.hasta).toISOString()} por HTTP ${info.pausa.status}.`);
    if (info.error) lineas.push(`Problema: ${info.error}`);
    lineas.push('Sin borrado automático de registros.');
    return decir(e, lineas.join('\n'));
  }, { nombre: 'intradia estado' });
  ctx.comando(/^\s*intradia\s+publica\s*[.!?]*\s*$/i, async (e) => {
    try { const r = await ctx.reintentarIntradia(); await decir(e, r.commit ? `Registro intradiario publicado: commit ${r.commit.slice(0, 7)}.` : 'Registro intradiario ya publicado, sin cambios.'); }
    catch (x) { await decir(e, `Registro conservado, sin confirmar publicación: ${x.message}`); }
  }, { nombre: 'intradia publica' });
  // Ningún valor predeterminado activa consultas. Configurar una frecuencia requiere la
  // decisión del dueño y la instalación aprobada. Nunca se borran registros por antigüedad.
  let reporteAutomatico = null;
  const informarAutomatico = async (texto) => {
    if (!ctx.canal || !ctx.reporte?.crear) return;
    try {
      if (!reporteAutomatico) reporteAutomatico = await ctx.reporte.crear({ canal: ctx.canal, inicio: texto });
      else await reporteAutomatico.final(texto);
    } catch (e) { reporteAutomatico = null; console.error('Reporte intradiario:', e.message); }
  };
  ctx.alIniciar(async () => {
    if (minutos === null) return;
    // Recupera y publica fotos anteriores aunque Binance siga sin responder. No toma precios.
    try {
      if (Object.keys(pendientesIntradia(raiz())).length) {
        const r = await ctx.reintentarIntradia();
        await informarAutomatico(r.commit ? `Cola intradiaria recuperada y publicada: ${r.commit.slice(0, 7)}.` : 'Cola intradiaria recuperada y confirmada, sin cambios nuevos.');
      }
    } catch (e) { error = e.message; await informarAutomatico(`Cola intradiaria conservada al arrancar: ${e.message}`); }
    const programar = () => {
      proxima = siguienteHitoUTC(ahora(), minutos);
      const objetivo = proxima;
      const t = setTimeout(async () => {
        // Si el reloj retrocedió, esperar al hito; si se perdió un intervalo entero,
        // saltarlo. No se toman fotos atrasadas ni se lanzan ciclos para recuperar.
        if (ahora() < objetivo || ahora() >= siguienteHitoUTC(objetivo, minutos)) { programar(); return; }
        try {
          const lectura = tomar(); // Inicia la consulta sin esperar el reporte de Slack.
          const reporte = informarAutomatico('Lectura intradiaria automática en curso. Registro y publicación se comprueban por separado.');
          const r = await lectura;
          await reporte;
          const instante = new Date(r.generada).toISOString().slice(0, 19).replace('T', ' ');
          await informarAutomatico(`Lectura intradiaria guardada: ${instante} UTC.\n${r.pendiente ? `Pendiente de publicar: ${r.pendiente}. La cola se conserva.` : r.publicacion?.commit ? `Publicada en el commit ${r.publicacion.commit.slice(0, 7)}.` : 'Publicación confirmada, sin cambios nuevos.'}`);
        } catch (e) {
          error = e.message; console.error('Lectura intradiaria:', e.message);
          let recuperacion = '';
          // La publicación pendiente no depende del éxito de una consulta nueva.
          try {
            const r = await ctx.reintentarIntradia();
            recuperacion = r.commit ? ` Cola anterior publicada: ${r.commit.slice(0, 7)}.` : '';
          } catch (x) { recuperacion = ` Cola pendiente: ${x.message}.`; }
          error = e.message;
          await informarAutomatico(`No completé la lectura intradiaria: ${e.message}. Los registros anteriores se conservan; reintento en el próximo intervalo.${recuperacion}`);
        } finally { await programar(); }
      }, Math.max(1, objetivo - ahora()));
      t.unref?.();
    };
    programar();
  });
}
