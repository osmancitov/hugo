// Modulo radiografias: "@hugo radiografia [CLASE] CODIGO [CODIGO ...]" dibuja la radiografia de
// variacion de cada activo con sus registros guardados, la guarda y la sube a este mismo hilo.
// La CLASE (stock/cripto) es opcional y aplica a toda la lista, como en registra: desambigua los
// codigos con carpeta en las dos clases. Sin clase, la de cada activo se deduce de su carpeta.
// El dibujo lo hace el productor (Python + matplotlib), el programa afinado y aprobado con SPCX
// (modulo md/radiografia-de-variacion.md del Nucleo). Este modulo lo lleva escrito y lo instala en
// ~/.local/share/hugo-radiografias/ la primera vez y cada vez que cambie; lo ejecuta con python3.
// Si falta python3 o matplotlib en la Debian, lo dice y ofrece el instalador autorizable; no dibuja nada.
// Registros: la misma carpeta base que usa el registro (HUGO_VELAS_DIR); la clase (stock/cripto)
// se deduce de la carpeta del activo si la orden no la fija; si está en ambas, se detiene.
// Destino de las imagenes: un clon de la estructura de registros bajo graficas/ (decision del
// usuario, 15-nov-2026): graficas/velas-24h/<clase>/<CODIGO>/<CODIGO>_radiografia.png junto a
// registros/; HUGO_GRAFICAS_DIR cambia la raiz. El nombre <CODIGO>_radiografia.png es decision del
// usuario (16-nov-2026): dice el activo y lo que muestra incluso fuera de su carpeta. Cada orden
// regenera la imagen del activo con su historial completo y pisa la anterior SOLO si la escribio
// este modulo (huella sha256 en .<CODIGO>_radiografia.sha256);
// un archivo ajeno nunca se pisa: se avisa y la imagen nueva solo va al hilo.
// Cada radiografía lleva en el subtítulo el nombre y el tipo del activo (empresa / fondo ETF /
// apalancado N× / inverso N×; decisión del usuario 15-nov-2026, para no confundir fondos con
// empresas). La clase operativa de Hugo no cambia: siguen siendo «stock» en carpetas y ordenes.
// Ejecuta directo, como registra y sincroniza: la respuesta a la orden ES la imagen. Es trabajo
// largo: se anota en ctx.activas (la ven estado, stop y restart) y mira la parada unica entre
// activo y activo; lo ya dibujado se conserva. Al cerrar la encomienda avisa cuantas entrego
// y si alguna fallo (decision del usuario, 16-nov-2026); si le piden parada, el cierre dice
// cuantas llevaba, sin darla por terminada.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EXCLUIDOS, CODIGO_OK, CLASES, resolverActivo } from './activos.mjs';

const ex = promisify(execFile);

