import type {CleaningDetails,EstimateLine,Project} from './estimate';
export type CleaningQuote={initialPrice:number;recurringPrice:number;initialBase:number;recurringBase:number;lines:EstimateLine[];unknowns:string[]};
const round=(n:number)=>Math.round(n*100)/100;
const line=(en:string,es:string,rate:number):EstimateLine=>({id:'clean-initial',description_en:en,description_es:es,quantity:1,unit:'visit',rate,status:'allowance_to_confirm'});
export function priceCleaning(c:CleaningDetails,overheadPct:number,profitPct:number):CleaningQuote{
 const nums=[c.bedrooms,c.bathrooms,c.livingRooms,c.areaSqFt,c.workers,c.firstHoursPerWorker,c.repeatHoursPerWorker,c.laborCostPerHour,c.firstSupplies,c.repeatSupplies,c.travelPerVisit,overheadPct,profitPct];
 if(nums.some(n=>!Number.isFinite(n)||n<0)||c.workers<1||c.firstHoursPerWorker<=0)throw new Error('Check crew size, hours, and cost values.');
 const initialBase=round(c.workers*c.firstHoursPerWorker*c.laborCostPerHour+c.firstSupplies+c.travelPerVisit);
 const recurringBase=round(c.workers*c.repeatHoursPerWorker*c.laborCostPerHour+c.repeatSupplies+c.travelPerVisit);
 const factor=(1+overheadPct/100)*(1+profitPct/100);
 const initialPrice=round(initialBase*factor);
 const recurringPrice=round(recurringBase*factor);
 const typeEn={residential:'home',office:'office',post_construction:'post-construction',specialty:'specialty'}[c.type];
 const typeEs={residential:'vivienda',office:'oficina',post_construction:'post-construcción',specialty:'especializada'}[c.type];
 const en='Initial deep cleaning — '+typeEn+'; '+c.bedrooms+' bedrooms, '+c.bathrooms+' bathrooms, '+c.livingRooms+' living rooms'+(c.areaSqFt?' ('+c.areaSqFt+' sq ft)':'')+'; '+c.workers+' worker(s) × '+c.firstHoursPerWorker+' hours; labor, supplies and travel included';
 const es='Limpieza profunda inicial — '+typeEs+'; '+c.bedrooms+' dormitorios, '+c.bathrooms+' baños, '+c.livingRooms+' salas'+(c.areaSqFt?' ('+c.areaSqFt+' pies²)':'')+'; '+c.workers+' persona(s) × '+c.firstHoursPerWorker+' horas; incluye mano de obra, productos y traslado';
 const unknowns=['Confirm actual condition, access, supplies, equipment, scope and worker-hours before providing a binding price.'];
 if(c.type==='post_construction')unknowns.push('Confirm dust, debris, glass, paint residue, floors and final walkthrough separately.');
 if(c.frequency!=='once'&&c.repeatHoursPerWorker<=0)unknowns.push('Enter repeat-visit labor hours before quoting recurring service.');
 if(!c.areaSqFt)unknowns.push('Square footage not provided; measure or verify home size as needed.');
 return {initialPrice,recurringPrice,initialBase,recurringBase,lines:[line(en,es,initialBase)],unknowns};
}
/** Pricing: line holds direct visit cost. The existing totals() applies profile overhead and profit once. */
export function cleaningToProject(c:CleaningDetails,p:Pick<Project,'overheadPct'|'profitPct'>):{cleaning:CleaningDetails;lines:EstimateLine[];unknowns:string[]}{
 const q=priceCleaning(c,p.overheadPct,p.profitPct);
 return {cleaning:{...c,repeatPricePerVisit:c.frequency==='once'?undefined:q.recurringPrice},lines:q.lines,unknowns:q.unknowns};
}
