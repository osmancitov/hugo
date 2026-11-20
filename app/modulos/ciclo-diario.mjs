// Puesta al día diaria (decisión del usuario, 20-nov-2026): una vez al día, minutos después del
// cierre UTC, Hugo pone los registros al día y después publica (la pasada regenera indicadores,
// pre-cálculos y catálogo, y sube un solo commit). No es la repetición periódica retirada el
// 19-nov: es UNA corrida diaria con su ingesta.
// Resistente a cortes (luz, apagado): si la máquina estaba apagada a la hora del cierre, la
// corrida se hace al arrancar; si el ciclo quedó a medias, el registro retoma su avance guardado
// (solo los trabajos con origen 'diaria') y la pasada re-compara desde cero sin pisar nada. La
// marca de la última corrida completa vive fuera de las rutas sincronizadas.
// Reporte para depurar: un hilo por corrida con la ingesta, la publicación y el cierre; cada
// fallo dice la causa y qué lo reintenta (próxima corrida o próximo arranque).
import fs from 'node:fs';
import path from 'node:path';
import { guardarEstado, leerEstado } from './registro-motor.mjs';

const DIA = 86400000;
const MARGEN = 5 * 60 * 1000; // la vela diaria cierra a las 00:00 UTC; margen para que la fuente la tenga lista
// Duración medida de la corrida (pedido del usuario, 20-nov-2026: que el reporte diga cuánto gastó).
const dur = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
};
const TOPE_ESPERA_REGISTRO = 6 * 3600 * 1000; // otro registro en curso: se espera, no se interrumpe

// Último día UTC cerrado con margen (su inicio). Antes del margen, el último cerrado es el anterior.
export const ultimoCerrado = (ahora) => Math.floor((ahora - MARGEN) / DIA) * DIA - DIA;
// Próxima corrida programada: el primer «cierre + margen» estrictamente futuro.
export const proximaCorrida = (ahora) => { let t = Math.floor(ahora / DIA) * DIA + MARGEN; if (t <= ahora) t += DIA; return t; };

export function registrar(ctx) {
  const ahora = ctx.ahora || Date.now;
  const esperar = ctx.esperar || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const archivoMarca = () => path.join(path.dirname(ctx.registroArchivoEstado()), 'ciclo-diario.json');
  const leerMarca = () => {
    try {
      const j = JSON.parse(fs.readFileSync(archivoMarca(), 'utf8'));
      return Number.isInteger(j.ultimo) && j.ultimo % DIA === 0 ? j.ultimo : 0;
    } catch { return 0; }
  };
  let enCurso = false;
  async function ciclo(origen) {
    if (enCurso) return;
    const objetivo = ultimoCerrado(ahora());
    if (leerMarca() >= objetivo) return; // ya cubierto: nada que hacer
    enCurso = true;
    const t0 = ahora();
    const fecha = new Date(objetivo).toISOString().slice(0, 10);
    let hilo = null;
    const avisar = async (texto) => {
      await ctx.app.client.chat.postMessage({ token: ctx.botToken, channel: ctx.canal, thread_ts: hilo, text: texto });
    };
    try {
      if (!ctx.canal) { console.error('Ciclo diario: no hay canal de avisos configurado; no corro.'); return; }
      hilo = await ctx.reporte.hilo({ canal: ctx.canal, texto: `Puesta al día diaria (${origen}): registros hasta el ${fecha} y publicación; reporto en este hilo.` });
      // 1) Ingesta: la misma vía de «pon al día». Si la propia corrida quedó interrumpida, se
      // retoma; si otro registro corre, se espera sin tocarlo.
      await ctx.ponerAlDiaDiaria({ channel: ctx.canal, thread_ts: hilo });
      const tope = ahora() + TOPE_ESPERA_REGISTRO;
      while (ctx.registroOcupado()) {
        if (ahora() > tope) { await avisar(`El registro sigue en curso; la publicación queda para la próxima corrida.\nDuración: ${dur(ahora() - t0)}.`); return; }
        await esperar(30000);
      }
      const est = leerEstado(ctx.registroArchivoEstado());
      const cubierto = est && est.estado === 'terminado' && est.hasta > objetivo;
      if (!cubierto) {
        await avisar((!est
          ? 'No pude iniciar la puesta al día; reintento en la próxima corrida o al arrancar.'
          : est.estado !== 'terminado'
            ? `El registro quedó ${est.estado}${est.error ? `: ${est.error}` : ''}. Lo retomo en la próxima corrida o al arrancar; también sirve «registra continuar».`
            : `El registro terminó pero llega solo al ${new Date(est.hasta - DIA).toISOString().slice(0, 10)} y falta hasta el ${fecha} (parcial). Lo retomo en la próxima corrida o al arrancar.`)
          + `\nDuración: ${dur(ahora() - t0)}.`);
        return; // sin marca: se reintenta
      }
      // 2) Publicación: la pasada con el guardia compartido; si la automática de arranque corre, espera.
      let reporte = null;
      try { reporte = await ctx.reporte.crearSync({ canal: ctx.canal, hilo, inicio: 'Publicación diaria en curso.' }); }
      catch (e) { console.error('Reporte del ciclo diario:', e.message); }
      let r;
      for (;;) {
        r = await ctx.correrPasada(reporte ? reporte.progreso : undefined);
        if (!r.error || !/en curso/.test(r.error)) break;
        await esperar(20000);
      }
      const texto = `Publicación diaria. ${r.error || r.texto}\nDuración: ${dur(ahora() - t0)}.`;
      if (reporte) await reporte.final(texto); else await avisar(texto);
      if (r.error) return; // sin marca: la próxima corrida o el arranque retoman
      guardarEstado(archivoMarca(), { ultimo: objetivo, cuando: new Date(ahora()).toISOString() });
    } catch (e) {
      console.error('Ciclo diario:', e.message);
      try { await avisar(`No pude completar la puesta al día diaria: ${e.message}. Lo hecho se conserva; lo retomo en la próxima corrida o al arrancar.`); }
      catch (e2) { console.error('Aviso del ciclo diario:', e2.message); }
    } finally { enCurso = false; }
  }
  ctx.cicloDiario = ciclo; // para pruebas
  ctx.alIniciar(() => {
    // Programada: una vez al día tras el cierre UTC.
    const programar = () => {
      const t = setTimeout(() => { ciclo('programada').catch((e) => console.error('Ciclo diario:', e.message)).finally(programar); }, proximaCorrida(ahora()) - ahora());
      t.unref?.();
    };
    programar();
    // De arranque: cubre los cortes. Si la última corrida completa no llega al último día
    // cerrado, corre ahora; la espera interna respeta la pasada automática y la retoma del
    // registro que ya arrancan solas.
    const t = setTimeout(() => { ciclo('de arranque').catch((e) => console.error('Ciclo diario de arranque:', e.message)); }, 180 * 1000);
    t.unref?.();
  });
}
