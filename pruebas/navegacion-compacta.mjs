import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('selecciones contraen los niveles y se puede volver al nivel anterior',()=>{
 assert.match(html,/contraerNavegacion\(navMerc,mercado\|\|esBusqueda\|\|esCampana\|\|Boolean\(mu\),'#\/',Boolean\(mu\)\)/);
 assert.match(html,/document\.querySelector\('\.mercados'\)\.after\(relojEntrada\)/);
 assert.match(html,/contraerNavegacion\(navCat,/);
 assert.match(html,/contraerNavegacion\(navV,ranking,/);
 assert.match(html,/a.hidden=!a.classList.contains\('actual'\)&&!\(conservarMercado&&a.id==='mercado-unificada'\)/);
 assert.match(html,/a.href=volver/);
 assert.match(html,/rot.hidden=true/);
});
test('Mercado abre directamente selección de grupo para la única campaña de 30 días',()=>{
 assert.match(html,/const mu=muA\|\|muG, elegirGrupo=Boolean\(muG&&!mu\[2\]\)/);
 assert.ok(html.includes("if(mu){if(elegirGrupo){app.replaceChildren();return;}vistaUnificada(muA?muA[3]+':'+decodeURIComponent(muA[4]):null,30,g2Ruta);return;}"));
 assert.ok(html.includes("vistaUnificada(muA?muA[3]+':'+decodeURIComponent(muA[4]):null,30,g2Ruta)"));
 assert.ok(html.includes("'#/unificada/30d/'+g[0]"));
 assert.ok(html.includes("'#/unificada/30d/'+g[0],!elegirGrupo&&g[0]===g2Ruta"));
 assert.ok(html.includes("vistaUnificada(muA?muA[3]+':'+decodeURIComponent(muA[4]):null,30,g2Ruta)"));
});

test('capitalización sin explicación eliminada; la vista Promedio ya no existe',()=>{
 assert.doesNotMatch(html,/Capitalización del token y, en su caso/);
 assert.doesNotMatch(html,/montarPersistencia|visor-persistencia|persistencia:'Promedio'/);
 assert.match(html,/location.replace\(hash.replace\('\/persistencia','\/variacion'\)\)/);
});

test('Variación sin párrafo introductorio eliminado',()=>{
 const src=fs.readFileSync(new URL('../visor-rachas.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/Lectura del día sobre la ventana de 90 días terminada/);
 assert.match(src,/contenedor.append\(controles,estado,fuente,reglas,cuerpo\)/);
});

test('menú de entrada: Mercado primero y Cimiento después; sin botones de Stocks, Cripto, Buscar ni Campaña',()=>{
 const m=html.match(/<nav class="mercados" aria-label="Mercados">(.*?)<\/nav>/)?.[1];
 assert.ok(m, 'menú principal presente');
 assert.deepEqual([...m.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map(x=>x[1]), ['Mercado','Cimiento']);
 for(const id of ['mercado-stock','mercado-cripto','mercado-buscar','mercado-campana'])assert.doesNotMatch(m,new RegExp(id));
});
