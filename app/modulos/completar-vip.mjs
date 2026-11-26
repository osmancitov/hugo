// Registro VIP horario canónico del día cerrado (relanzamiento aprobado por el usuario el 25-nov-2026, audios 21:03, 21:08, 21:11 y 21:15).
// Al cierre se toma la unión VIP (admitidos, sin Rezagados) de las campañas 30, 60 y 90, y se reconstruye DESDE CERO el
// día cerrado de esos activos con velas de 1 h de Binance: 25 puntos, de 00:00 a 24:00 UTC (el 24:00 es propio de esta versión
// y no toca el 00:00 del día en curso). Precio = primer precio negociado de H:00:00 UTC; apertura de 24 h = vela de 24 h antes.
// Sin vela no hay dato (no se rellena). Escribe solo registros/intradia/<mercado>/canonico/<día>.json: nunca los archivos vivos.
import fs from 'node:fs';
import path from 'node:path';
import { leerBarra, formatearBarra } from './barra-movil.mjs';
import { esVigente } from './vigencia.mjs';
import { diaUTC } from './intradia-datos.mjs';
import { leerCanonico } from './canonico-lectura.mjs';

export const H = 3600000, D = 24 * H;
export const MARGEN_TOMA_MS = 20 * 60000;
export const simbolo = (mercado, c) => `${c}${mercado === 'cripto' ? 'USDT' : 'BUSDT'}`;
const iso = (ms) => new Date(ms).toISOString();
const baseMercado = (mercado) => `intradia/${mercado}`;

// `raiz` es la carpeta registros/. VIP = admitidos (no Rezagados) del último archivo de cada campaña, vigentes en el catálogo.
export function vipAdmitidos(raiz) {
  const dir = path.join(raiz, 'categorias');
  const out = { stock: new Set(), cripto: new Set() };
  for (const n of [30, 60, 90]) {
    const f = fs.readdirSync(dir).filter((x) => new RegExp(`^\\d{6}-\\d{6}_carrera-${n}d$`).test(x)).sort().at(-1);
    if (!f) throw Error(`No hay categorías de la campaña de ${n} días; no invento los VIP.`);
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!Array.isArray(j.clasificados)) throw Error(`Categorías de ${n} días ilegibles.`);
    for (const a of j.clasificados) {
      if (a.grupo === 'rezagados' || typeof a.id !== 'string') continue;
      const [m, c] = [a.id.slice(0, a.id.indexOf(':')), a.id.slice(a.id.indexOf(':') + 1)];
      if (out[m]) out[m].add(c);
    }
  }
  const velas = path.join(raiz, 'velas-24h');
  for (const m of Object.keys(out)) { const vig = esVigente(velas, m); out[m] = [...out[m]].filter((c) => vig(c)).sort(); }
  return out;
}

