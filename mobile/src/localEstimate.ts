import {EstimateLine,Trade} from './estimate';

type LocalDraft={lines:EstimateLine[];unknowns:string[];recognized:boolean};
const has=(s:string,re:RegExp)=>re.test(s);
const line=(id:string,en:string,es:string,quantity:number,unit:string,rate:number):EstimateLine=>({
  id:'local-'+id,description_en:en,description_es:es,quantity,unit,rate,status:'allowance_to_confirm'
});
const tidy=(description:string)=>description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const number=(value:string)=>Number(value.replace(',','.'));
const meters=/\b(metros?|meters?)\b/i;

/** Preliminary planning allowances only, NOT quotes, verified labor rates, or live material costs.
 * This intentionally recognizes only mentioned work, keeping non-mentioned work out.
 */
export function localEstimate(description:string,trade:Trade):LocalDraft{
 const s=tidy(description);
 const lines:EstimateLine[]=[];
 const unknowns:string[]=[];
 let area:number|undefined;
 const dimensions=s.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*(?:pies?|feet|ft|')?\s*(?:por|x|×|by)\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:pies?|feet|ft|')?\b/);
 if(dimensions)area=number(dimensions[1])*number(dimensions[2]);
 const bathroom=has(s,/\b(bano|bathroom|bath)\b/);
 const shower=has(s,/\b(shower|regadera|ducha)\b/);
 const tub=has(s,/\b(tina|bathtub|tub|banera)\b/);
 const demo=has(s,/\b(demoler|demolicion|demolition|remove|remover|quitar|retirar|demolish)\b/);
 const glass=has(s,/\b(vidrio|glass|cristal|mampara)\b/);
 const vanity=has(s,/\b(vanity|vanitorio|gabinete de bano|lavabo con mueble)\b/);
 const toilet=has(s,/\b(toilet|inodoro|sanitario|retrete|wc)\b/);
 const mirror=has(s,/\b(espejo|mirror)\b/);
 const light=has(s,/\b(luz|luces|light|lighting|led|iluminado)\b/);
 const floor=has(s,/\b(piso|floor|flooring|loseta|tile de piso)\b/);
 const paint=has(s,/\b(pintura|pintar|paint|painting)\b/);
 const plumbing=has(s,/\b(plomeria|plumbing|tuberia|pipes|reubicar desague|move drain)\b/);
 const electrical=has(s,/\b(electricidad|electrical|electric|outlet|tomacorriente|recessed|empotrada)\b/);

 if(demo && tub)lines.push(line('tub-remove','Remove and dispose of existing bathtub','Retirar y desechar tina existente',1,'job',650));
 else if(demo && bathroom)lines.push(line('bath-demo','Bathroom demolition and debris removal (scope to confirm)','Demolición del baño y retiro de escombros (alcance por confirmar)',1,'job',850));

 if(shower){
  const conversion=tub&&demo;
  lines.push(line('shower',conversion?'Convert bathtub area to shower; waterproof, tile and plumbing allowance':'Install shower; waterproofing, tile and plumbing allowance',
    conversion?'Convertir área de tina en regadera; impermeabilización, azulejo y plomería':'Instalar regadera; impermeabilización, azulejo y plomería',1,'job',3600));
  if(glass)lines.push(line('glass','Provide and install shower glass door/enclosure','Suministrar e instalar puerta o cerramiento de vidrio para regadera',1,'job',1200));
  unknowns.push('Confirm shower dimensions, wall tile selection, drain position and waterproofing details.');
 }
 if(toilet)lines.push(line('toilet',has(s,/\b(reinstall|reinstalar|reinstalare|misma posicion|same position)\b/)?'Remove and reinstall existing toilet':'Toilet installation or reset (confirm existing vs new)',
   has(s,/\b(reinstall|reinstalar|reinstalare|misma posicion|same position)\b/)?'Retirar y reinstalar inodoro existente':'Instalación o reinstalación de inodoro (confirmar si es nuevo)',1,'job',300));
 if(vanity){
  const width=s.match(/(?:vanity|vanitorio|gabinete)[^.!?\n]{0,60}?(\d{2,3})\s*(?:pulgadas|inches|inch|in|")\b/);
  const detail=width?' ('+width[1]+' in)':'';
  lines.push(line('vanity','Supply and install vanity with single sink'+detail,'Suministro e instalación de vanity con lavabo sencillo'+detail,1,'job',950));
  unknowns.push('Confirm vanity material, faucet, countertop and connection requirements.');
 }
 if(mirror)lines.push(line('mirror',light?'Supply and install illuminated vanity mirror':'Supply and install vanity mirror',light?'Suministrar e instalar espejo iluminado':'Suministrar e instalar espejo',1,'job',375));
 if(floor)lines.push(line('floor','Install bathroom floor tile (surface preparation and tile selection to confirm)','Instalar loseta en piso de baño (preparación y material por confirmar)',area||0,'sq ft',22));
 if(paint)lines.push(line('paint','Prepare and paint bathroom walls/ceiling','Preparar y pintar paredes y techo del baño',1,'job',475));
 if(plumbing&&!shower)lines.push(line('plumbing','Bathroom plumbing work (scope to confirm)','Trabajo de plomería del baño (alcance por confirmar)',1,'job',700));
 if(electrical&&!mirror)lines.push(line('electrical','Electrical/lighting work (scope to confirm)','Trabajo eléctrico e iluminación (alcance por confirmar)',1,'job',550));
 if(area)unknowns.push('Room dimensions interpreted as '+dimensions![1]+' × '+dimensions![2]+' = '+area+' sq ft. Verify unit is feet and measure onsite.');
 if(floor&&!area)unknowns.push('Measure floor area before assigning a floor quantity.');
 if(!lines.length){
  lines.push(line('unclassified','Review dictated job description and define work items','Revisar descripción dictada y definir partidas',1,'job',0));
  unknowns.push('No supported remodeling tasks recognized. Add scope and pricing manually.');
 }
 unknowns.push('All nonzero rates are editable illustrative planning allowances, not validated local labor/material prices. Verify costs, permits, taxes, overhead and job-specific conditions before sharing.');
 return {lines,unknowns,recognized:lines[0].id!=='local-unclassified'};
}
