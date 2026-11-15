// Modulo velas: registro de velas diarias (1d, corte UTC) de un activo, mes por mes hacia atras.
// Orden: "@hugo registra ACTIVO" (solo el usuario). Pide 👍 y registra UN mes por orden: el mas
// reciente pendiente antes de la fecha cero (2026-11-01 00:00 UTC), yendo hacia atras.
// Fuente: API de Binance, velas 1d con el corte predeterminado UTC. Se guarda la vela completa,
// tal como la entrega la API (el cuerpo crudo de la respuesta), sin filtrar campos; el cierre es
// el precio de referencia del registro.
// Correspondencia codigo del registro -> instrumento de Binance, escrita y verificada abajo (no
// depende de recordarla): el codigo es el nombre visible (comandos, reportes, carpetas, archivos);
// el instrumento solo se usa en la consulta interna. Un codigo sin entrada no se adivina: la orden
// falla con aviso claro y agregar uno es un cambio de codigo (ver el manual).
// Destino: registros/velas-24h/<ACTIVO>/yymm_ACTIVO (carpeta por codigo, un archivo por mes, dentro
// de ~/Documents/hugo; HUGO_VELAS_DIR cambia la carpeta base).
// Visibilidad: avisa al empezar la consulta y al terminar el mes (velas guardadas, dias que faltan
// si los hay, y lo que tardo la consulta y el guardado por separado). Si falla, dice en que paso se
// detuvo. No pisa meses ya registrados: la siguiente orden toma el mes anterior pendiente. Meses
// parciales (p. ej. el primer mes del instrumento) se guardan con sus dias y se reportan incompletos.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CERO = Date.UTC(2026, 10, 1); // fecha cero acordada: 2026-11-01 00:00 UTC; el registro va hacia atras
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ACTIVO_OK = /^[A-Z0-9]{2,15}$/;
const LIMITE_MESES = 240; // tope de seguridad al buscar el mes pendiente

// Correspondencia verificada codigo del registro -> instrumento de Binance (status TRADING comprobado).
// SPCX: SpaceX (bStocks Tokenized Stock); instrumento SPCXBUSDT, verificado el 15 nov 2026.
const SIMBOLOS = { SPCX: 'SPCXBUSDT' };

