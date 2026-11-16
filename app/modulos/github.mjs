// Modulo github: "@hugo actualiza github" trae la ultima version del codigo y del manual desde el repositorio
// de GitHub configurado (HUGO_GITHUB=propietario/repo en config.env; publico, sin claves) y la instala con el flujo comun.
// GitHub es la fuente; Hugo solo descarga, nunca sube. Nada cambia sin el pulgar arriba del usuario.
// Pasos: pide a GitHub el ultimo commit de la rama principal -> descarga ese commit exacto a una carpeta temporal fuera de hugo
// -> comprueba que los archivos son normales y que pasan node --check -> compara por CONTENIDO con lo instalado ->
// si no hay diferencias dice que ya esta al dia; si las hay, pregunta (commit, titulo, archivos que cambian) ->
// con 👍 ejecuta un instalador local con copia y reversion (ctx.lanzarInstalacion, el mismo de "actualiza").
// Solo toca app/app.mjs, app/modulos/ y manual/manual-hugo.md. No toca config.env, keys/, historial, package.json ni node_modules.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const ex = promisify(execFile);

const RAMA = 'main';
const base = () => path.join(os.homedir(), '.local', 'share', 'hugo-respaldo');
const hugoDir = () => path.join(os.homedir(), 'Documents', 'hugo');

// Instalador local: se escribe en la carpeta de respaldos y recibe la carpeta descargada y el commit.
const INSTALADOR = String.raw`#!/usr/bin/env bash
# Instala en hugo/app y hugo/manual lo descargado de GitHub. Copia lo anterior y vuelve a ello si algo falla.
set -euo pipefail
SRC="$1"; SHA="$2"
H="$HOME/Documents/hugo"; D="$H/app"; M="$H/manual"
TS=$(date +%Y%m%d-%H%M%S)
R="$HOME/.local/share/hugo-respaldo/$TS"
NODE=$(command -v node || true); [ -n "$NODE" ] || { echo "Falta node."; exit 1; }
[ -f "$D/app.mjs" ] || { echo "No encuentro $D/app.mjs."; exit 1; }
for f in "$SRC/app/app.mjs" "$SRC"/app/modulos/*.mjs; do "$NODE" --check "$f" || { echo "Error de sintaxis en $f; no cambie nada."; exit 1; }; done
mkdir -p "$R/manual"
cp -p "$D/app.mjs" "$R/app.mjs"
[ -d "$D/modulos" ] && cp -rp "$D/modulos" "$R/modulos"
[ -f "$M/manual-hugo.md" ] && cp -p "$M/manual-hugo.md" "$R/manual/manual-hugo.md"
true
revertir() {
  set +e
  cp -p "$R/app.mjs" "$D/app.mjs"
  rm -rf "$D/modulos"; [ -d "$R/modulos" ] && cp -rp "$R/modulos" "$D/modulos"
  if [ -f "$R/manual/manual-hugo.md" ]; then cp -p "$R/manual/manual-hugo.md" "$M/manual-hugo.md"; else rm -f "$M/manual-hugo.md"; fi
  systemctl --user restart hugo.service
  journalctl --user -u hugo.service -n 15 --no-pager 2>/dev/null | sed 's/xox[a-z]-[A-Za-z0-9-]*/[clave]/g'
}
trap 'echo "Fallo durante la actualizacion. Vuelvo a lo anterior."; revertir; exit 1' ERR
cp "$SRC/app/app.mjs" "$D/app.mjs"
rm -rf "$D/modulos"; mkdir -p "$D/modulos"
for f in "$SRC"/app/modulos/*.mjs; do cp "$f" "$D/modulos/$(basename "$f")"; done
mkdir -p "$M"; cp "$SRC/manual/manual-hugo.md" "$M/manual-hugo.md"
echo "Instalado desde GitHub el commit $SHA en $D y $M. Copia de lo anterior: $R"
systemctl --user restart hugo.service
sleep 6
if [ "$(systemctl --user is-active hugo.service)" != "active" ]; then
  echo "Hugo no quedo activo. Vuelvo a lo anterior."
  revertir
  exit 1
fi
trap - ERR
printf '{"commit":"%s","fecha":"%s"}\n' "$SHA" "$(date -u +%FT%TZ)" > "$HOME/.local/share/hugo-respaldo/github-instalado.json"
echo "Hugo reiniciado con el commit $SHA."
`;

const ARCHIVOS_FIJOS = ['app/app.mjs', 'manual/manual-hugo.md'];
const locales = { 'app/app.mjs': () => path.join(hugoDir(), 'app', 'app.mjs'), 'manual/manual-hugo.md': () => path.join(hugoDir(), 'manual', 'manual-hugo.md') };
const rutaLocal = (rel) => (locales[rel] ? locales[rel]() : path.join(hugoDir(), 'app', 'modulos', path.basename(rel)));
const leer = (f) => { try { return fs.readFileSync(f); } catch { return null; } };

