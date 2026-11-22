// Superficie 3D del registro real. Proyección y dibujo locales, sin dependencias externas.
// Las tomas se leen directamente de GitHub; actualizar datos no requiere desplegar este módulo.
import { terrenoDia } from './app/modulos/intradia-datos.mjs';
import { COLORES_LECTURA, colorMovimiento } from './app/modulos/colores-lectura.mjs';
export { colorMovimiento } from './app/modulos/colores-lectura.mjs';
const { verde: VERDE, rojo: ROJO, gris: GRIS } = COLORES_LECTURA;
// Franja seleccionada: el mismo tono de cada color con la saturacion al tope (HLS), sin aclarar hacia el blanco.
// rojo #b73d40 -> #ff0a10 y verde #25855c -> #00c470 (mismo matiz, saturacion 100%); el gris solo sube un poco su luz.
const INTENSOS = { [COLORES_LECTURA.rojo]: '#ff0a10', [COLORES_LECTURA.verde]: '#00c470', [COLORES_LECTURA.gris]: '#a5abb5', transparent: 'transparent' };
const ORO = '#c2a15a';
export const horaSuperficie = (ms) => new Date(ms).toISOString().slice(11, 16);
export const porcentajeSuperficie = (n) => {
  if (n === null) return 'sin comparación';
  const visible = Math.abs(n) < .05 ? 0 : n;
  return `${visible > 0 ? '+' : ''}${new Intl.NumberFormat('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(visible)} %`;
};
const hora = horaSuperficie, pct = porcentajeSuperficie;

export function montarRelojObservatorio(contenedor, { ahora = Date.now, programar = setTimeout, cancelar = clearTimeout } = {}) {
  const caja = crear('div', 'superficie-reloj');
  const titulo = crear('p', 'superficie-reloj-titulo');
  const linea = crear('p', 'superficie-reloj-hora', 'UTC');
  const tiempo = crear('time');
  tiempo.title = 'Hora del dispositivo expresada en UTC, no una cotización en vivo';
  titulo.append(document.createTextNode('Reloj del observatorio: '), tiempo);
  caja.append(titulo, linea); contenedor.append(caja);
  let temporizador = null, vivo = true;
  const actualizar = () => {
    if (!vivo) return;
    const ms = ahora();
    tiempo.textContent = hora(ms); tiempo.dateTime = new Date(ms).toISOString();
    temporizador = programar(actualizar, 60000 - ((ms % 60000 + 60000) % 60000));
  };
  actualizar();
  return { desmontar() { vivo = false; cancelar(temporizador); } };
}
const crear = (tag, clase, texto) => Object.assign(document.createElement(tag), { className: clase || '', ...(texto === undefined ? {} : { textContent: texto }) });

