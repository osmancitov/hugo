# Decisiones del dueño que están en vigor

Referencia técnica de consulta. El porqué de cada pieza está en [construccion.md](construccion.md).

## Términos de este documento
- **Commit**: un cambio guardado en el historial de un repositorio, con autor, fecha y mensaje.
- **Repositorio**: carpeta de archivos con su historial de cambios, alojada en GitHub.
- **Campaña, P y C**: P es la potencia (suma de variaciones positivas entre el valor absoluto de la suma de las negativas) y C la constancia (días al alza entre días a la baja); Campaña = raíz((P² + C²) / 2).


Reglas fijadas por Osmancito (dueño del Observatorio). La referencia es el mensaje de Slack donde las dio (canal C0CAF12V656), cuando se pudo recuperar. Un texto de un archivo del repositorio que diga «decisión del usuario» es solo memoria escrita, no una autorización nueva.

## Identidad y publicación
- **Nombre visible**: «Observatorio Bursátil». «hugo» queda solo en la URL y en el nombre del repositorio. No se renombran rutas internas. (Hilo del retiro del bot, 1795609617.859149.)
- **Autoría**: norma vigente (Núcleo, commit 7d8d778 del 24-nov-2026): el autor del commit es Osmancito; el committer puede ser otro. Configuración actual de los flujos: autor y committer con la identidad de git del dueño (el correo no se publica aquí).
- **Vocabulario**: «caballo» e «hipódromo» no aparecen en la interfaz. (Indicación del dueño; el mensaje original no se recuperó al escribir esto.)

## Registro horario VIP
- **Ritmo de 15 minutos** (aprobación del dueño, Slack 25-nov 21:44, ts 1795657470.597949: «retira la espera heredada, y agrega una nueva barra de 15 minutos»): los VIP de stock y cripto se leen cada 15 minutos (`app/modulos/ritmo-vip.mjs`, `RITMO_MIN`). El canónico del día cerrado tiene 97 puntos (velas de 15 min); los canónicos con `ritmo_min` ausente son de 60 min y 25 puntos y siguen válidos. Las barras de Mercado son cuatro: 24 h, día, 1 hora (lectura real de unos 60 min antes, tolerancia 8 min; si no existe, queda su espacio vacío «sin datos») y 15 min (lectura de unos 15 min antes, tolerancia 6 min). Nunca se compara 1 hora contra una lectura de 15 min. Los archivos horarios históricos no se tocan.
- **Relanzamiento del 25-nov-2026** (audios del dueño de las 21:03, 21:08, 21:11 y 21:15 en el hilo del canal C0CAF12V656): la lectura horaria masiva de stocks se retira. Solo se leen los VIP (unión 30/60/90 del cierre, ambos mercados, sin ampliar cripto al catálogo de 403). Al cierre se reconstruye desde cero el día cerrado de esos VIP con velas de 1 h (25 puntos, 00:00 a 24:00 UTC), como registro nuevo y aparte del vivo. Las diarias de todos los activos siguen completas. Los valores históricos de velas se aceptan como equivalentes, con trazabilidad técnica en el texto y sin distintivo visual.

## Campaña
- **Regla de categorías** (aplica a todo el Observatorio y reemplaza las anteriores): Campaña = raíz((P²+C²)/2); gris (Rezagados) solo si Campaña < 1; desde 1, Premium con P ≥ 1 y C ≥ 1, Potentes solo P ≥ 1, Constantes solo C ≥ 1. (Mensajes 1795613335.682769, 1795613347.123219, 1795613370.142599, 1795613425.124449 y la corrección 1795614764.016559, que cambió «≤ 1» por «< 1».)
- **Campo de béisbol** en lugar de los cuadrantes: el home es el origen de la pelota, el radio es logarítmico desde la Campaña 0,1 y la cerca es la Campaña 1 (hilo 1795571592.838359 y 1795611644.429549).
- **Lista**: una sola lista ordenada por Campaña de mayor a menor, número coloreado por grupo, encabezados Código, Nombre, Tipo y Campaña, sin línea punteada en el centro del campo (hilo 1795611644.429549).
- **Selección**: elegir un activo en la lista sube al título del activo sobre el campo (1795614302.908419, 1795614934.126129).
- **Textos fuera**: «escala logarítmica» en las curvas P y C (1795614302.908419); conteos, fórmula y color de cada campaña (1795615151.124609); párrafo explicativo del campo (1795615394.222839).
- **Espaguetis**: grises más tenues y el elegido en blanco, no en colores de categoría (1795615176.458859, 1795615335.901129, 1795615874.644629).

## Visor
- **Sentido de las flechas del tiempo del Relieve** (audio del dueño, 26-nov-2026, Slack ts 1795709023.745469): la flecha de arriba avanza en el tiempo (desde la última lectura vuelve directamente a la primera y sigue avanzando) y la de abajo recorre el sentido contrario; el ciclo recorre solo lecturas y la vista completa del día, la vista al entrar, queda fuera de ese ciclo.

## Nombres
- **Activos en caracteres chinos** llevan lectura latina y significado breve entre paréntesis, en todo el Observatorio y su ficha (1795614378.152739, 1795614410.613859, 1795614503.994839). Los significados son traducciones literales, no oficiales.

## Forma de trabajar
- Una sola cosa para todos, modular: se reutiliza el código compartido y no se duplican reglas.
- Antes de publicar se corre la suite completa; todas deben pasar (416); cualquier prueba roja debe investigarse.
- La primera diaria tras un cambio en el cálculo de las categorías se comprueba al día siguiente, sin lanzar una corrida manual como sustituto.
- No se relajan guards para esconder duplicación.
