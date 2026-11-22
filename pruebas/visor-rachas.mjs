import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DIA, validarMes, resumir, separar, corteUTC, razonVariacion, cambiosDireccion } from '../app/modulos/visor-rachas-datos.mjs';
import { puestosDelDia, resultadoDesdeLectura, mesesVentana, ventanaDelDia } from '../visor-rachas.mjs';
const t = Date.UTC(2026,10,1), corte = Date.UTC(2026,10,18);
const vela = (i,o,c) => [t+i*DIA,String(o),String(Math.max(o,c)),String(Math.min(o,c)),String(c),'1',t+(i+1)*DIA-1,'1',1,'1','1','0'];
test('racha usa apertura/cierre; su cambio real incluye cambios entre velas, sin sumar porcentajes',()=>{
 const r=resumir([vela(0,100,101),vela(1,200,180),vela(2,190,171)]);
 assert.equal(r.dias,2); assert.equal(r.limitada,false); assert.ok(Math.abs(r.acumulado+14.5)<1e-10); assert.ok(Math.abs(r.variacion+10)<1e-10);
});
test('rango diario usa máximo menos mínimo relativo a apertura, no a cierre',()=>{
 const v=vela(0,100,110); v[2]='130';v[3]='80';
 const r=resumir([v]);assert.equal(r.rango,50);assert.ok(Math.abs(r.variacion-10)<1e-10);
 const plana=vela(0,100,100);assert.equal(resumir([plana]).rango,0);
});
test('velas negativas pueden tener cambio de precio de racha positivo',()=>{
 const r=resumir([vela(-1,100,101),vela(0,100,90),vela(1,110,105)]);
 assert.equal(r.dias,2); assert.equal(r.limitada,false); assert.ok(Math.abs(r.acumulado-5)<1e-10);
});
test('vela plana deja racha 0; una vela positiva abre racha al alza y corta la baja anterior',()=>{
 const p=resumir([vela(0,100,90),vela(1,100,100)]); assert.equal(p.dias,0); assert.equal(p.direccion,0); assert.equal(p.acumulado,0); assert.equal(p.limitada,false);
 const u=resumir([vela(0,100,90),vela(1,100,101)]); assert.equal(u.dias,1); assert.equal(u.direccion,1); assert.ok(Math.abs(u.acumulado-1)<1e-10);
});
test('racha al alza cuenta días seguidos y su total incluye los saltos entre velas',()=>{
 const r=resumir([vela(0,100,90),vela(1,90,100),vela(2,95,105),vela(3,110,121)]);
 assert.equal(r.dias,3); assert.equal(r.direccion,1); assert.equal(r.limitada,false); assert.ok(Math.abs(r.acumulado-(121/90-1)*100)<1e-10);
});
test('la última vela fija la dirección y una vela plana corta la racha al alza',()=>{
 const r=resumir([vela(0,100,110),vela(1,100,100),vela(2,100,110)]); assert.equal(r.dias,1); assert.equal(r.direccion,1);
 const n=resumir([vela(0,100,110),vela(1,110,100)]); assert.equal(n.dias,1); assert.equal(n.direccion,-1);
});
test('con un día de racha el total coincide con la variación del día',()=>{
 for(const c of [90,110]) { const r=resumir([vela(0,100,c)]); assert.equal(r.dias,1); assert.ok(Math.abs(r.acumulado-r.variacion)<1e-10); }
});
test('huecos no se rellenan, no se conectan rachas a través de días ausentes',()=>{
 const r=resumir([vela(0,100,90),vela(2,100,80)]); assert.equal(r.dias,1); assert.equal(r.limitada,true); assert.match(r.motivo,/hueco/);
});
test('una racha al inicio disponible es un mínimo observado, no un total certificado',()=>{
 const r=resumir([vela(0,100,90)],true); assert.equal(r.limitada,true); assert.match(r.motivo,/inicio/);
});
test('cruce de mes sin huecos',()=>{
 const prev=vela(-1,100,101), a=vela(0,100,90), b=vela(1,100,80);
 assert.equal(resumir([prev,a,b]).dias,2); assert.equal(resumir([prev,a,b]).limitada,false);
});
test('valida cierre UTC, precios y orden de los registros',()=>{
 assert.equal(validarMes([vela(0,100,90)],'2611',corte).length,1);
 for(const datos of [[vela(17,100,90)],[vela(0,100,90),vela(0,100,90)],[vela(-1,100,90)],[]]) assert.throws(()=>validarMes(datos,'2611',corte));
 const mala=vela(0,100,90); mala[1]=''; assert.throws(()=>validarMes([mala],'2611',corte));
 const mala2=vela(0,100,90); mala2[4]='Infinity'; assert.throws(()=>validarMes([mala2],'2611',corte));
});
test('rechaza duplicados entre meses y filas desordenadas',()=>{
 assert.throws(()=>resumir([vela(0,100,90),vela(0,100,90)]));
 assert.throws(()=>resumir([vela(1,100,90),vela(0,100,90)]));
});
test('equilibrio G/P: áreas por vela (cierre frente a apertura) y su cociente, como la radiografía',()=>{
 const r=razonVariacion([vela(0,100,110),vela(1,200,180),vela(2,100,100)]);
 assert.ok(Math.abs(r.verde-10)<1e-10); assert.ok(Math.abs(r.roja-10)<1e-10); assert.ok(Math.abs(r.razon-1)<1e-10);
});
test('equilibrio G/P: sin días rojos no tiene fin; sin días verdes vale 0; la vela plana no cuenta',()=>{
 assert.equal(razonVariacion([vela(0,100,110)]).razon,Infinity);
 assert.equal(razonVariacion([vela(0,100,90)]).razon,0);
 assert.equal(razonVariacion([vela(0,100,100)]).razon,0);
});
test('cambios de dirección: cada cruce de color cuenta; la plana no existe para el conteo y el hueco tampoco',()=>{
 assert.equal(cambiosDireccion([vela(0,100,110),vela(1,110,100),vela(2,100,105)]),2);
 assert.equal(cambiosDireccion([vela(0,100,110),vela(1,110,115),vela(2,115,120)]),0);
 assert.equal(cambiosDireccion([vela(0,100,110),vela(1,105,105),vela(2,105,100)]),1);
 assert.equal(cambiosDireccion([vela(0,100,110),vela(2,110,100)]),1);
 assert.equal(cambiosDireccion([vela(0,100,110),vela(2,110,120)]),0);
 assert.equal(cambiosDireccion([vela(0,100,100),vela(1,100,101)]),0);
});
test('separa atrasados y errores, sin tratarlos como última jornada común',()=>{
 const s=separar([{datos:{fecha:t}},{datos:{fecha:t+DIA}},{error:'red'}]);
 assert.equal(s.fecha,t+DIA); assert.equal(s.comparables.length,1); assert.equal(s.atrasados.length,1); assert.equal(s.errores.length,1);
 assert.equal(separar([{error:'red'}]).fecha,null);
});
test('todos los registros del catálogo real se validan y resumen sin alterar archivos',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const catalogo=JSON.parse(html.match(/const CATALOGO = (.*);/)[1]);
 const resultados=[];
 for(const clase of ['stock','cripto']) for(const e of catalogo[clase]) {
   const dir=new URL('../registros/velas-24h/'+clase+'/'+e.codigo+'/',import.meta.url);
   const meses=fs.readdirSync(dir).sort(); let filas=[];
   for(const m of meses) filas.push(...validarMes(JSON.parse(fs.readFileSync(new URL(m,dir))),m.slice(0,4),corteUTC()));
   const r=resumir(filas,true);
   // Oráculo independiente por cocientes y diferencia de fechas.
   const dirOf=f=>Math.sign(Number(f[4])-Number(f[1]));
   const sentido=dirOf(filas.at(-1));
   let k=filas.length-1, n=0, primera=null;
   while(sentido!==0&&k>=0&&dirOf(filas[k])===sentido) {
     if(k<filas.length-1&&filas[k+1][0]-filas[k][0]!==DIA) break;
     n++; primera=filas[k]; k--;
   }
   const esperado=n?(Number(filas.at(-1)[4])/Number(primera[1])-1)*100:0;
   assert.equal(r.direccion,sentido,e.codigo);
   assert.equal(r.dias,n,e.codigo); assert.ok(Math.abs(r.acumulado-esperado)<1e-8,e.codigo);
   assert.ok(Math.abs(r.rango-(Number(filas.at(-1)[2])-Number(filas.at(-1)[3]))/Number(filas.at(-1)[1])*100)<1e-8,e.codigo);
   // Oráculo del equilibrio G/P: áreas por signo de la variación de cada vela.
   let av=0,ar=0;
   for(const f of filas){const rv=(Number(f[4])/Number(f[1])-1)*100; if(rv>0)av+=rv; else if(rv<0)ar-=rv;}
   const rz=razonVariacion(filas);
   assert.ok(Math.abs(rz.verde-av)<1e-8&&Math.abs(rz.roja-ar)<1e-8,e.codigo);
   assert.ok(ar>0?Math.abs(rz.razon-av/ar)<1e-8:(av>0?rz.razon===Infinity:rz.razon===0),e.codigo);
   resultados.push({activo:e,datos:r});
 }
 assert.equal(resultados.length,catalogo.stock.length+catalogo.cripto.length); assert.ok(separar(resultados).comparables.length>0);
});


