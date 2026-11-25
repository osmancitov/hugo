// Publica el visor desde la diaria y comprueba el RESULTADO, no solo que se pidió (HTTP 204).
// Pide pages.yml, espera la conclusión de esa corrida y, si falla o no termina a tiempo (p. ej. un
// despliegue atascado en cola, que el reintento interno de pages.yml no resuelve), pide UNA corrida
// nueva. Pages solo publica lo que ya está en main: repetirlo no repite ningún registro de datos.
// Si la segunda corrida tampoco sale bien, falla a la vista (sin bucles).
import { pathToFileURL } from 'node:url';

export async function publicarVisor({ repo, token, fetchImpl = fetch, dormir = (ms) => new Promise((r) => setTimeout(r, ms)), limiteMs = 22 * 60000, pasoMs = 20000, log = console.log } = {}) {
  const base = `https://api.github.com/repos/${repo}/actions/workflows/pages.yml`;
  const cab = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const corridas = async () => {
    const r = await fetchImpl(`${base}/runs?event=workflow_dispatch&branch=main&per_page=20`, { headers: cab });
    if (!r.ok) throw Error(`No pude leer las corridas de Pages: HTTP ${r.status}.`);
    return (await r.json()).workflow_runs || [];
  };
  const intento = async (n) => {
    const antes = new Set((await corridas()).map((x) => x.id));
    const r = await fetchImpl(`${base}/dispatches`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) });
    if (r.status !== 204) throw Error(`No pude solicitar Pages: HTTP ${r.status}. ${await r.text()}`);
    log(`Publicación del visor solicitada (intento ${n}) con los datos ya guardados en main.`);
    let t = 0, id = null;
    while (t <= limiteMs) {
      await dormir(pasoMs); t += pasoMs;
      const lista = await corridas();
      if (!id) { const nueva = lista.find((x) => !antes.has(x.id)); if (nueva) { id = nueva.id; log(`Corrida de Pages: ${id}`); } }
      const mia = id && lista.find((x) => x.id === id);
      if (mia && mia.status === 'completed') return { id, conclusion: mia.conclusion };
    }
    return { id, conclusion: 'tiempo_agotado' };
  };
  const a = await intento(1);
  if (a.conclusion === 'success') { log(`Pages terminó bien (corrida ${a.id}).`); return a; }
  log(`Pages no terminó bien en el intento 1 (corrida ${a.id}: ${a.conclusion}); pido una corrida nueva, una sola vez.`);
  const b = await intento(2);
  if (b.conclusion === 'success') { log(`Pages terminó bien en el intento 2 (corrida ${b.id}).`); return b; }
  throw Error(`Pages falló dos veces (corridas ${a.id} y ${b.id}: ${a.conclusion}, ${b.conclusion}). Revisar a mano.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await publicarVisor({ repo: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN });
}
