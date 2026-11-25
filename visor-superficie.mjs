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
// Escala fija de altura desde la partida (% desde la primera lectura del día), igual todos los días: no se ajusta al máximo ni al mínimo de la pantalla.
export const colorAltura = (a) => { const t = Math.min(1, Math.abs(a) / 15), v = Math.round(255 * t), h = (n) => n.toString(16).padStart(2, '0'); return a < 0 ? `#${h(v)}0000` : `#00${h(v)}00`; };
export const ESCALA_ALTURA = [[-15, '≤ -15'], [-10, '-10'], [-6, '-6'], [-2.5, '-2,5'], [-.5, '-0,5'], [0, '0'], [.5, '0,5'], [2.5, '2,5'], [6, '6'], [10, '10'], [15, '≥ 15']].map(([v, et]) => [v, colorAltura(v), et]);
// Degradé continuo: negro en 0, rojo hasta (255,0,0) en -15 %, verde hasta (0,255,0) en +15 %; la altura de la línea nunca se recorta.

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

export function montarSuperficie(contenedor, lecturas, parsear, { alSeleccionar = () => {}, alElegirActivo = null, tituloArriba = false, crestas = false } = {}) {
  const horaVista=(ms)=>ms>=Date.parse(new Date(parsear(lecturas[0].texto).generada).toISOString().slice(0,10))+86400000&&hora(ms)==='00:00'?'24:00':hora(ms);
  const datos = terrenoDia(lecturas, parsear), { codigos, barras, puntos } = datos;
  let giro = -0.7854, inclinacion = 0.5774, amplitud = 1, zoom = 1, ultima = barras.length - 1, todas = true, activo = -1, arrastre = null, proyecciones = [], viva = true;
  const valores = puntos.flat().filter(Boolean).map((p) => Math.abs(p.altura));
  const maximo = Math.max(0.1, ...valores);
  const caja = crear('div', 'superficie-caja');
  const controles = crear('div', 'superficie-controles');
  const etiquetaLectura = crear('label', '', 'Franja '), elegirLectura = crear('select');
  // «Elegir» no fija franja: resalta todas a la vez (decisión del usuario, 22-nov-2026).
  const elegirTodas = crear('option', '', 'Elegir'); elegirTodas.value = -1; elegirLectura.append(elegirTodas);
  barras.forEach((b, i) => { const o = crear('option', '', `${horaVista(b.generada)} UTC`); o.value = i; elegirLectura.append(o); });
  elegirLectura.selectedIndex = 0;
  const pasosLectura = montarPasos(elegirLectura, 'Franja', (i) => seleccionar(i - 1, activo), { repetir: true, ciclar: true });
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
  // Tres vistas con nombre: la inicial oblicua, afinada isometrica a pedido del usuario (22-nov-2026), y las dos perspectivas que pidio (cascada y telar intactas).
  const vistas = [['Oblicua', -0.7854, 0.5774], ['Cascada', 0, 0.9], ['Telar', -1.5708, 1.55]];
  const botonesVista = vistas.map(([nombre, g, inc]) => {
    const b = crear('button', '', nombre);
    b.type = 'button';
    b.setAttribute('aria-label', `Vista ${nombre.toLowerCase()} de la superficie`);
    b.onclick = () => { giro = g; inclinacion = inc; amplitud = 1; zoom = 1; relieve.value = '1'; acercar.value = '1'; dibujar(); };
    return b;
  });
  controles.append(...(crestas ? [etiquetaActivo, etiquetaLectura, etiquetaZoom] : [etiquetaActivo, etiquetaLectura, etiquetaAltura, etiquetaZoom, ...botonesVista])); // Mercado: sin Relieve, Oblicua, Cascada ni Telar; el giro libre llega al ras exacto
  const canvas = crear('canvas', 'superficie-canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Superficie de variación contra la primera lectura real del día. Los selectores permiten leer cada punto. Arrastra para girar sin tope de giro; Zoom acerca y los botones Oblicua, Cascada y Telar llevan a vistas fijas.');
  const detalle = crear('p', 'superficie-detalle'); detalle.setAttribute('aria-live', 'polite');
  if (tituloArriba) detalle.classList.add('superficie-titulo'); // en la vista unificada el nombre y los datos del activo van como título, encima de la superficie (25-nov-2026)
  caja.append(...(tituloArriba ? [controles, detalle, canvas] : [controles, canvas, detalle]));
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
    detalle.append(enlace, document.createTextNode(p ? (crestas ? ` · ${fecha} · Total ${pct(p.altura)} · Parcial ${pct(p.movimiento)} · Actual ${p.precio} · Inicio ${p.referencia}` : ` · ${fecha} · altura ${pct(p.altura)} · entre lecturas ${pct(p.movimiento)} · precio ${p.precio} · referencia ${p.referencia}`) : ` · ${fecha} · sin cierre diario o sin precio comparable`));
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
    if (!crestas) {
    linea(proyectar(-1, -.7, -1), proyectar(-1, -.7, 1), '#786b4c');
    for (const z of [-1, -.5, 0, .5, 1]) {
      const p = proyectar(-1.03, -.7, z);
      texto(p, pct(z * maximo), z === 0 ? ORO : '#9aa0ac', 'right');
    }
    }
    const malla = puntos.map((fila, j) => fila.map((p, i) => p ? { ...proyectar(px(i), py(j), p.altura / maximo), p, i, j } : null));
    proyecciones = malla.flat().filter(Boolean);
    if (crestas) {
      // Crestas (25-nov-2026, prototipo): una línea por activo, altura = recorrido desde la partida del día,
      // pared de fondo con grilla y plano cero dorado. El color de cada tramo es sube/baja contra la lectura anterior;
      // gris si no hay cambio, es la primera lectura o hay un hueco de más de 1,5 h entre lecturas.
      const lados = [{ d: -sin, f: (u, z) => proyectar(-1, u * .7, z) }, { d: sin, f: (u, z) => proyectar(1, u * .7, z) }, { d: -.7 * cos, f: (u, z) => proyectar(u, -.7, z) }, { d: .7 * cos, f: (u, z) => proyectar(u, .7, z) }];
      const pared = lados.reduce((m, l) => l.d < m.d ? l : m);
      c.beginPath(); [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, z], k) => { const q = pared.f(u, z); k ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }); c.closePath(); c.fillStyle = 'rgba(40,44,56,.35)'; c.fill();
      // Marcas fijas cada 10 puntos porcentuales (0, ±10, ±20…), sin derivarlas del máximo; el alto de la pared sí sigue al máximo y las curvas no se recortan.
      const marcas = []; for (let v = -Math.floor(maximo / 10) * 10; v <= maximo + 1e-9; v += 10) marcas.push(v);
      for (const v of marcas) linea(pared.f(-1, v / maximo), pared.f(1, v / maximo), v === 0 ? ORO : '#3a3a34', v === 0 ? 1.6 : .7);
      for (const u of [-1, -.5, 0, .5, 1]) linea(pared.f(u, -1), pared.f(u, 1), '#3a3a34', .7);
      // El plano cero también se ve en el suelo (contorno dorado) y el eje porcentual va en el borde izquierdo de la pared.
      const suelo = [[-1, -.7], [1, -.7], [1, .7], [-1, .7], [-1, -.7]].map(([x, y]) => proyectar(x, y, 0));
      for (let k = 1; k < suelo.length; k++) linea(suelo[k - 1], suelo[k], '#8a7440', 1);
      const izqU = pared.f(-1, 0).x <= pared.f(1, 0).x ? -1 : 1;
      linea(pared.f(izqU, -1), pared.f(izqU, 1), '#786b4c');
      for (const v of marcas) { const q = pared.f(izqU, v / maximo); texto({ x: q.x - 5, y: q.y + 4 }, pct(v), v === 0 ? ORO : '#9aa0ac', 'right'); }
      // Telas entre cada curva y el cero: antes 0,09 por tela; ahora 0,03 y, con muchos activos, se reparte (1/n) para que la suma no tape el fondo al mirar de lado.
      const alfaTela = Math.min(.03, 1 / Math.max(1, codigos.length)).toFixed(4);
      const orden = codigos.map((_, i) => i).sort((i, k) => px(i) * sin - px(k) * sin);
      for (const i of orden) {
        const resaltado = i === activo;
        for (let j = 1; j < malla.length; j++) {
          const a = malla[j - 1][i], b = malla[j][i];
          if (!a || !b) continue; // sin dato deja un hueco, nunca altura cero
          const a0 = proyectar(px(i), py(j - 1), 0), b0 = proyectar(px(i), py(j), 0);
          c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(b0.x, b0.y); c.lineTo(a0.x, a0.y); c.closePath();
          c.fillStyle = resaltado ? 'rgba(180,190,215,.2)' : `rgba(124,138,165,${alfaTela})`; c.fill();
          const hueco = barras[j].generada - barras[j - 1].generada > 5400000;
          linea(a, b, resaltado ? (hueco ? GRIS : (colorMovimiento(b.p.movimiento) ?? GRIS)) : colorAltura(b.p.altura), resaltado ? 3.2 : 1.7);
        }
      }
    } else {
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
      const marcada = cara.j > 0 && (todas || cara.j === ultima); // la franja que termina en la lectura elegida (o todas con «Elegir»), con sus colores intensos
      gradiente.addColorStop(0, marcada ? INTENSOS[cara.colores[0]] ?? cara.colores[0] : cara.colores[0]);
      gradiente.addColorStop(1, marcada ? INTENSOS[cara.colores[1]] ?? cara.colores[1] : cara.colores[1]);
      c.fillStyle = gradiente; c.globalAlpha = marcada ? 1 : .66; c.fill();
      c.globalAlpha = marcada ? .9 : .46; c.strokeStyle = marcada ? '#e8e8ea' : '#c6bc9b'; c.lineWidth = marcada ? 1 : .45; c.stroke(); c.globalAlpha = 1;
    }
    }
    // Los carriles de cada activo unen únicamente sus lecturas. Una foto sola no crea terreno.
    if (!crestas) for (let i = 0; i < codigos.length; i++) for (let j = 1; j < malla.length; j++) {
      const a = malla[j - 1][i], b = malla[j][i];
      if (a && b && b.p.movimiento !== null) linea(a, b, colorMovimiento(b.p.movimiento), .8);
    }
    const fila = malla[ultima] || [];
    if (!crestas) for (let i = 1; i < fila.length; i++) if (fila[i - 1] && fila[i]) linea(fila[i - 1], fila[i], barras.length === 1 ? GRIS : '#ded0a4', 1.2);
    if (barras.length === 1) for (const p of fila.filter(Boolean)) { c.fillStyle = GRIS; c.fillRect(p.x - 1, p.y - 1, 2, 2); }
    if (crestas && barras.length) {
      const paso = Math.max(1, Math.ceil(barras.length / (ancho < 600 ? 5 : 8)));
      for (let j = 0; j < barras.length; j += paso) { const q = proyectar(1.04, py(j), -1); texto(q, horaVista(barras[j].generada), '#d9cfae'); linea(proyectar(1, py(j), -1), proyectar(1.03, py(j), -1), '#786b4c'); }
      texto({ x: ancho - 10, y: 26 }, `${horaVista(barras[0].generada)} → ${horaVista(barras.at(-1).generada)} UTC`, '#bbb39e', 'right');
    } else if (ancho < 600 && barras.length) {
      texto({ x: ancho - 10, y: 43 }, `${horaVista(barras[0].generada)} → ${horaVista(barras.at(-1).generada)}`, '#bbb39e', 'right');
    } else for (const j of [...new Set([0, Math.floor((barras.length - 1) / 2), barras.length - 1])]) {
      if (!barras[j]) continue;
      const p = proyectar(1.04, py(j), 0); texto(p, `${horaVista(barras[j].generada)}`);
    }
    const elegido = malla[ultima]?.[activo];
    if (elegido) {
      if (crestas) { const base = proyectar(px(activo), py(ultima), 0); linea(elegido, base, '#fff1cb', 1); c.beginPath(); c.arc(base.x, base.y, 2.5, 0, Math.PI * 2); c.fillStyle = ORO; c.fill(); }
      c.beginPath(); c.arc(elegido.x, elegido.y, 4, 0, Math.PI * 2); c.fillStyle = '#fff1cb'; c.fill(); c.strokeStyle = '#080604'; c.lineWidth = 1.4; c.stroke();
      texto({ x: elegido.x + 8, y: elegido.y - 9 }, `${elegido.p.codigo} ${pct(elegido.p.altura)}`, '#fff1cb');
    }
    if (crestas) { const w = (ancho - 20) / ESCALA_ALTURA.length; ESCALA_ALTURA.forEach(([, col, et], k) => { c.fillStyle = col; c.fillRect(10 + k * w, alto - 30, w - 2, 7); c.font = '9px Georgia'; c.fillStyle = '#9aa0ac'; c.textAlign = 'center'; c.fillText(et, 10 + k * w + w / 2 - 1, alto - 8); }); }
    describir();
  }
  let silencioso = false;
  const seleccionar = (j, i) => {
    if (j < -1 || j >= barras.length || i < -1 || i >= codigos.length) return;
    const x = window.scrollX, y = window.scrollY;
    todas = j < 0;
    if (j >= 0) ultima = j;
    activo = i;
    elegirLectura.value = j;
    if (i < 0) elegirActivo.selectedIndex = 0; else elegirActivo.value = i;
    pasosLectura.actualizar(); pasosActivo.actualizar();
    // Se conservan los mismos controles y el mismo terreno: no se reinicia su ángulo,
    // relieve, foco o posición al avanzar o usar un desplegable.
    dibujar(); alSeleccionar(ultima);
    if (alElegirActivo && !silencioso) alElegirActivo(i >= 0 ? codigos[i] : null);
    if (window.scrollX !== x || window.scrollY !== y) window.scrollTo({ left: x, top: y, behavior: 'instant' });
  };
  elegirLectura.onchange = () => seleccionar(Number(elegirLectura.value), activo);
  elegirActivo.onchange = () => seleccionar(ultima, Number(elegirActivo.value));
  relieve.oninput = () => { amplitud = Number(relieve.value); dibujar(); };
  // Zoom (Mercado, 25-nov-2026): pellizco con dos dedos y rueda sobre la gráfica, sincronizados con el slider; solo actúan dentro del lienzo.
  const dedos = new Map(); let pellizco = null;
  const fijarZoom = (z) => { zoom = Math.max(.6, Math.min(2, z)); acercar.value = String(Math.round(zoom * 20) / 20); dibujar(); };
  if (crestas) canvas.addEventListener('wheel', (e) => { e.preventDefault(); fijarZoom(zoom * Math.exp(-e.deltaY / 500)); }, { passive: false });
  const distDedos = () => { const [a, b] = [...dedos.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  canvas.onpointerdown = (e) => {
    if (crestas) { dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (dedos.size === 2) { pellizco = { d: distDedos() || 1, zoom }; arrastre = null; canvas.setPointerCapture(e.pointerId); return; } }
    arrastre = { x: e.clientX, y: e.clientY, giro, inclinacion, movido: false }; canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (crestas && dedos.has(e.pointerId)) dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pellizco && dedos.size === 2) { fijarZoom(pellizco.zoom * distDedos() / pellizco.d); return; }
    if (!arrastre) return;
    if (Math.abs(e.clientX - arrastre.x) + Math.abs(e.clientY - arrastre.y) > 4) arrastre.movido = true;
    giro = arrastre.giro + (e.clientX - arrastre.x) / 170;
    inclinacion = Math.max(crestas ? 0 : .05, Math.min(1.7, arrastre.inclinacion + (e.clientY - arrastre.y) / 210));
    if (crestas) { // Mercado (25-nov-2026): imán hacia el ras exacto y hacia los giros de frente o de canto, para superponer curvas sin inclinación residual con el dedo
      if (inclinacion < .09) inclinacion = 0;
      const m = Math.round(giro / (Math.PI / 2)) * (Math.PI / 2); if (Math.abs(giro - m) < .07) giro = m;
    }
    dibujar();
  };
  canvas.onpointerup = (e) => {
    dedos.delete(e.pointerId); if (pellizco) { if (dedos.size < 2) pellizco = null; arrastre = null; return; }
    if (arrastre && !arrastre.movido) {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const cercano = proyecciones.reduce((a, p) => Math.hypot(p.x - x, p.y - y) < Math.hypot(a.x - x, a.y - y) ? p : a, { x: 1e6, y: 1e6 });
      if (Math.hypot(cercano.x - x, cercano.y - y) < 35) seleccionar(cercano.j, cercano.i);
    }
    arrastre = null;
  };
  canvas.onpointercancel = (e) => { dedos.delete(e.pointerId); pellizco = null; arrastre = null; };
  const observador = new ResizeObserver(dibujar); observador.observe(caja);
  dibujar(); alSeleccionar(ultima);
  // Elegir el activo desde fuera (otra vista de la página unificada), sin avisar de vuelta.
  const elegirDesdeFuera = (codigo) => { silencioso = true; try { seleccionar(ultima, codigo ? codigos.indexOf(codigo) : -1); } finally { silencioso = false; } };
  return { datos, elegirActivo: elegirDesdeFuera, desmontar() { viva = false; pasosActivo.desmontar(); pasosLectura.desmontar(); observador.disconnect(); canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null; } };
}
