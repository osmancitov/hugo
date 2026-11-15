// Modulo sincronizar-registros: "@hugo sincroniza registros" copia el registro de velas entre la
// Debian y el repositorio publico de GitHub (HUGO_GITHUB), en los DOS sentidos y SIN PISAR contenido
// distinto. Los registros son publicos y van al repo por decision del usuario (15-nov-2026).
// Sentidos: lo que solo esta en la Debian sube en UN commit (autor y committer con el correo del
// usuario); lo que solo esta en GitHub baja sin pisar (tmp + enlace duro, como el registro). Lo que
// esta en los dos lados con contenido DISTINTO es un conflicto: se reporta y no se toca en ningun
// lado. La comparacion es por contenido (la huella sha de blob de git), nunca por nombre ni fecha.
// Credencial: keys/.github-key, un token de GitHub que el usuario ya tiene en la Debian. Hugo lo lee
// solo aqui y NUNCA lo imprime ni lo envia; antes de ofrecer subida comprueba contra la API que el
// token tiene permiso de escritura en el repo. Sin el archivo o sin ese permiso, la bajada funciona
// igual (el repo es publico) y la subida queda pendiente, avisando.
// Antes de cambiar nada muestra el plan (que sube, que baja, que conflictos hay) y solo actua con
// el pulgar del usuario. Solo toca rutas registros/velas-24h/<clase>/<ACTIVO>/yymm_ACTIVO (clase: stock o
// cripto, la misma lista que usa el registro); ninguna otra carpeta, en ningun sentido.
// Mudanza unica de lo heredado (autorizada por el usuario el 15-nov-2026): los registros de la ruta anterior
// velas-24h/<ACTIVO>/ (solo SPCX, una accion tokenizada) pasan a velas-24h/stock/<ACTIVO>/, con copia verificada por
// contenido antes de quitar el original, y en GitHub como renombrado del mismo contenido. Si algo no coincide, queda todo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { CLASES } from './activos.mjs';

const PREFIJO = 'registros/velas-24h';
const RUTA_OK = new RegExp(`^registros/velas-24h/(?:${CLASES.join('|')})/[A-Z0-9]{2,15}/\\d{4}_[A-Z0-9]{2,15}$`);
const RUTA_HEREDADA = /^registros\/velas-24h\/([A-Z0-9]{2,15})\/(\d{4}_\1)$/; // ruta anterior, sin clase
const CLASE_HEREDADA = 'stock';
const ARCHIVO_OK = /^\d{4}_[A-Z0-9]{2,15}$/;
const ACTIVO_OK = /^[A-Z0-9]{2,15}$/;
const MAX_BYTES = 5 * 1024 * 1024; // un registro mensual pesa KB; algo mayor es un error a revisar a mano
const RAMA = 'main';

