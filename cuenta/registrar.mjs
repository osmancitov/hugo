// Uso: node cuenta/registrar.mjs --activo CRWD --mercado stock --compra 210 --saldo-final 244 --fecha 2026-11-24 --hora-compra 08:00 --hora-venta 09:00 [--fecha-compra 2026-11-23] [--solo-mostrar]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { nuevoRegistro } from './operacion.mjs';
const a = {}; const v = process.argv.slice(2);
for (let i = 0; i < v.length; i++) if (v[i].startsWith('--')) a[v[i].slice(2)] = v[i + 1]?.startsWith('--') || v[i + 1] === undefined ? true : v[++i];
for (const k of ['activo', 'compra', 'saldo-final', 'fecha', 'hora-compra', 'hora-venta']) if (!a[k]) throw Error('Falta --' + k);
const ruta = new URL('./movimientos.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(ruta, 'utf8'));
const reg = nuevoRegistro({ anteriores: data.records, activo: a.activo, codigo: a.mercado ? a.activo : undefined, mercado: a.mercado,
  compra: Number(a.compra), saldoFinal: Number(a['saldo-final']), fecha: a.fecha, horaCompra: a['hora-compra'], horaVenta: a['hora-venta'], fechaCompra: a['fecha-compra'] });
console.log(JSON.stringify(reg, null, 2));
if (a['solo-mostrar']) process.exit(0);
data.records.unshift(reg);
data.reconciliation.current_balance = reg.balance; data.reconciliation.date = a.fecha;
fs.writeFileSync(ruta, JSON.stringify(data, null, 2) + '\n');
execFileSync('node', [new URL('./generar.mjs', import.meta.url).pathname], { stdio: 'inherit' });
