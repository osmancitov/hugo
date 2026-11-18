// Conecta la caja unica de reportes a un ctx de prueba, igual que app.mjs lo hace una sola vez
// para todos los modulos. Uso: const ctx = {...}; conectarCaja(ctx); registrar(ctx);
import { crearReporte, crearReporteSync, crearAvisador, abrirHilo } from '../app/modulos/reporte.mjs';

export function conectarCaja(ctx) {
 ctx.reporte = {
  crear: (o) => crearReporte({ client: ctx.app.client, token: ctx.botToken, ...o }),
  crearSync: (o) => crearReporteSync({ client: ctx.app.client, token: ctx.botToken, ...o }),
  avisador: (o = {}) => crearAvisador({ client: ctx.app.client, token: ctx.botToken, ...o }),
  hilo: (o) => abrirHilo({ client: ctx.app.client, token: ctx.botToken, ...o }),
 };
 return ctx;
}
