import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Modulo confirmacion: UNO solo, lo usan todos los demas modulos (ctx.confirmar).
// Regla: pulgar arriba = si. 10 minutos sin respuesta = no.
// Confirma la persona autorizada para la orden; otras reacciones se ignoran.
// El registro de velas ya no usa este modulo: se ejecuta directamente.
const aceptando = new Set();
const pendientes = new Map(); // "canal:ts" -> { user, alSi, alNo, timer, que, desde }

const esPulgar = (r) => r === '+1' || r === 'thumbsup' || r.startsWith('+1::') || r.startsWith('thumbsup::');

export function guardarAprobacion(registro) {
 const dir=path.join(os.homedir(),'.local','share','hugo');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const fd=fs.openSync(path.join(dir,'aprobaciones.jsonl'),'a',0o600);
 try{fs.writeSync(fd,JSON.stringify(registro)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}

export function registrar(ctx) {
  const { app, botToken } = ctx;

  // confirmar({ channel, thread_ts, user, texto, alSi, alNo, minutos, tambien, largo, corta })
  // `tambien`: id de Slack opcional que tambien confirma con su pulgar (sin usos actuales).
  // `largo`: el trabajo que arranca el pulgar es largo y se puede cortar con stop o restart (lo miran esos modulos).
  // `corta`: la orden interrumpe el trabajo largo que este en curso (reinicio); se avisa en la pregunta.
  ctx.confirmar = async ({ channel, thread_ts, user, texto, alSi, alNo, minutos = 10, que = 'una orden', tambien = '', largo = false, corta = false }) => {
    const ocupado = corta ? [...ctx.activas.values()].filter((a) => a.largo) : [];
    const aviso = ocupado.length ? `\nOjo: ahora estoy en:\n${ocupado.map((a) => `\u00b7 ${a.que} (desde hace ${Math.max(1, Math.round((Date.now() - a.desde) / 60000))} min)`).join('\n')}\nSi aplicas, me reinicio y ese trabajo se corta: lo ya guardado se conserva; lo que estaba a medias habr\u00e1 que repetirlo.` : '';
    const r = await app.client.chat.postMessage({
      token: botToken, channel, thread_ts,
      text: `🔶\nSolicitud\n${texto.replace(/^(?:🔶\s*)?Solicitud[.:]?\s*/u, '')}${aviso}`,
    });
    const clave = `${channel}:${r.ts}`;
    const timer = setTimeout(async () => {
      if (!pendientes.delete(clave)) return;
      try { await alNo({ motivo: 'sin-respuesta', ts: r.ts }); } catch (e) { console.error('alNo:', e.data?.error || e.message); }
    }, minutos * 60 * 1000);
    pendientes.set(clave, { user, tambien, alSi, alNo, timer, que, desde: Date.now(), largo, channel, thread_ts, texto });
    return r.ts;
  };

  // Lo que espera un 👍 (para el comando estado).
  ctx.esperando = () => [...pendientes.values()].map((p) => ({ que: p.que, desde: p.desde }));

  app.event('reaction_added', async ({ event }) => {
    if (event.item?.type !== 'message') return;
    const clave = `${event.item.channel}:${event.item.ts}`;
    const p = pendientes.get(clave);
    if (!esPulgar(event.reaction)) return;
    if (!p) { await ctx.retirarHuerfano?.(event); return; }
    if (event.user !== p.user && (!p.tambien || event.user !== p.tambien)) return;
    if(aceptando.has(clave))return;
    aceptando.add(clave);
    try {
      const registro={solicitud:event.item.ts,channel:p.channel,hiloOrigen:p.thread_ts||null,aprobador:event.user,reaccion:event.reaction,evento:event.event_ts||null,aceptada:new Date().toISOString(),que:p.que,texto:p.texto};
      await (ctx.guardarAprobacion||guardarAprobacion)(registro);
    }catch(e){aceptando.delete(clave);console.error('No pude guardar aprobación; no ejecuto ni retiro:',e.message);return;}
    clearTimeout(p.timer);
    pendientes.delete(clave);
    const idAct = `conf-${clave}`;
    ctx.activas.set(idAct, { que: p.que, desde: Date.now(), largo: !!p.largo });
    // El registro local ya quedó confirmado en disco antes de retirar la solicitud.
    // Fallar al retirar no cancela ni repite el trabajo aprobado.
    try { await app.client.chat.delete({token:botToken,channel:event.item.channel,ts:event.item.ts}); }
    catch(e){console.error('Solicitud aprobada conservada en Slack:',e.data?.error||e.message);}
    try { await p.alSi({ ts: event.item.ts }); } catch (e) { console.error('alSi:', e.data?.error || e.message); }
    finally { ctx.activas.delete(idAct); aceptando.delete(clave); }
  });
}

export const _prueba = { pendientes, esPulgar };