// Misma navegación para activos y lecturas, con repetición y ciclo opcionales.
export function montarPasos(selector, nombre, mover, { repetir = false, ciclar = false, programar = setTimeout, cancelar = clearTimeout } = {}) {
  const grupo = crear('span', 'superficie-pasos');
  const anterior = crear('button', 'superficie-flecha', '←');
  const siguiente = crear('button', 'superficie-flecha', '→');
  for (const [boton, direccion] of [[anterior, 'anterior'], [siguiente, 'siguiente']]) {
    boton.type = 'button';
    boton.setAttribute('aria-label', `${nombre} ${direccion}`);
    boton.title = `${nombre} ${direccion}`;
  }
  let temporizador = null, pulsado = null, vivo = true;
  const detener = () => { cancelar(temporizador); temporizador = null; pulsado = null; };
  const actualizar = () => {
    anterior.disabled = selector.options.length < 2 || (!ciclar && selector.selectedIndex <= 0);
    siguiente.disabled = selector.options.length < 2 || (!ciclar && selector.selectedIndex >= selector.options.length - 1);
    if (pulsado?.disabled) detener();
  };
  const paso = (delta) => {
    const n = selector.options.length;
    if (n < 2) return;
    if (selector.selectedIndex < 0) { mover(delta > 0 ? 0 : n - 1); return; }
    const indice = ciclar ? (selector.selectedIndex + delta + n) % n : selector.selectedIndex + delta;
    if (indice >= 0 && indice < selector.options.length) mover(indice);
  };
  for (const [boton, delta] of [[anterior, -1], [siguiente, 1]]) {
    boton.onclick = (e) => { if (vivo && (!repetir || !e?.detail)) paso(delta); };
    if (!repetir) continue;
    boton.style && (boton.style.touchAction = 'none');
    boton.title += ' · Mantén pulsado para recorrer 10 pasos por segundo';
    boton.onpointerdown = (e) => {
      if (!vivo || boton.disabled || (e.button !== undefined && e.button !== 0) || e.isPrimary === false) return;
      detener(); pulsado = boton;
      boton.setPointerCapture?.(e.pointerId);
      const avanzar = () => {
        if (!vivo || pulsado !== boton || boton.disabled) { detener(); return; }
        paso(delta);
        if (pulsado === boton && !boton.disabled) temporizador = programar(avanzar, 100);
      };
      avanzar();
    };
    boton.onpointerup = boton.onpointercancel = boton.onlostpointercapture = detener;
    boton.oncontextmenu = (e) => e.preventDefault();
  }
  const alOcultar = () => { if (globalThis.document?.hidden) detener(); };
  if (repetir) {
    globalThis.window?.addEventListener?.('blur', detener);
    globalThis.document?.addEventListener?.('visibilitychange', alOcultar);
  }
  grupo.append(anterior, selector, siguiente);
  actualizar();
  return { grupo, actualizar, desmontar() {
    vivo = false; detener();
    globalThis.window?.removeEventListener?.('blur', detener);
    globalThis.document?.removeEventListener?.('visibilitychange', alOcultar);
    for (const b of [anterior, siguiente]) b.onclick = b.onpointerdown = b.onpointerup = b.onpointercancel = b.onlostpointercapture = b.oncontextmenu = null;
  } };
}

