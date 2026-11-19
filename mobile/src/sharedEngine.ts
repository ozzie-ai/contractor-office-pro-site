/**
 * Shared Derek/Expo service boundary. No Swift UI is copied into React Native.
 * All server secrets stay on backend. JWT stays in memory for this first beta.
 * This is optional: the existing offline estimate/PDF continues unchanged.
 */
import type {Project, Interpretation} from './estimate';

export type SharedConfig={
  apiUrl:string;
  supabaseUrl:string;
  supabasePublishableKey:string;
};
export type BetaSession={accessToken:string;refreshToken?:string;expiresAt?:number};
export const sharedConfig:SharedConfig={
  apiUrl:process.env.EXPO_PUBLIC_COP_BACKEND_URL||'',
  supabaseUrl:process.env.EXPO_PUBLIC_SUPABASE_URL||'',
  supabasePublishableKey:process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY||''
};
type Http=(input:string,init?:RequestInit)=>Promise<Response>;

function secureBase(raw:string):string{
 const u=new URL(raw);
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash)
  throw new Error('Shared server requires a valid HTTPS URL.');
 return u.href.replace(/\/+$/,'');
}
export function isSharedConfigured(c:SharedConfig=sharedConfig):boolean{
 try{return !!(secureBase(c.apiUrl)&&secureBase(c.supabaseUrl)&&c.supabasePublishableKey.trim());}
 catch{return false;}
}
async function jsonRequest<T>(url:string,init:RequestInit, http:Http):Promise<T>{
 let response:Response;
 try{response=await http(url,{...init,headers:{'Content-Type':'application/json',...(init.headers as Record<string,string>||{})}});}
 catch{throw new Error('Network unavailable. Existing offline estimating still works.');}
 if(!response.ok) {
  // Do not display raw server errors, transcripts, membership details or credentials.
  if(response.status===401)throw new Error('The business session was rejected. Sign in again.');
  if(response.status===403)throw new Error('Your business account has no active organization membership.');
  if(response.status===429)throw new Error('AI service limit reached. Try the local estimate.');
  throw new Error('The shared service is unavailable (HTTP '+response.status+').');
 }
 try{return await response.json() as T;}
 catch{throw new Error('The shared service returned an invalid response.');}
}
const supaHeaders=(c:SharedConfig)=>({'apikey':c.supabasePublishableKey});

export async function sendEmailCode(c:SharedConfig,email:string,http:Http=fetch):Promise<void>{
 const base=secureBase(c.supabaseUrl);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid business account email.');
 await jsonRequest<unknown>(base+'/auth/v1/otp',{
  method:'POST',headers:supaHeaders(c),
  body:JSON.stringify({email:email.trim(),create_user:true})
 },http);
}
export async function verifyEmailCode(c:SharedConfig,email:string,code:string,http:Http=fetch):Promise<BetaSession>{
 const base=secureBase(c.supabaseUrl);
 if(!/^\d{6,8}$/.test(code.trim()))throw new Error('Enter the email verification code.');
 const response=await jsonRequest<{access_token?:string;refresh_token?:string;expires_in?:number}>(
  base+'/auth/v1/verify',{
   method:'POST',headers:supaHeaders(c),
   body:JSON.stringify({email:email.trim(),token:code.trim(),type:'email'})
  },http);
 if(!response.access_token)throw new Error('Sign-in did not return a valid session.');
 return {
  accessToken:response.access_token,
  refreshToken:response.refresh_token,
  expiresAt:typeof response.expires_in==='number'?Date.now()+response.expires_in*1000:undefined
 };
}
export async function bootstrapBusiness(c:SharedConfig,session:BetaSession,
 businessName:string,displayName:string,language:'en'|'es',http:Http=fetch):Promise<void>{
 const base=secureBase(c.apiUrl);
 const name=businessName.trim()||'My Construction Business';
 const display=displayName.trim()||'Contractor';
 const result=await jsonRequest<{status?:string}>(base+'/v1/account/bootstrap',{
  method:'POST',headers:{Authorization:'Bearer '+session.accessToken},
  body:JSON.stringify({business_name:name,display_name:display,language})
 },http);
 if(result?.status!=='authorized')throw new Error('Business account was not confirmed.');
}

export async function verifyBackendAccess(c:SharedConfig,session:BetaSession,http:Http=fetch):Promise<void>{
 const base=secureBase(c.apiUrl);
 const status=await jsonRequest<{status?:string}>(base+'/v1/account/status',{
  method:'GET',headers:{Authorization:'Bearer '+session.accessToken}
 },http);
 if(status?.status!=='authorized')throw new Error('Backend did not confirm contractor access.');
}

