export type Trade='electrical'|'plumbing'|'painting'|'concrete'|'handyman'|'remodel'|'cleaning';
export type Language='en'|'es';
export type CleaningType='residential'|'office'|'post_construction'|'specialty';
export type CleaningFrequency='once'|'weekly'|'biweekly'|'twice_monthly'|'monthly';
export type CleaningDetails={type:CleaningType;frequency:CleaningFrequency;dustLevel?:'light'|'moderate'|'heavy';laborHoursConfirmed?:boolean;laborHoursVerificationVersion?:2;postConstructionTasks?:string[];bedrooms:number;bathrooms:number;livingRooms:number;areaSqFt:number;workers:number;firstHoursPerWorker:number;repeatHoursPerWorker:number;laborCostPerHour:number;firstSupplies:number;repeatSupplies:number;travelPerVisit:number;repeatPricePerVisit?:number};
export type JobStatus='draft'|'sent'|'accepted'|'declined'|'in_progress'|'completed';
export const JOB_STATUSES:Record<JobStatus,{en:string;es:string}>={draft:{en:'Draft',es:'Borrador'},sent:{en:'Proposal sent',es:'Propuesta enviada'},accepted:{en:'Accepted',es:'Aceptada'},declined:{en:'Declined',es:'Rechazada'},in_progress:{en:'Work in progress',es:'Trabajo en proceso'},completed:{en:'Completed',es:'Terminado'}};
export type EstimateLine={
 id:string;description_en:string;description_es:string;
 quantity:number;unit:string;rate:number;status:'included_now'|'allowance_to_confirm';
 priceEvidence?:{kind:'cached_retail_reference'|'planning_allowance'|'contractor_entered';merchant?:string;observedOn?:string;referenceUrl?:string;detail?:string};
 costHoursPerUnit?:number;costMaterialsPerUnit?:number;costEquipmentPerUnit?:number;costHourlyWage?:number;costLaborBurdenMultiplier?:number;rateSource?:string;
};
export type Interpretation={
 trade?:string;project_summary_en?:string;project_summary_es?:string;
 tasks?:Array<{category:string;description_en:string;description_es:string;quantity:number|null;unit:string|null;specifications?:string[];status?:'included_now'|'allowance_to_confirm'}>;
 excluded_work?:string[];future_work?:string[];unknown_details?:string[];
};
export type Project={
 trade:Trade;contractor:string;customer:string;city:string;description:string;
 lines:EstimateLine[];exclusions:string[];futureWork:string[];unknowns:string[];
 customerNotes:string;language:Language;overheadPct:number;profitPct:number;
 paintingMeasurements?:{livingLengthFt?:number;livingWidthFt?:number;excludeLivingRoom?:boolean};
 status?:JobStatus;followUpDate?:string;followUpNotes?:string;lastProposalPreparedAt?:string;
 address?:string;cleaning?:CleaningDetails;cleaningQuoteSignature?:string;
 propertyArea?:{squareFootage:number;source:string;matchedAddress:string;lookedUpAddress:string;retrievedAt:string};
};
export const TRADES:Record<Trade,{en:string;es:string}>={
 electrical:{en:'Electrical',es:'Electricidad'},
 plumbing:{en:'Plumbing',es:'Plomería'},
 painting:{en:'Painting',es:'Pintura'},
 concrete:{en:'Concrete',es:'Concreto'},
 handyman:{en:'Handyman',es:'Trabajos varios'},
 remodel:{en:'Remodeling',es:'Remodelación'},
 cleaning:{en:'Cleaning Services',es:'Servicios de limpieza'},
};
export const money=(n:number)=>'$'+(Number.isFinite(n)?n:0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function recurringCleaningPrice(p:Pick<Project,'cleaning'|'overheadPct'|'profitPct'>):number{
 const c=p.cleaning;
 if(!c||c.frequency==='once'||c.workers<=0||c.repeatHoursPerWorker<=0)return 0;
 const base=c.workers*c.repeatHoursPerWorker*c.laborCostPerHour+c.repeatSupplies+c.travelPerVisit;
 return Math.round(base*(1+Math.max(0,p.overheadPct)/100)*(1+Math.max(0,p.profitPct)/100)*100)/100;
}
export function totals(p:Pick<Project,'lines'|'overheadPct'|'profitPct'>){
 const subtotal=p.lines.reduce((sum,x)=>sum+Math.max(0,x.quantity||0)*Math.max(0,x.rate||0),0);
 const overhead=subtotal*Math.max(0,p.overheadPct||0)/100;
 const profit=(subtotal+overhead)*Math.max(0,p.profitPct||0)/100;
 return {subtotal,overhead,profit,total:subtotal+overhead+profit};
}
/** Block customer PDF export when an included line has no priced quantity.
 * This prevents a $0 shower-wall-tile line from silently understating the total.
 * Preliminary rates still require contractor review.
 */
export function estimateReadiness(p:Pick<Project,'lines'>):{ready:boolean;issues:string[]}{
 const issues:string[]=[];
 if(!p.lines.length)issues.push('No work items have been added.');
 for(const x of p.lines){
  const name=x.description_en.trim()||x.description_es.trim()||'Untitled item';
  if(!Number.isFinite(x.quantity)||x.quantity<=0)issues.push(name+': enter a measured quantity.');
  if(!Number.isFinite(x.rate)||x.rate<=0)issues.push(name+': enter a positive rate.');
  if(!x.description_en.trim()||!x.description_es.trim())issues.push(name+': complete both customer descriptions.');
 }
 return {ready:issues.length===0,issues};
}
export function mapInterpretation(result:Interpretation):Pick<Project,'lines'|'exclusions'|'futureWork'|'unknowns'>{
 return {
  lines:(result.tasks||[]).map((task,i)=>({
   id:'ai-'+i,description_en:task.description_en||'Work item to review',
   description_es:task.description_es||'Trabajo por revisar',
   quantity:typeof task.quantity==='number'&&task.quantity>0?task.quantity:0,
   unit:task.unit||'job',rate:0,status:task.status==='allowance_to_confirm'?'allowance_to_confirm' as const:'included_now' as const
  })),
  exclusions:[...(result.excluded_work||[])],
  futureWork:[...(result.future_work||[])],
  unknowns:[...(result.unknown_details||[])],
 };
}
const esc=(s:string)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
export function proposalHtml(p:Project,mode:'estimate'|'proposal'='estimate'){
 const es=p.language==='es',tr=es?{
  title:mode==='proposal'?'PROPUESTA DE TRABAJO':'ESTIMADO DE TRABAJO',contractor:'Contratista',customer:'Cliente',location:'Ciudad',work:'Trabajo incluido',
  qty:'Cantidad',unit:'Unidad',rate:'Tarifa',amount:'Importe',excluded:'No incluido',future:'Trabajo futuro — no incluido',
  subtotal:'Subtotal',overhead:'Gastos generales',profit:'Utilidad',total:'Precio estimado',signature:'Firma del cliente',
  date:'Fecha',draft:'BORRADOR — El contratista debe confirmar precios y cantidades.',
  notice:'Este estimado resume el trabajo y precio propuesto. Confirmar los detalles antes de comenzar.'
 }:{
  title:mode==='proposal'?'WORK PROPOSAL':'WORK ESTIMATE',contractor:'Contractor',customer:'Customer',location:'City',work:'Included work',
  qty:'Qty',unit:'Unit',rate:'Rate',amount:'Amount',excluded:'Not included',future:'Future work — excluded',
  subtotal:'Subtotal',overhead:'Overhead',profit:'Profit',total:'Estimated price',signature:'Customer signature',
  date:'Date',draft:'DRAFT — Contractor must confirm pricing and quantities.',
  notice:'This estimate summarizes the proposed work and pricing. Confirm details before starting.'
 };
 const sum=totals(p);
 const cleaning=p.trade==='cleaning'?p.cleaning:undefined;
 const recurring=cleaning&&cleaning.frequency!=='once'?cleaning:undefined;
 const dustLabel=(level:NonNullable<CleaningDetails['dustLevel']>)=>({light:es?'Ligero':'Light',moderate:es?'Moderado':'Moderate',heavy:es?'Abundante':'Heavy'}[level]);
 const frequencyLabel=(value:CleaningFrequency)=>({once:es?'Una sola vez':'One-time service',weekly:es?'Semanal':'Weekly',biweekly:es?'Cada dos semanas':'Every two weeks',twice_monthly:es?'Dos veces al mes':'Twice monthly',monthly:es?'Mensual':'Monthly'}[value]);
 const incomplete=p.lines.length===0||p.lines.some(x=>!x.description_en||!x.description_es||x.quantity<=0||x.rate<=0)||p.unknowns.length>0;
 const list=(title:string,items:string[])=>items.length?'<h3>'+esc(title)+'</h3><ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'';
 const isCleaning=p.trade==='cleaning';
 // Cleaning is quoted as one bundled service, even when the owner adds extra tasks.
 // Never repeat the grand total on each line, and never disclose internal cost categories.
 const rows=isCleaning
  ?'<tr><td>'+p.lines.map(x=>esc(es?x.description_es:x.description_en)).join('<p style="margin:7px 0 0">')+'</td><td>1</td><td>'+(es?'servicio':'service')+'</td><td>'+esc(money(sum.total))+'</td></tr>'
  :p.lines.map(x=>'<tr><td>'+esc(es?x.description_es:x.description_en)+'</td><td>'+esc(String(x.quantity))+'</td><td>'+esc(x.unit)+'</td><td>'+esc(money(x.rate))+'</td><td>'+esc(money(x.quantity*x.rate))+'</td></tr>').join('');
 const line=(label:string,value:string)=>'<div class="total"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>';
 return '<!doctype html><html lang="'+p.language+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+
 'body{font-family:Arial,sans-serif;color:#173b42;padding:20px 24px;line-height:1.35}h1{font-size:24px;border-bottom:3px solid #177b6c;padding-bottom:10px}h3{margin-top:24px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:9px 5px;border-bottom:1px solid #d6dede;text-align:left}.total{display:flex;justify-content:space-between;margin-top:9px}.summary{break-inside:avoid;page-break-inside:avoid;margin-top:22px}.grand{font-size:21px;border-top:2px solid #173b42;padding-top:15px;margin-top:15px}.notice{font-size:12px;color:#4b6668}.sign{margin-top:18px;break-inside:avoid;page-break-inside:avoid}tr{break-inside:avoid;page-break-inside:avoid}'+
 '</style></head><body><h1>'+tr.title+'</h1>'+
 (incomplete?'<p class="notice"><b>'+tr.draft+'</b></p>':'')+
 '<p><b>'+tr.contractor+':</b> '+esc(p.contractor||'—')+'<br><b>'+tr.customer+':</b> '+esc(p.customer||'—')+'<br><b>'+(p.trade==='cleaning'?(es?'Dirección del servicio':'Service address'):tr.location)+':</b> '+esc(p.address||p.city||'—')+'</p>'+
 '<h3>'+tr.work+' — '+esc(TRADES[p.trade][p.language])+'</h3>'+
 '<table><thead><tr><th>'+tr.work+'</th><th>'+tr.qty+'</th><th>'+tr.unit+'</th>'+(isCleaning?'':'<th>'+tr.rate+'</th>')+'<th>'+tr.amount+'</th></tr></thead><tbody>'+rows+'</tbody></table>'+
 (cleaning?'<section style="break-inside:avoid;page-break-inside:avoid;margin-top:14px"><h3>'+(es?'PLAN DE LIMPIEZA':'CLEANING SERVICE PLAN')+'</h3><p>'+(es?'Tipo de servicio: ':'Service type: ')+esc(({residential:es?'Residencial':'Residential',office:es?'Oficina':'Office',post_construction:es?'Después de construcción':'Post-construction',specialty:es?'Especializada':'Specialty'} as Record<CleaningType,string>)[cleaning.type])+'<br>'+(es?'Frecuencia: ':'Frequency: ')+esc(frequencyLabel(cleaning.frequency))+(cleaning.type==='post_construction'?'<br>'+(es?'Nivel de polvo: ':'Dust level: ')+esc(dustLabel(cleaning.dustLevel||'moderate')):'')+'</p>'+(recurring?'<p><b>'+(es?'Precio por visita posterior: ':'Price per subsequent visit: ')+esc(money(recurringCleaningPrice(p)))+'</b></p><p class="notice">'+(es?'La primera limpieza profunda y cada visita posterior tienen precios separados. Confirmar alcance y calendario.':'The initial deep clean and subsequent visits are priced separately. Confirm scope and schedule.')+'</p>':'<p class="notice">'+(es?'Estimado de una sola limpieza. No incluye visitas futuras.':'One-time cleaning estimate. Future visits are not included.')+'</p>')+'</section>':'')+
 list(tr.excluded,p.exclusions)+list(tr.future,p.futureWork)+
 (p.customerNotes.trim()?'<p>'+esc(p.customerNotes.trim())+'</p>':'')+
 '<section class="summary">'+(isCleaning?'':line(tr.subtotal,money(sum.subtotal))+line(tr.overhead,money(sum.overhead))+line(tr.profit,money(sum.profit)))+'<div class="grand">'+line(tr.total,money(sum.total))+'</div></section>'+
 '<div style="break-inside:avoid;page-break-inside:avoid"><p class="notice">'+tr.notice+'</p><div class="sign">'+tr.signature+': ______________________________ &nbsp; '+tr.date+': ______________</div></div></body></html>';
}
