// VIP núcleo 54 campañas, de 7 a 60 días (decisión del dueño, 27-nov-2026): un activo entra si es VIP (Campaña >= 1)
// en al menos el 75 % de las 54 campañas de duración 7 a 60 días que terminan en el último día cerrado. El denominador
// es siempre 54: las duraciones que un activo no pudo disputar (sin las N velas completas) no se descuentan.
// Sin suavizado: P = suma de variaciones diarias positivas / |suma de las negativas|, C = días al alza / días a la baja,
// Campaña = raíz((P² + C²) / 2), VIP si Campaña >= 1 (la misma regla de campana-carrera.mjs).
// Ventana sin días a la baja (D = 0): P y C crecen sin límite cuando hay alzas (cualquier numerador positivo sobre una
// suma de bajas que tiende a 0), así que la Campaña supera 1 en el límite y cuenta como VIP; se anota en `sin_bajas`.
// Ventana sin ningún movimiento (todo plano, 0/0): indefinida, no cuenta como aparición.
// Sin atajos: si el núcleo falta, no sirve o está atrasado, `leerNucleo` LANZA; nunca vuelve a la unión 30/60/90.
import fs from 'node:fs';
import path from 'node:path';
import { vigentes } from './vigencia.mjs';

export const DIA = 86400000;
export const DESDE = 7, HASTA = 60, TOTAL = HASTA - DESDE + 1, PORCENTAJE = 75;
export const MINIMO = Math.ceil((PORCENTAJE * TOTAL) / 100); // 41 de 54
export const MAX_ATRASO_DIAS = 2; // el núcleo del cierre D-1 se publica minutos después de las 00:00 UTC del día D
export const nombreNucleo = (cierreMs) => `${new Date(cierreMs).toISOString().slice(2, 10).replace(/-/g, '')}_nucleo`;
export const dirNucleo = (raiz, mercado) => path.join(raiz, 'nucleo', mercado);

// Campaña >= 1 con los acumulados de una ventana completa; null si es indefinida (todo plano).
export function esVipVentana({ pos, neg, dp, dn }) {
  if (!dn) return dp ? { vip: true, sinBajas: true } : null;
  const P = pos / Math.abs(neg), C = dp / dn;
  return { vip: Math.sqrt((P * P + C * C) / 2) >= 1, sinBajas: false };
}

// rets: Map(inicioDiaMs -> variación %). Cuenta apariciones y duraciones evaluables de 7 a 60 con cierre en `cierre`.
export function aparicionesActivo(rets, cierre) {
  let pos = 0, neg = 0, dp = 0, dn = 0, apariciones = 0, evaluables = 0, sinBajas = 0, indefinidas = 0;
  for (let n = 1; n <= HASTA; n++) {
    const t = cierre - (n - 1) * DIA;
    if (!rets.has(t)) break; // sin la vela de ese día no hay ventana completa para esta duración ni las mayores
    const x = rets.get(t);
    if (x > 0) { pos += x; dp++; } else if (x < 0) { neg += x; dn++; }
    if (n < DESDE) continue;
    evaluables++;
    const r = esVipVentana({ pos, neg, dp, dn });
    if (!r) { indefinidas++; continue; }
    if (r.vip) { apariciones++; if (r.sinBajas) sinBajas++; }
  }
  return { apariciones, evaluables, sinBajas, indefinidas };
}

function retornos(raiz, mercado, a) {
  const rets = new Map();
  for (const mes of a.meses) {
    const p = path.join(raiz, 'velas-24h', mercado, a.codigo, `${mes}_${a.codigo}`);
    if (!fs.existsSync(p)) continue;
    for (const v of JSON.parse(fs.readFileSync(p, 'utf8'))) {
      const o = Number(v[1]), c = Number(v[4]);
      if (o > 0 && c > 0) rets.set(v[0], (c / o - 1) * 100);
    }
  }
  return rets;
}

