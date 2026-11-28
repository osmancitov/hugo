// Balance diario de Mercado (25-nov-2026, decisión del usuario, audio 1795640982.456729). Desde el 27-nov-2026 el
// conjunto es el VIP núcleo (54 campañas de duración variable, de 7 a 60 días); antes eran los clasificados (sin
// Rezagados) del último cierre de cada campaña. Se sigue ese conjunto hacia atrás durante los n días calendario
// cerrados de la ventana n (30, 60 o 90) y se recalcula toda la historia cada cierre; no es la clasificación de cada
// día. Por día: cuántos suben (cierre > apertura), quedan iguales y bajan. Un activo sin vela ese día no cuenta como
// igual ni como baja: queda fuera de ese día y el denominador (suma del día) lo refleja.
// Solo lee las carreras y las velas diarias ya guardadas; no escribe registros crudos.
import fs from 'node:fs';
import path from 'node:path';
import { sufijo } from './campana-serie.mjs';
import { validarNucleo, dirNucleo } from './nucleo.mjs';

const DIA = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const archivoBalance = (n) => 'balance' + sufijo(n);

export function construirBalance({ raiz, n, salida = path.join(raiz, 'registros', 'categorias') }) {
  const archivos = fs.readdirSync(salida).filter((f) => new RegExp(`^\\d{6}-\\d{6}${sufijo(n)}$`).test(f)).sort((a, b) => a.slice(7, 13).localeCompare(b.slice(7, 13)));
  if (!archivos.length) throw Error(`Sin carrera de ${n}d para el balance`);
  const ultima = JSON.parse(fs.readFileSync(path.join(salida, archivos.at(-1)), 'utf8'));
  const fin = Date.parse(ultima.carrera.ventana.fin + 'T00:00:00Z'), ini = fin - (n - 1) * DIA;
  // Cohorte: el VIP núcleo 54 campañas, de 7 a 60 días (27-nov-2026). Sin núcleo no hay balance: lanza, nunca vuelve a los clasificados.
  const cohorte = [];
  for (const m of ['stock', 'cripto']) {
    const f = path.join(raiz, 'registros', dirNucleo('', m), 'actual_nucleo');
    let j; try { j = validarNucleo(JSON.parse(fs.readFileSync(f, 'utf8')), m); } catch (e) { throw Error(`Sin núcleo de ${m} para el balance: ${e.message}`); }
    for (const codigo of j.nucleo) cohorte.push({ id: `${m}:${codigo}` });
  }
  const cat = Object.fromEntries(['stock', 'cripto'].map((m) => [m, JSON.parse(fs.readFileSync(path.join(raiz, 'registros/catalogo', m), 'utf8'))]));
  const dias = new Map(); for (let t = ini; t <= fin; t += DIA) dias.set(t, [0, 0, 0]); // [suben, bajan, iguales]
  const porMercado = { stock: 0, cripto: 0 };
  for (const a of cohorte) {
    const [m, codigo] = a.id.split(':');
    const e = cat[m]?.activos.find((x) => x.codigo === codigo);
    if (!e) throw Error(`El activo ${a.id} del cierre no está en el catálogo`);
    porMercado[m]++;
    for (const mes of e.meses) {
      const y = 2000 + Number(mes.slice(0, 2)), mm = Number(mes.slice(2));
      if (Date.UTC(y, mm, 1) <= ini || Date.UTC(y, mm - 1, 1) > fin) continue;
      const f = path.join(raiz, 'registros/velas-24h', m, codigo, `${mes}_${codigo}`);
      if (!fs.existsSync(f)) continue;
      for (const v of JSON.parse(fs.readFileSync(f, 'utf8'))) {
        const c = dias.get(v[0]); const ap = Number(v[1]), ci = Number(v[4]);
        if (!c || !(ap > 0) || !(ci > 0)) continue;
        c[ci > ap ? 0 : ci < ap ? 1 : 2]++;
      }
    }
  }
  const puntos = [...dias].map(([t, c]) => [t, c[0], c[1], c[2]]); // [día UTC, suben, bajan, iguales]
  return {
    balance: {
      ventana: { inicio: iso(ini), fin: iso(fin), cantidad: n, unidad: 'd' },
      conjunto: `VIP núcleo 54 campañas, de 7 a 60 días, seguidos hacia atrás los ${n} días calendario cerrados. Se recalcula entera en cada cierre; no es la clasificación de cada día.`,
      conteo: 'por día: suben (cierre > apertura), bajan (cierre < apertura) e iguales. Un activo sin vela ese día no cuenta en ninguna columna; el total del día es el número de activos con vela.',
      cohorte: { total: cohorte.length, ...porMercado },
      punto: '[día UTC en ms, suben, bajan, iguales]',
    },
    puntos,
  };
}

export function escribirBalance(dir, n, raiz) {
  const b = construirBalance({ raiz, n, salida: dir });
  const f = path.join(dir, archivoBalance(n));
  fs.writeFileSync(f + '.tmp', JSON.stringify(b) + '\n'); fs.renameSync(f + '.tmp', f);
  return b;
}
