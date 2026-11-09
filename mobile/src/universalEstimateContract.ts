import type {EstimateLine,Trade} from './estimate';

/**
 * Frontend-only gate for Derek's PROPOSED v1 API.
 * Not wired to a server or the iPhone UI until the API is approved.
 * Fail closed: invalid / incomplete responses must never become customer quotes.
 */
export type QuantityStatus='stated'|'derived'|'unknown';
export type RateStatus='verified_reference'|'modeled_allowance'|'contractor_override'|'unavailable';
export type ScopeItem={
 id:string;description_en:string;description_es:string;
 quantity:number|null;unit:string;quantity_status:QuantityStatus;
 included_now:boolean;pricing_hint?:string;
};
export type InterpretationResponse={
 schema_version:'1.0';request_id:string;status:'needs_review'|'complete'|'incomplete';
 trade:Trade;scope_items:ScopeItem[];exclusions:string[];future_work:string[];
 questions:string[];private_notes:string[];confidence:'low'|'medium'|'high';
};
export type PriceLine={
 scope_item_id:string;quantity:number|null;unit:string;
 unit_rate:number|null;extended_amount:number|null;
 rate_status:RateStatus;
 source?:{title:string;url?:string;observed_at?:string;region?:string;assumptions?:string};
};
export type PricingResponse={
 schema_version:'1.0';request_id:string;status:'complete'|'incomplete'|'needs_review';
 lines:PriceLine[];priced_subtotal:number;direct_subtotal:number|null;
 overhead:number|null;profit:number|null;estimated_total:number|null;
 questions:string[];
};
export type SafeReview={
 accepted:boolean;readyForProposal:boolean;issues:string[];
 lines:EstimateLine[];pricedSubtotal:number;estimatedTotal:number|null;
 exclusions:string[];futureWork:string[];
};
const trades:Trade[]=['electrical','plumbing','painting','concrete','handyman','remodel','cleaning'];
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const string=(v:unknown):v is string=>typeof v==='string';
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(string);
const nonneg=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const pos=(v:unknown):v is number=>nonneg(v)&&v>0;
const quantityStatuses:QuantityStatus[]=['stated','derived','unknown'];
const rateStatuses:RateStatus[]=['verified_reference','modeled_allowance','contractor_override','unavailable'];
const validSource=(v:unknown):boolean=>v===undefined||(record(v)&&string(v.title)&&v.title.length>0&&
 (v.url===undefined||string(v.url))&&(v.observed_at===undefined||string(v.observed_at))&&
 (v.region===undefined||string(v.region))&&(v.assumptions===undefined||string(v.assumptions)));
export function validateInterpretation(v:unknown):v is InterpretationResponse{
 if(!record(v)||v.schema_version!=='1.0'||!string(v.request_id)||!v.request_id||
 !trades.includes(v.trade as Trade)||!['needs_review','complete','incomplete'].includes(String(v.status))||
 !Array.isArray(v.scope_items)||!strings(v.exclusions)||!strings(v.future_work)||
 !strings(v.questions)||!strings(v.private_notes)||!['low','medium','high'].includes(String(v.confidence)))return false;
 const seen=new Set<string>();
 return v.scope_items.every(item=>{
  if(!record(item)||!string(item.id)||!item.id||seen.has(item.id)||!string(item.description_en)||
   !item.description_en.trim()||!string(item.description_es)||!item.description_es.trim()||
   !string(item.unit)||!item.unit.trim()||!quantityStatuses.includes(item.quantity_status as QuantityStatus)||
   typeof item.included_now!=='boolean'||(item.pricing_hint!==undefined&&!string(item.pricing_hint)))return false;
  if(item.quantity_status==='unknown'&&item.quantity!==null)return false;
  if(item.quantity_status!=='unknown'&&!pos(item.quantity))return false;
  seen.add(item.id);return true;
 });
}
export function validatePricing(v:unknown):v is PricingResponse{
 if(!record(v)||v.schema_version!=='1.0'||!string(v.request_id)||!v.request_id||
 !['complete','incomplete','needs_review'].includes(String(v.status))||!Array.isArray(v.lines)||
 !strings(v.questions)||!nonneg(v.priced_subtotal))return false;
 const nullable=(n:unknown)=>n===null||nonneg(n);
 if(!nullable(v.direct_subtotal)||!nullable(v.overhead)||!nullable(v.profit)||!nullable(v.estimated_total))return false;
 const seen=new Set<string>();
 return v.lines.every(item=>{
  if(!record(item)||!string(item.scope_item_id)||!item.scope_item_id||seen.has(item.scope_item_id)||
   !string(item.unit)||!item.unit||!rateStatuses.includes(item.rate_status as RateStatus)||
   !(item.quantity===null||pos(item.quantity))||!(item.unit_rate===null||pos(item.unit_rate))||
   !(item.extended_amount===null||nonneg(item.extended_amount))||!validSource(item.source))return false;
  seen.add(item.scope_item_id);return true;
 });
}
/**
 * A complete PDF requires one priced line for every included scope item,
 * no unexplained extra lines, no unanswered questions, consistent totals,
 * and contractor review. The private transcript is intentionally NEVER
 * included in SafeReview or EstimateLine.
 */
