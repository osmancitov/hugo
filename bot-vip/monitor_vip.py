#!/usr/bin/env python3
# Monitor VIP de arranque: sigue en la terminal todos los VIP del núcleo a la vez,
# con lecturas veloces, y avisa cuándo comprar y vender. Tú ejecutas a mano en la app.
#
# No toca tu cuenta: solo lee precios públicos de Binance y el núcleo público del repo.
# Sin pip ni librerías externas: Python 3 estándar pelado.
#
# Uso típico (desde la carpeta del repo):
#   python3 bot-vip/monitor_vip.py                    # monitor con el núcleo vigente
#   python3 bot-vip/monitor_vip.py --esperar-nucleo   # lanzarlo ANTES de las 8 p.m.: espera a la lista de esta noche
#   python3 bot-vip/monitor_vip.py --intervalo 5 --objetivo 2.5 --objetivo-desde cero
#
# Mientras corre, escribe comandos y Enter:
#   c DODO          marcar que compraste DODO (al precio actual)
#   c DODO 0.0412   marcar compra a precio exacto
#   v DODO          marcar que vendiste DODO (muestra el resultado)
#   t               ver también los que van por debajo del cero
#   q               salir
#
# Estado en estado-vip.json (si se va la luz, al volver a abrir retoma referencias
# y posiciones). Eventos en ~/.local/log/monitor-vip.log.

import argparse
import json
import os
import select
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone

NUCLEO_URL = "https://raw.githubusercontent.com/osmancitov/hugo/main/registros/nucleo/{mercado}/actual_nucleo"
HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"]
ESTADO = os.path.join(os.getcwd(), "estado-vip.json")
LOG = os.path.expanduser("~/.local/log/monitor-vip.log")
DIA_MS = 86400_000


def ahora_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def registrar(linea):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{ahora_iso()} UTC  {linea}\n")


def pedir_json(url, intentos=3):
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "monitor-vip"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            if i == intentos - 1:
                raise
            time.sleep(2 * (i + 1))
    raise RuntimeError("no se pudo leer " + url)


def elegir_host():
    for h in HOSTS:
        try:
            pedir_json(h + "/api/v3/time", intentos=1)
            return h
        except Exception:
            continue
    raise SystemExit("Ninguna fuente pública de Binance respondió. Revisa la conexión.")


def simbolo(mercado, codigo):
    return codigo + ("USDT" if mercado == "cripto" else "BUSDT")


def leer_nucleo(mercado):
    j = pedir_json(NUCLEO_URL.format(mercado=mercado))
    return j["cierre"], list(j["nucleo"])


GRACIA_PUBLICACION_S = 2 * 3600  # ventana tras medianoche UTC en que el núcleo recién salido se acepta igual


def cierre_objetivo():
    """El cierre que publica la próxima medianoche UTC: la fecha UTC de hoy.
    (La corrida de las ~00:05-00:21 UTC del día D+1 publica el núcleo del cierre D.)"""
    hoy = int(time.time() * 1000) // DIA_MS * DIA_MS
    return datetime.fromtimestamp(hoy / 1000, timezone.utc).strftime("%Y-%m-%d"), hoy


def esperar_nucleo(mercados, aviso=print):
    """Espera el núcleo de la noche: compara la FECHA DE CIERRE del archivo, no su cambio.
    Si acaba de publicarse (dentro de la gracia), arranca de una con él."""
    objetivo, hoy = cierre_objetivo()
    ayer = datetime.fromtimestamp((hoy - DIA_MS) / 1000, timezone.utc).strftime("%Y-%m-%d")
    while True:
        cierres = {}
        for m in mercados:
            cierre, _ = leer_nucleo(m)
            cierres[m] = cierre
        if all(c >= objetivo for c in cierres.values()):
            aviso(f"Núcleo del cierre {objetivo} publicado. Arrancando.")
            return
        recien_salido = (time.time() * 1000 - hoy) <= GRACIA_PUBLICACION_S * 1000
        if recien_salido and all(c == ayer for c in cierres.values()):
            aviso(f"Núcleo del cierre {ayer} recién publicado; arranco con él.")
            return
        aviso(f"Esperando el núcleo del cierre {objetivo} (publicados: {cierres}). Reviso en 60 s...")
        time.sleep(60)


def descubrir_pares(host, mercados):
    """Devuelve lista de (mercado, codigo, simbolo, precio) vivos, y los sin par."""
    vivos, sin_par = [], []
    for m in mercados:
        _, codigos = leer_nucleo(m)
        for c in codigos:
            s = simbolo(m, c)
            try:
                d = pedir_json(f"{host}/api/v3/ticker/price?symbol={s}", intentos=1)
                vivos.append((m, c, s, float(d["price"])))
            except Exception:
                sin_par.append(s)
            time.sleep(0.15)  # amable con el límite de peticiones
    return vivos, sin_par