test('puestos del día: el archivo de ranking manda; sin archivo se deriva con la misma regla',()=>{
 const c=corteUTC()-DIA;
 const archivo=puestosDelDia([['BBB',-3],['AAA',1]],{},{});
 assert.equal(archivo.get('AAA'),1); assert.equal(archivo.get('BBB'),2);
 const activos={X:{fecha:c,variacion:1},Y:{fecha:c,variacion:-2},Z:{fecha:c,variacion:1},W:{fecha:c-DIA,variacion:9}};
 const derivado=puestosDelDia(null,activos,c);
 assert.equal(derivado.get('Y'),3); // mayores subidas primero
 assert.equal(derivado.get('X'),1); assert.equal(derivado.get('Z'),2); // empate exacto: por código
 assert.ok(!derivado.has('W')); // sin vela ese día no ocupa puesto
});
test('resultado desde la lectura: gp null es infinito, falta es error de ventana, puesto incluido',()=>{
 const c=corteUTC()-DIA;
 const pre={corte:c,ventana:{inicio:c-89*DIA,fin:c},activos:{AAA:{fecha:c,dias:2,direccion:1,acumulado:3,limitada:false,motivo:'',rango:1,variacion:1,gp:null,cambios:4}}};
 const ok=resultadoDesdeLectura({codigo:'AAA',clase:'stock'},pre,new Map([['AAA',7]]));
 assert.equal(ok.datos.gp,Infinity); assert.equal(ok.datos.puesto,7);
 const falta=resultadoDesdeLectura({codigo:'ZZZ',clase:'stock'},pre,new Map());
 assert.equal(falta.error,'Sin lectura en la ventana'); assert.ok(!falta.datos);
});
test('la ventana del día: fin es el último día UTC cerrado e inicio cuenta 90 días con ambos extremos',()=>{
 const v=ventanaDelDia();
 assert.equal(v.fin,corteUTC()-DIA); assert.equal(v.inicio,v.fin-89*DIA); // hoy no toca el piso
 assert.deepEqual(mesesVentana(Date.UTC(2026,7,22),Date.UTC(2026,10,19)),['2608','2609','2610','2611']);
});
test('la vista lee los pre-cálculos y ya no recorre el registro completo ni el árbol de GitHub',()=>{
 const src=fs.readFileSync(new URL('../visor-rachas.mjs',import.meta.url),'utf8');
 for(const marca of ['registros/pre-calculado/','lectura-dia-90d','ranking-24h','Analizando los registros','Sin lectura en la ventana']) assert.ok(src.includes(marca),marca);
 // Sin repaso cosmético (decisión del usuario, 20-nov-2026): la lectura precalculada pinta directo;
 // la barra de avance queda solo para el repliegue en vivo.
 assert.ok(!src.includes('Activos analizados'),'sin repaso'); assert.ok(!src.includes('repasar'),'sin repaso');
 // En el orden G/P el selector de racha desaparece entero y no recorta (decisión del usuario, 20-nov-2026).
 assert.ok(src.includes("const soloTodas = orden==='gp' || orden==='ranking'"),'G/P y Día sin opciones de racha');
 assert.ok(src.includes('filtroRacha.hidden = soloTodas'),'G/P oculta el selector entero');
 assert.ok(src.includes("if (soloTodas) direccionRacha='todas'"),'G/P fuerza todas');
 assert.ok(!src.includes('/git/trees/')); assert.ok(!src.includes('/commits/main'));
 // La importación del módulo lleva versión en la URL para que cada publicación llegue sin esperar la caché de Pages (10 min).
 const ind=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(ind.includes("./visor-rachas.mjs?v="),'importación versionada');
 // La nota de racha limitada va bajo el nombre del activo: en la celda estrecha de la racha se partía letra a letra.
 assert.ok(src.includes("id.append(texto('small',d.motivo,'rachas-limite'))"),'nota bajo el nombre');
 assert.ok(!src.includes("dias.append(texto('small',d.motivo,'rachas-limite'))"),'nota fuera de la celda estrecha');
});

