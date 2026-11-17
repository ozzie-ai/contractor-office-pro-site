import type {EstimateLine,Trade} from './estimate';

/**
 * Restores two field workflows already present in the legacy browser estimator:
 * measured concrete patio quantity takeoff and owner-supplied faucet labor.
 * Older example rates are NOT supplier quotes; contractor acceptance is required.
 * Scope is derived from stated dimensions and work, never inferred from floor area.
 */
export const LEGACY_FIELD_SOURCE='Illustrative legacy field estimate — historic editable planning cost, contractor review required';

export type FieldDraft={lines:EstimateLine[];unknowns:string[];recognized:boolean};
const cleaned=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const round=(n:number)=>Math.round(n*100)/100;
const item=(id:string,en:string,es:string,q:number,unit:string,rate:number):EstimateLine=>({
 id:'legacy-'+id,description_en:en,description_es:es,
 quantity:q,unit,rate,status:'allowance_to_confirm',
 rateSource:rate>0?LEGACY_FIELD_SOURCE:undefined,
 priceEvidence:rate>0?{kind:'planning_allowance',detail:'Restored from editable older browser estimator; no independently verified 2026 unit rate'}:undefined
});
const numbers:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
 uno:1,una:1,un:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10};
const value=(s:string)=>numbers[s]??Number(s.replace(',','.'));
const quantity=(s:string)=>value(s);

