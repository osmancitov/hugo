// Tras publicar el commit de la corrida, confirma la cola intradiaria: solo se da
// por enviada la versión exacta que quedó en el commit. Si el push falló, este paso
// no corre y la cola queda pendiente en la caché para la siguiente corrida.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirmarIntradia, pendientesIntradia } from '../app/modulos/registro-intradia.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'registros');
const enviados = pendientesIntradia(RAIZ);
confirmarIntradia(RAIZ, enviados);
console.log(`Cola confirmada: ${Object.keys(enviados).length} archivo(s) enviados; pendientes: ${Object.keys(pendientesIntradia(RAIZ)).length}.`);