// Nombre y tipo de cada activo registrado, verificados (15-nov-2026): nombre del producto en
// Binance (el que ya valida activos.mjs); ARM/ASML/IBM/SPY, que Binance da a secas, curados desde
// el directorio oficial. Clase fondo/empresa: columna ETF del directorio Nasdaq (nasdaqtrader.com).
// Apalancamiento/inverso: nombre oficial del fondo; TQQQ 3x, SQQQ -3x y UVXY 1.5x confirmados con
// el emisor (proshares.com). Un activo nuevo que no esté aquí: nombre en vivo de Binance y tipo
// SOLO si el propio nombre lo declara; si no, la gráfica sale sin tipo (nunca se inventa).
const ACTIVOS_INFO = {
  AAOI: ["Applied Optoelectronics", "empresa"],
  AAPL: ["Apple", "empresa"],
  ADBE: ["Adobe", "empresa"],
  AGPU: ["Axe Compute", "empresa"],
  ALAB: ["Astera Labs", "empresa"],
  AMAT: ["Applied Materials", "empresa"],
  AMC: ["AMC Entertainment Holdings", "empresa"],
  AMD: ["Advanced Micro Devices", "empresa"],
  AMZN: ["Amazon", "empresa"],
  APP: ["Applovin Corp", "empresa"],
  ARM: ["Arm Holdings", "empresa"],
  ASML: ["ASML Holding", "empresa"],
  ASTS: ["AST SpaceMobile", "empresa"],
  AVGO: ["Broadcom", "empresa"],
  AXTI: ["AXT", "empresa"],
  BABA: ["Alibaba", "empresa"],
  BB: ["Blackberry", "empresa"],
  BE: ["Bloom Energy", "empresa"],
  BMNR: ["BitMine Immersion Technologies", "empresa"],
  BNC: ["BNB Standard Corporation", "empresa"],
  BOT: ["RoboStrategy Inc", "empresa"],
  BRKB: ["Berkshire Hathaway", "empresa"],
  BSP: ["Bending Spoons", "empresa"],
  CBRS: ["Cerebras", "empresa"],
  COHR: ["Coherent", "empresa"],
  COIN: ["Coinbase", "empresa"],
  CRCL: ["Circle Internet Group", "empresa"],
  CRDO: ["Credo Technology", "empresa"],
  CRM: ["Salesforce", "empresa"],
  CRWD: ["CrowdStrike", "empresa"],
  CRWV: ["CoreWeave", "empresa"],
  CYPH: ["Cypherpunk Technologies", "empresa"],
  DELL: ["Dell", "empresa"],
  DJT: ["Trump Media & Technology Group", "empresa"],
  DRAM: ["Roundhill Memory ETF", "fondo ETF"],
  EWJ: ["iShares MSCI Japan ETF", "fondo ETF"],
  EWT: ["iShares MSCI Taiwan ETF", "fondo ETF"],
  EWY: ["iShares MSCI South Korea ETF", "fondo ETF"],
  EWZ: ["iShares MSCI Brazil ETF", "fondo ETF"],
  EWZS: ["iShares MSCI Brazil Small-Cap ETF", "fondo ETF"],
  FLNC: ["Fluence Energy", "empresa"],
  FWDI: ["Forward Industries", "empresa"],
  GEV: ["GE Vernova Inc", "empresa"],
  GLW: ["Corning", "empresa"],
  GME: ["GameStop", "empresa"],
  GOOGL: ["Alphabet", "empresa"],
  GPRO: ["GoPro", "empresa"],
  GS: ["Goldman Sachs", "empresa"],
  HIMS: ["Hims & Hers", "empresa"],
  HOOD: ["Robinhood", "empresa"],
  HPE: ["Hewlett Packard", "empresa"],
  IBM: ["IBM", "empresa"],
  INTC: ["Intel", "empresa"],
  INTW: ["GraniteShares 2X Long INTC ETF", "fondo ETF apalancado 2×"],
  IREN: ["IREN Limited", "empresa"],
  IWM: ["iShares Russell 2000 ETF", "fondo ETF"],
  JPM: ["JPMorgan Chase", "empresa"],
  KORU: ["South Korea Bull 3X ETF", "fondo ETF apalancado 3×"],
  KSTR: ["KraneShares STAR Market 50 ETF", "fondo ETF"],
  LITE: ["Lumentum", "empresa"],
  LLY: ["Eli Lilly", "empresa"],
  MDB: ["Mongodb", "empresa"],
  MELI: ["MercadoLibre", "empresa"],
  META: ["Meta", "empresa"],
  MRNA: ["Moderna", "empresa"],
  MRVL: ["Marvell Technology", "empresa"],
  MSFT: ["Microsoft", "empresa"],
  MSTR: ["Strategy", "empresa"],
  MU: ["Micron Technology", "empresa"],
  MUU: ["Direxion MU Bull 2X ETF", "fondo ETF apalancado 2×"],
  MVLL: ["GraniteShares 2X Long MRVL ETF", "fondo ETF apalancado 2×"],
  NBIS: ["Nebius", "empresa"],
  NFLX: ["Netflix", "empresa"],
  NOK: ["Nokia", "empresa"],
  NU: ["Nu Holdings", "empresa"],
  NVDA: ["NVIDIA", "empresa"],
  ORCL: ["Oracle", "empresa"],
  PDD: ["PDD Holdings", "empresa"],
  PENG: ["Penguin Solutions", "empresa"],
  PLTR: ["Palantir", "empresa"],
  PYPL: ["Paypal", "empresa"],
  QCOM: ["Qualcomm", "empresa"],
  QNT: ["Quantinuum", "empresa"],
  QQQ: ["Invesco QQQ Trust", "fondo ETF"],
  RDDT: ["Reddit", "empresa"],
  RKLB: ["Rocket Lab", "empresa"],
  SECZ: ["Securitize", "empresa"],
  SHAZ: ["SharonAI", "empresa"],
  SKDD: ["GraniteShares 2x Short SK Hynix Daily ETF", "fondo ETF inverso 2×"],
  SKHY: ["SK Hynix", "empresa"],
  SKUU: ["GraniteShares 2x Long SK Hynix Daily ETF", "fondo ETF apalancado 2×"],
  SMCI: ["Super Micro Computer", "empresa"],
  SMH: ["VanEck Semiconductor ETF", "fondo ETF"],
  SNDK: ["SanDisk", "empresa"],
  SNXX: ["Tradr 2X Long SNDK ETF", "fondo ETF apalancado 2×"],
  SOXL: ["Semicon Bull 3X ETF", "fondo ETF apalancado 3×"],
  SOXS: ["Direxion Semiconductor Bear 3X ETF", "fondo ETF inverso 3×"],
  SPCX: ["SpaceX", "empresa"],
  SPY: ["SPDR S&P 500 ETF Trust", "fondo ETF"],
  SQQQ: ["ProShares UltraPro Short QQQ", "fondo ETF inverso 3×"],
  STX: ["Seagate", "empresa"],
  TMF: ["Direxion Daily 20 Year Treasury Bull 3X ETF", "fondo ETF apalancado 3×"],
  TQQQ: ["ProShares UltraPro QQQ", "fondo ETF apalancado 3×"],
  TSLA: ["Tesla", "empresa"],
  TSM: ["TSMC", "empresa"],
  USAR: ["USA Rare Earth", "empresa"],
  USDE: ["StablecoinX", "empresa"],
  UVXY: ["ProShares Ultra VIX Short-Term Futures ETF", "fondo ETF apalancado 1.5×"],
  VST: ["Vistra Corp", "empresa"],
  WDC: ["Western Digital", "empresa"],
  WEN: ["Wendy's", "empresa"],
  ZM: ["Zoom", "empresa"],
};