export function legacyFieldEstimate(description:string,trade:Trade):FieldDraft|null{
 const s=cleaned(description);
 if(trade==='concrete'){
  if(!/\b(concrete|cemento|concreto|losa|slab|patio|driveway)\b/.test(s))return null;
  const dimensions=s.match(/\b(\d{1,3}(?:[.,]\d+)?)\s*(?:ft|feet|pies?)?\s*(?:x|×|by|por)\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:ft|feet|pies?)?\b/);
  const thickness=s.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*(?:inches|inch|in\b|pulgadas?)\b/)||
   s.match(/\b(?:grosor|thick(?:ness)?)[^.!?\n]{0,28}?\b(\d{1,2}(?:[.,]\d+)?)\b/);
  const l=dimensions?value(dimensions[1]):0,w=dimensions?value(dimensions[2]):0,t=thickness?value(thickness[1]):0;
  if(!l||!w||!t||l>200||w>200||t>24||t<2){
   return {lines:[item('concrete-dimensions','Confirm concrete slab length, width and thickness (inches)',
    'Confirmar largo, ancho y grosor de la losa (pulgadas)',0,'job',0)],
    unknowns:['Missing concrete dimensions or thickness; enter measurements before calculating a complete price.'],recognized:false};
  }
  const area=round(l*w),perimeter=round(2*(l+w));
  const volume=area*t/324;
  const order=Math.ceil(volume*1.1*10)/10; // old browser estimator's 10% order allowance
  const mesh=/\b(mesh|malla)\b/.test(s),rebar=/\b(rebar|varilla)\b/.test(s);
  const finish=/\b(stamped|stamp|estampad|imprimid)\b/.test(s)?'stamped':
   /\b(exposed aggregate|agregado expuesto|piedra lavada)\b/.test(s)?'exposed':
   /\b(smooth|trowel|pulid|alisado)\b/.test(s)?'smooth':'broom';
  const finishExtra:{[k:string]:[number,number]}={broom:[0,0],smooth:[1.5,.35],exposed:[2.5,1],stamped:[5,2.5]};
  const lines:EstimateLine[]=[
   item('site-grade','Site preparation / grading','Preparación y nivelación del terreno',area,'sq ft',2.25),
   item('base','Base preparation / compaction','Preparación y compactación de la base',area,'sq ft',1.25),
   item('forms','Perimeter formwork','Formaleta perimetral',perimeter,'linear ft',5),
   item('ready-mix','Ready-mix concrete (10% order allowance; '+round(volume)+' yd³ net)','Concreto premezclado (10% extra; '+round(volume)+' yd³ netos)',order,'cu yd',180),
   item('delivery','Concrete delivery / short load','Entrega de concreto / carga pequeña',1,'job',325),
   item('place-finish','Place and broom-finish concrete','Colocar y acabar el concreto',area,'sq ft',4.25),
   item('joints-clean','Control joints and final cleanup','Juntas de control y limpieza final',1,'job',300)
  ];
  if(mesh||rebar)lines.splice(3,0,item('reinforcement',mesh?'Wire mesh reinforcement':'Rebar reinforcement',
    mesh?'Refuerzo con malla':'Refuerzo con varilla',area,'sq ft',1.25));
  else lines.push(item('reinforcement-review','Confirm whether reinforcement is required',
   'Confirmar si requiere malla o varilla',0,'job',0));
  if(finish!=='broom'){
   const [labor,material]=finishExtra[finish];
   lines.push(item('finish-labor','Additional '+finish+' finish labor','Mano de obra adicional por acabado '+finish,area,'sq ft',labor));
   lines.push(item('finish-material','Additional '+finish+' finish materials','Materiales adicionales por acabado '+finish,area,'sq ft',material));
  }
  if(/\b(demo|demol|tear out|remove existing concrete|retirar concreto|quitar concreto)\b/.test(s))
   lines.push(item('demo','Demolish and remove existing concrete (verify disposal)','Demoler y retirar concreto existente (verificar desecho)',area,'sq ft',4));
  return {lines,unknowns:[
   'Confirm truck access, excavation/disposal, base depth, reinforcement specification, mix strength, site conditions and permits.',
   ...(mesh||rebar?[]:['Missing reinforcement specification; confirm mesh, rebar or no reinforcement.']),
   'Historic component rates are editable, not 2026 supplier quotations. Explicit contractor approval required.'
  ],recognized:true};
 }
 if(trade==='handyman'||trade==='plumbing'){
  if(!/\b(faucets?|grifos?|griferias?|llaves?|mezcladoras?)\b/.test(s)||!/\b(replace|replacing|swap|cambiar|reemplaz|sustitu|instalar)\w*\b/.test(s))return null;
  // Do not omit unrelated trades or water heater work in a mixed description.
  if(/\b(water heater|calentador|toilet|inodoro|panel|wiring|circuit|tile|azulejos?)\b/.test(s))return null;
  const countWord='(?:\\d{1,2}|one|two|three|four|five|six|un|uno|una|dos|tres|cuatro|cinco|seis)';
  const bathroom=new RegExp('\\b('+countWord+')\\s+(?:bathroom|bath|lavabo|lavamanos)\\s+(?:sink\\s+)?(?:faucets?|grifos?|llaves?)\\b').exec(s);
  const kitchen=new RegExp('\\b('+countWord+')\\s+(?:kitchen|cocina)\\s+(?:sink\\s+)?(?:faucets?|grifos?|llaves?)\\b').exec(s);
  const tub=new RegExp('\\b('+countWord+')\\s+(?:tub|bathtub|tina|banera)\\s+(?:faucets?|grifos?|llaves?)\\b').exec(s);
  const generic=new RegExp('\\b('+countWord+')\\s+(?:faucets?|grifos?|llaves?)\\b').exec(s);
  const counts=[bathroom&&quantity(bathroom[1])||0,kitchen&&quantity(kitchen[1])||0,tub&&quantity(tub[1])||0];
  if(!counts.some(Boolean)&&generic)counts[0]=quantity(generic[1]);
  if(!counts.some(Boolean))return {lines:[item('faucet-count','Confirm how many faucets and their locations',
   'Confirmar número y ubicación de las llaves',0,'each',0)],unknowns:['Missing faucet count and location.'],recognized:false};
  const ownerSupplied=/\b(owner|homeowner|client|customer|dueno|propietario)\b[^.!?\n]{0,70}\b(supplies?|provides?|compra|suministra|pone)\b|\b(labor only|solo mano de obra|mano de obra solamente)\b/.test(s);
  const lines:EstimateLine[]=[];
  if(counts[0])lines.push(item('bath-faucet','Replace existing bathroom faucet'+(ownerSupplied?' (owner-supplied fixture)':''),
   'Reemplazar grifo de lavabo'+(ownerSupplied?' (grifo del dueño)':''),counts[0],'each',125));
  if(counts[1])lines.push(item('kitchen-faucet','Replace existing kitchen faucet'+(ownerSupplied?' (owner-supplied fixture)':''),
   'Reemplazar grifo de cocina'+(ownerSupplied?' (grifo del dueño)':''),counts[1],'each',125));
  if(counts[2])lines.push(item('tub-faucet','Replace bathtub faucet'+(ownerSupplied?' (owner-supplied fixture)':''),
   'Reemplazar grifo de tina'+(ownerSupplied?' (grifo del dueño)':''),counts[2],'each',175));
  if(!ownerSupplied)lines.push(item('faucet-materials','Confirm faucet fixture material price and supply',
   'Confirmar precio y suministro de grifos',0,'lot',0));
  return {lines,unknowns:[
   'Confirm faucet types, shutoffs, sink/tub access and whether fittings or plumbing repairs are required.',
   ...(ownerSupplied?['Owner provides fixture; replacement labor only.']:['Missing faucet material and supply prices.']),
   'Historical $125 sink / $175 tub labor examples require contractor review.'
  ],recognized:true};
 }
 return null;
}