// Archivos del repositorio descargado que Hugo instalaria. Rechaza todo lo que no sea archivo normal.
export function archivosDeRepo(raiz) {
  const lista = [...ARCHIVOS_FIJOS];
  const dm = path.join(raiz, 'app', 'modulos');
  let mods = [];
  try { mods = fs.readdirSync(dm).filter((n) => /^[a-z0-9-]+\.mjs$/.test(n)).sort(); } catch {}
  for (const n of mods) lista.push(`app/modulos/${n}`);
  for (const rel of lista) {
    let st; try { st = fs.lstatSync(path.join(raiz, rel)); } catch { throw new Error(`falta ${rel} en el repositorio`); }
    if (!st.isFile() || st.isSymbolicLink()) throw new Error(`${rel} no es un archivo normal`);
  }
  return lista;
}

// Diferencias por contenido entre lo descargado y lo instalado.
export function diferencias(raiz, lista) {
  const dif = [];
  for (const rel of lista) {
    const nuevo = fs.readFileSync(path.join(raiz, rel));
    const actual = leer(rutaLocal(rel));
    if (actual === null) dif.push({ rel, estado: 'nuevo' });
    else if (!actual.equals(nuevo)) dif.push({ rel, estado: 'cambiado' });
  }
  try {
    for (const n of fs.readdirSync(path.join(hugoDir(), 'app', 'modulos'))) {
      if (/\.mjs$/.test(n) && !lista.includes(`app/modulos/${n}`)) dif.push({ rel: `app/modulos/${n}`, estado: 'se borra' });
    }
  } catch {}
  return dif;
}

