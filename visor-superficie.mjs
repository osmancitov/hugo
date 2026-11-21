// Superficie 3D del registro real. Proyección y dibujo locales, sin dependencias externas.
// Las tomas se leen directamente de GitHub; actualizar datos no requiere desplegar este módulo.
import { terrenoDia } from './app/modulos/intradia-datos.mjs';
const VERDE = '#25855c', ROJO = '#b73d40', ORO = '#c2a15a', GRIS = '#626b7d';
const hora = (ms) => new Date(ms).toISOString().slice(11, 19);
const pct = (n) => {
  if (n === null) return 'sin comparación';
  const opciones = n !== 0 && Math.abs(n) < .0005 ? { maximumSignificantDigits: 3 } : { maximumFractionDigits: 3 };
  return `${n > 0 ? '+' : ''}${new Intl.NumberFormat('es', opciones).format(n === 0 ? 0 : n)} %`;
};
const crear = (tag, clase, texto) => Object.assign(document.createElement(tag), { className: clase || '', ...(texto === undefined ? {} : { textContent: texto }) });

// Misma navegación para activos y lecturas: los extremos no saltan al otro lado.
export function montarPasos(selector, nombre, mover) {
  const grupo = crear('span', 'superficie-pasos');
  const anterior = crear('button', 'superficie-flecha', '←');
  const siguiente = crear('button', 'superficie-flecha', '→');
  for (const [boton, direccion] of [[anterior, 'anterior'], [siguiente, 'siguiente']]) {
    boton.type = 'button';
    boton.setAttribute('aria-label', `${nombre} ${direccion}`);
    boton.title = `${nombre} ${direccion}`;
  }
  const actualizar = () => {
    anterior.disabled = selector.selectedIndex <= 0;
    siguiente.disabled = selector.selectedIndex < 0 || selector.selectedIndex >= selector.options.length - 1;
  };
  const paso = (delta) => {
    const indice = selector.selectedIndex + delta;
    if (indice >= 0 && indice < selector.options.length) mover(indice);
  };
  anterior.onclick = () => paso(-1);
  siguiente.onclick = () => paso(1);
  grupo.append(anterior, selector, siguiente);
  actualizar();
  return { grupo, actualizar };
}