// Texto «nombre · tipo» para el subtítulo. Los 105 stock registrados: de la tabla verificada
// (solo aplica a stock: un cripto con el mismo código es otro activo y no hereda ese nombre).
// Uno nuevo o un cripto: su nombre en vivo de Binance, SIN tipo (nunca se inventa una
// clasificación); si no se puede leer el nombre, la radiografía sale sin la línea de info.
async function infoDe(codigo, clase) {
  if (clase === 'stock') {
    const conocido = ACTIVOS_INFO[codigo];
    if (conocido) return `${conocido[0]} · ${conocido[1]}`;
  }
  try {
    const r = await resolverActivo(clase, codigo);
    return r && r.ok && r.nombre ? r.nombre : '';
  } catch { return ''; }
}

const PRODUCTOR = `#!/usr/bin/env python3
"""Productor de radiografías de variación.
Aplica el módulo md/radiografia-de-variacion.md a cualquier activo de los registros.

Uso: productor_radiografia.py CODIGO SALIDA.png [BASE_REGISTROS] [INFO] [CLASE]
  BASE_REGISTROS: carpeta velas-24h (por defecto ~/Documents/hugo/registros/velas-24h).
  CLASE (opcional, stock/cripto): la que validó la orden. Sin ella la clase se deduce de
  la carpeta del activo; si está en ambas, se detiene.
  INFO (opcional): texto «nombre · tipo» del activo para el subtítulo (decisión del
  usuario, 15-nov-2026: empresa / fondo ETF / apalancado N× / inverso N× bien visibles).

Marco vertical (decisión del usuario, 15-nov-2026, igual para todos los activos):
  - Eje EXACTO de -15 a +15 %, cero centrado, con líneas de borde explícitas en ±15
    y rejilla cada 2 puntos como en el módulo. Sin márgenes extra.
  - Un día que se sale del marco lleva un triángulo en el borde (color del día) con su
    variación real al lado; el recorte es SOLO del dibujo: áreas, razones y v/p siempre
    se calculan con las variaciones completas.
Dependencias: python3 + matplotlib (y numpy, que matplotlib trae).
"""
import json, glob, os, statistics, sys, datetime
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from matplotlib.collections import LineCollection, PolyCollection
from matplotlib.lines import Line2D
from matplotlib.patches import Patch, Polygon
from matplotlib.legend_handler import HandlerBase
from matplotlib import font_manager
import math

# Códigos con nombre Unicode (p.ej. 牛来): DejaVu no trae glifos CJK. Si el sistema tiene
# una fuente que sí, se usa como respaldo por glifo SOLO en título y subtítulo (donde va el
# código/nombre), pasando la lista de familias al texto (matplotlib >= 3.6). DejaVu sigue
# primero: el diseño no cambia. Sin fuente CJK instalada, todo queda como estaba.
_CJK = ['Noto Sans CJK SC', 'Noto Sans CJK TC', 'Noto Sans CJK JP', 'Source Han Sans SC',
        'WenQuanYi Zen Hei', 'WenQuanYi Micro Hei', 'Droid Sans Fallback', 'AR PL UMing CN',
        'Microsoft YaHei', 'SimHei', 'PingFang SC', 'Unifont', 'Unifont-JP']
_inst = {f.name for f in font_manager.fontManager.ttflist}
_cjk = [c for c in _CJK if c in _inst]
_FAM = ['DejaVu Sans'] + _cjk if _cjk else None  # None = familia por defecto, sin tocar

BG='#131722'; BLUE='#5a92d6'; TICK='#c9ccd3'
GRID_D='#212835'; GRID_15='#313b50'; GRID_1='#3d4759'; ZERO='#8b93a1'
GREEN=(37/255,133/255,92/255); RED=(183/255,61/255,64/255)
ALPHA=0.9
MESES_EN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
# Marco uniforme decidido por el usuario (15-nov-2026): eje EXACTO de -15 a +15 %, cero
# centrado, igual para todos los activos. Rejilla cada 2 puntos (módulo) y bordes del marco
# explícitos en ±15. Lo que se sale del marco se recorta SOLO en el dibujo: el día lleva una
# marca en el borde (triángulo del color del día) con su variación real, y las cuentas
# (áreas, razones, v/p) siempre se hacen con las variaciones completas.
YLO0, YHI0, TLO, THI = -15, 15, -14, 14
MARCO = '#3d4759'  # color de borde: el fuerte de la rejilla

def ventana(rets):
    """Devuelve (ylo, yhi, tick_lo, tick_hi): el marco uniforme, para todos igual."""
    return YLO0, YHI0, TLO, THI

def cargar(base, codigo, clase_arg=''):
    if clase_arg:
        clases = [clase_arg] if glob.glob(os.path.join(base, clase_arg, codigo, f'26*_{codigo}')) else []
    else:
        clases = [c for c in ('stock', 'cripto') if glob.glob(os.path.join(base, c, codigo, f'26*_{codigo}'))]
    if len(clases) != 1:
        sys.exit(f'{codigo}: esperaba una sola carpeta de clase con registros; hay {len(clases)} ({clases})')
    rows = []
    for f in sorted(glob.glob(os.path.join(base, clases[0], codigo, f'26*_{codigo}'))):
        rows += json.load(open(f))
    rows.sort(key=lambda r: r[0])
    return rows, clases[0]

def radiografia(codigo, base, out, info='', clase_arg=''):
    rows, clase = cargar(base, codigo, clase_arg)
    if len(rows) < 2:
        sys.exit(f'{codigo}: hacen falta al menos 2 velas; hay {len(rows)}')
    fechas=[datetime.datetime.utcfromtimestamp(r[0]/1000) for r in rows]
    ohlc4=[(float(r[1])+float(r[2])+float(r[3])+float(r[4]))/4 for r in rows]
    vol=[float(r[5]) for r in rows]
    # Variación de cada vela entre su apertura y su cierre, como la app.
    rets=[(float(r[4])/float(r[1])-1)*100 for r in rows]
    rs=rets
    npts=len(rs)
    vp=[v/p for v,p in zip(vol,ohlc4)]
    vmin,vmax=min(vp),max(vp); vmed=statistics.median(vp)
    pos=[r for r in rets if r>0]; neg=[r for r in rets if r<0]
    asum=sum(pos); ansum=sum(neg); dpos=len(pos); dneg=len(neg)
    if ansum == 0 or dneg == 0:
        sys.exit(f'{codigo}: sin días rojos no hay razones que dibujar; revisar con el autor')

    ylo, yhi, tlo, thi = ventana(rets)

    d15=[i for i,f in enumerate(fechas) if f.day==15]
    d01=[i for i,f in enumerate(fechas) if f.day==1]
    xt_d=sorted(d15+d01)
    xt_l=[f'{fechas[i].day:02d} {MESES_EN[fechas[i].month-1]}' for i in xt_d]

    def wpix(v): return max(0.7, min(12.0, 0.7+(v-vmin)/(vmax-vmin)*11.3))

    fig=plt.figure(figsize=(15.16,7.58), dpi=100)
    fig.patch.set_facecolor(BG)
    ax=fig.add_axes([80/1516,(758-722)/758,1409/1516,(722-57)/758])
    ax.set_facecolor(BG)
    ax.set_xlim(0,npts-1); ax.set_ylim(ylo,yhi)
    for s in ax.spines.values(): s.set_visible(False)
    ax.tick_params(length=0, colors=TICK, labelsize=10.5)

    for d in range(npts):
        ax.axvline(d, color=GRID_D, lw=0.72, zorder=1)
    for d in d15:
        ax.axvline(d, color=GRID_15, lw=1.44, zorder=1.5)
    for d in d01:
        ax.axvline(d, color=GRID_1, lw=1.44, zorder=1.5)
    for v in range(tlo, thi+1, 2):
        ax.axhline(v, color=GRID_D, lw=0.72, zorder=1)
    ax.axhline(ylo, color=MARCO, lw=1.44, zorder=1.6)
    ax.axhline(yhi, color=MARCO, lw=1.44, zorder=1.6)

    gverts=[]; rverts=[]
    for i in range(1,npts):
        r=rs[i]
        if r>0: gverts.append([(i-1,0),(i-1,r),(i,r),(i,0)])
        elif r<0: rverts.append([(i-1,0),(i-1,r),(i,r),(i,0)])
    ax.add_collection(PolyCollection(gverts, facecolor=GREEN, alpha=0.5, edgecolor='none', zorder=2))
    ax.add_collection(PolyCollection(rverts, facecolor=RED, alpha=0.5, edgecolor='none', zorder=2))

    ax.axhline(0, color=ZERO, lw=2.2, zorder=4)

    segs=[[(i-1,rs[i-1]),(i,rs[i])] for i in range(1,npts)]
    widths=[wpix(vp[i])*0.72 for i in range(1,npts)]
    lc=LineCollection(segs, linewidths=widths, color=BLUE, alpha=ALPHA,
                      capstyle='round', joinstyle='round', zorder=5)
    ax.add_collection(lc)

    marcas = [ylo] + list(range(tlo, thi+1, 2)) + [yhi]  # rejilla cada 2 puntos + bordes ±15 explícitos

    class Flag:
        pass

    class FlagHandler(HandlerBase):
        def create_artists(self, legend, orig_handle, xdescent, ydescent, width, height, fontsize, trans):
            x0, y0 = xdescent, ydescent
            g = Polygon([(x0,y0+height),(x0,y0),(x0+width,y0+height)], closed=True,
                        facecolor=GREEN, alpha=0.5, edgecolor='none')
            r = Polygon([(x0,y0),(x0+width,y0),(x0+width,y0+height)], closed=True,
                        facecolor=RED, alpha=0.5, edgecolor='none')
            for a in (g, r):
                a.set_transform(trans)
            return [g, r]

    handles=[Line2D([0],[0],color=BLUE,alpha=ALPHA,lw=0.7*0.72),
             Line2D([0],[0],color=BLUE,alpha=ALPHA,lw=12*0.72),
             Patch(facecolor=GREEN,alpha=0.5,edgecolor='none'),
             Patch(facecolor=RED,alpha=0.5,edgecolor='none'),
             Flag()]
    labels=[f'mín {round(vmin)} v/p', f'máx {vmax:,.0f} v/p'.replace(',','.'),
            f'+{round(asum)} %d / {dpos} d',
            f'−{round(abs(ansum))} %d / {dneg} d',
            f'{asum/abs(ansum):.2f} / {dpos/dneg:.2f}']
    leg=ax.legend(handles, labels, loc='upper right', bbox_to_anchor=(1.002,0.9865),
                  fontsize=10, frameon=True, facecolor='#161a25', edgecolor='#1a1e2a',
                  labelcolor=TICK, borderpad=0.3, labelspacing=0.42, handlelength=1.7,
                  handletextpad=0.6, borderaxespad=0, handler_map={Flag: FlagHandler()})
    leg.set_zorder(10)
    # La leyenda va encima (zorder 10): una etiqueta de marca que caiga en su caja quedaría
    # tapada. Se mide su caja en coordenadas de datos para que las etiquetas la esquiven.
    fig.canvas.draw()
    bb_leg = leg.get_window_extent().transformed(ax.transData.inverted())
    medio_txt = 23.0 * npts / 1409.0  # semiancho estimado de una etiqueta, en días

    # días fuera del marco: triángulo en el borde con la variación real
    fuera = [(i, rs[i]) for i in range(1, npts) if abs(rs[i]) > yhi]
    filas_txt = []  # (x, fila) para no chocar
    for i, r in fuera:
        arriba = r > 0
        ym = yhi if arriba else ylo
        color = GREEN if arriba else RED
        ax.scatter([i], [ym], marker='^' if arriba else 'v', s=90, color=[color],
                   alpha=0.9, zorder=6, clip_on=False)
        # la etiqueta se corre hacia el tramo más plano para no montarse en la línea,
        # pero nunca invierte el orden respecto a su triángulo (evita conectores cruzados)
        pi = rs[i - 1] if i - 1 >= 0 else 0.0
        si = rs[i + 1] if i + 1 < npts else 0.0
        pref = -1.8 if abs(si - r) > abs(pi - r) else 1.8
        ultimo = filas_txt[-1][0] if filas_txt else None
        i_txt = i + pref
        for cand in (pref, 0.0, -pref):
            if ultimo is None or i + cand > ultimo + 0.8:
                i_txt = i + cand
                break
        fila = 0
        for xp, fp in filas_txt:
            if abs(xp - i_txt) < 6 and fp == fila:
                fila += 1
        # si la etiqueta caería dentro de la caja de la leyenda, baja de fila hasta salir
        if arriba:
            while (i_txt + medio_txt > bb_leg.x0) and (i_txt - medio_txt < bb_leg.x1) \
                    and (ym - (1.6 + fila*2.1) > bb_leg.y0):
                fila += 1
        filas_txt.append((i_txt, fila))
        yt = ym - (1.6 + fila*2.1) if arriba else ym + (1.2 + fila*2.1)
        # conector discreto de la marca a su etiqueta (la etiqueta se corre para no chocar)
        yc0 = ym - 0.6 if arriba else ym + 0.6
        yc1 = yt + 0.15 if arriba else yt - 0.15
        ax.plot([i, i_txt], [yc0, yc1], color=TICK, alpha=0.45, lw=0.8, zorder=5.5)
        ax.text(i_txt, yt, f'{"+" if arriba else "−"}{abs(r):.1f} %', ha='center',
                va='bottom' if not arriba else 'top', fontsize=8, color=TICK, zorder=6, clip_on=False,
                path_effects=[pe.withStroke(linewidth=2.5, foreground=BG)])

    ax.set_yticks(marcas)
    ax.set_yticklabels([f'{v}%' for v in marcas])
    ax.set_xticks(xt_d); ax.set_xticklabels(xt_l)
    ax.set_ylabel('Variación diaria', fontsize=12, color=TICK, labelpad=8)

    fig.text(0.5,0.980,f'{codigo} variación diaria', ha='center', va='center', fontsize=14, color='#e8eaed', fontfamily=_FAM)
    partes = [f'{info}'] if info else []
    partes.append(f'Grosor = volumen/precio · {len(rets)} días')
    fig.text(0.5,0.947,' · '.join(partes), ha='center', va='center', fontsize=11, color='#9aa0ac', fontfamily=_FAM)

    d = os.path.dirname(os.path.abspath(out))
    os.makedirs(d, exist_ok=True)
    fig.savefig(out, facecolor=BG)
    print(f'saved {out} | {codigo} ({clase}) velas={len(rows)} rets={len(rets)} | '
          f'+{round(asum)} /{round(abs(ansum))} %d | {dpos}/{dneg} d | '
          f'razones {asum/abs(ansum):.2f}/{dpos/dneg:.2f} | v/p {round(vmin)}/{round(vmed)}/{round(vmax)} | '
          f'ventana {ylo:.2f}…{yhi:.2f}')

if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit('uso: productor_radiografia.py CODIGO SALIDA.png [BASE_REGISTROS] [INFO] [CLASE]')
    base = sys.argv[3] if len(sys.argv) > 3 else os.path.expanduser('~/Documents/hugo/registros/velas-24h')
    info = sys.argv[4] if len(sys.argv) > 4 else ''
    clase_arg = sys.argv[5] if len(sys.argv) > 5 else ''
    radiografia(sys.argv[1].upper(), base, sys.argv[2], info, clase_arg)
`;

