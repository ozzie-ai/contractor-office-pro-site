import type {EstimateLine,Trade} from './estimate';

/**
 * 2026 Los Angeles MARKET-ANCHORED PLANNING ASSUMPTIONS, not live price
 * quotations, subcontractor bids, or verified job-specific direct costs.
 *
 * Published local 100A->200A installed examples commonly span ~$2,500-$4,500+
 * for standard work; material complications can make this much higher:
 * https://www.ceonelectric.com/panel-upgrade-cost-los-angeles
 * https://amyelectric.com/blog/panel-upgrade-cost-los-angeles
 *
 * The component split below is an ILLUSTRATIVE cost allocation to help
 * contractors obtain an initial reviewable estimate. It is not a claimed
 * component breakdown from these publications. Avoid double-counting:
 * panel component excludes circuit-transfer and permit components.
 */
export const LA_PANEL_REFERENCE_2026='Illustrative Los Angeles 2026 planning allocation (not a supplier quote); reference: ceonelectric.com/panel-upgrade-cost-los-angeles and amyelectric.com/blog/panel-upgrade-cost-los-angeles';
export type PricingDraft={lines:EstimateLine[];notes:string[];suggested:number};
export function suggestPreliminaryPrices(trade:Trade,lines:EstimateLine[]):PricingDraft{
 if(trade!=='electrical')return {lines,notes:[],suggested:0};
 let suggested=0;
 const notes:string[]=[];
 const result=lines.map(item=>{
  if(item.rate>0)return item; // stated permit and human edits always win
  const is200=/\b200\s*a\b/i.test(item.description_en);
  let rate=0;
  if(item.id==='local-panel-upgrade'&&is200)rate=2100;
  if(item.id==='local-existing-circuits'&&item.quantity>0&&item.quantity<=60)rate=35;
  if(item.id==='local-future-breaker'&&/\b100\s*a\b/i.test(item.description_en))rate=220;
  if(rate<=0)return item;
  suggested++;
  return {...item,rate,rateSource:LA_PANEL_REFERENCE_2026,status:'allowance_to_confirm' as const};
 });
 if(suggested){
  notes.push('PRELIMINARY LA 2026 planning allowances (not live quotes). Panel $2,100/job, existing circuit transfers $35/each, and 100A breaker-only $220 if mentioned. Includes assumed labor/material allocations; review breaker type, utility requirements, panel location and service entry. Rates are editable and are NOT verified direct costs.');
  notes.push('The publicly cited market ranges describe complete panel upgrades; the itemized rates are modeling assumptions to avoid a permit-only $660 quote. Review total against actual site and subcontractor pricing.');
 }
 return {lines:result,notes,suggested};
}