export function montarSuperficie(contenedor, lecturas, parsear, { alSeleccionar = () => {} } = {}) {
  const datos = terrenoDia(lecturas, parsear), { codigos, barras, puntos } = datos;
  let giro = -0.34, inclinacion = 0.68, amplitud = 1, ultima = barras.length - 1, activo = 0, arrastre = null, proyecciones = [], viva = true;
  const valores = puntos.flat().filter(Boolean).map((p) => Math.abs(p.altura));
  const maximo = Math.max(0.1, ...valores);
  const caja = crear('div', 'superficie-caja');
  const controles = crear('div', 'superficie-controles');
  const etiquetaLectura = crear('label', '', 'Lectura '), elegirLectura = crear('select');
  barras.forEach((b, i) => { const o = crear('option', '', `${hora(b.generada)} UTC`); o.value = i; elegirLectura.append(o); });
  elegirLectura.value = ultima;
  const pasosLectura = montarPasos(elegirLectura, 'Lectura', (i) => seleccionar(i, activo));
  etiquetaLectura.append(pasosLectura.grupo);
  const etiquetaActivo = crear('label', '', 'Activo '), elegirActivo = crear('select');
  codigos.forEach((c, i) => { const o = crear('option', '', c); o.value = i; elegirActivo.append(o); });
  const pasosActivo = montarPasos(elegirActivo, 'Activo', (i) => seleccionar(ultima, i));
  etiquetaActivo.append(pasosActivo.grupo);
  const reiniciar = crear('button', '', 'Restablecer vista'); reiniciar.type = 'button';
  const etiquetaAltura = crear('label', '', 'Relieve '), relieve = crear('input');
  relieve.type = 'range'; relieve.min = '0.35'; relieve.max = '2'; relieve.step = '.05'; relieve.value = '1'; relieve.setAttribute('aria-label', 'Ampliación visual del relieve');
  etiquetaAltura.append(relieve);
  controles.append(etiquetaLectura, etiquetaActivo, etiquetaAltura, reiniciar);
  const canvas = crear('canvas', 'superficie-canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Superficie de variación contra cierre diario fijo. Los selectores permiten leer cada punto. Arrastra para girar.');
  const detalle = crear('p', 'superficie-detalle'); detalle.setAttribute('aria-live', 'polite');
  const leyenda = crear('p', 'superficie-leyenda');
  const verde = crear('span', '', 'Verde: no bajó entre lecturas'); verde.style.color = '#45b381';
  const rojo = crear('span', '', 'Rojo: bajó entre lecturas'); rojo.style.color = '#ed7477';
  leyenda.append(verde, document.createTextNode(' · '), rojo, document.createTextNode(' · Gris: sin comparación nueva'));
  const notas = crear('p', 'superficie-nota', 'Altura: cambio porcentual frente al cierre diario fijo. Color: movimiento desde la lectura anterior. Activos en orden alfabético, sin significado de proximidad. Las caras unen puntos observados; no son lecturas intermedias.');
  caja.append(controles, canvas, detalle, leyenda, notas);
  contenedor.append(caja);
  function describir() {
    const p = puntos[ultima]?.[activo];
    const fecha = barras[ultima] ? `${hora(barras[ultima].generada)} UTC` : 'sin lectura';
    detalle.textContent = p ? `${codigos[activo]} · ${fecha} · altura ${pct(p.altura)} · entre lecturas ${pct(p.movimiento)} · precio ${p.precio} · referencia ${p.referencia}` : `${codigos[activo] || 'Sin activos'} · ${fecha} · sin cierre diario o sin precio comparable`;
  }
  function dibujar() {
    if (!viva) return;
    const ancho = Math.max(280, caja.clientWidth), alto = ancho < 600 ? 370 : 500, dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = ancho * dpr; canvas.height = alto * dpr;
    canvas.style.height = `${alto}px`;
    const c = canvas.getContext('2d'); c.scale(dpr, dpr);
    c.fillStyle = '#080604'; c.fillRect(0, 0, ancho, alto);
    const cos = Math.cos(giro), sin = Math.sin(giro);
    const crudo = (x, y, z) => ({ u: x * cos - y * sin, v: (x * sin + y * cos) * inclinacion - z * .61 * amplitud });
    const esquinas = [-1.04, 1.04].flatMap((x) => [-.7, .7].flatMap((y) => [-1, 1].map((z) => crudo(x, y, z))));
    const minX = Math.min(...esquinas.map((p) => p.u)), maxX = Math.max(...esquinas.map((p) => p.u));
    const minY = Math.min(...esquinas.map((p) => p.v)), maxY = Math.max(...esquinas.map((p) => p.v));
    const izq = ancho < 600 ? 54 : 82, der = ancho < 600 ? 26 : 95, arriba = 38, abajo = 67;
    const escalaX = (ancho - izq - der) / (maxX - minX), escalaY = (alto - arriba - abajo) / (maxY - minY);
    const centroX = izq + (ancho - izq - der) / 2, centroY = arriba + (alto - arriba - abajo) / 2;
    const proyectar = (x, y, z) => {
      const p = crudo(x, y, z);
      return { x: centroX + (p.u - (minX + maxX) / 2) * escalaX,
        y: centroY + (p.v - (minY + maxY) / 2) * escalaY, profundidad: x * sin + y * cos };
    };
    const t0 = barras[0]?.generada || 0, dt = Math.max(1, (barras.at(-1)?.generada || 0) - t0);
    const px = (i) => codigos.length < 2 ? 0 : i / (codigos.length - 1) * 2 - 1;
    const py = (j) => barras.length < 2 ? 0 : ((barras[j].generada - t0) / dt * 1.4 - .7);
    const linea = (a, b, color, grosor = 1) => { c.strokeStyle = color; c.lineWidth = grosor; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); };
    const texto = (p, s, color = '#9aa0ac', align = 'left') => { c.font = '11px Georgia'; c.fillStyle = color; c.textAlign = align; c.fillText(s, p.x, p.y); };
    // Plano cero y ejes. Los límites porcentuales son simétricos y no se recortan picos.
    for (const y of [-.7, -.35, 0, .35, .7]) linea(proyectar(-1, y, 0), proyectar(1, y, 0), '#2a2922');
    for (const x of [-1, -.5, 0, .5, 1]) linea(proyectar(x, -.7, 0), proyectar(x, .7, 0), '#2a2922');
    linea(proyectar(-1, -.7, -1), proyectar(-1, -.7, 1), '#786b4c');
    for (const z of [-1, -.5, 0, .5, 1]) {
      const p = proyectar(-1.03, -.7, z);
      texto(p, pct(z * maximo), z === 0 ? ORO : '#9aa0ac', 'right');
    }
    texto({ x: 12, y: 22 }, 'Altura frente al cierre fijo (%)', ORO);
    const malla = puntos.map((fila, j) => fila.map((p, i) => p ? { ...proyectar(px(i), py(j), p.altura / maximo), p, i, j } : null));
    proyecciones = malla.flat().filter(Boolean);
    const caras = [];
    for (let j = 1; j < malla.length; j++) for (let i = 1; i < codigos.length; i++) {
      const vertices = [malla[j - 1][i - 1], malla[j - 1][i], malla[j][i], malla[j][i - 1]];
      if (vertices.some((p) => !p)) continue; // sin dato deja un hueco, nunca altura cero
      const nuevos = [puntos[j][i - 1], puntos[j][i]];
      caras.push({ vertices, colores: [nuevos[0].movimiento, nuevos[1].movimiento].map((m) => m === null ? GRIS : m >= 0 ? VERDE : ROJO), fondo: vertices.reduce((s, p) => s + p.profundidad, 0) / 4 });
    }
    caras.sort((a, b) => a.fondo - b.fondo);
    for (const cara of caras) {
      c.beginPath(); cara.vertices.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
      const a = cara.vertices[3], b = cara.vertices[2];
      const gradiente = c.createLinearGradient(a.x, a.y, b.x === a.x && b.y === a.y ? b.x + 1 : b.x, b.y);
      gradiente.addColorStop(0, cara.colores[0]); gradiente.addColorStop(1, cara.colores[1]);
      c.fillStyle = gradiente; c.globalAlpha = .66; c.fill();
      c.globalAlpha = .46; c.strokeStyle = '#c6bc9b'; c.lineWidth = .45; c.stroke(); c.globalAlpha = 1;
    }
    // Los carriles de cada activo unen únicamente sus lecturas. Una foto sola no crea terreno.
    for (let i = 0; i < codigos.length; i++) for (let j = 1; j < malla.length; j++) {
      const a = malla[j - 1][i], b = malla[j][i];
      if (a && b) linea(a, b, b.p.movimiento === null ? GRIS : b.p.movimiento >= 0 ? '#42b582' : '#e06a70', .8);
    }
    const fila = malla[ultima] || [];
    for (let i = 1; i < fila.length; i++) if (fila[i - 1] && fila[i]) linea(fila[i - 1], fila[i], '#ded0a4', 1.2);
    if (barras.length === 1) for (const p of fila.filter(Boolean)) { c.fillStyle = ORO; c.fillRect(p.x - 1, p.y - 1, 2, 2); }
    // Rótulos en los bordes, sin escribir 113 nombres superpuestos.
    const salto = Math.max(1, Math.ceil(codigos.length / (ancho < 600 ? 4 : 8)));
    for (let i = 0; i < codigos.length; i += salto) {
      const p = proyectar(px(i), .78, 0); p.y = alto - 52; texto(p, codigos[i], '#bbb39e', 'center');
    }
    texto({ x: ancho / 2, y: alto - 18 }, `${codigos.length} activos · orden A → Z`, ORO, 'center');
    if (ancho < 600 && barras.length) {
      texto({ x: ancho - 10, y: 43 }, `${hora(barras[0].generada)} → ${hora(barras.at(-1).generada)} UTC`, '#bbb39e', 'right');
    } else for (const j of [...new Set([0, Math.floor((barras.length - 1) / 2), barras.length - 1])]) {
      if (!barras[j]) continue;
      const p = proyectar(1.04, py(j), 0); texto(p, `${hora(barras[j].generada)} UTC`);
    }
    const elegido = malla[ultima]?.[activo];
    if (elegido) {
      c.beginPath(); c.arc(elegido.x, elegido.y, 4, 0, Math.PI * 2); c.fillStyle = '#fff1cb'; c.fill(); c.strokeStyle = '#080604'; c.lineWidth = 1.4; c.stroke();
      texto({ x: elegido.x + 8, y: elegido.y - 9 }, `${elegido.p.codigo} ${pct(elegido.p.altura)}`, '#fff1cb');
    }
    texto({ x: 12, y: alto - 34 }, barras.length < 2 ? 'Una lectura: aún sin superficie temporal.' : `${barras.length} lecturas reales · arrastra para girar`, '#9aa0ac');
    describir();
  }
  const seleccionar = (j, i) => {
    if (j < 0 || j >= barras.length || i < 0 || i >= codigos.length) return;
    const x = window.scrollX, y = window.scrollY;
    ultima = j; activo = i;
    elegirLectura.value = j; elegirActivo.value = i;
    pasosLectura.actualizar(); pasosActivo.actualizar();
    // Se conservan los mismos controles y el mismo terreno: no se reinicia su ángulo,
    // relieve, foco o posición al avanzar o usar un desplegable.
    dibujar(); alSeleccionar(j);
    if (window.scrollX !== x || window.scrollY !== y) window.scrollTo({ left: x, top: y, behavior: 'instant' });
  };
  elegirLectura.onchange = () => seleccionar(Number(elegirLectura.value), activo);
  elegirActivo.onchange = () => seleccionar(ultima, Number(elegirActivo.value));
  relieve.oninput = () => { amplitud = Number(relieve.value); dibujar(); };
  reiniciar.onclick = () => { giro = -.34; inclinacion = .68; amplitud = 1; relieve.value = '1'; dibujar(); };
  canvas.onpointerdown = (e) => { arrastre = { x: e.clientX, y: e.clientY, giro, inclinacion, movido: false }; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = (e) => {
    if (!arrastre) return;
    if (Math.abs(e.clientX - arrastre.x) + Math.abs(e.clientY - arrastre.y) > 4) arrastre.movido = true;
    giro = Math.max(-1.1, Math.min(1.1, arrastre.giro + (e.clientX - arrastre.x) / 250));
    inclinacion = Math.max(.25, Math.min(1.1, arrastre.inclinacion + (e.clientY - arrastre.y) / 300)); dibujar();
  };
  canvas.onpointerup = (e) => {
    if (arrastre && !arrastre.movido) {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const cercano = proyecciones.reduce((a, p) => Math.hypot(p.x - x, p.y - y) < Math.hypot(a.x - x, a.y - y) ? p : a, { x: 1e6, y: 1e6 });
      if (Math.hypot(cercano.x - x, cercano.y - y) < 35) seleccionar(cercano.j, cercano.i);
    }
    arrastre = null;
  };
  canvas.onpointercancel = () => { arrastre = null; };
  const observador = new ResizeObserver(dibujar); observador.observe(caja);
  dibujar(); alSeleccionar(ultima);
  return { datos, desmontar() { viva = false; observador.disconnect(); canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null; } };
}