export function registrar(ctx) {
  const { app, botToken } = ctx;
  const decir = (event, text) => app.client.chat.postMessage({ token: botToken, channel: event.channel, thread_ts: event.thread_ts || event.ts, text });
  const dirTrabajo = () => path.join(os.homedir(), '.local', 'share', 'hugo-radiografias');
  const base = () => process.env.HUGO_VELAS_DIR || ctx.conf.HUGO_VELAS_DIR || path.join(os.homedir(), 'Documents', 'hugo', 'registros', 'velas-24h');
  // graficas/ junto a registros/ en la raiz de hugo (decision del usuario); HUGO_GRAFICAS_DIR la cambia.
  const graficas = () => process.env.HUGO_GRAFICAS_DIR || ctx.conf.HUGO_GRAFICAS_DIR || path.join(path.dirname(path.dirname(base())), 'graficas', 'velas-24h');
  const sha256 = (ruta) => crypto.createHash('sha256').update(fs.readFileSync(ruta)).digest('hex');

  // Deja el productor instalado y al dia, con escritura atomica. Devuelve su ruta.
  async function asegurarProductor() {
    const dir = dirTrabajo();
    fs.mkdirSync(dir, { recursive: true });
    const ruta = path.join(dir, 'productor_radiografia.py');
    let actual = null;
    try { actual = fs.readFileSync(ruta, 'utf8'); } catch {}
    if (actual !== PRODUCTOR) {
      const tmp = path.join(dir, `.productor-${process.pid}-${Date.now()}.tmp`);
      fs.writeFileSync(tmp, PRODUCTOR);
      fs.renameSync(tmp, ruta);
    }
    return ruta;
  }

  // python3 y matplotlib disponibles; si falta algo, devuelve el texto del aviso.
  async function entornoListo() {
    try { await ex('python3', ['--version']); }
    catch { return 'No puedo dibujar radiograf\u00edas todav\u00eda: falta python3 en la Debian. El asistente puede prepararte un instalador que lo resuelve, para aprobarlo con tu \u{1F44D}.'; }
    try { await ex('python3', ['-c', 'import matplotlib']); }
    catch { return 'No puedo dibujar radiograf\u00edas todav\u00eda: falta matplotlib en la Debian. El asistente puede prepararte un instalador que lo resuelve, para aprobarlo con tu \u{1F44D}.'; }
    return '';
  }

  // Clase del activo segun sus registros: una sola o se detiene ese activo.
  function claseDe(codigo) {
    const ok = new RegExp(`^\\d{4}_${codigo}$`);
    const clases = CLASES.filter((c) => {
      try { return fs.readdirSync(path.join(base(), c, codigo)).some((n) => ok.test(n)); } catch { return false; }
    });
    return clases.length === 1 ? clases[0] : null;
  }

  // Guarda la imagen solo si el destino esta libre o lo escribio este modulo. Devuelve texto de aviso o ''.
  function guardar(png, codigo, clase) {
    const destino = path.join(graficas(), clase, codigo);
    const salida = path.join(destino, `${codigo}_radiografia.png`);
    const huella = path.join(destino, `.${codigo}_radiografia.sha256`);
    if (fs.existsSync(salida)) {
      let previa = null;
      try { previa = fs.readFileSync(huella, 'utf8').trim(); } catch {}
      if (previa !== sha256(salida)) {
        return `${codigo}: ya hab\u00eda un ${codigo}_radiografia.png en ${destino} que no gener\u00e9 yo; no lo pis\u00e9. La radiograf\u00eda nueva va solo en este mensaje.`;
      }
    }
    fs.mkdirSync(destino, { recursive: true });
    fs.copyFileSync(png, salida);
    fs.writeFileSync(huella, sha256(salida) + '\n');
    return '';
  }

  ctx.comando(/^\s*radiograf[ií]as?(?:\s|$)/i, async (event, texto) => {
    const partes = texto.trim().replace(/[.!?]+$/, '').split(/[\s,;]+/);
    partes.shift();
    // Clase opcional al inicio: aplica a toda la lista y desambigua carpetas duplicadas.
    let claseOrden = null;
    if (partes.length && CLASES.includes(partes[0].toLowerCase())) claseOrden = partes.shift().toLowerCase();
    const codigos = partes.map((p) => p.toUpperCase());
    if (!codigos.length || codigos.length > 120 || codigos.some((c) => !CODIGO_OK.test(c))) return decir(event, 'Indica uno o varios c\u00f3digos: radiograf\u00eda SPCX NVDA (o radiograf\u00eda cripto BTC ETH). No dibuj\u00e9 nada.');
    if (new Set(codigos).size !== codigos.length) return decir(event, 'Hay c\u00f3digos repetidos en la lista. Qu\u00edtalos y vuelve a pedirlo; no dibuj\u00e9 nada.');
    const falta = await entornoListo();
    if (falta) return decir(event, falta);
    const productor = await asegurarProductor();
    const paradaAlEmpezar = ctx.parada.n;
    const idAct = `radiografias-${Date.now()}`;
    ctx.activas.set(idAct, { que: `dibujar radiograf\u00edas (${codigos.length})`, desde: Date.now(), largo: true });
    // Cierre de la encomienda (decision del usuario, 16-nov-2026): dice cuantas entrego y si
    // alguna fallo. Entregada = su imagen llego al hilo (el aviso de no-pisado no la impide).
    const hechas = [];
    const fallas = [];
    try {
      for (let i = 0; i < codigos.length; i++) {
        if (ctx.parada.n !== paradaAlEmpezar) {
          await decir(event, `Parada pedida: no sigo con el resto de la lista. Llevaba ${hechas.length} de ${codigos.length} entregadas${fallas.length ? `; fallaron: ${fallas.join(', ')}` : ''}. Lo ya dibujado se conserva.`);
          return;
        }
        const codigo = codigos[i];
        ctx.activas.set(idAct, { que: `dibujar radiograf\u00eda ${codigo} (${i + 1}/${codigos.length})`, desde: Date.now(), largo: true });
        const clase = claseOrden || claseDe(codigo);
        if (clase === 'cripto' && EXCLUIDOS.has(codigo)) { fallas.push(codigo); await decir(event, `${codigo}: activo excluido del universo; no lo dibuje.`); continue; }
        if (!clase) { fallas.push(codigo); await decir(event, `${codigo}: no tiene registros guardados (o aparece en las dos clases); no lo dibuj\u00e9.`); continue; }
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-radiografia-'));
        try {
          const png = path.join(tmp, `${codigo}.png`);
          const info = await infoDe(codigo, clase);
          await ex('python3', [productor, codigo, png, base(), info, clase], { timeout: 120000 });
          const aviso = guardar(png, codigo, clase);
          if (aviso) await decir(event, aviso);
          await app.client.filesUploadV2({
            token: botToken, channel_id: event.channel, thread_ts: event.thread_ts || event.ts,
            file: fs.createReadStream(png), filename: `${codigo}_radiografia.png`,
          });
          hechas.push(codigo);
        } catch (e) {
          fallas.push(codigo);
          await decir(event, `No pude dibujar ${codigo}: ${String(e.stderr || e.message).trim().slice(0, 300)}`);
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      }
      await decir(event, `Encomienda terminada: ${hechas.length} de ${codigos.length} radiograf\u00edas entregadas${fallas.length ? `. Fallaron ${fallas.length}: ${fallas.join(', ')}` : ', sin fallos'}.`);
    } finally {
      ctx.activas.delete(idAct);
    }
  }, { nombre: 'dibujar radiograf\u00edas', delegable: true });
}