def precios(host, simbolos):
    lista = urllib.parse.quote(json.dumps(simbolos, separators=(",", ":")))
    datos = pedir_json(f"{host}/api/v3/ticker/price?symbols={lista}")
    return {d["symbol"]: float(d["price"]) for d in datos}


# ---- Lógica de avisos (pura, probada aparte) ----
def evaluar(ref, entrada, precio, objetivo_pct, base="compra"):
    """vs_cero, vs_entrada y aviso de salida para un símbolo.
    El objetivo se mide desde tu precio de compra (base='compra') o desde el cero (base='cero')."""
    vs_cero = (precio / ref - 1) * 100 if ref else 0.0
    aviso = None
    if entrada is not None:
        vs_entrada = (precio / entrada - 1) * 100
        if precio < ref:
            aviso = "VENDER: bajo el cero"
        else:
            vs_base = vs_cero if base == "cero" else vs_entrada
            if vs_base >= objetivo_pct:
                aviso = f"VENDER: objetivo +{objetivo_pct:g}% logrado"
    else:
        vs_entrada = None
    return vs_cero, vs_entrada, aviso


def cruzo_cero(antes, ahora):
    return antes is not None and antes <= 0 and ahora > 0


def cargar_estado():
    try:
        with open(ESTADO, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def guardar_estado(est):
    with open(ESTADO, "w", encoding="utf-8") as f:
        json.dump(est, f, ensure_ascii=False, indent=1)


def pintar(filas, ver_todos, intervalo, objetivo, host, cierres):
    # objetivo = (porcentaje, base)
    print("\033[2J\033[H", end="")
    print(f"MONITOR VIP {ahora_iso()[11:]} UTC · cada {intervalo:g} s · objetivo +{objetivo[0]:g}% desde {objetivo[1]}")
    print(f"Núcleo: {cierres} · {host.split('//')[1]}")
    print("c COD [precio] = compré · v COD = vendí · t = ver todos · q = salir")
    print("-" * 78)
    arriba = [f for f in filas if f["vs_cero"] > 0]
    abajo = [f for f in filas if f["vs_cero"] <= 0]
    mostrar = filas if ver_todos else (arriba + [f for f in abajo if f["entrada"] is not None])
    if not mostrar:
        print("(Nadie sobre el cero todavía. Los que arranquen aparecerán aquí.)")
    for f in mostrar:
        marca = "*" if f["entrada"] is not None else " "
        fila = (f"{marca} {f['codigo']:<9} {f['precio']:<12.8g} cero {f['ref']:<12.8g} "
                f"{f['vs_cero']:+7.2f}%")
        if f["entrada"] is not None and f["vs_entrada"] is not None:
            fila += f"  mia {f['vs_entrada']:+6.2f}%"
        if f["aviso"]:
            fila += f"   \033[1m<< {f['aviso']} >>\033[0m"
        print(fila)
    ocultos = len(filas) - len(mostrar)
    if ocultos:
        print(f"... y {ocultos} bajo el cero (pulsa t para verlos).")
    sys.stdout.flush()


def main():
    ap = argparse.ArgumentParser(description="Monitor VIP de arranque (solo lectura; tú operas a mano).")
    ap.add_argument("--intervalo", type=float, default=10, help="segundos entre lecturas (defecto 10)")
    ap.add_argument("--objetivo", type=float, default=2.0, help="ganancia %% para avisar venta (defecto 2)")
    ap.add_argument("--objetivo-desde", choices=["compra", "cero"], default="compra",
                    help="base del objetivo: tu precio de compra (defecto) o el cero de referencia")
    ap.add_argument("--mercados", default="cripto,stock", help="cripto, stock o cripto,stock (defecto ambos)")
    ap.add_argument("--esperar-nucleo", action="store_true", help="esperar a que se publique el núcleo del último cierre")
    ap.add_argument("--ver-todos", action="store_true", help="mostrar también los que van bajo el cero")
    args = ap.parse_args()

    mercados = [m.strip() for m in args.mercados.split(",") if m.strip() in ("cripto", "stock")]
    if not mercados:
        raise SystemExit("Mercados válidos: cripto, stock.")

    print("Buscando fuente de precios pública de Binance...")
    host = elegir_host()
    print(f"Fuente: {host}")

    if args.esperar_nucleo:
        esperar_nucleo(mercados)

    print("Leyendo el núcleo VIP y comprobando pares en Binance...")
    vivos, sin_par = descubrir_pares(host, mercados)
    cierres = {m: leer_nucleo(m)[0] for m in mercados}
    if sin_par:
        print(f"Sin par en Binance (fuera del monitor): {', '.join(sin_par)}")
    if not vivos:
        raise SystemExit("Ningún VIP tiene par vivo en Binance; nada que monitorear.")

    est = cargar_estado()
    refs = est.get("refs", {})          # simbolo -> precio de referencia (el cero)
    pos = est.get("pos", {})            # simbolo -> {"entrada": precio}
    avisados = est.get("avisados", {})  # simbolo -> último aviso ya gritado

    # Referencia: primera lectura del arranque. Si el estado ya la tenía, se conserva.
    primera = precios(host, [s for _, _, s, _ in vivos])
    for _, _, s, p0 in vivos:
        refs.setdefault(s, primera.get(s, p0))
    guardar_estado({"refs": refs, "pos": pos, "avisados": avisados})
    registrar(f"arranque: {len(vivos)} VIP vigilados; sin par: {sin_par}")

    ver_todos = args.ver_todos
    vs_anterior = {}
    stdin_vivo = True
    print("Monitor en marcha. (Si no ves la tabla, agranda la ventana.)")
    time.sleep(1)

    while True:
        try:
            actuales = precios(host, [s for _, _, s, _ in vivos])
        except Exception as e:
            print(f"\nError de lectura ({e}); reintento en {args.intervalo:g} s.")
            time.sleep(args.intervalo)
            continue

        filas = []
        for m, c, s, _ in vivos:
            p = actuales.get(s)
            if p is None:
                continue
            ref = refs.get(s)
            entrada = pos.get(s, {}).get("entrada") if s in pos else None
            vs_cero, vs_entrada, aviso = evaluar(ref, entrada, p, args.objetivo, args.objetivo_desde)
            # Aviso de candidato nuevo: cruza el cero hacia arriba y no está comprado.
            if entrada is None and cruzo_cero(vs_anterior.get(s), vs_cero) and avisados.get(s) != "candidato":
                aviso = "CANDIDATO"
                avisados[s] = "candidato"
                registrar(f"{s} candidato: arrancó sobre el cero a {p:g} ({vs_cero:+.2f}%)")
                print("\a", end="")
            if aviso and aviso.startswith("VENDER") and avisados.get(s) != aviso:
                avisados[s] = aviso
                registrar(f"{s} {aviso} a {p:g}")
                print("\a", end="")
            if not aviso and s in avisados and avisados[s].startswith("VENDER"):
                # volvió a zona normal: permite avisar de nuevo si recae
                del avisados[s]
            vs_anterior[s] = vs_cero
            filas.append({"mercado": m, "codigo": c, "simbolo": s, "precio": p, "ref": ref,
                          "vs_cero": vs_cero, "vs_entrada": vs_entrada, "entrada": entrada, "aviso": aviso})

        filas.sort(key=lambda f: -f["vs_cero"])
        pintar(filas, ver_todos, args.intervalo, (args.objetivo, args.objetivo_desde), host,
               ", ".join(f"{m} {c}" for m, c in cierres.items()))
        guardar_estado({"refs": refs, "pos": pos, "avisados": avisados})

        # Comandos sin bloquear la lectura.
        fin = time.time() + args.intervalo
        while time.time() < fin and stdin_vivo:
            r, _, _ = select.select([sys.stdin], [], [], max(0.0, fin - time.time()))
            if not r:
                break
            linea = sys.stdin.readline()
            if linea == "":
                stdin_vivo = False  # stdin cerrado (ej. lanzado sin terminal)
                break
            linea = linea.strip()
            if not linea:
                continue
            partes = linea.split()
            cmd = partes[0].lower()
            if cmd == "q":
                guardar_estado({"refs": refs, "pos": pos, "avisados": avisados})
                registrar("salida voluntaria")
                print("\nMonitor detenido. Estado guardado en estado-vip.json.")
                return
            if cmd == "t":
                ver_todos = not ver_todos
                break
            if cmd in ("c", "v") and len(partes) >= 2:
                cod = partes[1].upper()
                s = next((s for _, c2, s, _ in vivos if c2 == cod or s == cod), None)
                if s is None:
                    print(f"\n{cod} no está en el núcleo vigilado.")
                    time.sleep(2)
                    break
                if cmd == "c":
                    try:
                        precio_entrada = float(partes[2]) if len(partes) > 2 else actuales[s]
                    except ValueError:
                        print("\nPrecio no entendido; uso el actual.")
                        precio_entrada = actuales[s]
                    pos[s] = {"entrada": precio_entrada, "cuando": ahora_iso()}
                    avisados.pop(s, None)
                    registrar(f"{s} compra marcada a {precio_entrada:g}")
                else:
                    entrada = pos.pop(s, {}).get("entrada") if s in pos else None
                    if entrada:
                        res = (actuales[s] / entrada - 1) * 100
                        print(f"\n{cod} vendido. Resultado: {res:+.2f}% (comisión no incluida).")
                        registrar(f"{s} venta marcada a {actuales[s]:g} ({res:+.2f}%)")
                        time.sleep(3)
                    avisados.pop(s, None)
                guardar_estado({"refs": refs, "pos": pos, "avisados": avisados})
                break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nMonitor detenido. Estado guardado en estado-vip.json.")