export function montarSuperficie(contenedor, lecturas, parsear, { alSeleccionar = () => {} } = {}) {
  const horaVista=(ms)=>ms>=Date.parse(new Date(parsear(lecturas[0].texto).generada).toISOString().slice(0,10))+86400000&&hora(ms)==='00:00'?'24:00':hora(ms);
  const datos = terrenoDia(lecturas, parsear), { codigos, barras, puntos } = datos;
  let giro = -0.34, inclinacion = 0.68, amplitud = 1, zoom = 1, ultima = barras.length - 1, activo = -1, arrastre = null, proyecciones = [], viva = true;
  const valores = puntos.flat().filter(Boolean).map((p) => Math.abs(p.altura));
  const maximo = Math.max(0.1, ...valores);
  const caja = crear('div', 'superficie-caja');
  const controles = crear('div', 'superficie-controles');
  const etiquetaLectura = crear('label', '', 'Lectura '), elegirLectura = crear('select');
  barras.forEach((b, i) => { const o = crear('option', '', `${horaVista(b.generada)} UTC`); o.value = i; elegirLectura.append(o); });
  elegirLectura.value = ultima;
  const pasosLectura = montarPasos(elegirLectura, 'Lectura', (i) => seleccionar(i, activo), { repetir: true, ciclar: true });
  etiquetaLectura.append(pasosLectura.grupo);
  const etiquetaActivo = crear('label', '', 'Activo '), elegirActivo = crear('select');
  const elegirVacio = crear('option', '', 'Elegir'); elegirVacio.value = -1; elegirActivo.append(elegirVacio);
  codigos.forEach((c, i) => { const o = crear('option', '', c); o.value = i; elegirActivo.append(o); });
  elegirActivo.selectedIndex = 0;
  const pasosActivo = montarPasos(elegirActivo, 'Activo', (i) => seleccionar(ultima, i - 1), { repetir: true, ciclar: true });
  etiquetaActivo.append(pasosActivo.grupo);
  const etiquetaAltura = crear('label', '', 'Relieve '), relieve = crear('input');
  relieve.type = 'range'; relieve.min = '0.35'; relieve.max = '2'; relieve.step = '.05'; relieve.value = '1'; relieve.setAttribute('aria-label', 'Ampliación visual del relieve');
  etiquetaAltura.append(relieve);
  const etiquetaZoom = crear('label', '', 'Zoom '), acercar = crear('input');
  acercar.type = 'range'; acercar.min = '0.6'; acercar.max = '2'; acercar.step = '.05'; acercar.value = '1'; acercar.setAttribute('aria-label', 'Acercar o alejar la superficie');
  acercar.oninput = () => { zoom = Number(acercar.value); dibujar(); };
  etiquetaZoom.append(acercar);
  // Tres vistas con nombre: la inicial oblicua y las dos perspectivas que pidio el usuario (22-nov-2026).
  const vistas = [['Oblicua', -0.34, 0.68], ['Cascada', 0, 0.9], ['Telar', -1.5708, 1.55]];
  const botonesVista = vistas.map(([nombre, g, inc]) => {
    const b = crear('button', '', nombre);
    b.type = 'button';
    b.setAttribute('aria-label', `Vista ${nombre.toLowerCase()} de la superficie`);
    b.onclick = () => { giro = g; inclinacion = inc; amplitud = 1; zoom = 1; relieve.value = '1'; acercar.value = '1'; dibujar(); };
    return b;
  });
  controles.append(etiquetaActivo, etiquetaLectura, etiquetaAltura, etiquetaZoom, ...botonesVista);
  const canvas = crear('canvas', 'superficie-canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Superficie de variación contra la primera lectura real del día. Los selectores permiten leer cada punto. Arrastra para girar sin tope de giro; Zoom acerca y los botones Oblicua, Cascada y Telar llevan a vistas fijas.');
  const detalle = crear('p', 'superficie-detalle'); detalle.setAttribute('aria-live', 'polite');
  caja.append(controles, canvas, detalle);
  contenedor.append(caja);
  function describir() {
    detalle.hidden = activo < 0;
    if (activo < 0) { detalle.textContent = ''; return; }
    const p = puntos[ultima]?.[activo];
    const fecha = barras[ultima] ? `${horaVista(barras[ultima].generada)}` : 'sin lectura';
    const codigo = codigos[activo] || 'Sin activos';
    // El nombre del activo enlaza a su ficha (decisión del usuario, 22-nov-2026).
    const enlace = crear('a', 'barra-activo-enlace', codigo);
    enlace.href = '#/a/stock/' + encodeURIComponent(codigo);
    detalle.textContent = '';
    detalle.append(enlace, document.createTextNode(p ? ` · ${fecha} · altura ${pct(p.altura)} · entre lecturas ${pct(p.movimiento)} · precio ${p.precio} · referencia ${p.referencia}` : ` · ${fecha} · sin cierre diario o sin precio comparable`));
  }
  function dibujar() {
    if (!viva) return;
    const ancho = Math.max(280, caja.clientWidth), alto = ancho < 600 ? 560 : 640, dpr = Math.min(2, window.devicePixelRatio || 1);
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
    const escalaX = zoom * (ancho - izq - der) / (maxX - minX), escalaY = zoom * (alto - arriba - abajo) / (maxY - minY);
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
    const malla = puntos.map((fila, j) => fila.map((p, i) => p ? { ...proyectar(px(i), py(j), p.altura / maximo), p, i, j } : null));
    proyecciones = malla.flat().filter(Boolean);
    const caras = [];
    for (let j = 1; j < malla.length; j++) for (let i = 1; i < codigos.length; i++) {
      const vertices = [malla[j - 1][i - 1], malla[j - 1][i], malla[j][i], malla[j][i - 1]];
      if (vertices.some((p) => !p)) continue; // sin dato deja un hueco, nunca altura cero
      const nuevos = [puntos[j][i - 1], puntos[j][i]];
      caras.push({ vertices, colores: [nuevos[0].movimiento, nuevos[1].movimiento].map((m) => colorMovimiento(m) ?? 'transparent'), fondo: vertices.reduce((s, p) => s + p.profundidad, 0) / 4, j });
    }
    caras.sort((a, b) => a.fondo - b.fondo);
    for (const cara of caras) {
      c.beginPath(); cara.vertices.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
      const a = cara.vertices[3], b = cara.vertices[2];
      const gradiente = c.createLinearGradient(a.x, a.y, b.x === a.x && b.y === a.y ? b.x + 1 : b.x, b.y);
      const marcada = cara.j === ultima && ultima > 0; // la franja que termina en la lectura elegida, con sus colores intensos
      gradiente.addColorStop(0, marcada ? INTENSOS[cara.colores[0]] ?? cara.colores[0] : cara.colores[0]);
      gradiente.addColorStop(1, marcada ? INTENSOS[cara.colores[1]] ?? cara.colores[1] : cara.colores[1]);
      c.fillStyle = gradiente; c.globalAlpha = marcada ? 1 : .66; c.fill();
      c.globalAlpha = marcada ? .9 : .46; c.strokeStyle = marcada ? '#e8e8ea' : '#c6bc9b'; c.lineWidth = marcada ? 1 : .45; c.stroke(); c.globalAlpha = 1;
    }
    // Los carriles de cada activo unen únicamente sus lecturas. Una foto sola no crea terreno.
    for (let i = 0; i < codigos.length; i++) for (let j = 1; j < malla.length; j++) {
      const a = malla[j - 1][i], b = malla[j][i];
      if (a && b && b.p.movimiento !== null) linea(a, b, colorMovimiento(b.p.movimiento), .8);
    }
    const fila = malla[ultima] || [];
    for (let i = 1; i < fila.length; i++) if (fila[i - 1] && fila[i]) linea(fila[i - 1], fila[i], barras.length === 1 ? GRIS : '#ded0a4', 1.2);
    if (barras.length === 1) for (const p of fila.filter(Boolean)) { c.fillStyle = GRIS; c.fillRect(p.x - 1, p.y - 1, 2, 2); }
    if (ancho < 600 && barras.length) {
      texto({ x: ancho - 10, y: 43 }, `${horaVista(barras[0].generada)} → ${horaVista(barras.at(-1).generada)}`, '#bbb39e', 'right');
    } else for (const j of [...new Set([0, Math.floor((barras.length - 1) / 2), barras.length - 1])]) {
      if (!barras[j]) continue;
      const p = proyectar(1.04, py(j), 0); texto(p, `${horaVista(barras[j].generada)}`);
    }
    const elegido = malla[ultima]?.[activo];
    if (elegido) {
      c.beginPath(); c.arc(elegido.x, elegido.y, 4, 0, Math.PI * 2); c.fillStyle = '#fff1cb'; c.fill(); c.strokeStyle = '#080604'; c.lineWidth = 1.4; c.stroke();
      texto({ x: elegido.x + 8, y: elegido.y - 9 }, `${elegido.p.codigo} ${pct(elegido.p.altura)}`, '#fff1cb');
    }
    describir();
  }
  const seleccionar = (j, i) => {
    if (j < 0 || j >= barras.length || i < -1 || i >= codigos.length) return;
    const x = window.scrollX, y = window.scrollY;
    ultima = j; activo = i;
    elegirLectura.value = j;
    if (i < 0) elegirActivo.selectedIndex = 0; else elegirActivo.value = i;
    pasosLectura.actualizar(); pasosActivo.actualizar();
    // Se conservan los mismos controles y el mismo terreno: no se reinicia su ángulo,
    // relieve, foco o posición al avanzar o usar un desplegable.
    dibujar(); alSeleccionar(j);
    if (window.scrollX !== x || window.scrollY !== y) window.scrollTo({ left: x, top: y, behavior: 'instant' });
  };
  elegirLectura.onchange = () => seleccionar(Number(elegirLectura.value), activo);
  elegirActivo.onchange = () => seleccionar(ultima, Number(elegirActivo.value));
  relieve.oninput = () => { amplitud = Number(relieve.value); dibujar(); };
  canvas.onpointerdown = (e) => { arrastre = { x: e.clientX, y: e.clientY, giro, inclinacion, movido: false }; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = (e) => {
    if (!arrastre) return;
    if (Math.abs(e.clientX - arrastre.x) + Math.abs(e.clientY - arrastre.y) > 4) arrastre.movido = true;
    giro = arrastre.giro + (e.clientX - arrastre.x) / 170;
    inclinacion = Math.max(.05, Math.min(1.7, arrastre.inclinacion + (e.clientY - arrastre.y) / 210)); dibujar();
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
  return { datos, desmontar() { viva = false; pasosActivo.desmontar(); pasosLectura.desmontar(); observador.disconnect(); canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null; } };
}
