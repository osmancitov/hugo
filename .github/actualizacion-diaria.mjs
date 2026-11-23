// Puesta al día diaria de Hugo desde GitHub Actions (decisión del usuario, 22-nov-2026):
// la misma vía de «pon al día» con origen diaria y después la pasada de publicación,
// sin la Debian. Disparo: Google Apps Script entre las 00:05 y las 00:14 UTC (margen
// del cierre diario); el cron del flujo queda de respaldo hacia la 01:00 UTC.
// Idempotente por contenido: un día ya cubierto y publicado no produce cambios ni
// commit, y una corrida alcanza los días pendientes si hubo noches sin correr.
// Sin marcas persistentes: el motor valida en disco (este clon) y solo consulta a
// Binance lo que falta; las marcas que escribe (_cobertura y demás) son locales de
// la corrida y no suben: la pasada solo compara velas, indicadores, pre-cálculos y
// catálogo. Reporte: inicio y resultado llegan a Slack por la app oficial de GitHub;
// el detalle queda en el registro de esta corrida.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registrar as registrarVelas } from '../app/modulos/velas.mjs';
import { registrar as registrarSincronizar } from '../app/modulos/sincronizar-registros.mjs';
import { leerEstado } from '../app/modulos/registro-motor.mjs';
import { ultimoCerrado } from '../app/modulos/ciclo-diario.mjs';
import { fetchDatosPublicos } from './datos-publicos-diaria.mjs';
import { eventoDiaria } from './contexto-diaria.mjs';

// Solo esta entrada de Actions cambia de host público. La Debian queda intacta.
globalThis.fetch = fetchDatosPublicos(globalThis.fetch);

const DIA = 86400000;
const RAIZ = process.cwd();
process.env.HUGO_VELAS_DIR = path.join(RAIZ, 'registros', 'velas-24h');
const dirTrabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-diaria-'));
const archivoEstado = path.join(dirTrabajo, 'estado.json');
process.env.HUGO_REGISTRO_ESTADO = archivoEstado;
process.env.HUGO_REPO_SYNC_DIR = path.join(dirTrabajo, 'repo-sync');

const anotar = async (_evento, texto) => { console.log(texto); };
const ctx = {
  conf: {},
  activas: new Map(),
  parada: { n: 0 },
  comando: () => {},
  alIniciar: () => {}, // en la nube no hay pasadas automáticas de arranque
  reporte: { avisador: () => anotar },
  leerClave: (f) => (f === '.github-key' ? (process.env.HUGO_GH_KEY || '') : ''),
  canal: '',
  intradiaInfo: () => ({ ocupado: false }),
};
registrarVelas(ctx);
registrarSincronizar(ctx);

const objetivo = ultimoCerrado(Date.now());
const fecha = new Date(objetivo).toISOString().slice(0, 10);
console.log(`Puesta al día diaria desde Actions: registros hasta el ${fecha}.`);

// 1) Ingesta: la misma vía de «pon al día» de la corrida diaria (origen 'diaria').
await ctx.ponerAlDiaDiaria(eventoDiaria());
const est = leerEstado(archivoEstado);
if (!est || est.estado !== 'terminado') {
  console.error(`El registro quedó ${est ? est.estado : 'sin estado'}${est && est.error ? `: ${est.error}` : ''}. No publico; la próxima corrida lo retoma.`);
  process.exit(1);
}
if (est.hasta < objetivo + DIA) {
  console.error(`El registro terminó pero llega solo al ${new Date(est.hasta - DIA).toISOString().slice(0, 10)} y falta hasta el ${fecha} (parcial). No publico; la próxima corrida lo retoma.`);
  process.exit(1);
}

// 2) Publicación: la pasada completa (indicadores, pre-cálculos, catálogo, comparación y commit).
const r = await ctx.correrPasada(async (t) => console.log(t));
if (r.error) { console.error(`Publicación diaria. ${r.error}`); process.exit(1); }
if (r.detenida) { console.error(`Publicación diaria. ${r.texto}`); process.exit(1); }
console.log(`Publicación diaria. ${r.texto || 'Sin cambios.'}`);
console.log(`Cubierto hasta el ${fecha}.`);
