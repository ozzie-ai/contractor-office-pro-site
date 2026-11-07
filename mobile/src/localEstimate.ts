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
 const lightRecessed=has(s,/\b(recessed\s*(?:light|lighting|luz)?|luz\s*empotrada|foco\s*empotrado|can light|downlight)\b/);
 const gfci=has(s,/\b(gfci|gfi|ground.fault)\b/);
 const gfciReplacement=gfci&&has(s,/\b(reemplaz\w*|cambiar|reponer|sustituir|replace|instead of|en lugar de)\b/);
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
 if(lightRecessed)lines.push(line('recessed-light','Supply and install new recessed ceiling light (verify existing circuit and wiring)',
  'Suministrar e instalar lámpara empotrada nueva en techo (verificar circuito y cableado)',1,'job',325));
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
 if(electrical&&!lightRecessed&&!gfci&&!mirror)lines.push(line('electrical','Electrical/lighting work (confirm scope)','Electricidad o iluminación (confirmar alcance)',1,'job',550));
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
