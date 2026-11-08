import type {EstimateLine} from './estimate';

/**
 * Independently maintained estimator reference — NOT Gordian CTC data.
 * California EDD occupation profile (electricians, Los Angeles-Long Beach-Glendale,
 * Q1 2026): mean employee hourly wage $40.57.
 * https://labormarketinfo.edd.ca.gov/cgi/databrowsing/occExplorerQSDetails.asp?geogArea=0604000037&menuchoice=&soccode=472111++++
 * Employee wages are NOT labor burden, subcontractor cost or retail billing rates.
 */
export const LA_ELECTRICIAN_MEAN_WAGE_Q1_2026=40.57;
export const LA_WAGE_SOURCE='California EDD, LA electrician mean hourly wage, Q1 2026';
export type PricingInput={hoursPerUnit:number;materialsPerUnit:number;equipmentPerUnit:number;laborBurdenMultiplier:number;hourlyWage:number;};
export type PricingReference={taskId:string;recommendedHours:number|null;explanation:string;source:string;};
export type PricingBreakdown={laborPerUnit:number;materialsPerUnit:number;equipmentPerUnit:number;rate:number;extended:number};

/** Hours vary wildly by site: never invent a guaranteed time for a 200A upgrade. */
export const ELECTRICAL_REFERENCES:Record<string,PricingReference>={
 'local-panel-upgrade':{taskId:'local-panel-upgrade',recommendedHours:null,explanation:'Confirm panel type, utility disconnect, service conductor and grounding before setting crew hours.',source:'Contractor-entered production hours'},
 'local-existing-circuits':{taskId:'local-existing-circuits',recommendedHours:null,explanation:'Use hands-on labor hours per circuit, not total job hours. Verify if wiring is reused.',source:'Contractor-entered production hours'},
 'local-future-breaker':{taskId:'local-future-breaker',recommendedHours:null,explanation:'Breaker only. Excludes feeder wiring, connection and energization of future circuit.',source:'Contractor-entered production hours'},
 'local-permit':{taskId:'local-permit',recommendedHours:0,explanation:'Permit fee comes from job notes or local permitting authority, not employee wage.',source:'Contractor / local jurisdiction'},
 'local-recessed-light':{taskId:'local-recessed-light',recommendedHours:null,explanation:'Ceiling access, circuit extension, fixture specification and patching may change hours.',source:'Contractor-entered production hours'},
 'local-dimmer':{taskId:'local-dimmer',recommendedHours:null,explanation:'Confirm device compatibility, box wiring and permitting requirements.',source:'Contractor-entered production hours'},
 'local-gfci':{taskId:'local-gfci',recommendedHours:null,explanation:'Confirm line/load condition, grounding and circuit protection.',source:'Contractor-entered production hours'}
};
export function calculateUnitRate(input:PricingInput):PricingBreakdown{
 const values=[input.hoursPerUnit,input.materialsPerUnit,input.equipmentPerUnit,input.laborBurdenMultiplier,input.hourlyWage];
 if(values.some(v=>!Number.isFinite(v)||v<0)||input.laborBurdenMultiplier<1)throw new Error('Enter nonnegative costs and labor burden multiplier of at least 1.');
 const laborPerUnit=input.hoursPerUnit*input.hourlyWage*input.laborBurdenMultiplier;
 const rate=Math.round((laborPerUnit+input.materialsPerUnit+input.equipmentPerUnit)*100)/100;
 return {laborPerUnit,materialsPerUnit:input.materialsPerUnit,equipmentPerUnit:input.equipmentPerUnit,rate,extended:rate};
}
export function explainLine(line:EstimateLine):string{
 const reference=ELECTRICAL_REFERENCES[line.id];
 return reference?reference.explanation:'Enter verified unit costs and hours; no licensed third-party catalog prices are included.';
}
