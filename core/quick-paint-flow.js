/*
 * Simple one-dictation painting flow, embedded in the ORIGINAL Contractor Office Pro.
 * No new workspace, SKU input, forms, trip-by-room charges or extra questionnaire.
 * All output remains an editable preliminary estimate; transcript stays private.
 */
(function(){
'use strict';
const parser=window.COPQuickPaint,book=window.COPReferencePrices;
if(!parser||!book||typeof suggestedItems!=='function')return;
const $=id=>document.getElementById(id);
const wording=(en,es)=>lang==='es'?es:en;
const money=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const currency=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
let active=null,lastEstimate=null,paintReference=null,markupTouched=false,customerLanguageTouched=false;
$('customerLang').addEventListener('change',()=>customerLanguageTouched=true);
const newRatesKey='cop-quickpaint-labor-v1';
function savedPaintLabor(){try{const v=Number(localStorage.getItem(newRatesKey));return Number.isFinite(v)&&v>0?v:null}catch{return null}}
function storePaintLabor(n){try{localStorage.setItem(newRatesKey,String(n))}catch{}}
for(const id of ['overhead','profit'])$(id).addEventListener('input',()=>markupTouched=true);
function qualified(){
 if(!['painting','other','handyman'].includes(job))return null;
 const plan=parser.parse($('description').value);
 if(!plan||!plan.allMeasured)return null;
 return plan;
}
const beforeInit=initializePainting;
initializePainting=function(){
 beforeInit();
 active=qualified();
 if(!active)return;
 paintingActive=true;
 const first=active.zones[0];
 // Only set legacy minimums for existing transition guard; they are NOT used for totals.
 $('pRooms').value=String(active.counts.bedroom||active.zones.length);
 $('pLength').value=String(first.lengthFt);$('pWidth').value=String(first.widthFt);
 $('pHeight').value=String(active.heightFt);
 $('pWalls').checked=true;
 $('pCeilings').checked=active.includeCeilings;
 $('paintingPanel').classList.add('hidden');
 $('size').value=String(active.floorSf);
};
const beforeRefresh=refreshPaintingPanel;
refreshPaintingPanel=function(){
 beforeRefresh();
 if(active)$('paintingPanel').classList.add('hidden');
};
const originalBuildScope=buildCustomerScope;
function quickScope(){
 if(!active||!lastEstimate)return originalBuildScope();
 const e=lastEstimate,lines=[
  wording('Interior wall painting — '+e.roomCount+' spaces','Pintura interior de muros — '+e.roomCount+' espacios')
 ];
 for(const z of active.zones){
  const type=parser.parse&&({bedroom:wording('Bedroom','Habitación'),bathroom:wording('Bathroom','Baño'),
   kitchen:wording('Kitchen','Cocina'),living_dining:wording('Combined living/dining','Sala y comedor juntos'),
   closet:wording('Closet','Clóset'),other:wording('Area','Área')})[z.category]||wording('Area','Área');
  lines.push('• '+(z.quantity>1?z.quantity+' × ':'')+type+(z.index&&z.quantity===1?' '+z.index:'')+': '+z.lengthFt+' × '+z.widthFt+' ft');
 }
 lines.push(wording('Walls: ','Muros: ')+money(e.wallNetSf)+' sq ft '+wording('estimated paintable','estimados para pintar')+'; '+e.paintGallons+' '+wording('gallons of paint','galones de pintura')+'; '+e.coats+' '+wording('coats','manos')+'.');
 lines.push(wording('Working assumptions: ','Supuestos: ')+e.heightFt+' ft '+wording('wall height','altura de muros')+
  ', '+e.settings.openingDeductionPct+'% '+wording('opening allowance','descuento provisional por puertas/ventanas')+
  ', '+e.settings.paintWastePct+'% '+wording('paint waste','desperdicio de pintura')+'.');
 lines.push(wording('Included: ordinary protection, masking, minor preparation, wall painting, and job mobilization.',
  'Incluye protección, enmascarado, preparación menor, pintura de muros y movilización del trabajo.'));
 lines.push(e.includeCeilings?wording('Ceiling painting included.','Se incluye pintar cielos.'):
  wording('Excluded: ceilings, doors, trim, exterior, and major wall repairs.','Excluye cielos, puertas, molduras, exterior y reparaciones mayores.'));
 $('customerScope').value=lines.join('\n');
}
buildCustomerScope=function(){return quickScope()};
const originalTakeoff=calculateTakeoff;
calculateTakeoff=function(){
 if(!active||!lastEstimate)return originalTakeoff();
 const e=lastEstimate;
 takeoffItems=[
  {id:'interior-paint',name:wording('Interior wall paint','Pintura interior'),qty:e.paintGallons,unit:'gal',basis:money(e.wallNetSf)+' sf × '+e.coats+' '+wording('coats','manos')+' + '+e.settings.paintWastePct+'%'},
  {id:'wall-protection',name:wording('Masking and preparation allowance','Protección y preparación'),qty:1,unit:'job',basis:wording('Job-wide allowance, not per room','Una provisión para todo el trabajo')}
 ];
 const table=document.createElement('table');table.className='estimate-table';
 for(const x of takeoffItems){
  const r=document.createElement('tr');for(const field of [x.name,x.qty+' '+x.unit,x.basis]){
   const cell=document.createElement('td');cell.textContent=field;r.append(cell);
  }table.append(r);
 }
 $('takeoffContent').replaceChildren(table);
 $('takeoffWarnings').textContent=wording('Editable planning quantities. Confirm actual surfaces and paint before ordering.',
  'Cantidades preliminares editables. Verifica superficies y pintura antes de comprar.');
 $('takeoffApply').classList.add('hidden');$('showerControls').classList.add('hidden');$('kitchenCabinetPanel').classList.add('hidden');
};
function applyMarkup(e){
 if(!markupTouched&&$('overhead').value==='0'&&$('profit').value==='0'){
  let saved;
  try{saved=JSON.parse(localStorage.getItem('cop-labor-cost-policy-v1')||'null')}catch{}
  $('overhead').value=String(Number.isFinite(saved?.overheadPct)?saved.overheadPct:e.settings.overheadPct);
  $('profit').value=String(Number.isFinite(saved?.profitPct)?saved.profitPct:e.settings.profitPct);
 }
}
function prepareQuickEstimate(){
 const reference=book.choose('interior-paint-1gal','standard',new Date().toISOString().slice(0,10));
 if(!reference){active=null;return false}
 paintReference=reference;
 const savedRate=savedPaintLabor();
 const settings=savedRate?{loadedLaborCostPerHour:savedRate}:{};
 const e=parser.estimate(active,{paintUnitCost:reference.unitCost,settings});
 lastEstimate=e;
 if(!customerLanguageTouched)$('customerLang').value=lang==='es'?'es':'en';
 applyMarkup(e);
 // The contractor only sees four understandable, editable cost groups.
 estimateItems=[
  {description:wording('Interior paint — cached retail material','Pintura interior — material a precio de referencia'),
   quantity:e.paintGallons,unit:'gal',rate:e.paintUnitCost,copKind:'paint',copSourceDate:reference.observedOn},
  {description:wording('Masking and ordinary surface prep — job allowance','Protección y preparación básica — provisión por trabajo'),
   quantity:1,unit:'job',rate:e.prepCost,copKind:'prep'},
  {description:wording('Wall painting labor — total crew hours','Pintura de muros — mano de obra (horas totales)'),
   quantity:e.totalLaborHours,unit:'hr',rate:e.settings.loadedLaborCostPerHour,copKind:'labor'},
  {description:wording('Mobilization and purchasing — once per job','Movilización y compras — una vez por trabajo'),
   quantity:1,unit:'job',rate:e.mobilization,copKind:'mobilization'}
 ];
 initialized=true;
 // Preserve the simple original interface; none of the room-calculator forms are needed.
 $('paintingPanel').classList.add('hidden');
 paintingActive=false;
 renderItems();quickScope();calculateTakeoff();
 // Store provenance, so cached reference is not treated as an unverified $45 sample.
 if(typeof window.COPRegisterRetailReference==='function'){
  window.COPRegisterRetailReference(0,{retailer:reference.store,checkedOn:reference.observedOn,
   unitCost:reference.unitCost,description:estimateItems[0].description,cached:true,sourceUrl:reference.sourceUrl});
 }
 const heightNote=e.assumedHeight?wording('8-ft walls assumed. ','Se asumieron muros de 8 pies. '):'';
 const ceilingNote=e.includeCeilings?wording('Ceilings included. ','Incluye cielos. '):wording('Walls only. ','Solo muros. ');
 const stale=reference.isStale?wording('Cached paint price needs refresh. ','El precio guardado de pintura necesita actualización. '):'';
 $('estimateHint').textContent=wording(
  'AUTO DRAFT — ','BORRADOR AUTOMÁTICO — ')+e.roomCount+wording(' spaces, ',' espacios, ')+money(e.floorSf)+
  wording(' sf floor; ',' pies² de piso; ')+money(e.wallNetSf)+wording(' sf walls; ',' pies² de muros; ')+
  e.paintGallons+wording(' gal; ',' galones; ')+money(e.totalLaborHours)+wording(' estimated labor hours. ',' horas estimadas. ')+
  heightNote+ceilingNote+stale+
  wording('Material is a dated retail reference. Labor, prep, trip, overhead and profit are editable assumptions.',
   'El material usa precio guardado de tienda. Mano de obra, preparación, viaje, gastos y ganancia son supuestos editables.');
 // Make sure original editor reflects the generated total without requiring new questions.
 recalculate();
 return true;
}
const previousSuggested=suggestedItems;
suggestedItems=function(){
 if(!active)return previousSuggested.apply(this,arguments);
 // Reset state in older extensions, then replace the generic single-room output.
 previousSuggested.apply(this,arguments);
 prepareQuickEstimate();
};
const prevNext1=$('next1').onclick;
$('next1').onclick=function(){
 prevNext1.apply(this,arguments);
 // One continue button after speaking goes directly to a REVIEWABLE estimate.
 if(active&&step===2)$('next2').click();
};
// Remember labor input only when user actually edits the row; not the initial guess.
$('estimateRows').addEventListener('input',ev=>{
 if(!lastEstimate||!active)return;
 const inp=ev.target;
 if(inp?.getAttribute('aria-label')!=='rate 3')return;
 const n=Number(inp.value);
 if(Number.isFinite(n)&&n>0)storePaintLabor(n);
});
})();
