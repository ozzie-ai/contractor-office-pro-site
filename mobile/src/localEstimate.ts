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
 const roomDim=near(s,all,roomRe)||(all.length===1&&!showerDim?all[0]:undefined);
 const roomArea=roomDim?roomDim.a*roomDim.b:0;
 const tub=has(s,/\b(tina|bathtub|tub|banera)\b/);
 const demo=has(s,/\b(demoler|demolicion|demolition|remove|remover|quitar|retirar|demolish|sacar)\b/);
 const glass=has(s,/\b(vidrio|glass|cristal|mampara)\b/);
 const vanity=has(s,/\b(vanity|vanitorio|gabinete de bano|lavabo con mueble)\b/);
 const toilet=has(s,/\b(toilet|inodoro|sanitario|retrete|wc)\b/);
 const mirror=has(s,/\b(espejo|mirror)\b/);
 const light=has(s,/\b(luz|luces|light|lighting|led|iluminado)\b/);
 const floor=has(s,/\b(piso|floor|flooring|loseta|tile de piso|pavimento)\b/);
 const paint=has(s,/\b(pintura|pintar|paint|painting)\b/);
 const plumbing=has(s,/\b(plomeria|plumbing|tuberia|pipes|reubicar desague|move drain)\b/);
 const electrical=has(s,/\b(electricidad|electrical|electric|outlet|tomacorriente|recessed|empotrada)\b/);
 const wall=has(s,/\b(pared|paredes|muro|muros|wall|walls)\b/);
 const tile=has(s,/\b(losa|loseta|azulejo|ceramica|tile|tiling|alicatar|enchapar|revestir)\b/);
 const heightMatch=s.match(/\b(?:altura|alto|high|height|de altura|paredes? (?:son|de|tienen)|walls? (?:are|of))\s*(?:de\s*)?(\d{1,2}(?:[.,]\d+)?)\s*(?:pies?|feet|ft|')\b/)
  ||s.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*(?:pies?|feet|ft|')\s*(?:de altura|de alto|high|tall)\b/);
 const height=heightMatch?number(heightMatch[1]):0;
 const short=showerDim?Math.min(showerDim.a,showerDim.b):0,long=showerDim?Math.max(showerDim.a,showerDim.b):0;
 const wallArea=showerDim&&height>0&&height<=20?(2*short+long)*height:0;
 if(demo&&tub)lines.push(line('tub-remove','Remove and dispose of existing bathtub','Retirar y desechar tina existente',1,'job',650));
 else if(demo&&bathroom)lines.push(line('bath-demo','Bathroom demolition and debris removal (confirm scope)','Demolición y retiro de escombros del baño (confirmar alcance)',1,'job',850));
 if(shower){
  const d=showerDim?' ('+size(showerDim)+')':' (confirm dimensions)';
  lines.push(line('shower',(tub&&demo?'Convert bathtub area to shower':'Install shower')+d+'; base, waterproofing and plumbing only; wall tile and glass priced separately',
   (tub&&demo?'Convertir área de tina en regadera':'Instalar regadera')+d+'; base, impermeabilización y plomería solamente; loseta y vidrio por separado',1,'job',2700));
  if(glass)lines.push(line('glass','Supply and install shower glass door/enclosure'+d,'Suministrar e instalar puerta de vidrio para regadera'+d,1,'job',1200));
  if(!showerDim)unknowns.push('Confirm shower dimensions and wall lengths on site.');
  unknowns.push('Verify shower drain, waterproofing system, fixtures and glass selection.');
 }
 if(shower&&wall&&tile){
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
 const reinstall=has(s,/\b(reinstal\w*|reinstall\w*|volver a instalar|same position|misma posicion|reset)\b/);
 if(toilet)lines.push(line('toilet',reinstall?'Remove and reinstall existing toilet':'Toilet installation/reset (confirm new or existing)',
  reinstall?'Retirar y reinstalar inodoro existente':'Instalar o reinstalar inodoro (confirmar existente o nuevo)',1,'job',300));
 if(vanity){
  const width=s.match(/(?:vanity|vanitorio|gabinete)[^.!?\n]{0,100}?\b(\d{2,3})\s*(?:pulgadas|inches|inch|in\b|")/);
  const detail=width?' ('+width[1]+' in)':'';
  lines.push(line('vanity','Supply and install vanity with single sink'+detail,'Suministrar e instalar vanity con lavabo sencillo'+detail,1,'job',950));
  unknowns.push('Confirm vanity width, faucet, countertop and plumbing connections.');
 }
 if(mirror)lines.push(line('mirror',light?'Supply and install illuminated mirror':'Supply and install mirror',
  light?'Suministrar e instalar espejo iluminado':'Suministrar e instalar espejo',1,'job',375));
 if(floor){
  const detail=roomDim?' ('+size(roomDim)+' = '+roomArea+' sq ft)':' (room dimensions to confirm)';
  lines.push(line('floor','Replace bathroom floor tile'+detail,'Reemplazar loseta de piso de baño'+detail,roomArea,'sq ft',22));
  if(!roomArea)unknowns.push('Confirm room floor area; shower footprint must not be reused as bathroom size.');
 }
 if(paint)lines.push(line('paint','Prepare and paint bathroom walls/ceiling','Preparar y pintar paredes y techo del baño',1,'job',475));
 if(plumbing&&!shower)lines.push(line('plumbing','Bathroom plumbing work (confirm scope)','Trabajo de plomería de baño (confirmar alcance)',1,'job',700));
 if(electrical&&!mirror)lines.push(line('electrical','Electrical/lighting work (confirm scope)','Electricidad o iluminación (confirmar alcance)',1,'job',550));
 if(roomArea)unknowns.push('Bathroom floor '+roomArea+' sq ft based on '+size(roomDim!)+'; verify dimensions and units.');
 if(!lines.length){
  lines.push(line('unclassified','Review dictated scope and define work items','Revisar descripción dictada y definir partidas',1,'job',0));
  unknowns.push('No supported remodeling tasks recognized. Add line items manually.');
 }
 unknowns.push('Rates are illustrative editable planning allowances, NOT verified supplier or labor quotes. Confirm equipment, waste, permits, tax, overhead and profit.');
 return {lines,unknowns,recognized:lines[0].id!=='local-unclassified'};
}
