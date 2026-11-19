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
/** Contractor's earlier five-device example, not an independently verified sell rate.
 * Materials $174 + labor $645 = $819 illustrative base allocation.
 * Splitting that between standard and GFCI devices is only a planning assumption.
 */
export const OUTLET_EXAMPLE_SOURCE='Illustrative outlet-device replacement example — contractor sample, not verified';
export function suggestPreliminaryPrices(trade:Trade,lines:EstimateLine[],description=''):PricingDraft{
 if(trade!=='electrical')return {lines,notes:[],suggested:0};
 // Only the specific example of replacing 3+2 devices with existing wiring.
 // Never extrapolate this reference to new circuits, mixed scopes or other counts.
 const outletExample=/\b(?:replace|replacing|reemplazar|cambiar)\b/i.test(description)
  && /\b(?:existing wiring|wiring already exists|already wired|cableado existente|cables existentes)\b/i.test(description)
  && !/\b(?:new wiring|new circuit|new circuits|rewire|additional wiring|cableado nuevo|circuito nuevo|circuitos nuevos)\b/i.test(description)
  && lines.length===2
  && lines.some(x=>x.id==='local-outlets-standard'&&x.quantity===3)
  && lines.some(x=>x.id==='local-outlets-gfci'&&x.quantity===2);
 // Device assumptions apply only to explicitly existing-wiring replacement work.
 // Never present them as live material data or approved contractor rates.
 const existingWiring=/\b(?:existing wiring|wiring (?:is )?already (?:in place|exists|there)|wiring ready exists|already wired|cableado existente|cableado ya existe|cables existentes)\b/i.test(description);
 const newWiring=/\b(?:new wiring|new circuits?|rewire|run (?:new )?wiring|cableado nuevo|circuitos? nuevos?)\b/i.test(description);
 const replacement=/\b(?:replace|replacing|replacement|change|changing|cambiar|cambiando|reemplazar|reemplazando)\b/i.test(description);
 const deviceAllowance=existingWiring&&!newWiring&&replacement;
 const deviceIds=['local-standard-outlets','local-gfci','local-standard-switches'];
 let suggested=0;
 const notes:string[]=[];
 const result=lines.map(item=>{
  if(item.rate>0)return item; // stated permit and human edits always win
  const is200=/\b200\s*a\b/i.test(item.description_en);
  let rate=0;
  if(outletExample&&item.id==='local-outlets-standard')rate=140;
  if(outletExample&&item.id==='local-outlets-gfci')rate=199.5;
  if(deviceAllowance&&item.id==='local-standard-outlets'&&item.quantity>0)rate=95;
  if(deviceAllowance&&item.id==='local-gfci'&&item.quantity>0)rate=145;
  if(deviceAllowance&&item.id==='local-standard-switches'&&item.quantity>0)rate=105;
  if(item.id==='local-panel-upgrade'&&is200)rate=2100;
  if(item.id==='local-existing-circuits'&&item.quantity>0&&item.quantity<=60)rate=35;
  if(item.id==='local-future-breaker'&&/\b100\s*a\b/i.test(item.description_en))rate=220;
  if(rate<=0)return item;
  suggested++;
  const device=deviceAllowance&&deviceIds.includes(item.id);
  return {...item,rate,
    rateSource:device?'Illustrative existing-wiring device allowance — requires contractor review':outletExample?OUTLET_EXAMPLE_SOURCE:LA_PANEL_REFERENCE_2026,
    status:'allowance_to_confirm' as const,
    priceEvidence:device?{kind:'planning_allowance' as const,detail:'Unverified per-device labor and ordinary materials planning assumption; no live supplier quote'}:
      outletExample?{kind:'planning_allowance' as const,detail:'Historical contractor example only; no supplier unit price verified'}:item.priceEvidence};
 });
 if(suggested&&outletExample){
  notes.push('PRELIMINARY contractor example: 3 standard x $140 + 2 GFCI x $199.50 = $819 before overhead/profit. The split is illustrative, NOT approved or live verified. Contractor review is required before sharing.');
 }
 if(deviceAllowance&&result.some(x=>deviceIds.includes(x.id)&&x.rate>0)){
  notes.push('PRELIMINARY device replacement allowances, existing wiring: regular outlet $95 each; GFCI $145 each; ordinary wall switch $105 each. These are editable UNVERIFIED assumptions including expected labor/materials, not actual supplier prices, bids or automatically approved selling rates.');
 }
 if(suggested&&!outletExample&&!result.some(x=>deviceIds.includes(x.id)&&x.rate>0)){
  notes.push('PRELIMINARY LA 2026 planning allowances (not live quotes). Panel $2,100/job, existing circuit transfers $35/each, and 100A breaker-only $220 if mentioned. Includes assumed labor/material allocations; review breaker type, utility requirements, panel location and service entry. Rates are editable and are NOT verified direct costs.');
  notes.push('The publicly cited market ranges describe complete panel upgrades; the itemized rates are modeling assumptions to avoid a permit-only $660 quote. Review total against actual site and subcontractor pricing.');
 }
 return {lines:result,notes,suggested};
}
