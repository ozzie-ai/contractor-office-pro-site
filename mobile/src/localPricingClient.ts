import type {EstimateLine} from './estimate';

export const LOCAL_TASK_CODES:Record<string,string>={
  'local-panel-upgrade':'ELEC.PANEL.UPGRADE',
  'local-existing-circuits':'ELEC.CIRCUIT.TRANSFER',
  'local-future-breaker':'ELEC.BREAKER.ONLY',
  'local-permit':'ELEC.PERMIT',
  'local-recessed-light':'ELEC.RECESSED.LIGHT',
  'local-gfci':'ELEC.GFCI',
};
export type LocalReference={
 task_code:string;region:string;found:boolean;message?:string;name_en?:string;unit?:string;
 direct_cost?:number|null;cost_complete?:boolean;benchmark_bid?:number|null;
 observed_on?:string;source_name?:string;source_url?:string;license?:string;notes?:string;
 rate_is_not_customer_quote?:boolean;
};
export function validateLocalEndpoint(endpoint:string):string{
 const url=endpoint.trim().replace(/\/+$/,'');
 // No publicly routable HTTP endpoint: this is intended only for a trusted home network.
 const match=/^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d{2,5})?$/i.exec(url);
 if(!match)throw new Error('Use your Mac private Wi-Fi IPv4 URL, e.g. http://192.168.1.10:8765');
 return url;
}
export async function lookupLocalPrice(endpoint:string,token:string,region:string,line:EstimateLine):Promise<LocalReference>{
 const code=LOCAL_TASK_CODES[line.id];
 if(!code)throw new Error('No matching catalog task for this work item yet.');
 if(!token.trim())throw new Error('Enter the Mac local API token in Business Settings.');
 if(!/^[A-Z0-9-]{2,40}$/.test(region))throw new Error('Enter a supported region code.');
 const base=validateLocalEndpoint(endpoint);
 const controller=new AbortController();
 // React Native supports AbortController in current Expo SDK runtime.
 const timeout=setTimeout(()=>controller.abort(),8000);
 try{
  const uri=base+'/reference?task='+encodeURIComponent(code)+'&region='+encodeURIComponent(region);
  const response=await fetch(uri,{headers:{Authorization:'Bearer '+token.trim()},signal:controller.signal});
  if(!response.ok)throw new Error(response.status===401?'Check the Mac database access token.':'Mac database HTTP error '+response.status);
  const data=await response.json() as LocalReference;
  if(typeof data!=='object'||data===null||typeof data.found!=='boolean'||data.task_code!==code||data.region!==region)
   throw new Error('Unexpected Mac pricing data; no prices changed.');
  if(data.found&&data.direct_cost!=null&&(!Number.isFinite(data.direct_cost)||data.direct_cost<=0))
   throw new Error('Invalid unit cost returned. No prices changed.');
  return data;
 }finally{clearTimeout(timeout);}
}