export async function refreshSession(c:SharedConfig,session:BetaSession,http:Http=fetch):Promise<BetaSession>{
 if(!session.refreshToken)throw new Error('Session expired. Request a new sign-in code.');
 if(!session.expiresAt||session.expiresAt>Date.now()+60000)return session;
 const base=secureBase(c.supabaseUrl);
 const response=await jsonRequest<{access_token?:string;refresh_token?:string;expires_in?:number}>(
  base+'/auth/v1/token?grant_type=refresh_token',{
   method:'POST',headers:supaHeaders(c),
   body:JSON.stringify({refresh_token:session.refreshToken})
  },http);
 if(!response.access_token)throw new Error('Session expired. Request a new sign-in code.');
 return {accessToken:response.access_token,refreshToken:response.refresh_token||session.refreshToken,
  expiresAt:Date.now()+(response.expires_in||3600)*1000};
}
export type AiCapabilities={
 auth_environment_configured:boolean;
 ai_environment_configured:boolean;
 deterministic_device_interpretation:boolean;
 pricing_math_available:boolean;
 live_provider_verification:boolean;
};
/** Public server configuration signals, NOT a guarantee that the AI provider is reachable.
 * Never send a transcript or user token when checking readiness.
 */
export async function getAiCapabilities(c:SharedConfig,http:Http=fetch):Promise<AiCapabilities>{
 const base=secureBase(c.apiUrl);
 const response=await jsonRequest<Partial<AiCapabilities>>(base+'/v1/capabilities',{
  method:'GET'
 },http);
 if(typeof response?.ai_environment_configured!=='boolean'||
    typeof response?.auth_environment_configured!=='boolean'||
    typeof response?.deterministic_device_interpretation!=='boolean'||
    typeof response?.pricing_math_available!=='boolean'||
    typeof response?.live_provider_verification!=='boolean')
   throw new Error('Server AI capabilities could not be verified; offline estimating is unchanged.');
 return response as AiCapabilities;
}

export async function interpretWithDerek(c:SharedConfig,session:BetaSession,description:string,http:Http=fetch):Promise<Interpretation>{
 if(description.trim().length<10||description.length>10000)throw new Error('Describe the work before requesting AI.');
 const base=secureBase(c.apiUrl);
 const response=await jsonRequest<{version?:number;interpretation?:Interpretation;pricing_status?:string}>(
  base+'/v1/interpret',{
   method:'POST',headers:{Authorization:'Bearer '+session.accessToken},
   body:JSON.stringify({description:description.trim()})
  },http);
 const raw=response.interpretation;
 if(response.version!==2||response.pricing_status!=='not_priced'||!raw||!Array.isArray(raw.tasks))
  throw new Error('AI interpretation needs review; no estimate was changed.');
 return {
  trade:raw.trade,
  project_summary_en:raw.project_summary_en||'',
  project_summary_es:raw.project_summary_es||'',
  tasks:raw.tasks.slice(0,100).map(t=>{
   const qty=t.quantity===null?null:Number(t.quantity);
   return {category:String(t.category||'other'),description_en:String(t.description_en||''),
    description_es:String(t.description_es||''),
    quantity:qty!==null&&Number.isFinite(qty)&&qty>0?qty:null,
    unit:typeof t.unit==='string'?t.unit:null,
    specifications:Array.isArray(t.specifications)?t.specifications:[],
    status:t.status==='allowance_to_confirm'?'allowance_to_confirm' as const:'included_now' as const};
  }),
  excluded_work:Array.isArray(raw.excluded_work)?raw.excluded_work:[],
  future_work:Array.isArray(raw.future_work)?raw.future_work:[],
  unknown_details:Array.isArray(raw.unknown_details)?raw.unknown_details:[]
 };
}
export type PhotoInspection={
 observations:{
  visible_conditions:string[];
  possible_work:string[];
  missing_information:string[];
  limitations:string[];
 };
 pricing_status:'not_priced';
 approved_for_scope:false;
};
/** Single private photo, uploaded only after explicit contractor consent.
 * No server storage or automatic price/scope changes are requested.
 */
