import type {Trade} from './estimate';
import type {InterpretationResponse,PricingResponse,ScopeItem,PriceLine} from './universalEstimateContract';

export type DemoCase={id:string;en:string;es:string;interpretation:InterpretationResponse;pricing:PricingResponse};
const model='Simulated prototype allocation, NOT a live supplier quote. Review permit, service entrance, materials and utility requirements.';
const makeItem=(id:string,en:string,es:string,quantity:number|null,unit:string):ScopeItem=>({
 id,description_en:en,description_es:es,quantity,unit,quantity_status:quantity===null?'unknown':'stated',included_now:true
});
const price=(id:string,quantity:number|null,unit:string,rate:number|null):PriceLine=>({
 scope_item_id:id,quantity,unit,unit_rate:rate,extended_amount:quantity!==null&&rate!==null?quantity*rate:null,
 rate_status:rate===null?'unavailable':'modeled_allowance',
 ...(rate===null?{}:{source:{title:'DEMO · simulated 2026 Los Angeles planning allowance',region:'US-CA-LA',assumptions:model}})
});
const make=(id:string,en:string,es:string,trade:Trade,items:ScopeItem[],prices:PriceLine[],exclusions:string[]=[],future_work:string[]=[],questions:string[]=[]):DemoCase=>{
 const subtotal=prices.reduce((acc,p)=>acc+(p.extended_amount??0),0);
 const complete=items.length===prices.length&&items.every(item=>item.quantity!==null&&prices.some(p=>p.scope_item_id===item.id&&p.unit_rate!==null))&&questions.length===0;
 const overhead=subtotal*0.1,profit=(subtotal+overhead)*0.2;
 return {
  id,en,es,
  interpretation:{schema_version:'1.0',request_id:id,status:complete?'complete':'needs_review',trade,
   scope_items:items,exclusions,future_work,questions,private_notes:['DEMO ONLY: private contractor transcription must not be shown to customers.'],confidence:'medium'},
  pricing:{schema_version:'1.0',request_id:id,status:complete?'complete':'incomplete',lines:prices,
   priced_subtotal:subtotal,direct_subtotal:complete?subtotal:null,overhead:complete?overhead:null,
   profit:complete?profit:null,estimated_total:complete?subtotal+overhead+profit:null,
   questions}
 };
};
export const DEMO_UNIVERSAL_CASES:DemoCase[]=[
 make('demo-panel','Electrical panel','Panel eléctrico','electrical',[
  makeItem('panel','Upgrade existing electrical panel 100A to 200A','Actualizar panel de 100A a 200A',1,'job'),
  makeItem('circuits','Reconnect 20 existing circuits','Reconectar 20 circuitos existentes',20,'each'),
  makeItem('breaker','Install one 100A breaker only; exclude future wiring','Instalar solo breaker de 100A; sin cableado futuro',1,'each'),
  makeItem('permit','Electrical permit allowance','Permiso eléctrico',1,'job')
 ],[price('panel',1,'job',2100),price('circuits',20,'each',35),price('breaker',1,'each',220),price('permit',1,'job',500)],
 ['Future 100A feeder wiring and final connections excluded'],['Future wiring under a separate job']),
 make('demo-remodel','Bathroom remodel','Remodelación de baño','remodel',[
  makeItem('shower','Replace tub with 3 × 5 ft shower','Cambiar tina por regadera de 3 × 5 pies',1,'job'),
  makeItem('floor','Tile bathroom floor — 35 sq ft','Colocar losa de piso — 35 pies²',35,'sq_ft'),
  makeItem('walls','Waterproof and tile three shower walls — 88 sq ft','Impermeabilizar y enlosar tres paredes — 88 pies²',88,'sq_ft')
 ],[price('shower',1,'job',null),price('floor',35,'sq_ft',null),price('walls',88,'sq_ft',null)],[],[],['Confirm materials and shower specifications before pricing.']),
 make('demo-cleaning','Post-construction cleaning','Limpieza después de obra','cleaning',[
  makeItem('clean','Heavy-dust post-construction cleaning, 1,500 sq ft','Limpieza después de obra con polvo abundante, 1,500 pies²',1500,'sq_ft')
 ],[price('clean',1500,'sq_ft',null)],[],[],['Confirm workforce and included tasks.']),
 make('demo-concrete','Concrete driveway','Entrada de concreto','concrete',[
  makeItem('driveway','Remove and replace driveway concrete — 600 sq ft','Retirar y reemplazar concreto — 600 pies²',600,'sq_ft')
 ],[price('driveway',600,'sq_ft',null)],[],[],['Confirm thickness and reinforcement.']),
 make('demo-plumbing','Water heater','Calentador de agua','plumbing',[
  makeItem('heater','Replace water heater and reconnect supply pipes','Reemplazar calentador y reconectar tuberías',1,'job')
 ],[price('heater',1,'job',null)],[],[],['Confirm fuel type and capacity.'])
];