async function velas1h(mercado, c, desde, hasta, fetchImpl, host) {
  const r = await fetchImpl(`${host}/api/v3/klines?symbol=${encodeURIComponent(simbolo(mercado, c))}&interval=1h&startTime=${desde}&endTime=${hasta}&limit=100`, { headers: { 'User-Agent': 'hugo' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw Error(`Binance ${c}: ${r.status}`);
  const d = await r.json();
  if (!Array.isArray(d)) throw Error(`Binance ${c}: respuesta sin lista de velas.`);
  return new Map(d.map((k) => [k[0], String(k[1])]));
}

// Cierre de la vela diaria del día anterior (misma fuente que las lecturas vivas), o null.
export function cierreDiaAnterior(raiz, mercado, c, dia) {
  const ref = Date.parse(dia) - D;
  const aamm = iso(ref).slice(2, 7).replace('-', '');
  try {
    const a = JSON.parse(fs.readFileSync(path.join(raiz, 'velas-24h', mercado, c, `${aamm}_${c}`), 'utf8'));
    const f = a.find((r) => r[0] === ref);
    return f ? String(f[4]) : null;
  } catch { return null; }
}

// Lectura nueva de una hora que falta, con todos los activos dados.
export function crearTexto(mercado, dia, hora, activos, base, nota) {
  const act = activos.map((n) => ({ codigo: n.codigo, ultimoTexto: n.ultimo, aperturaTexto: n.apertura, cierre: hora, diaCierreTexto: n.diaCierre ?? undefined }));
  let suben = 0, bajan = 0, ds = 0, db = 0, di = 0, sd = 0;
  for (const a of act) {
    if (Number(a.ultimoTexto) >= Number(a.aperturaTexto)) suben++; else bajan++;
    const r = base?.get(a.codigo);
    if (!(r > 0)) { if (base) sd++; else ds++; continue; }
    const p = Number(a.ultimoTexto); if (p >= r) { ds++; if (p === r) di++; } else db++;
  }
  const barra = { inicio: hora - D, cierreMin: hora, fin: hora, dispersionMs: null, consultados: act.length, conDato: act.length, sinDato: 0, suben, bajan, activos: act,
    dia: { ref: diaUTC(Date.parse(dia) - D), base: base ? base.generada : hora, suben: ds, bajan: db, iguales: base ? di : act.length, sinDato: sd } };
  const texto = formatearBarra(barra, hora).replace(/^# Barra movil.*\n# Foto real.*\n/, `# Origen tecnico: ${nota}\n`);
  leerBarra(texto);
  return texto;
}


const leerOpc = (r) => { try { return fs.readFileSync(r, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
export const rutaCanonico = (raiz, mercado, dia) => path.join(raiz, baseMercado(mercado), 'canonico', `${dia}.json`);

export { leerCanonico };

// Construye el día cerrado de `vip` desde cero. No lee ni modifica los archivos vivos. Idempotente:
// si el canónico ya existe y es válido no lo reescribe (devuelve estado "existe").
export async function construirCanonico({ raiz, mercado, dia, vip, ahora = Date.now(), fetchImpl = fetch, host = 'https://data-api.binance.vision', escribir = true, rehacer = false }) {
  const t0 = Date.parse(dia), fin = t0 + D;
  if (!(fin + MARGEN_TOMA_MS <= ahora)) throw Error(`El día ${dia} aún no está cerrado.`);
  const ruta = rutaCanonico(raiz, mercado, dia);
  const previo = leerOpc(ruta);
  if (previo !== null && !rehacer) { leerCanonico(previo, dia); return { dia, mercado, estado: 'existe', activos: 0, sinVela: [] }; }
  if (!vip.length) throw Error('No hay VIP: no construyo un canónico vacío.');
  const velas = new Map();
  for (const c of vip) velas.set(c, await velas1h(mercado, c, t0 - D, fin, fetchImpl, host));
  const nota = `registro canonico del dia cerrado, reconstruido desde cero con Binance klines 1h (primer precio negociado de H:00:00 UTC; apertura de 24 h = vela de 24 h antes), el ${iso(ahora).slice(0, 19)}Z.`;
  const lecturas = [];
  const sinVela = [];
  let base = null;
  for (let h = 0; h <= 24; h++) {
    const t = t0 + h * H;
    const dd = h === 24 ? iso(fin).slice(0, 10) : dia; // el punto 24:00 tiene la forma de la primera lectura del día siguiente
    const act = [];
    for (const c of vip) {
      const m = velas.get(c), u = m.get(t), ap = m.get(t - D);
      if (u === undefined || ap === undefined) { sinVela.push(`${c}@${String(h).padStart(2, '0')}`); continue; }
      act.push({ codigo: c, ultimo: u, apertura: ap, diaCierre: cierreDiaAnterior(raiz, mercado, c, dd) });
    }
    if (!act.length) continue;
    const texto = crearTexto(mercado, dd, t, act, h === 24 ? null : base, nota);
    lecturas.push({ generada: iso(t), texto });
    if (h === 0) { const b = leerBarra(texto); base = new Map([...b.activos].map(([c, a]) => [c, a.ultimo])); base.generada = b.generada; }
  }
  const salida = JSON.stringify({ version: 1, dia, canonico: true, mercado, ...(lecturas.length === 25 ? {} : { incompleto: true }), lecturas }) + '\n';
  leerCanonico(salida, dia);
  for (const l of lecturas) leerBarra(l.texto);
  if (escribir) { fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, salida); }
  return { dia, mercado, estado: previo === null ? 'creado' : 'rehecho', activos: vip.length, puntos: lecturas.length, sinVela };
}