export function registrar(ctx) {
  const { app, botToken } = ctx;
  const decir = (channel, thread_ts, text) => app.client.chat.postMessage({ token: botToken, channel, thread_ts, text });
  const sinClaves = (t) => String(t).replace(/xox[a-z]-[A-Za-z0-9-]+/g, '[clave]');

  async function api(url, opciones = {}) {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'hugo', Accept: 'application/vnd.github+json' }, ...opciones });
    if (!r.ok) throw new Error(`GitHub respondio ${r.status}`);
    return r;
  }

  // Descarga el ultimo commit y compara por contenido. Devuelve { sha, titulo, tmp, src, dif }; el llamador limpia tmp.
  async function comprobar(repo) {
    let tmp;
    try {
      const c = await (await api(`https://api.github.com/repos/${repo}/commits/${RAMA}`)).json();
      const sha = c.sha, titulo = String(c.commit?.message || '').split('\n')[0].slice(0, 120);
      if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('respuesta sin commit valido');
      fs.mkdirSync(base(), { recursive: true });
      tmp = fs.mkdtempSync(path.join(base(), 'github-'));
      const tgz = path.join(tmp, 'repo.tar.gz');
      const r = await api(`https://codeload.github.com/${repo}/tar.gz/${sha}`);
      fs.writeFileSync(tgz, Buffer.from(await r.arrayBuffer()));
      fs.mkdirSync(path.join(tmp, 'src'));
      await ex('tar', ['-xzf', tgz, '-C', path.join(tmp, 'src'), '--strip-components=1', '--no-same-owner'], { timeout: 30000 });
      const src = path.join(tmp, 'src');
      return { sha, titulo, tmp, src, red: false };
    } catch (e) {
      if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
      const err = new Error(sinClaves(e.message)); err.tmp = null; throw err;
    }
  }
  async function verificar(repo) {
    const r = await comprobar(repo);
    try {
      const lista = archivosDeRepo(r.src);
      for (const rel of lista.filter((x) => x.endsWith('.mjs'))) {
        try { await ex(process.execPath, ['--check', path.join(r.src, rel)], { timeout: 20000 }); }
        catch { throw new Error(`error de sintaxis en ${rel}`); }
      }
      r.lista = lista; r.dif = diferencias(r.src, lista);
      return r;
    } catch (e) {
      fs.rmSync(r.tmp, { recursive: true, force: true });
      const err = new Error(sinClaves(e.message).slice(0, 200)); err.invalido = r.sha; throw err;
    }
  }
  const resumenDe = (dif) => dif.map((d) => `${d.rel.replace(/^app\//, '')} (${d.estado})`).join(', ');

  ctx.comando(/^\s*actualiz\w*(\s+(desde\s+)?github)?\s*$/i, async (event) => {
    const hilo = event.thread_ts || event.ts;
    const repo = process.env.HUGO_GITHUB || ctx.conf.HUGO_GITHUB || '';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return decir(event.channel, hilo, 'Falta HUGO_GITHUB (propietario/repositorio) en config.env; no hago nada.');
    if (ctx.actualizacionEnCurso && await ctx.actualizacionEnCurso()) return decir(event.channel, hilo, 'Ya hay una actualizaci\u00f3n en curso o sin avisar; no empiezo otra.');
    let r;
    try { r = await verificar(repo); }
    catch (e) { return decir(event.channel, hilo, e.invalido ? `El commit ${e.invalido.slice(0, 7)} de GitHub no pasa la comprobaci\u00f3n (${e.message}). No cambi\u00e9 nada.` : `No pude comprobar GitHub (${e.message}). No cambi\u00e9 nada.`); }
    const { sha, titulo, tmp, src, dif } = r;
    if (!dif.length) {
      fs.rmSync(tmp, { recursive: true, force: true });
      return decir(event.channel, hilo, `Hugo ya est\u00e1 al d\u00eda con GitHub (commit ${sha.slice(0, 7)}).`);
    }
    await ctx.confirmar({
      que: 'actualizar desde GitHub', channel: event.channel, thread_ts: hilo, user: ctx.usuario, corta: true,
      texto: `Solicitud.\n\u00bfAplico desde GitHub ${repo} el commit ${sha.slice(0, 7)} \u00ab${titulo}\u00bb? Cambia: ${resumenDe(dif)}.`,
      alSi: async () => {
        try {
          const script = path.join(base(), `instalar-github-${sha.slice(0, 7)}.sh`);
          fs.writeFileSync(script, INSTALADOR, { mode: 0o700 });
          await ctx.lanzarInstalacion({ channel: event.channel, hilo, ruta: script, args: [src, sha.slice(0, 7)], etiqueta: `commit ${sha.slice(0, 7)} de ${repo}`, sha: sha.slice(0, 7), limpiar: tmp });
        } catch (e) {
          fs.rmSync(tmp, { recursive: true, force: true });
          await decir(event.channel, hilo, `No pude lanzar la actualizaci\u00f3n: ${sinClaves(e.message)}. No cambi\u00e9 nada.`);
        }
      },
      alNo: async () => { fs.rmSync(tmp, { recursive: true, force: true }); await decir(event.channel, hilo, 'Sin respuesta: no apliqu\u00e9 nada.'); },
    });
  }, { delegable: true, nombre: 'comprobar GitHub' });

  // Al arrancar (despues del saludo con la fecha): comprueba GitHub y AVISA en el canal si hay cambios. Nunca instala ni reinicia.
  // - Al dia en la primera comprobacion: en silencio. Con cambios: aviso con commit y archivos; aplicar pide el 👍 de siempre.
  // - Sin conexion: 3 intentos cortos; si fallan, un aviso unico («sigo con la version instalada, sin comprobar») y reintentos
  //   a los 2, 10 y 60 minutos. Si despues se puede comprobar: avisa los cambios, o «Comprobado: al dia» si antes avis\u00e9 del fallo.
  const REINTENTOS_MS = (process.env.HUGO_REINTENTOS_GITHUB_MS || '120000,600000,3600000').split(',').map(Number);
  const alArrancar = async () => {
    const repo = process.env.HUGO_GITHUB || ctx.conf.HUGO_GITHUB || '';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return;
    let avisadoFallo = false;
    const aviso = (t) => decir(ctx.canal, undefined, t).catch((e) => console.error('aviso github:', e.data?.error || e.message));
    async function intentar(rapido) {
      if (ctx.actualizacionEnCurso && await ctx.actualizacionEnCurso()) return 'curso';
      let r, ultimo;
      for (let i = 0; i < (rapido ? 3 : 1); i++) {
        try { r = await verificar(repo); break; }
        catch (e) { ultimo = e; if (e.invalido) break; if (rapido && i < 2) await new Promise((x) => setTimeout(x, Number(process.env.HUGO_ESPERA_GITHUB_MS || 4000))); }
      }
      if (!r) {
        if (ultimo?.invalido) { await aviso(`GitHub tiene un commit nuevo (${ultimo.invalido.slice(0, 7)}) que no pasa la comprobaci\u00f3n (${ultimo.message}). Sigo con la versi\u00f3n instalada.`); return 'invalido'; }
        return 'sinred';
      }
      try {
        if (r.dif.length) await aviso(`Hay una actualizaci\u00f3n en GitHub: commit ${r.sha.slice(0, 7)} \u00ab${r.titulo}\u00bb. Cambia: ${resumenDe(r.dif)}. Escribe @Hugo actualiza para aplicarla (te pedir\u00e9 el \u{1F44D}).`);
        else if (avisadoFallo) await aviso(`Comprobado: Hugo est\u00e1 al d\u00eda con GitHub (commit ${r.sha.slice(0, 7)}).`);
      } finally { fs.rmSync(r.tmp, { recursive: true, force: true }); }
      return 'ok';
    }
    const res = await intentar(true);
    if (res !== 'sinred') return;
    await aviso('No pude comprobar GitHub al arrancar. Sigo con la versi\u00f3n instalada, sin dar por comprobada la actualizaci\u00f3n; reintentar\u00e9 en unos minutos.');
    avisadoFallo = true;
    (async () => { for (const ms of REINTENTOS_MS) { await new Promise((x) => setTimeout(x, ms)); if ((await intentar(false)) !== 'sinred') return; } })();
  };
  // No bloquea el arranque ni el saludo: empieza unos segundos despues, en segundo plano.
  ctx.alIniciar(async () => {
    setTimeout(() => { alArrancar().catch((e) => console.error('verificacion github:', e.message)); }, Number(process.env.HUGO_RETRASO_GITHUB_MS || 3000));
  });
}
