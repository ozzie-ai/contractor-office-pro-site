/* COP pricebook bridge — adapts the original estimate screen without adding a new workspace.
   Cached reference costs are NOT live retailer quotes. */
(function(){
'use strict';
const book=window.COPReferencePrices;
if(!book||typeof suggestedItems!=='function')return;
const $=id=>document.getElementById(id);
const today=()=>new Date().toISOString().slice(0,10);
const localText=(en,es)=>lang==='es'?es:en;
let currentDraft=null;
function recordRetail(index,reference){
 if(typeof window.COPRegisterRetailReference==='function')
  window.COPRegisterRetailReference(index,{retailer:reference.store,checkedOn:reference.observedOn,
   unitCost:reference.unitCost,description:estimateItems[index].description,cached:true,sourceUrl:reference.sourceUrl});
}
function fillOutletCache(){
 for(const [key,id] of [['standard','duplex-15a'],['gfci','gfci-15a']]){
  const price=book.choose(id,null,today()),input=$('cop_'+key+'_cost'),store=$('cop_'+key+'_store');
  if(!price||!input||!store)continue;
  if(input.value==='')input.value=String(price.unitCost);
  if(!store.value&&[...store.options].some(x=>x.value===price.store))store.value=price.store;
  input.dataset.referenceDate=price.observedOn;
  input.dataset.referencePrice=String(price.unitCost);
  // Editing the cached price means the contractor supplied a new observation.
  input.addEventListener('input',()=>{delete input.dataset.referenceDate},{once:true});
  store.addEventListener('change',()=>{delete input.dataset.referenceDate},{once:true});
 }
 const body=$('copCostBody');
 if(body){
  const note=document.createElement('p');note.className='help';
  note.textContent=localText('Material prices were filled automatically from retailer references dated Nov 11, 2026 — not live quotes. Confirm the outlet type and labor hours; you can adjust costs.',
   'Los materiales se calcularon con precios de referencia de tiendas del 11 de noviembre de 2026; no son precios en vivo. Confirma el tipo de tomacorriente y las horas de trabajo. Puedes ajustar los costos.');
  body.insertBefore(note,body.firstChild);
 }
}
function tradeAllowed(reference){
 if(job==='handyman'||job==='other')return selected instanceof Set && selected.has(reference.trade);
 if(job==='electrical' || job==='drywall')return job===reference.trade;
 if(job==='bathroom'||job==='kitchen'||job==='remodel')return selected instanceof Set&&selected.has(reference.trade);
 return job===reference.trade;
}
function looksLikePlaceholder(x){
 return Number(x.rate)===0 && /(?:no quantified|no hay partidas|scope not identified|alcance no identificado|work to be defined|trabajo por definir|servicio no reconocido|service not recognized|requires price|requiere precio)/i.test(x.description||'');
}
function applyCachedMaterials(){
 const result=book.fromTranscript($('description').value,{now:today()});
 const refs=result.lines.filter(x=>tradeAllowed(x)&&Number.isInteger(x.quantity)&&x.quantity>0&&x.total!==null);
 if(!refs.length)return;
 const existing=estimateItems.filter(x=>!looksLikePlaceholder(x));
 // Never add duplicate material prices on top of a composite or already-priced scope.
 const chargedMaterials=existing.filter(x=>/material|materiales|supplies|pintura|drywall\s+sheets|conductors|conductor|cable|romex/i.test(x.description||'')&&Number(x.rate)>0);
 if(chargedMaterials.length){
  const warning=localText('A cached price reference exists for '+refs.map(x=>x.en).join(', ')+'; the existing estimate already includes materials, so no second charge was added.',
   'Hay precios de referencia para '+refs.map(x=>x.es).join(', ')+'. Como el estimado ya incluye materiales, no se agregaron cargos duplicados.');
  $('estimateHint').textContent+= ' '+warning;
  return;
 }
 const keep=existing.slice();
 const newRefs=[];
 for(const ref of refs){
  if(keep.some(x=>x.copPricebookId===ref.id))continue;
  keep.push({description:(lang==='es'?ref.es:ref.en)+' — '+localText('materials','materiales'),
    quantity:ref.quantity,unit:ref.unit,rate:ref.unitCost,copPricebookId:ref.id,copCachedOn:ref.observedOn,
    copCachedStore:ref.store,copReferenceUrl:ref.sourceUrl});
  newRefs.push({index:keep.length-1,ref});
 }
 if(!newRefs.length)return;
 if(!keep.some(x=>/labor|mano de obra/i.test(x.description||''))){
  keep.push({description:localText('Labor — confirm total job hours','Mano de obra — confirmar horas del trabajo'),
   quantity:1,unit:'job',rate:0,copMissingLabor:true});
 }
 estimateItems=keep;
 initialized=true;
 renderItems();
 buildCustomerScope();
 calculateTakeoff();
 for(const {index,ref} of newRefs)recordRetail(index,ref);
 if(typeof window.COPRefreshRetailReferences==='function')window.COPRefreshRetailReferences();
 currentDraft={refIds:newRefs.map(x=>x.ref.id),questions:result.questions,stamp:today()};
 const questions=result.questions.map(x=>x.message).slice(0,2);
 $('estimateHint').textContent=localText(
  'Materials priced from the offline reference book (not live retailer prices). Complete labor cost and review quantities before quoting.',
  'Materiales calculados con precios guardados (no precios en vivo). Completa la mano de obra y revisa las cantidades antes de cotizar.'
 )+(questions.length?' '+questions.join(' • '):'');
}
const previous=suggestedItems;
suggestedItems=function(){
 currentDraft=null;
 previous.apply(this,arguments);
 if(!$('copCostPanel')?.hidden){
  fillOutletCache();
  return;
 }
 applyCachedMaterials();
};
const oldNext=$('next4').onclick;
$('next4').onclick=function(){
 if(currentDraft){
  const unpriced=estimateItems.filter(x=>x.copMissingLabor&&!(Number(x.rate)>0));
  if(unpriced.length){
   alert(localText('Confirm the total labor cost for this job before preparing the proposal.',
    'Confirma el costo total de mano de obra antes de preparar la propuesta.'));
   return;
  }
  const critical=currentDraft.questions.filter(q=>!['wire_waste','drywall_waste'].includes(q.code));
  if(critical.length){
   alert(localText('Review the unresolved material specification or quantity before preparing the proposal.',
    'Revisa la especificación o cantidad del material pendiente antes de preparar la propuesta.'));
   return;
  }
 }
 return oldNext.apply(this,arguments);
};
})();
