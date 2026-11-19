// Modulo sincronizar-registros: "@hugo sincroniza registros" copia el registro de velas entre la
// Debian y el repositorio publico de GitHub (HUGO_GITHUB), en los DOS sentidos y SIN PISAR contenido
// distinto. Los registros son publicos y van al repo por decision del usuario (15-nov-2026).
// Sentidos: lo que solo esta en la Debian sube en UN commit (autor y committer con el correo del
// usuario); lo que solo esta en GitHub baja sin pisar (tmp + enlace duro, como el registro). Lo que
// esta en los dos lados con contenido DISTINTO que no sea una ampliacion estricta es un conflicto: se reporta y no se toca en ningun
// lado. La comparacion es por contenido (la huella sha de blob de git), nunca por nombre ni fecha.
//
// Transporte git agrupado (decision del usuario, 18-nov-2026, notas de voz): nada de subir ni
// bajar archivo por archivo por la REST API ("uno a la vez en una cola enorme"). La pasada trabaja
// sobre un clon local persistente del repo (HUGO_REPO_SYNC_DIR, por defecto
// ~/.local/share/hugo/repo-sync): fetch + reset a origin/main, comparacion y lectura de blobs en
// local, y la subida como UN add + commit + push sin force. Si GitHub avanza entre el fetch y el
// push, el push sale rechazado (non-fast-forward): se re-lee, se rearma la subida sobre lo ultimo
// y se reintenta, acotado; nunca se pisa lo ajeno. Requiere git instalado en la Debian; sin git la
// pasada avisa claro y no toca nada.
// Credencial: keys/.github-key, un token de GitHub que el usuario ya tiene en la Debian. Hugo lo lee
// solo aqui y NUNCA lo imprime ni lo escribe en disco: va por variable de entorno a un script
// GIT_ASKPASS propio cuando git pide credenciales; la URL del remoto no lleva clave. Sin el archivo
// o sin escritura, la bajada funciona igual (el repo es publico) y la subida queda pendiente, avisando.
// Sin confirmacion, dentro de la sincronizacion autorizada. Las series mensuales solo crecen
// cuando todo el prefijo es identico y las velas nuevas ya cerraron en UTC; nunca cambian dias previos. Solo toca rutas registros/velas-24h/<clase>/<ACTIVO>/yymm_ACTIVO (clase: stock o
// cripto, la misma lista que usa el registro); ninguna otra carpeta, en ningun sentido.
// Piso fijo del registro (decision del usuario, 18-nov-2026): nada anterior al 1-ago-2026 se
// sincroniza en NINGUN sentido — los archivos AAMM anteriores ni bajan del repo ni suben de
// la Debian; no entran en la comparacion, igual que los activos excluidos. Asi una pasada
// planeada con un arbol viejo tampoco puede reintroducirlos.
// Recuperacion: el clon es duradero por construccion. Una pasada interrumpida deja copias sin
// publicar en el clon; la siguiente empieza con fetch + reset --hard a origin/main y rearma la
// subida desde cero, asi nada a medio publicar persiste ni se sube dos veces.
// Mudanza unica de lo heredado (una sola vez): los registros de la ruta anterior
// velas-24h/<ACTIVO>/ (solo SPCX, una accion tokenizada) pasan a velas-24h/stock/<ACTIVO>/, con copia verificada por
// contenido antes de quitar el original, y en GitHub como renombrado del mismo contenido. Si algo no coincide, queda todo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CLASES, EXCLUIDOS } from './activos.mjs';
import { retirarExcluidos } from './retirar-eur.mjs';
import { compararSeries, mesDeRuta, validarSerie, publicarSerie } from './registro-serie.mjs';
import { SERIES, PREFIJOS_IND, RUTA_IND, ARCHIVO_IND, leerIndicador, relacionIndicador, escribirIndicador, actualizarIndicadores } from './indicadores.mjs';

const execFileP = promisify(execFile);

const PREFIJO = 'registros/velas-24h';
// AAMM del piso: los nombres de archivo empiezan por el mes (ARCHIVO_OK exige \d{4}_).
const PISO_AAMM = '2608';
const bajoPiso = (nombre) => nombre.slice(0, 4) < PISO_AAMM;
// La forma del codigo es la de activos.mjs (CODIGO_OK): hay criptos de una letra y con nombre Unicode.
const RUTA_OK = new RegExp(`^registros/velas-24h/(?:${CLASES.join('|')})/[\\p{L}\\p{N}]{1,15}/\\d{4}_[\\p{L}\\p{N}]{1,15}$`, 'u');
const RUTA_HEREDADA = /^registros\/velas-24h\/([A-Z0-9]{2,15})\/(\d{4}_\1)$/; // ruta anterior, sin clase (solo ASCII: lo heredado era stock)
const CLASE_HEREDADA = 'stock';
const ARCHIVO_OK = /^\d{4}_[\p{L}\p{N}]{1,15}$/u;
const ACTIVO_OK = /^[\p{L}\p{N}]{1,15}$/u;
const MAX_BYTES = 5 * 1024 * 1024; // un registro mensual pesa KB; algo mayor es un error a revisar a mano
const RAMA = 'main';
const INTENTOS_PUSH = 3; // non-fast-forward: re-leer y rearmar, acotado