test('Día descarta una racha filtrada y vuelve a mostrar todos los puestos, sin alterar G/P', async () => {
 const anteriorDocumento=globalThis.document, anteriorFetch=globalThis.fetch;
 class Elemento {
  constructor(tag) { this.tagName=tag; this.hijos=[]; this.atributos={}; this.isConnected=true; }
  append(...n) { this.hijos.push(...n); }
  appendChild(n) { this.append(n); }
  replaceChildren(...n) { this.hijos=[...n]; }
  setAttribute(k,v) { this.atributos[k]=v; }
 }
 try {
  globalThis.document={createElement:t=>new Elemento(t),createTextNode:t=>({textContent:t})};
  const fin=corteUTC()-DIA;
  const catalogo=['AAA','BBB','CCC'].map(codigo=>({codigo,nombre:codigo,clase:'stock'}));
  const activos=Object.fromEntries(catalogo.map((a,i)=>[a.codigo,{fecha:fin,direccion:i===0?-1:1,dias:1,acumulado:i-1,rango:3-i,gp:3-i,puesto:i+1}]));
  const pre={corte:fin,ventana:{inicio:fin-89*DIA,fin},activos};
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('ranking-24h')?[['AAA',-1],['BBB',0],['CCC',1]]:pre});
  const {montarRachas}=await import('../visor-rachas.mjs?prueba-dia-sin-filtro');
  const contenedor=new Elemento('main');
  montarRachas(contenedor,catalogo,()=>'', 'stock');
  await new Promise(r=>setImmediate(r));
  const controles=contenedor.hijos[1], modo=controles.hijos[1], filtro=controles.hijos[2], cuerpo=contenedor.hijos.at(-1);
  const codigos=()=>cuerpo.hijos[0].hijos[0].hijos[1].hijos.map(f=>f.hijos.find(td=>td.className==='col-activo').hijos[0].textContent);
  assert.equal(modo.value,'gp'); assert.equal(filtro.hidden,true);
  modo.value='dias';modo.onchange(); filtro.value='suben';filtro.onchange();
  assert.equal(filtro.hidden,false); assert.deepEqual(codigos(),['BBB','CCC']);
  modo.value='ranking';modo.onchange();
  assert.equal(filtro.hidden,true); assert.equal(filtro.value,'todas'); assert.deepEqual(codigos(),['CCC','BBB','AAA']);
  modo.value='dias';modo.onchange(); assert.equal(filtro.value,'todas');
  modo.value='gp';modo.onchange(); assert.equal(filtro.hidden,true); assert.deepEqual(codigos(),['AAA','BBB','CCC']);
 } finally {globalThis.document=anteriorDocumento;globalThis.fetch=anteriorFetch;}
});


test('porcentajes enteros: ceros grises sin signo y mitades simétricas; no cambia el valor real', async()=>{
 const {porcentajeEntero,clasePorcentaje}=await import('../visor-rachas.mjs');
 for (const n of [0,-0,0.4,-0.4,0.499,-0.499]) { assert.equal(porcentajeEntero(n),'0');assert.equal(clasePorcentaje(n),'igual'); }
 for (const [n,t,c] of [[0.5,'+1','positivo'],[-0.5,'-1','negativo'],[1.5,'+2','positivo'],[-1.5,'-2','negativo']]) {assert.equal(porcentajeEntero(n),t);assert.equal(clasePorcentaje(n),c);}
 const filas=[['ZZZ',0.49],['AAA',0.41],['BBB',0.49],['CCC',-0.4]];
 const antes=JSON.stringify(filas),p=puestosDelDia(filas,{},0);
 assert.deepEqual([...p.keys()],['BBB','ZZZ','AAA','CCC']);assert.equal(JSON.stringify(filas),antes);
});