export async function inspectPhotoWithDerek(c:SharedConfig,session:BetaSession,
 photo:{base64:string;mimeType:'image/jpeg'|'image/png'|'image/webp';context:string},
 contractorConsent:boolean,http:Http=fetch):Promise<PhotoInspection>{
 if(!contractorConsent)throw new Error('Confirm photo-sharing consent before AI inspection.');
 if(!photo.base64||photo.base64.length>5_500_000||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.base64))
  throw new Error('Photo is too large or unreadable for AI inspection.');
 const bytesApprox=Math.floor(photo.base64.length*3/4)-(photo.base64.endsWith('==')?2:photo.base64.endsWith('=')?1:0);
 if(bytesApprox>4_000_000)throw new Error('Photo exceeds 4 MB; choose a smaller image.');
 if(!['image/jpeg','image/png','image/webp'].includes(photo.mimeType))
  throw new Error('Photo type must be JPEG, PNG or WebP.');
 const base=secureBase(c.apiUrl);
 const response=await jsonRequest<PhotoInspection>(base+'/v1/photo/inspect',{
  method:'POST',headers:{Authorization:'Bearer '+session.accessToken},
  body:JSON.stringify({image_base64:photo.base64,mime_type:photo.mimeType,
    contractor_consent:true,context:photo.context.slice(0,1500)})
 },http);
 const o=response?.observations;
 const valid=(v:unknown)=>Array.isArray(v)&&v.length<=12&&v.every(x=>typeof x==='string'&&x.length<=1000);
 if(!o||!valid(o.visible_conditions)||!valid(o.possible_work)||
    !valid(o.missing_information)||!valid(o.limitations)||
    response.pricing_status!=='not_priced'||response.approved_for_scope!==false)
  throw new Error('Photo AI response failed safety validation; estimate unchanged.');
 return response;
}

const units:Record<string,string>={
 'each':'each','ea':'each','unit':'each','job':'job','sq ft':'sq ft','sf':'sq ft','sqft':'sq ft',
 'linear ft':'linear ft','lf':'linear ft','ft':'linear ft','cu yd':'cu yd','cy':'cu yd',
 'hr':'hr','hour':'hr','hours':'hr','day':'day','days':'day'
};
export type ResearchReference={
 reference_id:string;reference_kind:'reviewed_budget'|'service_market'|'supplier_market';
 trade:string;service:string;unit:string;locality:string;
 low_usd:string|null;high_usd:string|null;planning_rate_usd:string|null;
 scope:string|null;exclusions:string|null;review_status:string;
 budget_usable:boolean;automatic_final_quote:false;
};
export async function listResearchReferences(c:SharedConfig,session:BetaSession,
 opts:{budgetOnly?:boolean;limit?:number}={},http:Http=fetch):Promise<ResearchReference[]>{
 const base=secureBase(c.apiUrl);
 const limit=Math.max(1,Math.min(100,Math.floor(opts.limit??30)));
 const only=opts.budgetOnly!==false;
 const result=await jsonRequest<ResearchReference[]>(base+
  '/v1/research-references?budget_only='+(only?'true':'false')+'&limit='+limit,{
   method:'GET',headers:{Authorization:'Bearer '+session.accessToken}
 },http);
 if(!Array.isArray(result)||result.length>limit||result.some(r=>!r||
  r.automatic_final_quote!==false||typeof r.service!=='string'||
  typeof r.trade!=='string'||typeof r.budget_usable!=='boolean'))
  throw new Error('Reference catalog returned invalid data. Existing estimate unchanged.');
 return result;
}

export type ContractorDirectRate={
 id:string;kind:'labor'|'material'|'markup'|'other';name_en:string;name_es:string|null;
 unit:string;unit_cost:string;unit_price:string;category:string|null;
 source:'contractor_entered';
};
/** Ratebook data belongs to the authenticated contractor's business.
 * Never substitute market research references for their direct costs.
 */
export async function listContractorDirectRates(c:SharedConfig,session:BetaSession,
 http:Http=fetch):Promise<ContractorDirectRate[]>{
 const base=secureBase(c.apiUrl);
 const response=await jsonRequest<ContractorDirectRate[]>(base+'/v1/pricebook?limit=200',{
  method:'GET',headers:{Authorization:'Bearer '+session.accessToken}
 },http);
 if(!Array.isArray(response)||response.length>200||
    response.some(x=>!x||typeof x.id!=='string'||typeof x.name_en!=='string'||
      typeof x.unit!=='string'||!['labor','material','markup','other'].includes(x.kind)||
      x.source!=='contractor_entered'||!Number.isFinite(Number(x.unit_cost))||
      !Number.isFinite(Number(x.unit_price))||Number(x.unit_cost)<0||Number(x.unit_price)<=0))
  throw new Error('Contractor pricebook could not be verified. Current estimate unchanged.');
 return response;
}
const rateKey=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const rateUnit=(s:string)=>({
 'ea':'each','unit':'each','each':'each','sf':'sq ft','sqft':'sq ft','sq ft':'sq ft',
 'lf':'linear ft','linear ft':'linear ft','ft':'linear ft','hr':'hr','hour':'hr'
} as Record<string,string>)[s.trim().toLowerCase()]||s.trim().toLowerCase();
/** Strict, unambiguous match. Do not guess work assemblies from semantic similarity.
 * Only full-scope contractor 'other' service rates are eligible for installed
 * job item pricing; raw material/labor rows are not standalone installed costs.
 */
