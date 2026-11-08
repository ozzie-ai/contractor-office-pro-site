export type PropertyAreaResult={
 squareFootage:number;source:string;matchedAddress:string;lookedUpAddress:string;retrievedAt:string;
};
export type AreaLookupResult={status:'found';property:PropertyAreaResult}|{status:'unavailable'|'not_found'|'error';message:string};

/** Endpoint belongs to a trusted server. Never include property-data API keys in the phone app. */
export async function findPropertyArea(address:string,endpoint:string,fetcher:typeof fetch=fetch):Promise<AreaLookupResult>{
 const normalized=address.trim();
 if(normalized.length<8)return {status:'error',message:'Enter the complete street address and city before searching.'};
 if(!endpoint.trim())return {status:'unavailable',message:'Property lookup is not connected yet. Enter the square footage manually for now.'};
 if(!/^https:\/\//i.test(endpoint))return {status:'error',message:'Property data connection must use HTTPS.'};
 try{
  const separator=endpoint.includes('?')?'&':'?';
  const response=await fetcher(endpoint+separator+'address='+encodeURIComponent(normalized),{method:'GET',headers:{Accept:'application/json'}});
  if(response.status===404)return {status:'not_found',message:'No verified property area was found for that address. Enter measured square footage.'};
  if(!response.ok)return {status:'error',message:'Property service is unavailable. Enter measured square footage.'};
  const data:unknown=await response.json();
  if(!data||typeof data!=='object')return {status:'error',message:'Property provider returned incomplete information.'};
  const record=data as Record<string,unknown>;
  const value=Number(record.squareFootage);
  if(!Number.isFinite(value)||value<100||value>200000)return {status:'not_found',message:'Property record does not contain usable building square footage.'};
  const matchedAddress=typeof record.matchedAddress==='string'?record.matchedAddress.trim():'';
  const source=typeof record.source==='string'?record.source.trim():'';
  if(!matchedAddress||!source)return {status:'error',message:'Property data source or matched address is missing.'};
  return {status:'found',property:{squareFootage:value,matchedAddress,source,lookedUpAddress:normalized,retrievedAt:new Date().toISOString()}};
 }catch{return {status:'error',message:'Could not reach property lookup. Enter square footage manually.'};}
}
export function areaMatchesAddress(property:PropertyAreaResult|undefined,address:string):boolean{
 return Boolean(property&&property.lookedUpAddress.trim().toLowerCase()===address.trim().toLowerCase());
}
