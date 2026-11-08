import type {CleaningDetails,EstimateLine,Project} from './estimate';
export const POST_CONSTRUCTION_TASKS=[
 {id:'dust',en:'Fine construction dust removal (HEPA vacuum where appropriate)',es:'Retiro de polvo fino de construcción (aspiradora HEPA cuando corresponda)'},
 {id:'cabinets',en:'Clean inside and outside cabinets and drawers',es:'Limpiar interiores y exteriores de gabinetes y gavetas'},
 {id:'trim',en:'Detail baseboards, doors, frames and accessible ledges',es:'Limpiar zócalos, puertas, marcos y repisas accesibles'},
 {id:'glass',en:'Clean interior windows, tracks and sills',es:'Limpiar vidrios interiores, rieles y alféizares'},
 {id:'fixtures',en:'Detail fixtures, vents and reachable light covers',es:'Detallar accesorios, rejillas y lámparas accesibles'},
 {id:'floors',en:'Vacuum and wet-clean appropriate finished floors',es:'Aspirar y limpiar pisos terminados según el material'},
 {id:'residue',en:'Remove accessible paint and adhesive residue where surface-safe',es:'Retirar residuos accesibles de pintura y adhesivo cuando sea seguro'},
 {id:'touchup',en:'Final touch-up and walkthrough',es:'Retoques finales y revisión del trabajo'}
] as const;
export const DEFAULT_POST_CONSTRUCTION_TASKS=['dust','cabinets','trim','glass','fixtures','floors','touchup'];
export function recommendedPostConstructionWorkerHours(c:CleaningDetails):number{
 if(c.type!=='post_construction'||!c.areaSqFt)return 0;
 const sqftPerWorkerHour=c.dustLevel==='heavy'?100:c.dustLevel==='moderate'?160:240;
 return Math.ceil(c.areaSqFt/sqftPerWorkerHour);
}
/** Input fingerprint for the most recently calculated cleaning price.
 * An old saved draft without this marker must be recalculated before sharing.
 */
export function cleaningQuoteFingerprint(c:CleaningDetails,overheadPct:number,profitPct:number):string{
 const {repeatPricePerVisit,...inputs}=c;
 return JSON.stringify({inputs,overheadPct,profitPct});
}
/** Always derive customer quote from live scope and current margins.
 * Retains unrelated manual work items but re-prices the generated cleaning visit.
 */
