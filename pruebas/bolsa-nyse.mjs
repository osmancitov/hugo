import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoBolsa, textoBolsa, horaUTC4 } from '../app/modulos/bolsa-nyse.mjs';
const t = (s) => textoBolsa(estadoBolsa(Date.parse(s)));
test('sábado: cerrada por fin de semana, abre el lunes 10:30 UTC-4 (invierno)', () => {
  assert.match(t('2026-11-28T21:00:00Z'), /fin de semana.*sábados ni los domingos.*abre lunes 30 nov, 10:30 a\. m\. y cierra lunes 30 nov, 5:00 p\. m\./);
});
test('sesión regular abierta y cierre a las 5:00 p. m. UTC-4 en invierno, 4:00 p. m. en verano', () => {
  assert.match(t('2026-11-30T16:00:00Z'), /abierta · cierra lunes 30 nov, 5:00 p\. m\./);
  assert.match(t('2026-06-02T15:00:00Z'), /abierta · cierra martes 2 jun, 4:00 p\. m\./);
});
test('cambio de hora: lunes 9 mar 2026 abre 9:30 a. m. UTC-4', () => {
  assert.match(t('2026-03-06T22:00:00Z'), /abre lunes 9 mar, 9:30 a\. m\./);
});
test('feriado y cierre anticipado', () => {
  assert.match(t('2026-11-26T15:00:00Z'), /feriado: Acción de Gracias.*abre viernes 27 nov, 10:30 a\. m\. y cierra viernes 27 nov, 2:00 p\. m\..*cierre anticipado/);
  assert.match(t('2026-11-27T17:30:00Z'), /cierra viernes 27 nov, 2:00 p\. m\..*cierre anticipado/);
  assert.match(t('2026-12-24T16:00:00Z'), /cierre anticipado/);
});
test('fuera de 2026 a 2028 no afirma nada', () => {
  assert.match(t('2029-01-02T15:00:00Z'), /sin calendario cargado/);
  assert.equal(horaUTC4(Date.parse('2026-11-30T14:30:00Z')), 'lunes 30 nov, 10:30 a. m.');
});