// raiz = carpeta registros/. Devuelve el registro del núcleo (aún sin escribir).
export function calcularNucleo({ raiz, mercado, cierre, generado = new Date().toISOString() }) {
  const vig = vigentes(path.join(raiz, 'velas-24h'), mercado);
  const cat = JSON.parse(fs.readFileSync(path.join(raiz, 'catalogo', mercado), 'utf8'));
  const activos = [];
  for (const a of cat.activos) {
    if (!vig.has(a.codigo)) continue;
    const r = aparicionesActivo(retornos(raiz, mercado, a), cierre);
    if (r.apariciones) activos.push({ codigo: a.codigo, ...r });
  }
  activos.sort((x, y) => y.apariciones - x.apariciones || (x.codigo < y.codigo ? -1 : x.codigo > y.codigo ? 1 : 0));
  const nucleo = activos.filter((a) => a.apariciones >= MINIMO).map((a) => a.codigo);
  return {
    version: 1, mercado, cierre: new Date(cierre).toISOString().slice(0, 10), generado,
    regla: { duraciones: [DESDE, HASTA], total: TOTAL, umbral_pct: PORCENTAJE, minimo: MINIMO, denominador: 'fijo (54)', suavizado: 'ninguno', campana: 'raiz((P^2+C^2)/2) >= 1' },
    nucleo, activos,
  };
}

export function validarNucleo(j, mercado) {
  if (!j || j.version !== 1 || j.mercado !== mercado || !/^\d{4}-\d\d-\d\d$/.test(j.cierre || '') || !Array.isArray(j.nucleo) || !Array.isArray(j.activos)) throw Error(`Núcleo de ${mercado} ilegible o de otro mercado.`);
  if (j.regla?.minimo !== MINIMO || j.regla?.total !== TOTAL) throw Error(`Núcleo de ${mercado} con regla distinta de la vigente.`);
  const ap = new Map(j.activos.map((a) => [a.codigo, a.apariciones]));
  for (const c of j.nucleo) if (!(ap.get(c) >= MINIMO)) throw Error(`Núcleo de ${mercado}: ${c} no alcanza ${MINIMO} apariciones.`);
  return j;
}

// Escribe `<cierre>_nucleo` (no se reescribe si existe y vale) y `actual_nucleo` (copia del más reciente).
export function escribirNucleo({ raiz, mercado, cierre, generado }) {
  const dir = dirNucleo(raiz, mercado), f = path.join(dir, nombreNucleo(cierre));
  fs.mkdirSync(dir, { recursive: true });
  let j;
  if (fs.existsSync(f)) j = validarNucleo(JSON.parse(fs.readFileSync(f, 'utf8')), mercado);
  else { j = validarNucleo(calcularNucleo({ raiz, mercado, cierre, generado }), mercado); fs.writeFileSync(f, JSON.stringify(j) + '\n'); }
  const act = path.join(dir, 'actual_nucleo');
  let previo = null;
  try { previo = JSON.parse(fs.readFileSync(act, 'utf8')); } catch { /* sin actual */ }
  if (!previo || previo.cierre <= j.cierre) fs.writeFileSync(act, JSON.stringify(j) + '\n');
  return j;
}

// Lee el núcleo vigente. Lanza si falta, no sirve o su cierre es más viejo de lo permitido respecto de `ahora`
// (cierre esperado = día UTC anterior a hoy; se tolera el cierre anterior hasta que la puesta al día publique el nuevo).
export function leerNucleo(raiz, mercado, { ahora = Date.now(), maxAtraso = MAX_ATRASO_DIAS } = {}) {
  const f = path.join(dirNucleo(raiz, mercado), 'actual_nucleo');
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw Error(`No hay núcleo de ${mercado} (${e.code === 'ENOENT' ? 'ausente' : 'ilegible'}); no leo con la unión antigua.`); }
  validarNucleo(j, mercado);
  const esperado = Math.floor(ahora / DIA) * DIA - DIA;
  const atraso = Math.round((esperado - Date.parse(j.cierre)) / DIA);
  if (atraso > maxAtraso - 1) throw Error(`El núcleo de ${mercado} es del cierre ${j.cierre}, atrasado ${atraso} día(s); no lo uso en silencio.`);
  if (!j.nucleo.length) throw Error(`El núcleo de ${mercado} del cierre ${j.cierre} está vacío; no leo sin universo.`);
  return j;
}
