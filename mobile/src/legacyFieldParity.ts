import type {EstimateLine,Trade} from './estimate';

/**
 * Restores two field workflows already present in the legacy browser estimator:
 * measured concrete patio quantity takeoff and owner-supplied faucet labor.
 * Older example rates are NOT supplier quotes; contractor acceptance is required.
 * Scope is derived from stated dimensions and work, never inferred from floor area.
 */
export const LEGACY_FIELD_SOURCE='Illustrative legacy field estimate — historic editable planning cost, contractor review required';

export type FieldDraft={lines:EstimateLine[];unknowns:string[];recognized:boolean;customerScope?:{en:string[];es:string[]}};
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

 // EV charger field takeoff — recovered from the earlier web-based electrician
 // estimator. Component amounts are the older editable sample costs; they are
 // NOT live supplier quotes or code-compliance design approvals.
 if(trade==='electrical'&&/\b(ev|electric[- ]?vehicle|vehiculo electrico|carro electrico|tesla)\b/.test(s)
   &&/\b(chargers?|cargadores?|cargador|charging|carga)\b/.test(s)){
  const lines:EstimateLine[]=[],unknowns:string[]=[];
  const route=s.match(/\b(\d+(?:[.,]\d+)?)\s*(?:ft|feet|pies?)\s*(?:of\s+|de\s+)?(?:run|route|cable|wire|conduit|recorrido|tuberia|circuito)\b/)||
   s.match(/\b(?:run|route|recorrido|tirada|cableado)\s*(?:of\s+|de\s+)?(\d+(?:[.,]\d+)?)\s*(?:ft|feet|pies?)\b/);
  const ft=route?value(route[1]):0;
  const breaker=s.match(/\b(\d{2,3})\s*(?:a\b|amps?|amperes?|amperios?)\s*(?:circuit\s+)?(?:breaker|interruptor)\b/)||
    s.match(/\b(?:breaker|interruptor)\s*(?:of|de|for|para)?\s*(\d{2,3})\s*(?:a\b|amps?|amperes?|amperios?)\b/);
  const amps=breaker?Number(breaker[1]):0;
  const current=s.match(/\b(?:charger|cargador)\s*(?:at|de|of|para)?\s*(\d{2,3})\s*(?:a\b|amps?|amperios?)\b/)||
    s.match(/\b(\d{2,3})\s*(?:a\b|amps?|amperios?)\s*(?:ev\s+)?(?:charger|cargador)\b/);
  const chargeCurrent=current?Number(current[1]):0;
  const volts=s.match(/\b(\d{3})\s*(?:volts?|v)\b/);
  const permit=s.match(/\b(?:permit|permiso)\b[^.!?\n$]{0,30}\$\s*(\d+(?:[.,]\d+)?)/)||
    s.match(/\$\s*(\d+(?:[.,]\d+)?)\s*(?:for\s+the\s+|de\s+)?(?:permit|permiso)\b/);
  const suppliedByOwner=/\b(?:homeowner|owner|client|customer|dueno|propietario)\b[^.!?\n]{0,65}\b(?:supplies?|provides?|suministra|compra|pone)\b|\b(?:charger|cargador)\b[^.!?\n]{0,55}\b(?:provided by|supplied by)\s+(?:the\s+)?(?:owner|client|homeowner)\b/.test(s);
  if(ft>0&&ft<=500){
   if(!/\b(?:owner supplies|homeowner supplies|owner provided|homeowner provided)\s+(?:all\s+)?(?:materials?|wire|wiring|conduit)\b/.test(s)){
    lines.push(item('ev-wire','EV feeder conductors — route material','Conductores del circuito EV — material de recorrido',ft,'linear ft',8));
    lines.push(item('ev-conduit','EV conduit and fittings','Tubería, conectores y soportes para EV',ft,'linear ft',4));
   }
   lines.push(item('ev-run-labor','EV circuit installation — route labor','Instalación de circuito EV — mano de obra de recorrido',ft,'linear ft',8));
  }else{
   lines.push(item('ev-route-review','Confirm EV circuit route length in feet','Confirmar longitud del recorrido EV en pies',0,'linear ft',0));
   unknowns.push('Confirm total route length before costing conductors, conduit and labor.');
  }
  if(amps>=15&&amps<=200)lines.push(item('ev-breaker','New EV circuit breaker — verify device and panel compatibility',
    'Breaker de circuito EV — verificar compatibilidad',1,'each',110));
  else{lines.push(item('ev-breaker-review','Confirm dedicated EV circuit breaker rating (A)',
    'Confirmar amperaje del breaker dedicado EV',0,'each',0));unknowns.push('Confirm breaker rating, type, panel capacity and circuit sizing.');}
  lines.push(item('ev-terminations','EV charging circuit terminations and testing',
    'Conexiones y pruebas del circuito de carga EV',1,'job',350));
  if(permit)lines.push(item('ev-permit','Electrical permit fee (contractor-stated)',
     'Permiso eléctrico (importe indicado)',1,'job',value(permit[1])));
  else {lines.push(item('ev-permit-review','Confirm EV charger permit requirements and cost',
   'Confirmar costo y requisitos del permiso EV',0,'job',0));unknowns.push('Permit cost and jurisdiction requirements need confirmation.');}
  if(!suppliedByOwner){
   lines.push(item('ev-charger-supply','Confirm EV charger equipment model and supply cost',
    'Confirmar modelo y costo del equipo cargador EV',0,'each',0));
   unknowns.push('Confirm who supplies the EV charger and its equipment price.');
  }
  if(!chargeCurrent){
   lines.push(item('ev-current-review','Confirm maximum EV charger continuous current (A)',
    'Confirmar corriente máxima continua del cargador EV (A)',0,'amps',0));
   unknowns.push('Confirm charger continuous current rating; it is not the breaker rating.');
  }
  if(!volts){
   lines.push(item('ev-voltage-review','Confirm EV charger circuit voltage (V)',
    'Confirmar voltaje del circuito del cargador EV (V)',0,'volts',0));
   unknowns.push('Confirm nominal installation voltage.');
  }
  if(chargeCurrent&&amps&&amps<Math.ceil(chargeCurrent*1.25)){
   lines.push(item('ev-sizing-review','Verify circuit breaker rating vs continuous EV charger current',
    'Verificar breaker frente a corriente continua del cargador',0,'job',0));
   unknowns.push('Check continuous-load circuit and breaker sizing with a qualified electrician; current rating may be inadequate.');
  }
  if(/\b(panel upgrade|upgrade (?:the )?panel|reemplazar tablero|cambiar panel|nuevo panel)\b/.test(s)){
   lines.push(item('ev-panel-review','Panel upgrade mentioned with EV work — separate scope and price needed',
    'Se menciona actualizar panel con EV — desglosar y cotizar',0,'job',0));
   unknowns.push('EV work and panel upgrade must both be included; confirm panel service, circuits and costs separately.');
  }
  unknowns.push('Verify conduit type, feeder conductor sizing, voltage drop, load calculation, access, utility and inspection.');
  return {lines,unknowns,recognized:true,customerScope:{
   en:['Install a dedicated EV charging circuit with the customer-confirmed route and breaker specifications.',
    'Provide route conduits and conductors and complete wiring terminations and safety testing.',
    ...(suppliedByOwner?['Owner supplies the EV charging equipment; unit purchase is excluded.']:[]),
    'Verify local permit, electrical panel capacity and inspections before installation.'],
   es:['Instalar un circuito dedicado para cargador de vehículo eléctrico con recorrido y breaker por confirmar.',
    'Instalar tubería, conductores, conexiones y realizar pruebas de seguridad.',
    ...(suppliedByOwner?['El propietario proporciona el cargador; su compra está excluida.']:[]),
    'Verificar permiso, capacidad del panel e inspección antes de instalar.']
  }};
 }
 // Kitchen assembly takeoff, not room-size guesswork: room area alone does NOT
 // establish linear feet of cabinets or quartz countertop square footage.
 if(trade==='remodel'&&/\b(kitchen|cocina)\b/.test(s)
   &&/\b(remodel|renovat|reforma|demol|cabinets?|gabinetes?|shaker|quartz|cuarzo|countertops?|encimeras?|granito)\b/.test(s)){
  const lines:EstimateLine[]=[],unknowns:string[]=[];
  const room=s.match(/\b(?:kitchen|cocina)\b[^.!?\n]{0,40}?\b(\d{1,3}(?:[.,]\d+)?)\s*(?:ft|feet|pies?)?\s*(?:x|×|by|por)\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:ft|feet|pies?)?\b/);
  const floor=room?round(value(room[1])*value(room[2])):0;
  const cabinetry=/\b(cabinets?|gabinetes?|alacenas?|shaker)\b/.test(s);
  const countertop=/\b(countertops?|quartz|cuarzo|encimeras?|granito)\b/.test(s);
  const tile=/\b(tile|loseta|azulejo|flooring|piso)\b/.test(s);
  const cabinetLf=s.match(/\b(\d+(?:[.,]\d+)?)\s*(?:linear\s+(?:ft|feet)|lf|pies?\s+lineales)\s*(?:of\s+|de\s+)?(?:base\s+|upper\s+|wall\s+)?(?:cabinets?|gabinetes?|alacenas?)\b/)||
   s.match(/\b(?:cabinets?|gabinetes?)\s*(?:of\s+|de\s+)?(\d+(?:[.,]\d+)?)\s*(?:linear\s+(?:ft|feet)|lf|pies?\s+lineales)\b/);
  const quartzSf=s.match(/\b(\d+(?:[.,]\d+)?)\s*(?:sq\.?\s*ft|square\s+feet|ft2|ft²|pies?\s+cuadrados)\s*(?:of\s+|de\s+)?(?:quartz|cuarzo|countertops?|encimeras?|granito)\b/)||
   s.match(/\b(?:quartz|cuarzo|countertops?|encimeras?|granito)\s*(?:area\s+of\s+|de\s+)?(\d+(?:[.,]\d+)?)\s*(?:sq\.?\s*ft|square\s+feet|ft2|ft²|pies?\s+cuadrados)\b/);
  const lf=cabinetLf?value(cabinetLf[1]):0,sf=quartzSf?value(quartzSf[1]):0;
  const demol=/\b(?:demol\w*|remove existing|tear out|rip out|quitar|retirar)\b/.test(s);
  const sink=/\b(sink|fregadero|lavaplatos|lavabo)\b/.test(s);
  const bar=/\b(breakfast bar|barra desayunadora|barra de desayuno|island|isla)\b/.test(s);
  if(demol)lines.push(item('kitchen-demo','Demolish and remove specified existing kitchen fixtures/finishes',
   'Demoler y retirar los elementos existentes indicados de cocina',1,'job',1100));
  if(cabinetry){
   if(lf>0&&lf<=150){
    lines.push(item('kitchen-cabinets-material','Cabinet module materials — confirm model/finish',
     'Material de gabinetes — confirmar modelo y acabado',lf,'linear ft',280));
    lines.push(item('kitchen-cabinets-labor','Install measured cabinet modules',
     'Instalar módulos de gabinetes medidos',lf,'linear ft',95));
   }else{lines.push(item('kitchen-cabinets-review','Measure total cabinet linear feet (uppers and lowers separately)',
    'Medir pies lineales de gabinetes (altos y bajos por separado)',0,'linear ft',0));
    unknowns.push('Confirm cabinet linear feet and counts for lower and upper runs. A 10×10 room does not equal 20 linear feet of cabinets.');
   }
  }
  if(countertop){
   if(sf>0&&sf<=1000){
    lines.push(item('kitchen-quartz-material','Quartz countertop fabrication/material',
     'Material y fabricación de cubierta de cuarzo',sf,'sq ft',65));
    lines.push(item('kitchen-quartz-install','Quartz countertop installation',
     'Instalación de cubierta de cuarzo',sf,'sq ft',25));
   }else {lines.push(item('kitchen-quartz-review','Measure countertop area and confirm edges/backsplash',
     'Medir cubierta y confirmar bordes y salpicadero',0,'sq ft',0));
    unknowns.push('Confirm actual countertop square footage and countertop/backsplash details.');
   }
  }
  if(tile){
   if(floor>0&&floor<=2000){
    lines.push(item('kitchen-floor-prep','Prepare existing kitchen floor substrate',
     'Preparar base de piso de cocina',floor,'sq ft',4));
    lines.push(item('kitchen-tile-material','Kitchen floor tile materials (10% waste)',
     'Material de loseta de cocina (10% desperdicio)',Math.ceil(floor*11/10),'sq ft',4.5));
    lines.push(item('kitchen-tile-labor','Kitchen floor tile installation',
     'Mano de obra instalación de loseta en cocina',floor,'sq ft',7.5));
   }else{lines.push(item('kitchen-floor-review','Confirm room dimensions and measured flooring area',
    'Confirmar medidas de cocina y área de loseta',0,'sq ft',0));
    unknowns.push('Kitchen floor dimensions not stated; cannot price the floor.');
   }
  }
  if(sink)lines.push(item('kitchen-sink','Kitchen sink and plumbing reconnection (verify fixture supply)',
   'Instalar fregadero y reconectar plomería (verificar suministro)',1,'job',850));
  if(bar){lines.push(item('kitchen-breakfast-bar','Breakfast bar/island — confirm footprint, support and finish',
    'Barra desayunadora/isla — confirmar medidas, soporte y acabado',0,'job',0));
   unknowns.push('Breakfast bar/island needs dimensions, cabinet support and countertop overhang/finish; excluded from priced subtotal.');
  }
  if(!lines.length)return null;
  unknowns.push('Confirm layout, cabinet construction, demolition conditions, plumbing/electrical modifications, permits, materials and supplier prices.');
  return {lines,unknowns,recognized:true,customerScope:{
   en:['Kitchen work as described, with site measurements and selections to be confirmed.',
     ...(demol?['Remove and dispose of specified existing kitchen finishes/fixtures.']:[]),
     ...(cabinetry?['Supply and install the selected kitchen cabinet layout after measuring upper/lower runs.']:[]),
     ...(countertop?['Fabricate and install measured quartz countertops, subject to finish and edge selection.']:[]),
     ...(tile?['Prepare the substrate and replace kitchen floor tile in the measured area.']:[]),
     ...(sink?['Install the kitchen sink and reconnect plumbing at the agreed location.']:[]),
     ...(bar?['Breakfast bar/island is pending dimension and support confirmation; not included in priced subtotal.']:[])],
   es:['Trabajos de cocina según lo descrito; confirmar medidas y selecciones.',
     ...(demol?['Retirar y desechar acabados y accesorios existentes indicados.']:[]),
     ...(cabinetry?['Suministrar e instalar gabinetes según medidas de muebles altos y bajos.']:[]),
     ...(countertop?['Fabricar e instalar cubiertas de cuarzo según medidas verificadas.']:[]),
     ...(tile?['Preparar base y reemplazar la loseta de cocina en el área medida.']:[]),
     ...(sink?['Instalar fregadero y reconectar plomería en ubicación acordada.']:[]),
     ...(bar?['Barra desayunadora/isla pendiente de medidas y soporte; no incluida en subtotal.']:[])]
  }};
 }
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
