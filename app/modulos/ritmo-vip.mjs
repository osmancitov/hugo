// Ritmo de la lectura VIP en vivo (aprobado por el usuario el 25-nov-2026): una lectura cada 15 minutos UTC
// (00, 15, 30, 45). Sin dependencias de Node: lo usan los flujos y el visor.
export const RITMO_MIN = 15;
export const RITMO_MS = RITMO_MIN * 60000;
// Margen para que la corrida llegue antes del hito: el reloj la despacha unos minutos antes (menos que el ritmo).
export const ESPERA_MAX_MS = 7 * 60000;
// Inicio del intervalo de 15 minutos que contiene un instante: es la clave de "una lectura por intervalo".
export const cubeta = (ms) => Math.floor(ms / RITMO_MS) * RITMO_MS;