export function exactContractorRateMatches(line:Pick<Project['lines'][number],
 'description_en'|'description_es'|'unit'>,rates:ContractorDirectRate[]):ContractorDirectRate[]{
 const english=rateKey(line.description_en),spanish=rateKey(line.description_es);
 return rates.filter(x=>x.kind==='other'&&Number(x.unit_cost)>0&&
   rateUnit(x.unit)===rateUnit(line.unit)&&
   (rateKey(x.name_en)===english||
    (!!x.name_es&&rateKey(x.name_es)===spanish)));
}

export type SharedPriceCheck={
 status:'incomplete'|'ready_for_contractor_review';
 selling_total:string|null;
 missing:string[];
 preliminary:boolean;
};
export function toSharedPriceRequest(project:Pick<Project,'lines'|'overheadPct'|'profitPct'|'language'>):object{
 if(!project.lines.length)throw new Error('Add work items before checking the shared engine.');
 if(!Number.isFinite(project.overheadPct)||!Number.isFinite(project.profitPct)||
    project.overheadPct<0||project.profitPct<0||project.overheadPct>100||project.profitPct>100)
  throw new Error('Enter valid overhead and profit percentages from 0 to 100.');
 const items=project.lines.map((l,i)=>{
  const unit=units[l.unit.trim().toLowerCase()];
  if(!unit)throw new Error('Unsupported unit on item '+(i+1)+'. Review the unit before pricing.');
  if(!Number.isFinite(l.quantity)||l.quantity<=0||!Number.isFinite(l.rate)||l.rate<=0)
   throw new Error('Enter quantities and direct-cost rates before shared pricing.');
  // Preserve detailed contractor cost components ONLY when they reconcile to
  // the approved direct unit rate. If prices were edited independently, avoid
  // applying stale components or double counting: retain the known total.
  const parts=[l.costHoursPerUnit,l.costHourlyWage,l.costLaborBurdenMultiplier,
   l.costMaterialsPerUnit,l.costEquipmentPerUnit];
  const breakdownOk=parts.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0)&&
   (l.costLaborBurdenMultiplier||0)>=1;
  const loadedLaborRate=breakdownOk?l.costHourlyWage!*l.costLaborBurdenMultiplier!:0;
  const partsRate=breakdownOk?l.costHoursPerUnit!*loadedLaborRate+
   l.costMaterialsPerUnit!+l.costEquipmentPerUnit!:0;
  const detailed=breakdownOk&&Math.abs(Math.round(partsRate*100)-Math.round(l.rate*100))===0;
  // Expo rate is a DIRECT cost: overhead and profit are added by the server.
  return {
   task_code:'expo.item.'+(i+1),
   description_en:l.description_en,
   description_es:l.description_es,
   quantity:l.quantity,unit,
   direct_cost:{
    labor_hours_per_unit:detailed?l.costHoursPerUnit:0,
    loaded_labor_rate:detailed?loadedLaborRate:0,
    material_cost_per_unit:detailed?l.costMaterialsPerUnit:0,
    equipment_cost_per_unit:detailed?l.costEquipmentPerUnit:0,
    other_cost_per_unit:detailed?0:l.rate,
    source:l.priceEvidence?.kind==='contractor_entered'?'contractor_entered':'planning_allowance'
   }
  };
 });
 return {items,overhead_pct:project.overheadPct,profit_pct:project.profitPct,
  customer_language:project.language,mobilization_direct_cost:0};
}
export async function verifyWithDerek(c:SharedConfig,session:BetaSession,project:Pick<Project,'lines'|'overheadPct'|'profitPct'|'language'>,http:Http=fetch):Promise<SharedPriceCheck>{
 const base=secureBase(c.apiUrl);
 const response=await jsonRequest<SharedPriceCheck>(
  base+'/v1/estimate/price',{
   method:'POST',headers:{Authorization:'Bearer '+session.accessToken},
   body:JSON.stringify(toSharedPriceRequest(project))
  },http);
 if(!response||!Array.isArray(response.missing)||typeof response.preliminary!=='boolean'||
    !['incomplete','ready_for_contractor_review'].includes(response.status))
  throw new Error('Invalid estimate response. Existing estimate was not modified.');
 return response;
}
