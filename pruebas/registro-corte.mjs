// Auxiliar de la prueba de SIGKILL. No usa red ni cuentas.
import fs from 'node:fs';
import path from 'node:path';
import {crearMotor} from '../app/modulos/registro-motor.mjs';
const [root,punto]=process.argv.slice(2);
const octubre=Date.UTC(2026,9,1);
const vela=t=>[t,'1','2','1','2','10',t+86400000-1,'10',3,'1','2','0'];
const matar=()=>process.kill(process.pid,'SIGKILL');
if(punto==='despues-enlace') {const original=fs.linkSync;fs.linkSync=(...args)=>{original(...args);matar();};}
const motor=crearMotor({ahora:()=>Date.UTC(2026,10,1),base:()=>path.join(root,'velas'),archivoEstado:()=>path.join(root,'estado.json'),
 resolver:async(_,c)=>({ok:true,simbolo:c+'USDT'}),
 fetchImpl:async u=>{const t=Number(new URL(u).searchParams.get('startTime'));return{ok:true,status:200,text:async()=>JSON.stringify(t===octubre?[vela(t)]:[])};},
 avisar:async(_,t)=>{if(punto==='antes-guardar'&&t.startsWith('Consulto'))matar();if(punto==='despues-avance'&&t.includes('guardé'))matar();if(punto==='entre-activos'&&t.includes('Historial terminado; 1/2'))matar();if(punto==='antes-aviso-final'&&t.includes('Historial terminado; 2/2'))matar();},
});
if(punto==='reanudar')await motor.iniciar({arranque:true});
else await motor.iniciar({clase:'stock',codigos:['AA','BB'],event:{channel:'prueba',ts:'raiz'}});