export function reviewUniversalEstimate(
 rawInterpretation:unknown,
 rawPricing:unknown,
 contractorOverrides:Readonly<Record<string,number>>={},
 contractorApproved=false
):SafeReview{
 const issues:string[]=[];
 const empty=():SafeReview=>({accepted:false,readyForProposal:false,issues,lines:[],pricedSubtotal:0,estimatedTotal:null,exclusions:[],futureWork:[]});
 if(!validateInterpretation(rawInterpretation)){issues.push('Invalid or unsafe interpretation response.');return empty();}
 if(!validatePricing(rawPricing)){issues.push('Invalid or unsafe pricing response.');return empty();}
 const scope=rawInterpretation,price=rawPricing;
 if(scope.request_id!==price.request_id)issues.push('Response IDs do not match.');
 const expected=scope.scope_items.filter(x=>x.included_now);
 const priceMap=new Map(price.lines.map(x=>[x.scope_item_id,x]));
 if(priceMap.size!==price.lines.length)issues.push('Duplicate price lines.');
 if(price.lines.some(x=>!expected.some(s=>s.id===x.scope_item_id)))issues.push('Unknown or excluded work item priced.');
 if(scope.questions.length||price.questions.length)issues.push('Unanswered job or pricing questions.');
 if(scope.status!=='complete'||price.status!=='complete')issues.push('AI response still needs review.');
 const lines:EstimateLine[]=[];
 for(const item of expected){
  const p=priceMap.get(item.id);
  if(!p){issues.push('Missing price for '+item.id);continue;}
  if(item.quantity_status==='unknown'||!pos(item.quantity)){issues.push('Unknown quantity for '+item.id);continue;}
  if(p.quantity!==item.quantity||p.unit!==item.unit)issues.push('Quantity or unit mismatch for '+item.id);
  const override=contractorOverrides[item.id];
  const rate=override!==undefined?override:p.unit_rate;
  if(!pos(rate)){issues.push('Missing unit price for '+item.id);continue;}
  if(override!==undefined&&!pos(override)){issues.push('Invalid contractor rate for '+item.id);continue;}
  if(override===undefined&&p.rate_status==='unavailable')issues.push('Unpriced work marked available: '+item.id);
  if(override===undefined&&p.rate_status==='verified_reference'&&(!p.source?.title||!p.source.observed_at||!p.source.region))issues.push('Unsubstantiated verified price for '+item.id);
  if(override===undefined&&p.rate_status==='modeled_allowance'&&!p.source?.assumptions)issues.push('Missing model assumptions for '+item.id);
  if(override===undefined&&p.extended_amount!==null&&Math.abs(p.extended_amount-rate*item.quantity)>0.02)issues.push('Incorrect line total for '+item.id);
  lines.push({id:item.id,description_en:item.description_en,description_es:item.description_es,
   quantity:item.quantity,unit:item.unit,rate,status:p.rate_status==='verified_reference'?'included_now':'allowance_to_confirm',
   rateSource:override!==undefined?'Contractor override':p.source?.title||p.rate_status});
 }
 const pricedSubtotal=lines.reduce((sum,x)=>sum+x.quantity*x.rate,0);
 if(Object.keys(contractorOverrides).some(id=>!expected.some(x=>x.id===id)))issues.push('Override for unknown work item.');
 const overridesApplied=Object.keys(contractorOverrides).length>0;
 if(!overridesApplied&&Math.abs(pricedSubtotal-price.priced_subtotal)>0.02)issues.push('Server subtotal does not reconcile.');
 if(!overridesApplied&&price.estimated_total!==null&&price.direct_subtotal!==null&&price.overhead!==null&&price.profit!==null&&
 Math.abs(price.estimated_total-(price.direct_subtotal+price.overhead+price.profit))>0.02)issues.push('Server total does not reconcile.');
 if(!overridesApplied&&price.status==='complete'&&price.estimated_total===null)issues.push('No complete estimate total.');
 if(overridesApplied)issues.push('Recalculate overhead and profit after contractor edits before final export.');
 if(!contractorApproved)issues.push('Contractor approval required.');
 return {accepted:true,readyForProposal:issues.length===0,issues,lines,pricedSubtotal,
  estimatedTotal:issues.length===0?price.estimated_total:null,
  exclusions:[...scope.exclusions],futureWork:[...scope.future_work]};
}
