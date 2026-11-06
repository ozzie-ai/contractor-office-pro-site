// Secure speech-to-text for the mobile pilot. Never commit API keys.
// POST {audioBase64: "..."} from the app. Short audio files only.
const MAX_AUDIO_BYTES=2300000;
const allowedOrigins=new Set(["https://ozzie-ai.github.io",...(process.env.ALLOWED_ORIGINS||"").split(",").map(s=>s.trim()).filter(Boolean)]);
function reply(res,status,body,origin){
 res.statusCode=status;
 res.setHeader("Content-Type","application/json; charset=utf-8");
 res.setHeader("Cache-Control","no-store");
 if(origin)res.setHeader("Access-Control-Allow-Origin",origin);
 res.setHeader("Access-Control-Allow-Headers","Content-Type, X-Beta-Access");
 res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
 res.end(JSON.stringify(body));
}
export default async function handler(req,res){
 const origin=req.headers.origin,cors=origin&&allowedOrigins.has(origin)?origin:null;
 if(req.method==="OPTIONS")return cors?reply(res,204,{},cors):reply(res,403,{error:"origin_not_allowed"});
 if(req.method!=="POST")return reply(res,405,{error:"method_not_allowed"},cors);
 if(origin&&!cors)return reply(res,403,{error:"origin_not_allowed"});
 if(!process.env.COP_BETA_TOKEN)return reply(res,503,{error:"beta_access_not_configured"},cors);
 if(req.headers["x-beta-access"]!==process.env.COP_BETA_TOKEN)return reply(res,401,{error:"access_denied"},cors);
 if(!process.env.OPENAI_API_KEY)return reply(res,503,{error:"ai_service_not_configured"},cors);
 let body;
 try{body=typeof req.body==="object"?req.body:JSON.parse(req.body||"{}")}catch{return reply(res,400,{error:"invalid_request"},cors)}
 const raw=body?.audioBase64;
 if(typeof raw!=="string"||raw.length<100||raw.length>Math.ceil(MAX_AUDIO_BYTES*4/3)+4||!/^[A-Za-z0-9+/\r\n]+=*$/.test(raw))return reply(res,400,{error:"audio_file_invalid_or_too_large"},cors);
 const bytes=Buffer.from(raw,"base64");
 if(bytes.length>MAX_AUDIO_BYTES||bytes.length<100)return reply(res,400,{error:"audio_file_invalid_or_too_large"},cors);
 const form=new FormData();
 form.set("file",new Blob([bytes],{type:"audio/mp4"}),"job-description.m4a");
 form.set("model",process.env.OPENAI_TRANSCRIBE_MODEL||"gpt-4o-mini-transcribe");
 form.set("prompt","Natural Spanish and English construction contractor field notes. Preserve breaker amperages, panel sizes, subpanel versus EV charger, circuit counts, distances, and work exclusions exactly. Transcribe, do not rewrite as an estimate.");
 try{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),55000);
  let upstream;
  try{
   upstream=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",signal:ctrl.signal,headers:{Authorization:"Bearer "+process.env.OPENAI_API_KEY},body:form});
  }finally{clearTimeout(timer)}
  if(!upstream.ok)return reply(res,upstream.status===429?429:502,{error:upstream.status===429?"transcription_rate_limited":"transcription_provider_failed"},cors);
  const result=await upstream.json();
  if(typeof result.text!=="string"||!result.text.trim())return reply(res,502,{error:"empty_transcript"},cors);
  return reply(res,200,{transcript:result.text},cors);
 }catch(e){return reply(res,502,{error:e?.name==="AbortError"?"transcription_timeout":"transcription_request_failed"},cors)}
}
