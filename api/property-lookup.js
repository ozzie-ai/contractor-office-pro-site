/**
 * Optional Vercel serverless adapter. Set RENTCAST_API_KEY server-side.
 * Production service needs authentication and per-account rate limits.
 */
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const apiKey=process.env.RENTCAST_API_KEY;
 if(!apiKey)return res.status(503).json({error:'Property source not configured'});
 const address=typeof req.query?.address==='string'?req.query.address.trim():'';
 if(address.length<8||address.length>220)return res.status(400).json({error:'Valid complete address required'});
 try{
  const url='https://api.rentcast.io/v1/properties?address='+encodeURIComponent(address)+'&limit=2';
  const response=await fetch(url,{headers:{'X-Api-Key':apiKey,Accept:'application/json'},signal:AbortSignal.timeout(9000)});
  if(!response.ok)return res.status(response.status===404?404:502).json({error:'Provider unavailable'});
  const items=await response.json();
  if(!Array.isArray(items)||items.length!==1)return res.status(404).json({error:'No unambiguous property match'});
  const record=items[0],squareFootage=Number(record?.squareFootage);
  if(!Number.isFinite(squareFootage)||squareFootage<100||squareFootage>200000)return res.status(404).json({error:'No usable living-area square footage'});
  const matchedAddress=String(record.formattedAddress||'').trim();
  if(!matchedAddress)return res.status(404).json({error:'No matched address'});
  return res.status(200).json({squareFootage,matchedAddress,source:'RentCast property records'});
 }catch{return res.status(502).json({error:'Property lookup failed'});}
}
