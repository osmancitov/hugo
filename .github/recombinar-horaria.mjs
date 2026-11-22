// Recombina la cola intradiaria con origin/main recién traído antes de cada
// intento de publicación: el remoto manda por hora (ver cola-horaria.mjs).
import { materializarCola } from './cola-horaria.mjs';
const p = await materializarCola();
console.log(`Cola recombinada contra origin/main: ${Object.keys(p).length} archivo(s) pendientes.`);