export function currentCleaningProject(p:Project):Project{
 if(p.trade!=='cleaning'||!p.cleaning)return p;
 const priced=cleaningToProject(p.cleaning,p);
 const otherLines=p.lines.filter(x=>x.id!=='clean-initial');
 return {...p,...priced,lines:[...priced.lines,...otherLines]};
}
export function isCleaningQuoteCurrent(p:Pick<Project,'trade'|'cleaning'|'cleaningQuoteSignature'|'overheadPct'|'profitPct'>):boolean{
 if(p.trade!=='cleaning')return true;
 if(!p.cleaning||!p.cleaningQuoteSignature)return false;
 return p.cleaningQuoteSignature===cleaningQuoteFingerprint(p.cleaning,p.overheadPct,p.profitPct);
}
export type CleaningQuote={initialPrice:number;recurringPrice:number;initialBase:number;recurringBase:number;lines:EstimateLine[];unknowns:string[]};
const round=(n:number)=>Math.round(n*100)/100;
const line=(en:string,es:string,rate:number):EstimateLine=>({id:'clean-initial',description_en:en,description_es:es,quantity:1,unit:'visit',rate,status:'allowance_to_confirm'});
export function priceCleaning(c:CleaningDetails,overheadPct:number,profitPct:number):CleaningQuote{
 const nums=[c.bedrooms,c.bathrooms,c.livingRooms,c.areaSqFt,c.workers,c.firstHoursPerWorker,c.repeatHoursPerWorker,c.laborCostPerHour,c.firstSupplies,c.repeatSupplies,c.travelPerVisit,overheadPct,profitPct];
 if(nums.some(n=>!Number.isFinite(n)||n<0)||c.workers<1||c.firstHoursPerWorker<=0)throw new Error('Check crew size, hours, and cost values.');
 // For construction cleans, area and dust change the actual priced worker-hours, not merely a warning.
 // The user can deliberately use fewer hours only after confirming their own site-assessed hours.
 const suggested=recommendedPostConstructionWorkerHours(c);
 const entered=c.workers*c.firstHoursPerWorker;
 const workerHours=c.type==='post_construction'&&!(c.laborHoursConfirmed&&c.laborHoursVerificationVersion===2)?Math.max(entered,suggested):entered;
 const initialBase=round(workerHours*c.laborCostPerHour+c.firstSupplies+c.travelPerVisit);
 const recurringBase=round(c.workers*c.repeatHoursPerWorker*c.laborCostPerHour+c.repeatSupplies+c.travelPerVisit);
 const factor=(1+overheadPct/100)*(1+profitPct/100);
 const initialPrice=round(initialBase*factor);
 const recurringPrice=round(recurringBase*factor);
 const typeEn={residential:'home',office:'office',post_construction:'post-construction',specialty:'specialty'}[c.type];
 const typeEs={residential:'vivienda',office:'oficina',post_construction:'post-construcción',specialty:'especializada'}[c.type];
 const scope=(c.postConstructionTasks||DEFAULT_POST_CONSTRUCTION_TASKS).map(id=>POST_CONSTRUCTION_TASKS.find(t=>t.id===id)).filter((t):t is typeof POST_CONSTRUCTION_TASKS[number]=>Boolean(t));
 const scopeEn=c.type==='post_construction'?'; included: '+scope.map(t=>t.en).join('; '):'';
 const pricedHoursDetail='; '+workerHours+' total worker-hours used to price job';
 const scopeEs=c.type==='post_construction'?'; incluye: '+scope.map(t=>t.es).join('; '):'';
 const en='Initial '+(c.type==='post_construction'?'detailed post-construction':'deep')+' cleaning — '+typeEn+'; '+c.bedrooms+' bedrooms, '+c.bathrooms+' bathrooms, '+c.livingRooms+' living rooms'+(c.areaSqFt?' ('+c.areaSqFt+' sq ft)':'')+scopeEn+pricedHoursDetail;
 const es='Limpieza '+(c.type==='post_construction'?'detallada después de construcción':'profunda')+' — '+typeEs+'; '+c.bedrooms+' dormitorios, '+c.bathrooms+' baños, '+c.livingRooms+' salas'+(c.areaSqFt?' ('+c.areaSqFt+' pies²)':'')+scopeEs+'; '+workerHours+' horas-persona consideradas en el precio';
 const unknowns=['Confirm actual condition, access, supplies, equipment, scope and worker-hours before providing a binding price.'];
 if(c.type==='post_construction'){
  const recommended=recommendedPostConstructionWorkerHours(c);
  unknowns.push('Confirm construction dust severity, room-by-room tasks, surface conditions and whether rough/final/touch-up phases are required.');
  if(!c.areaSqFt)unknowns.push('ACTION REQUIRED: Enter measured or reasonably estimated square footage for post-construction scope.');
  if(recommended&&entered<recommended&&!c.laborHoursConfirmed)unknowns.push('AREA-BASED LABOR APPLIED: '+workerHours+' total worker-hours used for pricing, instead of '+entered+' entered. Review after site visit.');
  if(recommended&&entered<recommended&&c.laborHoursConfirmed&&c.laborHoursVerificationVersion===2)unknowns.push('Contractor verified '+entered+' worker-hours below area/dust planning guideline of '+recommended+'.');
 }
 if(c.frequency!=='once'&&c.repeatHoursPerWorker<=0)unknowns.push('Enter repeat-visit labor hours before quoting recurring service.');
 if(!c.areaSqFt)unknowns.push('Square footage not provided; measure or verify home size as needed.');
 return {initialPrice,recurringPrice,initialBase,recurringBase,lines:[line(en,es,initialBase)],unknowns};
}
/** Pricing: line holds direct visit cost. The existing totals() applies profile overhead and profit once. */
export function cleaningToProject(c:CleaningDetails,p:Pick<Project,'overheadPct'|'profitPct'>):{cleaning:CleaningDetails;cleaningQuoteSignature:string;lines:EstimateLine[];unknowns:string[]}{
 const q=priceCleaning(c,p.overheadPct,p.profitPct);
 return {cleaning:{...c,repeatPricePerVisit:c.frequency==='once'?undefined:q.recurringPrice},cleaningQuoteSignature:cleaningQuoteFingerprint(c,p.overheadPct,p.profitPct),lines:q.lines,unknowns:q.unknowns};
}
