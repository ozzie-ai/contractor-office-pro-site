import {EstimateLine,Trade} from './estimate';
type LocalDraft={lines:EstimateLine[];unknowns:string[];recognized:boolean};
type Dim={a:number;b:number;index:number;end:number};
const has=(s:string,re:RegExp)=>re.test(s);
const line=(id:string,en:string,es:string,quantity:number,unit:string,rate:number):EstimateLine=>({id:'local-'+id,description_en:en,description_es:es,quantity,unit,rate,status:'allowance_to_confirm'});
const tidy=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const number=(s:string)=>Number(s.replace(',','.'));
const dims=(s:string):Dim[]=>{
 const re=/\b(\d{1,2}(?:[.,]\d+)?)\s*(?:pies?|feet|ft|')?\s*(?:por|x|×|by)\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:pies?|feet|ft|')?\b/g;
 return Array.from(s.matchAll(re)).map(m=>({a:number(m[1]),b:number(m[2]),index:m.index,end:m.index+m[0].length})).filter(d=>d.a>0&&d.b>0&&d.a<=30&&d.b<=30);
};
const near=(s:string,all:Dim[],re:RegExp):Dim|undefined=>{
 const flags=re.flags.includes('g')?re.flags:re.flags+'g';
 const targets=Array.from(s.matchAll(new RegExp(re.source,flags))).map(m=>(m.index||0)+m[0].length/2);
 if(!targets.length)return undefined;
 const ranked=all.map(d=>({d,distance:Math.min(...targets.map(p=>Math.abs((d.index+d.end)/2-p)))}))
   .sort((a,b)=>a.distance-b.distance);
 return ranked[0]?.distance<=85?ranked[0].d:undefined;
};
const showerRe=/\b(shower|regadera|ducha)\b/,roomRe=/\b(bano|bathroom|room|cuarto)\b/;
const size=(d:Dim)=>d.a+' × '+d.b+' ft';
export function localEstimate(description:string,_trade:Trade):LocalDraft{
 const s=tidy(description),lines:EstimateLine[]=[],unknowns:string[]=[];
 // Electrical scope has its own parser: no bathroom defaults or unrelated fixtures.
 if(_trade==='electrical'){
  const words:Record<string,number>={un:1,una:1,uno:1,one:1,dos:2,two:2,tres:3,three:3,cuatro:4,four:4,cinco:5,five:5,seis:6,six:6,siete:7,seven:7,ocho:8,eight:8,nueve:9,nine:9,diez:10,ten:10,veinte:20,twenty:20};
  const parseCount=(v:string)=>words[v]||Number(v)||0;
  const panel=/\b(panel|tablero|centro de carga|load center|service upgrade|servicio electrico)\b/.test(s);
  const upgrade=panel&&/\b(upgrad\w*|actualiz\w*|ampli\w*|aument\w*|reemplaz\w*|cambi\w*|convert\w*)\b/.test(s);
  const amps=Array.from(s.matchAll(/\b(\d{2,3})\s*(?:a\b|amp(?:s)?\b|amperios?\b|amperes?\b)/g)).map(m=>Number(m[1]));
  const dedicatedBreaker=/(?:\b(breaker|interruptor termomagnetico|disyuntor)\b)/.test(s)&&/\b(posterior\w*|despues|future|later|otro trabajo|only|solo|solamente|nomas|unicamente)\b/.test(s);
  const circuits=s.match(/\b(\d{1,3}|veinte|twenty)\s*(?:de\s+los\s+|de\s+los\s+que\s+)?(?:(?:existing|existen(?:tes?)?|old|viejos?|nuevos?|new)\s+)?(?:circuits?|circuitos?)\b/)
   ||s.match(/\b(\d{1,3}|veinte|twenty)\b[^.!?\n]{0,38}?\b(?:circuits?|circuitos?)\b/);
  const circuitQty=circuits?parseCount(circuits[1]):0;
  const permit=/\b(permiso|permit|inspection|inspeccion)\b/.test(s);
  const permitSection=s.match(/(?:permiso|permit)[^.!?\n]{0,90}/)?.[0]||'';
  const permitPrice=permitSection.match(/\$\s*(\d{2,5})\b/)?.[1]
   ||permitSection.match(/(?:costara|costaria|costs?|aproximadamente|about|around|aprox\.?)\s*(?:de\s*)?\$?\s*(\d{2,5})\b/)?.[1]
   ||s.match(/\$\s*(\d{2,5})[^.!?\n]{0,45}(?:permiso|permit)/)?.[1];
  if(upgrade){
   const from=amps[0]||0,to=amps[1]||0;
   const detail=from&&to?from+'A to '+to+'A':'size to confirm';
   lines.push(line('panel-upgrade','Upgrade electrical panel/service '+detail+' (equipment and installation; utility coordination to confirm)',
    'Actualizar panel/servicio electrico '+(from&&to?'de '+from+'A a '+to+'A':'(confirmar amperajes)')+'; equipo e instalacion, confirmar coordinacion con compania electrica',1,'job',0));
   unknowns.push('Confirm service size, utility requirements, grounding/bonding, panel location, and inspections. Price equipment and labor.');
  }
  if(circuitQty>0&&circuitQty<=200){
   lines.push(line('existing-circuits','Transfer and reconnect '+circuitQty+' existing circuits into new panel (confirm breakers and labeling)',
    'Transferir y reconectar '+circuitQty+' circuitos existentes al panel nuevo (confirmar breakers y rotulado)',circuitQty,'each',0));
   unknowns.push('Confirm circuit transfer versus new branch-circuit wiring; no new home runs assumed.');
  }
  if(dedicatedBreaker){
   const breakerMatch=s.match(/\b(\d{2,3})\s*(?:a\b|amp(?:s)?\b|amperios?\b)[^.!?\n]{0,60}\bbreaker\b/)
    ||s.match(/\bbreaker\b[^.!?\n]{0,30}?\b(\d{2,3})\s*(?:a\b|amp(?:s)?\b|amperios?\b)/);
   const breakerAmps=breakerMatch?Number(breakerMatch[1]):amps.length>=3?amps[amps.length-1]:0;
   lines.push(line('future-breaker','Supply and install '+(breakerAmps?breakerAmps+'A ':'')+'breaker only; no new circuit wiring or final connections',
    'Suministrar e instalar solamente breaker '+(breakerAmps?breakerAmps+'A':'(amperaje pendiente)')+'; sin cableado ni conexiones futuras',1,'each',0));
   unknowns.push('Confirm panel and breaker compatibility, capacity and approval for breaker-only installation.');
  }
  if(permit){
   lines.push(line('permit','Electrical permit and inspection allowance','Permiso electrico e inspeccion (monto provisional)',1,'job',permitPrice?Number(permitPrice):0));
   if(!permitPrice)unknowns.push('Confirm permit fee.');
  }
  const recessed=/\b(recessed\s*(?:lights?|lighting)?|luces?\s*empotradas?|focos?\s*empotrados?|downlights?|can lights?)\b/.test(s);
  if(recessed){
   const m=s.match(/\b(\d{1,2}|un|una|uno|one|dos|two|tres|three|cuatro|four|cinco|five|seis|six|siete|seven|ocho|eight|nueve|nine|diez|ten)\s+(?:nuev[oa]s?\s+)?(?:recessed\s*(?:lights?|lighting)?|luces?\s*empotradas?|focos?\s*empotrados?|downlights?|can lights?)\b/);
   const qty=m?parseCount(m[1]):0;
   const ceiling=s.match(/\b(?:ceiling|techo|cielo raso)\b[^.!?\n]{0,35}?\b(\d{1,2}|ocho|eight|nueve|nine|diez|ten)\s*(?:pies?|feet|ft)\b/)
    ||s.match(/\b(\d{1,2}|ocho|eight|nueve|nine|diez|ten)\s*(?:pies?|feet|ft)\s*(?:de altura)?\s*(?:del?\s*)?(?:ceiling|techo)\b/);
   const height=ceiling?parseCount(ceiling[1]):0;
   lines.push(line('recessed-light','Supply and install recessed LED ceiling lights'+(height?' ('+height+' ft ceiling)':' (verify ceiling height)'),
    'Suministrar e instalar luces LED empotradas'+(height?' (techo de '+height+' pies)':' (confirmar altura)'),qty,'each',0));
   if(!qty)unknowns.push('Confirm number of recessed lights; count was not dictated.');
   unknowns.push('Confirm wiring, access, fixture type and switching.');
  }
  const dimmer=/\b(dimmer|dimer|dimmers|regulador(?: de intensidad)?|atenuador)\b/.test(s);
  if(dimmer){
   const replace=/\b(reemplaz\w*|cambi\w*|sustitu\w*|replace|instead|en lugar de)\b/.test(s);
   lines.push(line('dimmer',replace?'Replace existing wall switch with LED-compatible dimmer':'Install LED-compatible dimmer (verify location)',
    replace?'Reemplazar interruptor existente con dimmer compatible con LED':'Instalar dimmer compatible con LED (confirmar lugar)',1,'each',0));
  }
  const gfci=/\b(gfci|gfi|ground.fault)\b/.test(s);
  if(gfci){
   lines.push(line('gfci','Install or replace GFCI receptacle (confirm existing wiring)',
    'Instalar o reemplazar tomacorriente GFCI (verificar cableado)',1,'each',0));
  }
  if(!lines.length){
   lines.push(line('unclassified','Review dictated electrical scope and define work items','Revisar descripcion electrica y definir partidas',1,'job',0));
   unknowns.push('Scope not recognized; the app will not invent unrelated electrical tasks.');
  }
  if(lines.some(item=>item.rate<=0))unknowns.push('Enter verified prices for unpriced work items; overhead and profit apply automatically.');
  return {lines,unknowns,recognized:lines[0].id!=='local-unclassified'};
 }
 // Other trades must not inherit bathroom-specific work just because their notes mention "replace".
 // Unsupported scope is explicitly reviewable, never presented as an invented priced task.
 if(_trade!=='remodel' && !/\b(bano|bathroom|shower|regadera|tina|bathtub|vanity|inodoro)\b/.test(s)){
  const titles:Record<Trade,[string,string]>={
   electrical:['Review electrical scope','Revisar trabajo electrico'],
   plumbing:['Review plumbing scope','Revisar trabajo de plomeria'],
   painting:['Review painting scope','Revisar trabajo de pintura'],
   concrete:['Review concrete scope','Revisar trabajo de concreto'],
   handyman:['Review handyman scope','Revisar trabajos varios'],
   remodel:['Review remodeling scope','Revisar remodelacion'],
   cleaning:['Review cleaning scope','Revisar limpieza']
  };
  const [en,es]=titles[_trade];
  return {lines:[line('trade-review',en+' — '+description.trim(),es+' — '+description.trim(),1,'job',0)],
   unknowns:['This trade requires a reviewed scope and verified prices. No bathroom work was inferred.'],recognized:false};
 }
 const all=dims(s),shower=has(s,showerRe),bathroom=has(s,roomRe);
 const showerDim=shower?near(s,all,showerRe):undefined;
 const roomCandidate=near(s,all,roomRe)||(all.length===1&&!showerDim?all[0]:undefined);
 const roomDim=roomCandidate===showerDim?undefined:roomCandidate;
 const roomArea=roomDim?roomDim.a*roomDim.b:0;
 const tub=has(s,/\b(tina|bathtub|tub|banera)\b/);
 const demo=has(s,/\b(demoler|demolicion|demolition|remove|remover|quitar|retirar|demolish|sacar)\b/);
 const glass=has(s,/\b(vidrio|glass|cristal|mampara)\b/);
 const vanity=has(s,/\b(vanity|vanitorio|gabinete de bano|lavabo con mueble)\b/);
 const toilet=has(s,/\b(toilet|inodoro|sanitario|retrete|wc)\b/);
 const mirror=has(s,/\b(espejo|mirror)\b/);
 const light=has(s,/\b(luz|luces|light|lighting|led|iluminado)\b/);
 const floor=has(s,/\b(piso|floor|flooring|loseta|tile de piso|pavimento)\b/);
 const removingFloor=has(s,/\b(demoler|demolicion|remover|retirar|quitar|remove|demolish|sacar)\b[^.!?]{0,75}\b(piso|floor)\b|\b(piso|floor)\b[^.!?]{0,50}\b(existente|existing|demol|retirar|remove|quitar)\b/);
 const paint=has(s,/\b(pintura|pintar|paint|painting)\b/);
 const plumbing=has(s,/\b(plomeria|plumbing|tuberia|pipes|reubicar desague|move drain)\b/);
 const electrical=has(s,/\b(electricidad|electrical|electric|outlet|tomacorriente|recessed|empotrada)\b/);
 const wall=has(s,/\b(pared|paredes|muro|muros|wall|walls)\b/);
 const tile=has(s,/\b(losa|loseta|azulejo|ceramica|tile|tiling|alicatar|enchapar|revestir)\b/);
 const heightMatch=s.match(/\b(?:altura|alto|high|height|de altura|paredes? (?:son|de|tienen)|walls? (?:are|of))\s*(?:de\s*)?(\d{1,2}(?:[.,]\d+)?)\s*(?:pies?|feet|ft|')\b/)
  ||s.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*(?:pies?|feet|ft|')\s*(?:de altura|de alto|high|tall)\b/)
  ||s.match(/\b(?:paredes?|walls?)[^.!?]{0,85}?\b(\d{1,2}(?:[.,]\d+)?)\s*(?:pies?|feet|ft|')\b/);
 const height=heightMatch?number(heightMatch[1]):0;
 const short=showerDim?Math.min(showerDim.a,showerDim.b):0,long=showerDim?Math.max(showerDim.a,showerDim.b):0;
 const wallArea=showerDim&&height>0&&height<=20?(2*short+long)*height:0;
 const newToilet=has(s,/\b(nuevo|nueva|new)\s+(?:toilet|inodoro|sanitario|retrete)\b|\b(?:toilet|inodoro|sanitario)\s+(?:nuevo|nueva|new)\b/);
 const demoSection=s.split(/\b(?:voy a instalar|vamos a instalar|instalare|instalar un nuevo|install a new|install new)\b/)[0];
 const hasRemovalVerb=has(demoSection,/\b(retirar|remover|quitar|sacar|remove|demoler|demolition)\b/);
 const oldToilet=hasRemovalVerb&&has(demoSection,/\b(toilet|inodoro|sanitario|retrete)\b/);
 const oldVanity=hasRemovalVerb&&has(demoSection,/\b(vanity|vanitorio)\b/);
 const oldMirror=hasRemovalVerb&&has(demoSection,/\b(espejo|mirror)\b/);
 const lightRecessed=has(s,/\b(recessed\s*(?:lights?|lighting|luz|luces)?|luces?\s*empotradas?|focos?\s*empotrados?|can lights?|downlights?)\b/);
 const dimmer=has(s,/\b(dimmer|dimer|dimmers|regulador(?: de intensidad)?|atenuador)\b/);
 const dimmerReplacement=dimmer&&has(s,/\b(reemplaz\w*|cambi\w*|sustitu\w*|replace|instead(?: of| del?| la)?|en lugar de(?:l| la)?)\b/);
 const ceilingHeightMatch=s.match(/\b(?:ceiling|techo|cielo raso|altura del techo)\b[^.!?]{0,35}?\b(\d{1,2}(?:[.,]\d+)?|ocho|eight|nueve|nine|diez|ten)\s*(?:pies?|feet|ft)\b/)
  ||s.match(/\b(\d{1,2}(?:[.,]\d+)?|ocho|eight|nueve|nine|diez|ten)\s*(?:pies?|feet|ft)\s*(?:de altura)?\s*(?:del?\s*)?(?:ceiling|techo)\b/);
 const ceilingHeight=ceilingHeightMatch?((({ocho:8,eight:8,nueve:9,nine:9,diez:10,ten:10} as Record<string,number>)[ceilingHeightMatch[1]])||number(ceilingHeightMatch[1])):undefined;
 const countWords:Record<string,number>={un:1,una:1,uno:1,one:1,dos:2,two:2,tres:3,three:3,cuatro:4,four:4,cinco:5,five:5,seis:6,six:6,siete:7,seven:7,ocho:8,eight:8,nueve:9,nine:9,diez:10,ten:10};
 const countMatch=s.match(/\b(\d{1,2}|un|una|uno|one|dos|two|tres|three|cuatro|four|cinco|five|seis|six|siete|seven|ocho|eight|nueve|nine|diez|ten)\s+(?:nuev[oa]s?\s+)?(?:recessed\s*(?:lights?|lighting)?|luces?\s*empotradas?|focos?\s*empotrados?|downlights?|can lights?)\b/)
  ||s.match(/\b(?:recessed\s*(?:lights?|lighting)?|luces?\s*empotradas?|focos?\s*empotrados?)\b[^.!?]{0,30}?\b(\d{1,2})\s*(?:luces?|lights?|focos?|unidades?)\b/);
 const recessedCount=countMatch?(countWords[countMatch[1]]||number(countMatch[1])):1;
 const validRecessedCount=Number.isInteger(recessedCount)&&recessedCount>0&&recessedCount<=30?recessedCount:0;
 const gfci=has(s,/\b(gfci|gfi|ground.fault)\b/);
 const gfciReplacement=gfci&&has(s,/\b(reemplaz\w*|cambiar|reponer|sustituir|replace|instead of|en lugar de(?:l| la)?)\b/);
 const whitePaint=has(s,/\b(blanco|blanca|white)\b/);
 const tileToCeiling=has(s,/\b(hasta el techo|to the ceiling|hasta techo)\b/);
 if(demo&&tub)lines.push(line('tub-remove','Remove and dispose of existing bathtub','Retirar y desechar tina existente',1,'job',650));
 else if(demo&&bathroom)lines.push(line('bath-demo','Bathroom demolition and debris removal (confirm scope)','Demolición y retiro de escombros del baño (confirmar alcance)',1,'job',850));
 if(oldToilet)lines.push(line('remove-toilet','Remove and dispose of existing toilet','Retirar y desechar inodoro existente',1,'job',125));
 if(oldVanity)lines.push(line('remove-vanity','Remove and dispose of existing vanity/sink','Retirar y desechar vanity y lavabo existentes',1,'job',225));
 if(oldMirror)lines.push(line('remove-mirror','Remove and dispose of existing mirror','Retirar y desechar espejo existente',1,'job',65));
 if(removingFloor)lines.push(line('floor-demo',roomArea?'Demolish and dispose of existing bathroom floor tile ('+roomArea+' sq ft)':'Demolish existing bathroom floor tile (measure area)',
  roomArea?'Demoler y desechar loseta de piso existente ('+roomArea+' pies²)':'Demoler loseta de piso existente (medir área)',roomArea,'sq ft',8));
 if(shower){
  const d=showerDim?' ('+size(showerDim)+')':' (confirm dimensions)';
  lines.push(line('shower',(tub&&demo?'Convert bathtub area to shower':'Install shower')+d+'; base, waterproofing and plumbing only; wall tile and glass priced separately',
   (tub&&demo?'Convertir área de tina en regadera':'Instalar regadera')+d+'; base, impermeabilización y plomería solamente; loseta y vidrio por separado',1,'job',2700));
  if(glass)lines.push(line('glass','Supply and install shower glass door/enclosure'+d,'Suministrar e instalar puerta de vidrio para regadera'+d,1,'job',1200));
  if(!showerDim)unknowns.push('Confirm shower dimensions and wall lengths on site.');
  unknowns.push('Verify shower drain, waterproofing system, fixtures and glass selection.');
 }
 if(shower&&wall&&(tile||tileToCeiling)){
  if(wallArea){
   const geometry=short+' + '+long+' + '+short+' ft × '+height+' ft = '+wallArea+' sq ft';
   lines.push(line('wall-tile','Tile three shower walls (gross '+geometry+'); setting and tile material, excluding waterproofing',
    'Enlosar tres paredes de regadera (bruto '+geometry+'); colocación y loseta sin impermeabilización',wallArea,'sq ft',18));
   unknowns.push('Wall tile is gross area. Verify wall count, openings, cuts, waste and selection; waterproofing is in shower base allowance.');
  }else{
   lines.push(line('wall-tile','Shower wall tile — measure wall area','Loseta para paredes de regadera — medir el área',0,'sq ft',18));
   unknowns.push('Wall tile square footage requires shower length, width AND wall height.');
  }
 }
 const reinstall=has(s,/\b(reinstal\w*|reinstall\w*|volver a instalar|reset)\b/);
 if(toilet)lines.push(line('toilet',newToilet?'Supply and install new toilet in existing position':reinstall?'Remove and reinstall existing toilet':'Toilet installation/reset (confirm new or existing)',
  newToilet?'Suministrar e instalar inodoro nuevo en la misma posición':reinstall?'Retirar y reinstalar inodoro existente':'Instalar o reinstalar inodoro (confirmar existente o nuevo)',1,'job',newToilet?650:300));
 if(vanity){
  const width=s.match(/(?:vanity|vanitorio|gabinete)[^.!?\n]{0,100}?\b(\d{2,3})\s*(?:pulgadas|inches|inch|in\b|")/);
  const detail=width?' ('+width[1]+' in)':'';
  lines.push(line('vanity','Supply and install vanity with single sink'+detail,'Suministrar e instalar vanity con lavabo sencillo'+detail,1,'job',950));
  unknowns.push('Confirm vanity width, faucet, countertop and plumbing connections.');
 }
 if(mirror){
  const mirrorMatch=s.match(/\b(?:espejo|mirror)\b[^.!?]{0,95}?\b(\d{2,3})\s*(?:pulgadas|inches|inch|in)?\s*(?:de ancho|wide)?\s*(?:por|x|×|by)\s*(\d{2,3})\s*(?:pulgadas|inches|inch|in)?\b/);
  const mirrorSize=mirrorMatch?' ('+mirrorMatch[1]+' × '+mirrorMatch[2]+' in)':'';
  lines.push(line('mirror',(light?'Supply and install illuminated mirror':'Supply and install mirror')+mirrorSize,
   (light?'Suministrar e instalar espejo iluminado':'Suministrar e instalar espejo')+mirrorSize,1,'job',375));
 }
 if(lightRecessed){
  const heightDetail=ceilingHeight?' ('+ceilingHeight+' ft ceiling)':' (ceiling height to confirm)';
  lines.push(line('recessed-light','Supply and install recessed LED ceiling lights'+heightDetail+'; verify circuit, switching and wiring',
   'Suministrar e instalar luces LED empotradas en techo'+heightDetail+'; verificar circuito, interruptor y cableado',
   validRecessedCount,'each',325));
  if(!ceilingHeight)unknowns.push('Confirm ceiling height and access for recessed fixtures.');
  unknowns.push('Confirm fixture type, dimmer compatibility, switch location, existing wiring and ceiling access before pricing.');
 }
 if(dimmer)lines.push(line('dimmer',dimmerReplacement?'Replace existing wall switch with LED-compatible dimmer':'Install LED-compatible dimmer switch (confirm existing vs new)',
   dimmerReplacement?'Reemplazar interruptor existente por dimmer compatible con LED':'Instalar dimmer compatible con LED (confirmar si sustituye interruptor)',1,'each',175));
 if(gfci)lines.push(line('gfci',
  gfciReplacement?'Replace existing bathroom receptacle with GFCI outlet':'Install GFCI bathroom receptacle (verify existing wiring)',
  gfciReplacement?'Reemplazar tomacorriente existente por uno GFCI':'Instalar tomacorriente GFCI (verificar cableado existente)',
  1,'job',175));
 if(floor){
  const detail=roomDim?' ('+size(roomDim)+' = '+roomArea+' sq ft)':' (room dimensions to confirm)';
  lines.push(line('floor','Replace bathroom floor tile'+detail,'Reemplazar loseta de piso de baño'+detail,roomArea,'sq ft',22));
  if(!roomArea)unknowns.push('Confirm room floor area; shower footprint must not be reused as bathroom size.');
 }
 if(paint){
  const paintWalls=has(s,/\b(paredes|walls|pared|wall)\b/),paintCeiling=has(s,/\b(ceiling|techo|cielo raso|cielorraso)\b/);
  if(paintWalls)lines.push(line('paint-walls','Prepare and paint remaining untiled bathroom walls'+(whitePaint?' white':'' )+' (confirm square footage)',
    'Preparar y pintar paredes sin loseta'+(whitePaint?' de blanco':'')+' (confirmar área)',1,'job',350));
  if(paintCeiling)lines.push(line('paint-ceiling','Prepare and paint bathroom ceiling'+(whitePaint?' white':''),'Preparar y pintar techo del baño'+(whitePaint?' de blanco':''),1,'job',175));
  if(!paintWalls&&!paintCeiling)lines.push(line('paint','Prepare and paint bathroom (scope to confirm)','Preparar y pintar baño (confirmar alcance)',1,'job',475));
 }
 if(plumbing&&!shower)lines.push(line('plumbing','Bathroom plumbing work (confirm scope)','Trabajo de plomería de baño (confirmar alcance)',1,'job',700));
 if(electrical&&!lightRecessed&&!dimmer&&!gfci&&!mirror)lines.push(line('electrical','Electrical/lighting work (confirm scope)','Electricidad o iluminación (confirmar alcance)',1,'job',550));
 if(roomArea)unknowns.push('Bathroom floor '+roomArea+' sq ft based on '+size(roomDim!)+'; verify dimensions and units.');
 if(tileToCeiling&&!height)unknowns.push('Shower tile reaches ceiling; confirm measured wall height before pricing.');
 if(gfci)unknowns.push('Verify GFCI location, circuit protection and wiring before final pricing.');
 if(!lines.length){
  lines.push(line('unclassified','Review dictated scope and define work items','Revisar descripción dictada y definir partidas',1,'job',0));
  unknowns.push('No supported remodeling tasks recognized. Add line items manually.');
 }
 unknowns.push('Rates are illustrative editable planning allowances, NOT verified supplier or labor quotes. Confirm equipment, waste, permits, tax, overhead and profit.');
 return {lines,unknowns,recognized:lines[0].id!=='local-unclassified'};
}
