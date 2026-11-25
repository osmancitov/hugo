// Un solo formato para los nombres en caracteres chinos: lectura latina y significado, muy breve.
// El catálogo trae `lectura` y `traduccion` (se anotan en activos-curados.json).
export function parentesisLectura(e) {
  return e && e.lectura ? ` (${e.lectura}${e.traduccion ? ', ' + e.traduccion : ''})` : '';
}