// Huella de blob de git del contenido local: asi se compara con el arbol del repo sin bajarlo.
const shaBlob = (buf) => crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`, 'latin1'), buf])).digest('hex');

// Costura de pruebas: sustituye el paso de indicadores de la pasada; en producción no se fija
// y el paso es actualizarIndicador real. Cada archivo de pruebas corre en su propio proceso.
let pasoIndicador = null;
export function fijarPasoIndicador(fn) { pasoIndicador = fn; }

export function registrar(ctx) {
  const { app, botToken } = ctx;
  const dirBase = () => process.env.HUGO_VELAS_DIR || ctx.conf.HUGO_VELAS_DIR || path.join(os.homedir(), 'Documents', 'hugo', 'registros', 'velas-24h');
  // Indicadores: una carpeta hermana de velas-24h por serie, registros/<serie>/ (19-nov-2026).
  const dirInd = (serie) => path.join(path.dirname(dirBase()), serie);
  const serieDe = (rel) => rel.split('/')[1];
  const pasoInd = () => (pasoIndicador || actualizarIndicadores)({ dirRaiz: path.dirname(dirBase()) });
  const clonDir = () => process.env.HUGO_REPO_SYNC_DIR || ctx.conf.HUGO_REPO_SYNC_DIR || path.join(os.homedir(), '.local', 'share', 'hugo', 'repo-sync');
  const urlRepo = (repo) => process.env.HUGO_REPO_SYNC_URL || ctx.conf.HUGO_REPO_SYNC_URL || `https://x-access-token@github.com/${repo}.git`;
  const limpiarExcluidos = () => retirarExcluidos(dirBase(), process.env.HUGO_GRAFICAS_DIR || ctx.conf.HUGO_GRAFICAS_DIR || path.join(path.dirname(path.dirname(dirBase())), 'graficas', 'velas-24h'));
  ctx.alIniciar(async () => {
    try {
      const n = limpiarExcluidos();
      if (n) await app.client.chat.postMessage({ token: botToken, channel: ctx.canal, text: `Activos excluidos retirados del equipo: ${n} archivo(s) borrados. La sincronizacion los excluye en ambos sentidos.` });
    } catch {
      await app.client.chat.postMessage({ token: botToken, channel: ctx.canal, text: 'No pude completar la retirada local de activos excluidos; hay archivos o carpetas que requieren revision. Siguen excluidos de la sincronizacion.' });
    }
  });
  const decir = (event, text) => app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: event.thread_ts || event.ts, text });
  let enCurso = false;

  // --- Transporte git local ---
  // El token viaja SOLO por entorno al script askpass; jamas en la linea de comandos, la URL o el disco.
  const rutaAskpass = () => path.join(path.dirname(clonDir()), 'hugo-git-askpass.sh');
  function asegurarAskpass() {
    try {
      fs.mkdirSync(path.dirname(rutaAskpass()), { recursive: true, mode: 0o700 });
      fs.writeFileSync(rutaAskpass(), '#!/bin/sh\nprintf %s "$HUGO_GH_TOKEN"\n', { mode: 0o700 });
    } catch (e) { console.error('No pude preparar el askpass de git:', e.message); }
  }
  async function git(args, { token = '', cwd, buffer = false } = {}) {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    if (token) { asegurarAskpass(); env.GIT_ASKPASS = rutaAskpass(); env.HUGO_GH_TOKEN = token; }
    try {
      const r = await execFileP('git', args, { cwd: cwd ?? clonDir(), env, maxBuffer: 64 * 1024 * 1024, timeout: 300000, ...(buffer ? { encoding: 'buffer' } : {}) });
      return r.stdout;
    } catch (e) {
      const salida = `${e.stderr || ''} ${e.message || ''}`;
      if (/403|permission denied|authentication failed|could not read username|invalid username|not permitted/i.test(salida)) { const x = new Error('el token no tiene escritura en este repo o falta'); x.sinPermiso = true; throw x; }
      e.salidaGit = salida.slice(0, 400);
      e.errorGit = String(e.stderr || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      throw e;
    }
  }
  let gitComprobado = false;
  async function hayGit() {
    if (gitComprobado) return true;
    try { await execFileP('git', ['--version'], { timeout: 15000 }); gitComprobado = true; return true; } catch { return false; }
  }
  async function asegurarClon(repo, token) {
    const dir = clonDir(), url = urlRepo(repo);
    if (!fs.existsSync(path.join(dir, '.git'))) {
      fs.mkdirSync(path.dirname(dir), { recursive: true, mode: 0o700 });
      await git(['clone', '--quiet', '--single-branch', '--branch', RAMA, url, dir], { token, cwd: path.dirname(dir) });
    } else {
      const actual = String(await git(['remote', 'get-url', 'origin'])).trim();
      if (actual !== url) await git(['remote', 'set-url', 'origin', url]);
    }
  }
  // Deja el clon en la punta de origin/main: descarta cualquier resto de una pasada interrumpida.
  async function traerPunta(token) {
    await git(['fetch', '--quiet', '--prune', 'origin'], { token });
    await git(['reset', '--hard', '--quiet', `origin/${RAMA}`]);
  }
  async function commitGit(mensaje) {
    const autor = ['-c', 'user.name=Osmancito', '-c', 'user.email=osmanvielma@gmail.com'];
    await git([...autor, 'commit', '--quiet', '-m', mensaje]);
    return String(await git(['rev-parse', 'HEAD'])).trim();
  }

  // Arbol del repo (ruta -> sha de blob), leido del clon local tras traerPunta: sin red.
  async function remotos() {
    const salida = String(await git(['-c', 'core.quotePath=false', 'ls-tree', '-r', `origin/${RAMA}`]));
    const mapa = new Map(), blobs = new Map();
    const heredados = [];
    for (const linea of salida.split('\n')) {
      if (!linea) continue;
      const m = /^\d+ blob ([0-9a-f]{40})\t(.+)$/.exec(linea);
      if (!m) continue;
      const [, sha, p] = m;
      const nombre = p.slice(p.lastIndexOf('/') + 1);
      if (bajoPiso(nombre)) continue; // piso fijo: lo anterior a ago-2026 no baja ni se muda
      if (RUTA_OK.test(p) && !(p.split('/')[2] === 'cripto' && EXCLUIDOS.has(p.split('/')[3]))) { mapa.set(p, sha); blobs.set(p, sha); }
      else if (RUTA_IND.test(p)) { mapa.set(p, sha); blobs.set(p, sha); } // indicadores: misma comparación por huella
      else if (RUTA_HEREDADA.test(p)) { heredados.push(p); blobs.set(p, sha); } // ruta anterior sin clase: no se sincroniza, solo se muda
    }
    return { mapa, heredados, blobs };
  }
  // Lee un blob del clon por su huella: contenido exacto, sin depender del checkout.
  async function leerBlob(sha) {
    const buf = await git(['cat-file', 'blob', sha], { buffer: true });
    if (!buf.length || buf.length > MAX_BYTES || shaBlob(buf) !== sha) throw Error('El blob remoto no tiene el contenido o tamano esperado.');
    return buf;
  }

  // Archivos locales del registro: [{ rel, ruta, bytes }], solo nombres con la forma acordada.
  function locales() {
    const lista = [];
    for (const clase of CLASES) {
      let activos = [];
      try { activos = fs.readdirSync(path.join(dirBase(), clase)); } catch { continue; }
      for (const a of activos) {
        if (!ACTIVO_OK.test(a) || (clase === 'cripto' && EXCLUIDOS.has(a))) continue;
        let nombres = [];
        try { nombres = fs.readdirSync(path.join(dirBase(), clase, a)); } catch { continue; }
        for (const n of nombres) {
          if (!ARCHIVO_OK.test(n) || bajoPiso(n)) continue;
          const ruta = path.join(dirBase(), clase, a, n);
          let st;
          try { st = fs.lstatSync(ruta); } catch { continue; }
          if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) continue;
          lista.push({ rel: `${PREFIJO}/${clase}/${a}/${n}`, ruta, bytes: st.size });
        }
      }
    }
    // Indicadores (19-nov-2026): archivos mensuales bajo la carpeta hermana de cada serie.
    for (const s of SERIES) {
      let inds = [];
      try { inds = fs.readdirSync(dirInd(s.serie)); } catch { inds = []; }
      for (const n of inds) {
        if (!ARCHIVO_IND.test(n) || bajoPiso(n)) continue;
        const ruta = path.join(dirInd(s.serie), n);
        let st;
        try { st = fs.lstatSync(ruta); } catch { continue; }
        if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) continue;
        lista.push({ rel: `registros/${s.serie}/${n}`, ruta, bytes: st.size });
      }
    }
    return lista;
  }

  const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

  // Mudanza local de lo heredado: velas-24h/<ACTIVO>/yymm_ACTIVO -> velas-24h/stock/<ACTIVO>/yymm_ACTIVO.
  // Solo COPIA: a un temporal, comprueba por sha256 que es identica y la enlaza sin pisar. El original NO se quita aqui:
  // lo quita retirarLocalHeredado() despues de releer el repo y ver la ruta nueva identica y la vieja ya ausente.
  // Si el destino ya existe con otro contenido, no toca ninguno de los dos y lo reporta.
  function mudarLocalHeredado() {
    const movidos = [], conflictos = [], fallos = [];
    let activos = [];
    try { activos = fs.readdirSync(dirBase()); } catch { return { movidos, conflictos, fallos }; }
    for (const a of activos) {
      if (!ACTIVO_OK.test(a)) continue; // las carpetas de clase (stock/cripto) tambien pasan el patron: sus hijas son carpetas de activo, no archivos mensuales, y se saltan solas
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
            if (sha256(fs.readFileSync(destino)) === sha256(buf)) movidos.push(rel); else conflictos.push(rel);
            continue;
          }
          fs.mkdirSync(path.dirname(destino), { recursive: true });
          const tmp = `${destino}.tmp-${process.pid}`;
          fs.writeFileSync(tmp, buf);
          if (sha256(fs.readFileSync(tmp)) !== sha256(buf)) { fs.rmSync(tmp, { force: true }); throw new Error('la copia no coincide'); }
          fs.linkSync(tmp, destino); // falla si ya existe: nunca pisa
          fs.rmSync(tmp, { force: true });
          if (sha256(fs.readFileSync(destino)) !== sha256(buf)) throw new Error('el destino no coincide; dejo el original');
          movidos.push(rel);
        } catch (e) { fallos.push(`${rel}: ${e.message}`.slice(0, 160)); }
      }
    }
    return { movidos, conflictos, fallos };
  }

  // Quita los originales locales heredados SOLO si, con una lectura del repo posterior a todo cambio remoto, la ruta nueva
  // existe con la misma huella que la copia local, la ruta vieja ya no esta en el repo y la copia local sigue identica al original.
  // Cualquier duda (sin lectura, sin copia remota, vieja aun en el repo) conserva el original.
  function retirarLocalHeredado(visto, heredadosRemotos) {
    const retirados = [], conservados = [];
    let activos = []; try { activos = fs.readdirSync(dirBase()); } catch { return { retirados, conservados }; }
    for (const a of activos) {
      if (!ACTIVO_OK.test(a)) continue;
      const dirViejo = path.join(dirBase(), a);
      let nombres = []; try { if (!fs.lstatSync(dirViejo).isDirectory()) continue; nombres = fs.readdirSync(dirViejo); } catch { continue; }
      for (const n of nombres) {
        if (!ARCHIVO_OK.test(n)) continue;
        const rel = `${a}/${n}`, viejo = path.join(dirViejo, n), destino = path.join(dirBase(), CLASE_HEREDADA, a, n);
        try {
          const bv = fs.readFileSync(viejo), bd = fs.readFileSync(destino);
          const relNuevo = `${PREFIJO}/${CLASE_HEREDADA}/${a}/${n}`;
          const ok = sha256(bv) === sha256(bd) && visto && visto.get(relNuevo) === shaBlob(bd)
            && !heredadosRemotos.includes(`${PREFIJO}/${rel}`);
          if (ok) { fs.rmSync(viejo); retirados.push(rel); } else conservados.push(rel);
        } catch { conservados.push(rel); }
      }
      try { fs.rmdirSync(dirViejo); } catch { /* aun con archivos: no se borra */ }
    }
    return { retirados, conservados };
  }

  // Renombra en el repo lo heredado a la ruta con clase, en UN commit, sin subir contenido: el blob es el mismo (misma huella),
  // asi que el contenido movido es identico por construccion. Solo mueve lo que la Debian ya tiene identico en la ruta nueva;
  // si el destino remoto existe con otro contenido, o no hay copia local identica, no lo toca y lo reporta.
  async function mudarRemotoHeredado(token) {
    const { blobs, heredados } = await remotos();
    const viejos = [...heredados].sort();
    if (!viejos.length) return { movidos: [], pendientes: [] };
    const movidos = [], pendientes = [];
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
      if (shaNuevo === undefined) await git(['mv', viejo, nuevo]);
      else await git(['rm', '--quiet', viejo]); // el destino ya existe identico: basta quitar la ruta vieja
      movidos.push(corto);
    }
    if (!movidos.length) return { movidos, pendientes };
    const commit = await commitGit(`Registros de velas: mudanza a ${CLASE_HEREDADA}/ (${movidos.join(', ')})`);
    await git(['push', 'origin', `HEAD:${RAMA}`], { token }); // sin force: un avance ajeno se rechaza y se reporta
    return { movidos, pendientes, commit };
  }

  function relacion(local, remoto, rel) {
    return compararSeries(JSON.parse(local), JSON.parse(remoto), mesDeRuta(rel));
  }
  async function planear() {
    const { mapa, heredados } = await remotos();
    const subir = [], bajar = [], conflictos = [];
    const visto = new Map(mapa);
    let iguales = 0;
    for (const f of locales()) {
      const shaRemota = mapa.get(f.rel);
      if (shaRemota === undefined) { subir.push(f); continue; }
      const local = fs.readFileSync(f.ruta);
      if (shaBlob(local) === shaRemota) iguales++;
      else {
        const remoto = await leerBlob(shaRemota);
        try {
          const modo = RUTA_IND.test(f.rel) ? relacionIndicador(leerIndicador(local), leerIndicador(remoto)) : relacion(local, remoto, f.rel);
          if (modo === 'ampliar') bajar.push({ rel: f.rel, sha: shaRemota });
          else if (modo === 'conservar') subir.push(f);
          else iguales++;
        } catch { conflictos.push(f.rel); }
      }
      mapa.delete(f.rel);
    }
    for (const [rel, sha] of mapa) bajar.push({ rel, sha });
    subir.sort((a, b) => a.rel.localeCompare(b.rel));
    bajar.sort((a, b) => a.rel.localeCompare(b.rel));
    conflictos.sort();
    return { subir, bajar, iguales, conflictos, heredados, visto };
  }

  const corta = (rel) => RUTA_IND.test(rel) ? rel.split('/').pop() : rel.replace(`${PREFIJO}/`, '');
  const cortas = (l) => l.map((x) => corta(typeof x === 'string' ? x : x.rel));
  const lista = (l) => { const c = cortas(l); return c.length > 12 ? `${c.slice(0, 12).join(', ')} y ${c.length - 12} mas` : c.join(', '); };

  // Baja sin pisar: tmp + enlace duro, el mismo criterio que el registro de velas.
  async function bajarArchivos(bajar, progreso = async () => {}, verificar = () => {}) {
    const hechos = [], fallos = [];
    for (const b of bajar) {
      verificar();
      try {
        const buf = await leerBlob(b.sha);
        const esInd = RUTA_IND.test(b.rel);
        const destino = esInd ? path.join(dirInd(serieDe(b.rel)), b.rel.split('/').pop()) : path.join(dirBase(), b.rel.slice(PREFIJO.length + 1));
        if (esInd ? !leerIndicador(buf).length : !validarSerie(JSON.parse(buf), mesDeRuta(b.rel)).length) throw Error('No sincronizo un archivo mensual vacio.');
        if (fs.existsSync(destino)) {
          if (!fs.lstatSync(destino).isFile()) throw Error('El destino no es un archivo normal.');
          const previo = fs.readFileSync(destino);
          const modo = esInd ? relacionIndicador(leerIndicador(previo), leerIndicador(buf)) : relacion(previo, buf, b.rel);
          if (modo === 'ampliar') { if (esInd) escribirIndicador(destino, leerIndicador(buf)); else publicarSerie(destino, buf, previo); }
          else continue; // iguales o la Debian tiene una extension mayor: nunca recortar
        } else if (esInd) escribirIndicador(destino, leerIndicador(buf)); else publicarSerie(destino, buf);
        hechos.push(b.rel);
        await progreso(`Descarga: ${hechos.length}/${bajar.length} archivo(s) copiados.`);
      } catch (e) { fallos.push(`${b.rel.replace(`${PREFIJO}/`, '')}: ${e.message}`.slice(0, 160)); }
    }
    return { hechos, fallos };
  }

  // Sube en UN solo commit desde el clon: copia los archivos al arbol de trabajo, add, commit y push
  // sin force. Si la rama avanzo entre el fetch y el push (non-fast-forward), re-lee la punta,
  // rearma la subida sobre lo ultimo (lo que mientras tanto aparezca con contenido distinto se omite
  // y se reporta: del plan a la ejecucion nunca se pisa) y reintenta, acotado a INTENTOS_PUSH.
  async function subirArchivos(token, subir, progreso = async () => {}, verificar = () => {}) {
    verificar();
    const omitidos = [];
    for (let intento = 1; intento <= INTENTOS_PUSH; intento++) {
      if (intento > 1) {
        await traerPunta(token);
        await progreso(`GitHub avanzo mientras subia; rearmo la subida sobre lo ultimo (intento ${intento} de ${INTENTOS_PUSH}).`);
      }
      const { mapa: actuales } = await remotos();
      const items = [];
      omitidos.length = 0;
      for (const f of subir) {
        verificar();
        const buf = fs.readFileSync(f.ruta);
        const shaLocal = shaBlob(buf);
        const shaRemota = actuales.get(f.rel);
        if (shaRemota === shaLocal) continue; // ya esta igual
        try {
          const esInd = RUTA_IND.test(f.rel);
          if (esInd ? !leerIndicador(buf).length : !validarSerie(JSON.parse(buf), mesDeRuta(f.rel)).length) throw Error('No sincronizo un archivo mensual vacio.');
          if (shaRemota !== undefined) {
            const remoto = await leerBlob(shaRemota);
            const modo = esInd ? relacionIndicador(leerIndicador(remoto), leerIndicador(buf)) : relacion(remoto, buf, f.rel);
            if (modo !== 'ampliar') continue; // remoto igual o mayor: no recortar
          }
        } catch (e) { omitidos.push(`${corta(f.rel)}: ${e.message}`); continue; }
        const destino = path.join(clonDir(), f.rel);
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, buf);
        items.push(f.rel);
        await progreso(`Subida: ${items.length}/${subir.length} archivo(s) copiados al clon; aun sin publicar el commit.`);
      }
      if (!items.length) return { commit: null, subidos: [], omitidos };
      verificar(); // frena antes de publicar el commit: copias en el clon no cuentan como subida
      await progreso(`Publicando commit con ${items.length} archivo(s); falta confirmar la rama.`);
      await git(['add', '--', ...items]);
      const pendiente = String(await git(['status', '--porcelain', '--', ...items])).trim();
      if (!pendiente) return { commit: null, subidos: [], omitidos }; // el arbol ya tenia ese contenido
      const velas = items.filter((i) => !RUTA_IND.test(i)).map((i) => i.replace(`${PREFIJO}/`, ''));
      const partes = [];
      if (velas.length) partes.push(`Registros de velas: ${velas.join(', ')}`);
      for (const s of SERIES) {
        const meses = items.filter((i) => i.startsWith(`registros/${s.serie}/`)).map((i) => i.split('/').pop());
        if (meses.length) partes.push(`Indicadores ${s.serie}: ${meses.join(', ')}`);
      }
      const mensaje = partes.join(' · ');
      const sha = await commitGit(mensaje);
      try {
        await git(['push', 'origin', `HEAD:${RAMA}`], { token }); // sin force: un avance ajeno se rechaza
      } catch (e) {
        if (e.sinPermiso) throw e;
        if (intento < INTENTOS_PUSH && /non-fast-forward|fetch first|stale info|\[rejected\]/i.test(e.salidaGit || '')) continue;
        throw e;
      }
      return { commit: sha, subidos: items, omitidos };
    }
    throw new Error(`GitHub siguio avanzando durante ${INTENTOS_PUSH} intentos de publicar; no subi nada. La proxima pasada lo reintenta.`);
  }

  // Una pasada completa: compara, baja y sube sin pisar, y devuelve un resumen. SIN confirmacion por
  // pasada: mantiene la sincronizacion automatica configurada. No se
  // cambian dias ya registrados; solo se incorporan ampliaciones estrictas. Los conflictos no se tocan.
  async function pasada(progreso = async () => {}, { ind } = {}) {
    try { limpiarExcluidos(); } catch { return { error: 'Retirada local de EUR pendiente de revision; no inicio la sincronizacion.' }; }
    const repo = process.env.HUGO_GITHUB || ctx.conf.HUGO_GITHUB || '';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { error: 'Falta HUGO_GITHUB (propietario/repositorio) en config.env; no hago nada.' };
    if (!(await hayGit())) return { error: 'La sincronizacion ahora trabaja con git y no lo encuentro instalado en este equipo (paquete git). No cambie nada; instalalo y repite.' };
    // stop o restart suben ctx.parada.n: la pasada frena entre archivos; lo ya copiado queda y nada se pisa.
    const parada = ctx.parada || { n: 0 };
    const marcaParada = parada.n;
    const verificar = () => { if (parada.n !== marcaParada) { const e = new Error('a pedido (stop o restart)'); e.detenida = true; throw e; } };
    const token = ctx.leerClave('.github-key');
    // Mudanza de lo heredado (ver la cabecera): primero la Debian, luego el repo. Idempotente: sin heredados no hace nada.
    const previo = [];
    let mudo = false;
    // Indicadores (decisión del usuario, 19-nov-2026): la pasada actualiza primero el histórico
    // propio de cada serie; los archivos tocados entran en la comparación de abajo y se suben en
    // el mismo commit. Un fallo de una fuente no detiene a las demás ni a las velas: se avisa.
    if (ind) {
      try {
        const rInd = await ind();
        for (const s of (rInd.series || [])) {
          if (s.error) previo.push(`indicador ${s.etiqueta} sin actualizar (${s.error}); sigo con las velas`);
          else if (s.nuevos) { const u = s.dias[s.dias.length - 1]; previo.push(`indicador ${s.etiqueta}: ${s.nuevos} día(s) nuevo(s), último ${u.fecha} con valor ${u.valor}`); }
        }
      } catch (e) { previo.push(`indicadores sin actualizar (${e.message}); sigo con las velas`); }
    }
    const mud = mudarLocalHeredado();
    if (mud.movidos.length) { mudo = true; previo.push(`copi\u00e9 ${mud.movidos.length} registro(s) heredados a ${CLASE_HEREDADA}/ en la Debian (${mud.movidos.join(', ')}), verificados por contenido; los originales siguen hasta ver GitHub`); }
    if (mud.conflictos.length) previo.push(`heredados sin mover (el destino existe con otro contenido): ${mud.conflictos.join(', ')}`);
    if (mud.fallos.length) previo.push(`no pude mudar: ${mud.fallos.join('; ')}`);
    let plan;
    try {
      await asegurarClon(repo, token);
      await traerPunta(token);
      plan = await planear();
      if (plan.heredados.length) {
        if (token) {
          const r = await mudarRemotoHeredado(token);
          if (r.movidos.length) { mudo = true; previo.push(`renombr\u00e9 en GitHub ${r.movidos.length} registro(s) heredados a ${CLASE_HEREDADA}/ (${r.movidos.join(', ')}) en el commit ${r.commit.slice(0, 7)}, mismo contenido`); }
          if (r.pendientes.length) previo.push(`heredados en GitHub sin tocar: ${r.pendientes.join('; ')}`);
          await traerPunta(token);
          plan = await planear();
        } else previo.push(`hay ${plan.heredados.length} registro(s) heredados en GitHub por mudar, pero falta keys/.github-key`);
      }
      const ret = retirarLocalHeredado(plan.visto, plan.heredados);
      if (ret.retirados.length) { mudo = true; previo.push(`quit\u00e9 los originales de la ruta anterior en la Debian (${ret.retirados.join(', ')}) tras releer GitHub: ruta nueva id\u00e9ntica y ruta vieja ausente`); }
      if (ret.conservados.length) previo.push(`originales conservados (GitHub aun no confirma la ruta nueva): ${ret.conservados.join(', ')}`);
      verificar();
    } catch (e) {
      if (e.detenida) return { detenida: true, hizoAlgo: mudo, texto: `Sincronizaci\u00f3n detenida a pedido durante la comparaci\u00f3n. No cambi\u00e9 nada m\u00e1s; la pr\u00f3xima pasada retoma lo que falte.${previo.length ? ` ${previo.join('. ')}.` : ''}` };
      const detalle=(e.errorGit||'').split(token||'\u0000').join('***');
      return { error: `No pude comparar con GitHub (${e.message}).${detalle?` Detalle git: ${detalle}.`:''} No cambi\u00e9 nada m\u00e1s.${previo.length ? ` ${previo.join('. ')}.` : ''}`, hizoAlgo: mudo };
    }
    const { subir, bajar, iguales, conflictos } = plan;
    await progreso(`Comparacion lista: ${subir.length} por subir, ${bajar.length} por bajar, ${iguales} iguales, ${conflictos.length} conflictos sin tocar.`);
    const aviso = previo.length ? ` ${previo.join('. ')}.` : '';
    const notaConflicto = conflictos.length ? ` Conflicto${conflictos.length > 1 ? 's' : ''} sin tocar (mismo mes, contenido distinto): ${lista(conflictos)}.` : '';
    const clave = conflictos.join(',');
    if (!subir.length && !bajar.length) return { cambios: mudo, hayPendiente: previo.length > 0 && !mudo, conflictos: clave, texto: `Registros ya sincronizados con ${repo}: ${iguales} archivo(s) iguales.${notaConflicto}${aviso}` };
    const subidaLista = subir.length > 0 && !!token;
    const t0 = Date.now();
    const res = [], extra = [];
    let hizoAlgo = mudo;
    try {
      if (bajar.length) {
        const baj = await bajarArchivos(bajar, progreso, verificar);
        if (baj.hechos.length) hizoAlgo = true;
        res.push(`baj\u00e9 ${baj.hechos.length} (${lista(baj.hechos)})`);
        if (baj.fallos.length) extra.push(`no pude bajar: ${baj.fallos.join('; ')}`);
      }
      if (subir.length && subidaLista) {
        try {
          const sub = await subirArchivos(token, subir, progreso, verificar);
          if (sub.commit) hizoAlgo = true;
          res.push(sub.commit ? `sub\u00ed ${sub.subidos.length} (${lista(sub.subidos)}) en el commit ${sub.commit.slice(0, 7)}` : 'no sub\u00ed nada');
          if (sub.omitidos.length) extra.push(`no sub\u00ed: ${sub.omitidos.join('; ')}`);
        } catch (e) {
          if (e.sinPermiso) extra.push(`pendientes de subir ${subir.length} (${lista(subir)}): el token de keys/.github-key no tiene escritura en este repo`);
          else throw e;
        }
      } else if (subir.length) {
        extra.push(`pendientes de subir ${subir.length} (${lista(subir)}): falta keys/.github-key o el token no tiene escritura en este repo`);
      }
    } catch (e) {
      if (e.detenida) return { detenida: true, hizoAlgo, texto: 'Sincronizaci\u00f3n detenida a pedido. Lo ya copiado queda y nada se pis\u00f3 en ning\u00fan lado; la pr\u00f3xima pasada retoma lo que falte.' };
      const detalle=(e.errorGit||'').split(token||'\u0000').join('***');
      return { error: `La sincronizaci\u00f3n se detuvo: ${e.message}${detalle?` (detalle git: ${detalle})`:''} Lo ya copiado queda; nada se pis\u00f3 en ning\u00fan lado.`, hizoAlgo };
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
    ctx.activas.set('sincronizacion', { que: 'sincronizar registros', desde: Date.now(), largo: true });
    let reporte;
    try {
      reporte=await ctx.reporte.crearSync({event});
      const r = await pasada(reporte.progreso, { ind: pasoInd });
      await reporte.final(r.error || r.texto);
    } catch (e) {
      const texto=`La sincronizacion se detuvo o no pude informar su resultado: ${e.message}. Lo ya copiado se conserva; revisa el estado antes de repetir.`;
      try {if(reporte)await reporte.final(texto);else await decir(event,texto);}catch(err){console.error('No pude informar sincronizacion:',err.message);}
    } finally { enCurso = false; ctx.activas.delete('sincronizacion'); }
  }, { nombre: 'sincronizar registros', delegable: true });

  // Automatica: una pasada poco despues de arrancar y luego cada HUGO_SYNC_MINUTOS (60 por defecto;
  // 0 la apaga). Cuando hay trabajo real (archivos por subir o bajar), abre un solo mensaje en el
  // canal de avisos y lo va editando con el avance y el resultado, como el reporte manual. Cada
  // pasada anuncia «comprobando GitHub» al empezar y cierra con el resultado, aunque no haya nada
  // que copiar (decision del usuario, 18-nov-2026: el silencio no permite saber si arranco). Si el
  // reporte no pudo abrirse, el error repetido se avisa una vez hasta que se arregle.
  // Un fallo del propio reporte nunca interrumpe la copia.
  let ultimoAviso = '';
  async function automatica() {
    if (enCurso) return;
    enCurso = true;
    ctx.activas.set('sincronizacion', { que: 'sincronizar registros (autom\u00e1tica)', desde: Date.now(), largo: true });
    try {
      // Un solo mensaje que se va editando con el avance; se renueva con prudencia (mas o menos
      // uno por minuto mientras hay avance) para no editar el mismo mensaje toda la pasada ni
      // llenar el canal, y el ultimo queda editado con el resultado final. Cuando el ritmo de la
      // fase permite estimarlo, el avance muestra el tiempo restante aproximado (no es promesa).
      let reporte = null, ociosa = false, abiertoEn = 0, fase = '', faseInicio = 0, faseBase = 0, padre = null;
      const abrirReporte = async (texto) => {
        if (!padre) {
          padre = await ctx.reporte.hilo({ canal: ctx.canal, texto: 'Sincronizaci\u00f3n autom\u00e1tica de registros: comprobando GitHub; reporto el resultado en este hilo.' });
        }
        reporte = await ctx.reporte.crearSync({ canal: ctx.canal, hilo: padre, inicio: `Sincronizaci\u00f3n autom\u00e1tica de registros en curso. ${texto}` });
        abiertoEn = Date.now();
      };
      const conEstimacion = (texto) => {
        const m = texto.match(/^(Subida|Descarga): (\d+)\/(\d+) /);
        if (!m) return texto;
        const hechos = Number(m[2]), total = Number(m[3]);
        const ahora = Date.now();
        if (m[1] !== fase) { fase = m[1]; faseInicio = ahora; faseBase = hechos; return texto; }
        const trans = (ahora - faseInicio) / 1000, avanzados = hechos - faseBase;
        if (avanzados < 1 || trans < 10 || hechos >= total) return texto;
        const min = Math.max(1, Math.round((total - hechos) * trans / avanzados / 60));
        return `${texto} Quedan aprox. ${min} min.`;
      };
      const progreso = async (texto) => {
        try {
          if (ociosa) return;
          if (!reporte) {
            if (!ctx.canal) { ociosa = true; return; }
            await abrirReporte(texto);
            return;
          }
          const conEst = conEstimacion(texto);
          if (Date.now() - abiertoEn >= 60000) {
            await reporte.final(`Sincronizaci\u00f3n autom\u00e1tica de registros en curso. ${conEst}`);
            await abrirReporte(conEst);
            return;
          }
          await reporte.progreso(conEst);
        } catch (e) { console.error('Reporte de sincronizacion automatica:', e.message); reporte = null; }
      };
      // Aviso ANTES de clonar y comparar: sin esta señal no se distingue «en curso» de «no arranco».
      if (ctx.canal) {
        try { await abrirReporte('Comprobando GitHub\u2026'); }
        catch (e) { console.error('Reporte de sincronizacion automatica:', e.message); reporte = null; }
      }
      const r = await pasada(progreso, { ind: pasoInd });
      let aviso = '';
      if (r.error) aviso = `Sincronizaci\u00f3n autom\u00e1tica de registros: ${r.error}`;
      else if (r.detenida) aviso = `Sincronizaci\u00f3n autom\u00e1tica de registros detenida a pedido. Lo ya copiado queda; la pr\u00f3xima pasada retoma lo que falte.`;
      else if (r.cambios || r.hayPendiente || r.conflictos) aviso = `Sincronizaci\u00f3n autom\u00e1tica de registros. ${r.texto}`;
      if (reporte) {
        try { await reporte.final(aviso || `Sincronizaci\u00f3n autom\u00e1tica de registros: sin cambios; todo sigue igual.`); } catch (e) { console.error('Reporte de sincronizacion automatica:', e.message); }
        ultimoAviso = '';
      } else {
        const firma = aviso ? aviso.replace(/ en [\d.]+ s/, '').replace(/commit [0-9a-f]{7}/, '') : '';
        const repetido = !r.cambios && firma === ultimoAviso;
        if (aviso && !repetido && ctx.canal) await app.client.chat.postMessage({ token: botToken, channel: ctx.canal, text: aviso });
        ultimoAviso = r.cambios ? '' : firma;
      }
    } catch (e) {
      console.error('Sincronizacion automatica:', e.message);
    } finally { enCurso = false; ctx.activas.delete('sincronizacion'); }
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
