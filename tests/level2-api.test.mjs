// Level 2 API smoke tests — no real AI key or network request.
import assert from 'node:assert/strict';
import handler from '../api/interpret.js';
const originalFetch=globalThis.fetch;
const originalKey=process.env.OPENAI_API_KEY;
const originalToken=process.env.COP_BETA_TOKEN;
process.env.OPENAI_API_KEY='test-only-not-a-real-key';
process.env.COP_BETA_TOKEN='local-test-token';
const createRes=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.body=body||''}});
async function request({method='POST',origin='https://ozzie-ai.github.io',token='local-test-token',description='Instalar breaker para cargar carro electrico.'}={}){
 const res=createRes();
 await handler({method,headers:{origin,'x-beta-access':token},body:{description}},res);
 return {code:res.statusCode,body:res.body?JSON.parse(res.body):{},headers:res.headers};
}
try{
 assert.equal((await request({token:'wrong'})).code,401);
 assert.equal((await request({origin:'https://not-authorized.example'})).code,403);
 assert.equal((await request({description:'short'})).code,400);
 const o=await request({method:'OPTIONS'});assert.equal(o.code,204);
 let called=0;
 globalThis.fetch=async(url,opts)=>{
  called++;
  assert.equal(url,'https://api.openai.com/v1/responses');
  const input=JSON.parse(opts.body);
  assert.equal(input.store,false);
  assert.equal(input.text.format.type,'json_schema');
  assert.ok(input.instructions.includes('different')||input.instructions.includes('distinct'));
  assert.ok(input.input[0].content.includes('Instalar'));
  const interpretation={trade:'electrical',project_summary_en:'EV electrical circuit',project_summary_es:'Circuito eléctrico EV',
   tasks:[{category:'electrical',description_en:'EV charger wiring',description_es:'Cableado EV',quantity:100,unit:'ft',specifications:['40 A breaker'],status:'included_now'}],
   excluded_work:[],future_work:[],unknown_details:['Charger rated current'],confidence_notes:[]};
  return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(interpretation)}]}]})};
 };
 const ok=await request({description:'Instalar un breaker doble de 40 amperios para un cargador eléctrico a cien pies.'});
 assert.equal(ok.code,200);assert.equal(ok.body.version,2);assert.equal(ok.body.pricing_status,'not_priced');
 assert.equal(ok.body.interpretation.tasks[0].quantity,100);assert.equal(called,1);
 console.log('PASS Level 2 secure API: auth, CORS, validation, schema and structured model response');
}finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;if(originalToken===undefined)delete process.env.COP_BETA_TOKEN;else process.env.COP_BETA_TOKEN=originalToken;}
