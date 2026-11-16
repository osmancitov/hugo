// Registra: una orden directa para recorrer el historial de uno o varios activos.
// La clase aplica a toda la lista. No hay confirmaciones especiales por clase.
import os from 'node:os';
import path from 'node:path';
import { resolverActivo, CLASES, CODIGO_OK } from './activos.mjs';
import { crearMotor } from './registro-motor.mjs';
import { crearAvisador } from './registro-avisos.mjs';

export function registrar(ctx) {
  const base=()=>process.env.HUGO_VELAS_DIR || ctx.conf.HUGO_VELAS_DIR || path.join(os.homedir(),'Documents','hugo','registros','velas-24h');
  const archivoEstado=()=>process.env.HUGO_REGISTRO_ESTADO || ctx.conf.HUGO_REGISTRO_ESTADO || path.join(os.homedir(),'.local','share','hugo-registro','estado.json');
  const avisar=crearAvisador({client:ctx.app.client,token:ctx.botToken});
  const motor=crearMotor({base,archivoEstado,resolver:resolverActivo,avisar,activas:ctx.activas,parada:ctx.parada});
  ctx.comando(/^\s*registr\w*(?:\s|$)/i, async(event,texto)=>{
    const partes=texto.trim().replace(/[.!?]+$/,'').split(/[\s,;]+/);
    partes.shift();
    if(partes.length===1 && partes[0].toLowerCase()==='continuar') return motor.iniciar({event,continuar:true});
    const clase=String(partes.shift()||'').toLowerCase();
    if(!CLASES.includes(clase)) return avisar(event,'Indica la clase y uno o varios codigos: registra stock NVDA SPCX, o registra cripto BTC ETH. Para retomar un trabajo pendiente: registra continuar.');
    const codigos=partes.map(p=>p.toUpperCase());
    if(!codigos.length || codigos.length>500 || codigos.some(c=>!CODIGO_OK.test(c))) return avisar(event,'Falta una lista valida de codigos (hasta 500, separados por espacios o comas). No inicie el registro.');
    if(new Set(codigos).size!==codigos.length) return avisar(event,'Hay codigos repetidos en la lista. Quitalos para conservar un orden claro; no inicie el registro.');
    return motor.iniciar({clase,codigos,event});
  },{nombre:'registrar velas',delegable:true});
  // El trabajo nuevo solo nace por una orden. Al volver, continua uno ya aceptado.
  ctx.alIniciar(()=>{motor.iniciar({arranque:true}).catch(async e=>{
    console.error('Reanudar registra:',e.message);
    try { await ctx.app.client.chat.postMessage({token:ctx.botToken,channel:ctx.canal,text:`No pude reanudar el registro: ${e.message}. El avance se conserva para revisar.`}); } catch(err) { console.error('Aviso de registro:',err.message); }
  });});
}