// Huella de blob de git del contenido local: asi se compara con el arbol del repo sin bajarlo.
const shaBlob = (buf) => crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`, 'latin1'), buf])).digest('hex');

export function registrar(ctx) {
  const { app, botToken } = ctx;
  const dirBase = () => process.env.HUGO_VELAS_DIR || ctx.conf.HUGO_VELAS_DIR || path.join(os.homedir(), 'Documents', 'hugo', 'registros', 'velas-24h');
  const decir = (event, text) => app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: event.thread_ts || event.ts, text });
  let enCurso = false;

  async function api(repo, ruta, { token = '', method = 'GET', body } = {}) {
    const headers = { 'User-Agent': 'hugo', Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let datos;
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; datos = JSON.stringify(body); }
    const r = await fetch(`https://api.github.com/repos/${repo}${ruta}`, { method, headers, body: datos, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`GitHub respondio ${r.status} en ${ruta || '/'}`);
    return r.json();
  }

  // ¿El token existe y tiene escritura en el repo? Solo se comprueba cuando hay algo que subir.
  async function puedeSubir(repo, token) {
    if (!token) return false;
    try {
      const info = await api(repo, '', { token });
      return info?.permissions?.push === true;
    } catch { return false; }
  }

  // Archivos locales del registro: [{ rel, ruta, bytes }], solo nombres con la forma acordada.
  function locales() {
    const lista = [];
    for (const clase of CLASES) {
      let activos = [];
      try { activos = fs.readdirSync(path.join(dirBase(), clase)); } catch { continue; }
      for (const a of activos) {
        if (!ACTIVO_OK.test(a)) continue;
        let nombres = [];
        try { nombres = fs.readdirSync(path.join(dirBase(), clase, a)); } catch { continue; }
        for (const n of nombres) {
          if (!ARCHIVO_OK.test(n)) continue;
          const ruta = path.join(dirBase(), clase, a, n);
          let st;
          try { st = fs.lstatSync(ruta); } catch { continue; }
          if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) continue;
          lista.push({ rel: `${PREFIJO}/${clase}/${a}/${n}`, ruta, bytes: st.size });
        }
      }
    }
    return lista;
  }

  const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

  // Mudanza local de lo heredado: velas-24h/<ACTIVO>/yymm_ACTIVO -> velas-24h/stock/<ACTIVO>/yymm_ACTIVO.
  // Copia a un temporal, comprueba por sha256 que es identica, la enlaza sin pisar y solo entonces quita el original.
  // Si el destino ya existe con otro contenido, no toca ninguno de los dos y lo reporta.
  function mudarLocalHeredado() {
    const movidos = [], conflictos = [], fallos = [];
    let activos = [];
    try { activos = fs.readdirSync(dirBase()); } catch { return { movidos, conflictos, fallos }; }
    for (const a of activos) {
      if (!ACTIVO_OK.test(a)) continue; // las carpetas de clase van en minuscula: no entran
      const dirViejo = path.join(dirBase(), a);
      let st; try { st = fs.lstatSync(dirViejo); } catch { continue; }
      if (!st.isDirectory()) continue;
      let nombres = []; try { nombres = fs.readdirSync(dirViejo); } catch { continue; }
      for (const n of nombres) {
        if (!ARCHIVO_OK.test(n)) continue;
        const viejo = path.join(dirViejo, n);
        const destino = path.join(dirBase(), CLASE_HEREDADA, a, n);
        const rel = `${a}/${n}`;
        try {
          const sv = fs.lstatSync(viejo);
          if (!sv.isFile() || sv.size === 0 || sv.size > MAX_BYTES) continue;
          const buf = fs.readFileSync(viejo);
          if (fs.existsSync(destino)) {
            if (sha256(fs.readFileSync(destino)) === sha256(buf)) { fs.rmSync(viejo); movidos.push(rel); } else conflictos.push(rel);
            continue;
          }
          fs.mkdirSync(path.dirname(destino), { recursive: true });
          const tmp = `${destino}.tmp-${process.pid}`;
          fs.writeFileSync(tmp, buf);
          if (sha256(fs.readFileSync(tmp)) !== sha256(buf)) { fs.rmSync(tmp, { force: true }); throw new Error('la copia no coincide'); }
          fs.linkSync(tmp, destino); // falla si ya existe: nunca pisa
          fs.rmSync(tmp, { force: true });
          if (sha256(fs.readFileSync(destino)) !== sha256(buf)) throw new Error('el destino no coincide; dejo el original');
          fs.rmSync(viejo);
          movidos.push(rel);
        } catch (e) { fallos.push(`${rel}: ${e.message}`.slice(0, 160)); }
      }
      try { fs.rmdirSync(dirViejo); } catch { /* sigue con archivos: no se borra */ }
    }
    return { movidos, conflictos, fallos };
  }

  // Arbol del repo (ruta -> sha de blob), solo rutas del registro con forma valida.
  async function remotos(repo, token) {
    const ref = await api(repo, `/git/ref/heads/${RAMA}`, { token });
    const commit = await api(repo, `/git/commits/${ref.object.sha}`, { token });
    const arbol = await api(repo, `/git/trees/${commit.tree.sha}?recursive=1`, { token });
    if (arbol.truncated) throw new Error('el arbol del repo es demasiado grande para leerlo completo');
    const mapa = new Map();
    const heredados = [];
    for (const e of arbol.tree || []) {
      if (e.type !== 'blob') continue;
      if (RUTA_OK.test(e.path)) mapa.set(e.path, e.sha);
      else if (RUTA_HEREDADA.test(e.path)) heredados.push(e.path); // ruta anterior sin clase: no se sincroniza, solo se muda
    }
    return { mapa, heredados };
  }

  // Renombra en GitHub lo heredado a la ruta con clase, en UN commit, sin subir contenido: el blob es el mismo (misma huella),
  // asi que el contenido movido es identico por construccion. Solo mueve lo que la Debian ya tiene identico en la ruta nueva;
  // si el destino remoto existe con otro contenido, o no hay copia local identica, no lo toca y lo reporta.
  async function mudarRemotoHeredado(repo, token) {
    const ref = await api(repo, `/git/ref/heads/${RAMA}`, { token });
    const baseCommit = await api(repo, `/git/commits/${ref.object.sha}`, { token });
    const arbol = await api(repo, `/git/trees/${baseCommit.tree.sha}?recursive=1`, { token });
    if (arbol.truncated) throw new Error('el arbol del repo es demasiado grande para leerlo completo');
    const blobs = new Map();
    for (const e of arbol.tree || []) if (e.type === 'blob') blobs.set(e.path, e.sha);
    const viejos = [...blobs.keys()].filter((r) => RUTA_HEREDADA.test(r)).sort();
    if (!viejos.length) return { movidos: [], pendientes: [] };
    const entradas = [], movidos = [], pendientes = [];
    for (const viejo of viejos) {
      const [, a, n] = viejo.match(RUTA_HEREDADA);
      const nuevo = `${PREFIJO}/${CLASE_HEREDADA}/${a}/${n}`;
      const corto = viejo.replace(`${PREFIJO}/`, '');
      const local = path.join(dirBase(), CLASE_HEREDADA, a, n);
      let shaLocal = null;
      try { shaLocal = shaBlob(fs.readFileSync(local)); } catch { /* sin copia local */ }
      const shaViejo = blobs.get(viejo);
      const shaNuevo = blobs.get(nuevo);
      if (shaLocal !== shaViejo) { pendientes.push(`${corto}: la Debian no tiene una copia id\u00e9ntica en ${CLASE_HEREDADA}/`); continue; }
      if (shaNuevo !== undefined && shaNuevo !== shaViejo) { pendientes.push(`${corto}: ya existe en ${CLASE_HEREDADA}/ con otro contenido`); continue; }
      if (shaNuevo === undefined) entradas.push({ path: nuevo, mode: '100644', type: 'blob', sha: shaViejo });
      entradas.push({ path: viejo, mode: '100644', type: 'blob', sha: null });
      movidos.push(corto);
    }
    if (!movidos.length) return { movidos, pendientes };
    const tree = await api(repo, '/git/trees', { token, method: 'POST', body: { base_tree: baseCommit.tree.sha, tree: entradas } });
    const commit = await api(repo, '/git/commits', {
      token, method: 'POST',
      body: {
        message: `Registros de velas: mudanza a ${CLASE_HEREDADA}/ (${movidos.join(', ')})`,
        tree: tree.sha, parents: [ref.object.sha],
        author: { name: 'Osmancito', email: 'osmanvielma@gmail.com' },
        committer: { name: 'Osmancito', email: 'osmanvielma@gmail.com' },
      },
    });
    await api(repo, `/git/refs/heads/${RAMA}`, { token, method: 'PATCH', body: { sha: commit.sha } }); // sin force
    return { movidos, pendientes, commit: commit.sha };
  }

  async function planear(repo, token) {
    const { mapa, heredados } = await remotos(repo, token);
    const subir = [], bajar = [], conflictos = [];
    let iguales = 0;
    for (const f of locales()) {
      const shaRemota = mapa.get(f.rel);
      if (shaRemota === undefined) { subir.push(f); continue; }
      if (shaBlob(fs.readFileSync(f.ruta)) === shaRemota) iguales++; else conflictos.push(f.rel);
      mapa.delete(f.rel);
    }
    for (const [rel, sha] of mapa) bajar.push({ rel, sha });
    subir.sort((a, b) => a.rel.localeCompare(b.rel));
    bajar.sort((a, b) => a.rel.localeCompare(b.rel));
    conflictos.sort();
    return { subir, bajar, iguales, conflictos, heredados };
  }

  const cortas = (l) => l.map((x) => (typeof x === 'string' ? x : x.rel).replace(`${PREFIJO}/`, ''));
  const lista = (l) => { const c = cortas(l); return c.length > 12 ? `${c.slice(0, 12).join(', ')} y ${c.length - 12} mas` : c.join(', '); };

  // Baja sin pisar: tmp + enlace duro, el mismo criterio que el registro de velas.
  async function bajarArchivos(repo, token, bajar) {
    const hechos = [], fallos = [];
    for (const b of bajar) {
      try {
        const blob = await api(repo, `/git/blobs/${b.sha}`, { token });
        const buf = Buffer.from(String(blob.content || ''), 'base64');
        if (!buf.length || buf.length > MAX_BYTES) throw new Error(`tamano fuera de lo esperado (${buf.length} bytes)`);
        const destino = path.join(dirBase(), b.rel.slice(PREFIJO.length + 1));
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        const tmp = `${destino}.tmp-${process.pid}`;
        fs.writeFileSync(tmp, buf);
        fs.linkSync(tmp, destino); // falla si ya existe: nunca pisa
        fs.rmSync(tmp, { force: true });
        hechos.push(b.rel);
      } catch (e) { fallos.push(`${b.rel.replace(`${PREFIJO}/`, '')}: ${e.message}`.slice(0, 160)); }
    }
    return { hechos, fallos };
  }

  // Sube en UN solo commit. Relee la punta de la rama justo antes: lo que mientras tanto aparezca en
  // el repo con contenido distinto se omite y se reporta (del plan a la ejecucion nunca se pisa).
  async function subirArchivos(repo, token, subir) {
    const ref = await api(repo, `/git/ref/heads/${RAMA}`, { token });
    const baseCommit = await api(repo, `/git/commits/${ref.object.sha}`, { token });
    const arbol = await api(repo, `/git/trees/${baseCommit.tree.sha}?recursive=1`, { token });
    if (arbol.truncated) throw new Error('el arbol del repo es demasiado grande para leerlo completo');
    const actuales = new Map();
    for (const e of arbol.tree || []) if (e.type === 'blob' && RUTA_OK.test(e.path)) actuales.set(e.path, e.sha);
    const items = [], omitidos = [];
    for (const f of subir) {
      const buf = fs.readFileSync(f.ruta);
      const shaRemota = actuales.get(f.rel);
      if (shaRemota === shaBlob(buf)) continue; // ya esta igual
      if (shaRemota !== undefined) { omitidos.push(`${f.rel.replace(`${PREFIJO}/`, '')}: aparecio en el repo con otro contenido`); continue; }
      const blob = await api(repo, '/git/blobs', { token, method: 'POST', body: { content: buf.toString('base64'), encoding: 'base64' } });
      items.push({ path: f.rel, mode: '100644', type: 'blob', sha: blob.sha });
    }
    if (!items.length) return { commit: null, subidos: [], omitidos };
    const tree = await api(repo, '/git/trees', { token, method: 'POST', body: { base_tree: baseCommit.tree.sha, tree: items } });
    const commit = await api(repo, '/git/commits', {
      token, method: 'POST',
      body: {
        message: `Registros de velas: ${items.map((i) => i.path.replace(`${PREFIJO}/`, '')).join(', ')}`,
        tree: tree.sha, parents: [ref.object.sha],
        author: { name: 'Osmancito', email: 'osmanvielma@gmail.com' },
        committer: { name: 'Osmancito', email: 'osmanvielma@gmail.com' },
      },
    });
    await api(repo, `/git/refs/heads/${RAMA}`, { token, method: 'PATCH', body: { sha: commit.sha } }); // sin force: un avance ajeno se rechaza
    return { commit: commit.sha, subidos: items.map((i) => i.path), omitidos };
  }

  // Una pasada completa: compara, baja y sube sin pisar, y devuelve un resumen. SIN confirmacion por
  // pasada: el usuario autorizo la sincronizacion automatica de este alcance (15-nov-2026). Nada se
  // pisa nunca; los conflictos se reportan y no se tocan.
  async function pasada() {
    const repo = process.env.HUGO_GITHUB || ctx.conf.HUGO_GITHUB || '';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { error: 'Falta HUGO_GITHUB (propietario/repositorio) en config.env; no hago nada.' };
    const token = ctx.leerClave('.github-key');
    // Mudanza de lo heredado (ver la cabecera): primero la Debian, luego GitHub. Idempotente: sin heredados no hace nada.
    const previo = [];
    let mudo = false;
    const mud = mudarLocalHeredado();
    if (mud.movidos.length) { mudo = true; previo.push(`mud\u00e9 ${mud.movidos.length} registro(s) heredados a ${CLASE_HEREDADA}/ en la Debian (${mud.movidos.join(', ')}), verificados por contenido`); }
    if (mud.conflictos.length) previo.push(`heredados sin mover (el destino existe con otro contenido): ${mud.conflictos.join(', ')}`);
    if (mud.fallos.length) previo.push(`no pude mudar: ${mud.fallos.join('; ')}`);
    let plan;
    try {
      plan = await planear(repo, token);
      if (plan.heredados.length) {
        if (await puedeSubir(repo, token)) {
          const r = await mudarRemotoHeredado(repo, token);
          if (r.movidos.length) { mudo = true; previo.push(`renombr\u00e9 en GitHub ${r.movidos.length} registro(s) heredados a ${CLASE_HEREDADA}/ (${r.movidos.join(', ')}) en el commit ${r.commit.slice(0, 7)}, mismo contenido`); }
          if (r.pendientes.length) previo.push(`heredados en GitHub sin tocar: ${r.pendientes.join('; ')}`);
          plan = await planear(repo, token);
        } else previo.push(`hay ${plan.heredados.length} registro(s) heredados en GitHub por mudar, pero falta keys/.github-key o escritura en el repo`);
      }
    } catch (e) { return { error: `No pude comparar con GitHub (${e.message}). No cambi\u00e9 nada m\u00e1s.${previo.length ? ` ${previo.join('. ')}.` : ''}`, hizoAlgo: mudo }; }
    const { subir, bajar, iguales, conflictos } = plan;
    const aviso = previo.length ? ` ${previo.join('. ')}.` : '';
    const notaConflicto = conflictos.length ? ` Conflicto${conflictos.length > 1 ? 's' : ''} sin tocar (mismo mes, contenido distinto): ${lista(conflictos)}.` : '';
    const clave = conflictos.join(',');
    if (!subir.length && !bajar.length) return { cambios: mudo, hayPendiente: previo.length > 0 && !mudo, conflictos: clave, texto: `Registros ya sincronizados con ${repo}: ${iguales} archivo(s) iguales.${notaConflicto}${aviso}` };
    const subidaLista = subir.length > 0 && (await puedeSubir(repo, token));
    const t0 = Date.now();
    const res = [], extra = [];
    let hizoAlgo = mudo;
    try {
      if (bajar.length) {
        const baj = await bajarArchivos(repo, token, bajar);
        if (baj.hechos.length) hizoAlgo = true;
        res.push(`baj\u00e9 ${baj.hechos.length} (${lista(baj.hechos)})`);
        if (baj.fallos.length) extra.push(`no pude bajar: ${baj.fallos.join('; ')}`);
      }
      if (subir.length && subidaLista) {
        const sub = await subirArchivos(repo, token, subir);
        if (sub.commit) hizoAlgo = true;
        res.push(sub.commit ? `sub\u00ed ${sub.subidos.length} (${lista(sub.subidos)}) en el commit ${sub.commit.slice(0, 7)}` : 'no sub\u00ed nada');
        if (sub.omitidos.length) extra.push(`no sub\u00ed: ${sub.omitidos.join('; ')}`);
      } else if (subir.length) {
        extra.push(`pendientes de subir ${subir.length} (${lista(subir)}): falta keys/.github-key o el token no tiene escritura en este repo`);
      }
    } catch (e) {
      return { error: `La sincronizaci\u00f3n se detuvo: ${e.message} Lo ya copiado queda; nada se pis\u00f3 en ning\u00fan lado.`, hizoAlgo };
    }
    if (conflictos.length) extra.push(`conflictos sin tocar: ${lista(conflictos)}`);
    const segundos = ((Date.now() - t0) / 1000).toFixed(1);
    res.push(`iguales: ${iguales}`);
    return { cambios: hizoAlgo, conflictos: clave, hayPendiente: extra.length > 0, texto: `Sincronizaci\u00f3n lista en ${segundos} s: ${res.join(', ')}.${extra.length ? ` ${extra.join('. ')}.` : ''}${aviso}` };
  }

  // Orden manual: corre una pasada ya, sin 👍, y contesta en el hilo.
  ctx.comando(/^\s*sincroniz\w*\s+registros?\s*[.!?]*\s*$/i, async (event) => {
    if (enCurso) return decir(event, 'Ya estoy sincronizando registros; espera a que termine.');
    enCurso = true;
    try {
      const r = await pasada();
      await decir(event, r.error || r.texto);
    } catch (e) {
      await decir(event, `No pude sincronizar (${e.message}). No cambi\u00e9 nada.`);
    } finally { enCurso = false; }
  }, { nombre: 'sincronizar registros', delegable: true });

  // Automatica: una pasada poco despues de arrancar y luego cada HUGO_SYNC_MINUTOS (60 por defecto;
  // 0 la apaga). Solo avisa en el canal de avisos cuando algo cambio, hay un conflicto nuevo o un
  // error nuevo; si todo sigue igual, calla. Un error repetido se avisa una vez hasta que se arregle.
  let ultimoAviso = '';
  async function automatica() {
    if (enCurso) return;
    enCurso = true;
    try {
      const r = await pasada();
      let aviso = '';
      if (r.error) aviso = `Sincronizaci\u00f3n autom\u00e1tica de registros: ${r.error}`;
      else if (r.cambios || r.hayPendiente || r.conflictos) aviso = `Sincronizaci\u00f3n autom\u00e1tica de registros. ${r.texto}`;
      const firma = aviso ? aviso.replace(/ en [\d.]+ s/, '').replace(/commit [0-9a-f]{7}/, '') : '';
      const repetido = !r.cambios && firma === ultimoAviso;
      if (aviso && !repetido && ctx.canal) await app.client.chat.postMessage({ token: botToken, channel: ctx.canal, text: aviso });
      ultimoAviso = r.cambios ? '' : firma;
    } catch (e) {
      console.error('Sincronizacion automatica:', e.message);
    } finally { enCurso = false; }
  }
  const minutos = Number(process.env.HUGO_SYNC_MINUTOS ?? ctx.conf.HUGO_SYNC_MINUTOS ?? 60);
  if (Number.isFinite(minutos) && minutos >= 5) {
    ctx.alIniciar(() => {
      setTimeout(automatica, 90 * 1000).unref?.();
      setInterval(automatica, minutos * 60 * 1000).unref?.();
    });
  }
  ctx.pasadaSincronizacion = pasada; ctx.automaticaSincronizacion = automatica; // para pruebas
}