const nombreMes = (ms) => { const d = new Date(ms); return `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const yymm = (ms) => { const d = new Date(ms); return `${String(d.getUTCFullYear() % 100).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const mesAnterior = (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1); };
const mesSiguiente = (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };

export function registrar(ctx) {
  const { app, botToken } = ctx;
  const dirBase = () => process.env.HUGO_VELAS_DIR || ctx.conf.HUGO_VELAS_DIR || path.join(os.homedir(), 'Documents', 'hugo', 'registros', 'velas-24h');
  const decir = (event, text) => app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: event.thread_ts || event.ts, text });
  const seg = (ms) => (ms < 1000 ? `${(ms / 1000).toFixed(2)} s` : `${(ms / 1000).toFixed(1)} s`);
  let enCurso = false;

  // Inicio UTC del mes mas reciente pendiente antes de la fecha cero; null si no hay pendiente.
  function mesPendiente(dir, activo) {
    let inicio = CERO;
    for (let i = 0; i < LIMITE_MESES; i++) {
      inicio = mesAnterior(inicio);
      if (!fs.existsSync(path.join(dir, `${yymm(inicio)}_${activo}`))) return inicio;
    }
    return null;
  }

  // Confirma contra Binance que el instrumento existe y esta activo (TRADING) antes de consultar velas.
  // Un fallo de red o una respuesta ajena (p. ej. bloqueo por ubicacion) se reporta como detencion, no como "inactivo".
  async function instrumentoActivo(simbolo) {
    const r = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${simbolo}`, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'hugo' } });
    const cuerpo = await r.text();
    let info;
    try { info = JSON.parse(cuerpo); } catch { throw new Error(`la respuesta de validacion no fue JSON (HTTP ${r.status})`); }
    if (!info || !Array.isArray(info.symbols)) throw new Error(`Binance respondio al validar: ${String((info && (info.msg || info.message)) || cuerpo.slice(0, 120))}`);
    const s = info.symbols[0];
    return !!(s && s.symbol === simbolo && s.status === 'TRADING');
  }

  // Consulta un mes de velas diarias. Devuelve { datos, cuerpo, consultaMs }; cuerpo es el texto crudo que se guarda.
  async function velasDelMes(simbolo, inicio) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${simbolo}&interval=1d&startTime=${inicio}&endTime=${mesSiguiente(inicio) - 1}&limit=1000`;
    const t0 = Date.now();
    const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'hugo' } });
    const cuerpo = await r.text();
    const consultaMs = Date.now() - t0;
    let datos;
    try { datos = JSON.parse(cuerpo); } catch { throw new Error(`la respuesta no fue JSON (HTTP ${r.status})`); }
    if (!Array.isArray(datos)) throw new Error(`Binance respondio: ${String(datos.msg || datos.message || datos.code || cuerpo.slice(0, 120))}`);
    return { datos, cuerpo, consultaMs };
  }

  function diasFaltantes(datos, inicio) {
    const d = new Date(inicio);
    const diasEnMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const presentes = new Set(datos.map((v) => new Date(v[0]).getUTCDate()));
    const faltan = [];
    for (let dia = 1; dia <= diasEnMes; dia++) if (!presentes.has(dia)) faltan.push(dia);
    return { diasEnMes, faltan };
  }

  ctx.comando(/^\s*registr\w*\s+([A-Za-z0-9]{2,15})\s*[.!?]*\s*$/i, async (event, texto) => {
    const hilo = event.thread_ts || event.ts;
    const activo = (texto.match(/^\s*registr\w*\s+([A-Za-z0-9]{2,15})\s*[.!?]*\s*$/i) || [])[1]?.toUpperCase() || '';
    if (enCurso) return decir(event, 'Ya estoy registrando velas; espera a que termine.');
    if (!ACTIVO_OK.test(activo)) return decir(event, `\u00ab${activo}\u00bb no parece un codigo de activo.`);
    const simbolo = SIMBOLOS[activo];
    if (!simbolo) return decir(event, `No tengo una correspondencia verificada para ${activo} y no la invento. Agregar un activo es un cambio del codigo de Hugo (manual \u00abC\u00f3mo modificar Hugo\u00bb).`);
    const dir = path.join(dirBase(), activo);
    const inicio = mesPendiente(dir, activo);
    if (inicio === null) return decir(event, `No encuentro ningun mes pendiente de ${activo} antes de la fecha cero (noviembre 2026); no hago nada.`);
    const destino = path.join(dir, `${yymm(inicio)}_${activo}`);
    await ctx.confirmar({
      que: 'registrar velas', channel: event.channel, thread_ts: hilo, user: ctx.usuario,
      texto: `Solicitud.\n\u00bfRegistro las velas diarias de ${activo} (Binance, corte UTC) de ${nombreMes(inicio)}? Se guardan completas, tal como las entrega la API, en ${destino}.`,
      alSi: async () => {
        enCurso = true;
        try {
          if (!(await instrumentoActivo(simbolo))) return decir(event, `Binance no tiene activo el instrumento que corresponde a ${activo}; no guard\u00e9 nada. Si cambi\u00f3 de s\u00edmbolo, la correspondencia se actualiza en el c\u00f3digo de Hugo.`);
          await decir(event, `Empiezo: consulto a Binance las velas diarias de ${activo} de ${nombreMes(inicio)}.`);
          const { datos, cuerpo, consultaMs } = await velasDelMes(simbolo, inicio);
          if (!datos.length) {
            return decir(event, `Binance no tiene velas de ${activo} en ${nombreMes(inicio)} (consulta ${seg(consultaMs)}). No guard\u00e9 nada; si el instrumento empieza despu\u00e9s de ese mes, no hay historia anterior que registrar. Me detengo aqu\u00ed.`);
          }
          const t0 = Date.now();
          fs.mkdirSync(dir, { recursive: true });
          const tmp = `${destino}.tmp-${process.pid}`;
          fs.writeFileSync(tmp, cuerpo);
          fs.linkSync(tmp, destino); // falla si el archivo ya existe: nunca pisa un mes registrado
          fs.rmSync(tmp, { force: true });
          const guardadoMs = Date.now() - t0;
          const { diasEnMes, faltan } = diasFaltantes(datos, inicio);
          const cobertura = faltan.length
            ? `Atenci\u00f3n: faltan los d\u00edas ${faltan.join(', ')} de ${diasEnMes}; no doy el mes por completo.`
            : `Mes completo: ${diasEnMes}/${diasEnMes} d\u00edas.`;
          const siguiente = mesPendiente(dir, activo);
          await decir(event, `${nombreMes(inicio)}: ${datos.length} velas guardadas en ${destino} (consulta ${seg(consultaMs)}, guardado ${seg(guardadoMs)}). ${cobertura}${siguiente !== null ? ` El mes anterior pendiente es ${nombreMes(siguiente)}.` : ''}`);
        } catch (e) {
          await decir(event, `El registro de ${activo} se detuvo en ${nombreMes(inicio)}: ${e.message}. No guard\u00e9 ese mes; lo ya registrado no se toc\u00f3.`);
        } finally {
          enCurso = false;
        }
      },
      alNo: async () => { await decir(event, 'Sin respuesta: no registr\u00e9 nada.'); },
    });
  }, { nombre: 'registrar velas', delegable: true }); // delegable: la puede pedir el asistente; el 👍 que la ejecuta sigue siendo solo del usuario
}
