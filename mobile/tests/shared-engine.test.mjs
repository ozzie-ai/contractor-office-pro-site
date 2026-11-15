import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync('src/sharedEngine.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const module={exports:{}};
vm.runInNewContext(js,{module,exports:module.exports,URL,Date,process:{env:{}}});
const bridge=module.exports;
const config={apiUrl:'https://api.example.test',supabaseUrl:'https://project.supabase.co',supabasePublishableKey:'public-key'};
const session={accessToken:'test-jwt'};
const mock=(status,body)=>async (_url,_init)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('optional connector is disabled by default, accepts HTTPS only and requires public config',()=>{
 assert.equal(bridge.isSharedConfigured(),false);
 assert.equal(bridge.isSharedConfigured(config),true);
 assert.equal(bridge.isSharedConfigured({...config,apiUrl:'http://insecure.example.com'}),false);
 assert.equal(bridge.isSharedConfigured({...config,supabasePublishableKey:''}),false);
});

test('email OTP uses Supabase public key and never sends our server OpenAI secrets',async()=>{
 let called=false;
 await bridge.sendEmailCode(config,'contractor@example.com',async (url,init)=>{
  called=true;
  assert.equal(url,'https://project.supabase.co/auth/v1/otp');
  assert.equal(init.headers.apikey,'public-key');
  assert.equal(JSON.parse(init.body).create_user,false);
  assert.equal(JSON.parse(init.body).email,'contractor@example.com');
  return {ok:true,status:200,json:async()=>({})};
 });
 assert.equal(called,true);
});

test('verification creates in-memory session; code is not placed in URL',async()=>{
 let called=false;
 const result=await bridge.verifyEmailCode(config,'contractor@example.com','123456',async (url,init)=>{
  called=true;
  assert.equal(url,'https://project.supabase.co/auth/v1/verify');
  assert.equal(JSON.parse(init.body).token,'123456');
  return {ok:true,status:200,json:async()=>({access_token:'user-jwt',refresh_token:'refresh',expires_in:3600})};
 });
 assert.equal(called,true);
 assert.equal(result.accessToken,'user-jwt');
 assert.equal(result.refreshToken,'refresh');
});

test('AI returns typed quantities including Decimal strings and no manufactured prices',async()=>{
 const response=await bridge.interpretWithDerek(config,session,'Cambiar cinco tomacorrientes, dos GFCI',async (url,init)=>{
  assert.equal(url,'https://api.example.test/v1/interpret');
  assert.equal(init.headers.Authorization,'Bearer test-jwt');
  assert.equal(JSON.parse(init.body).description,'Cambiar cinco tomacorrientes, dos GFCI');
  return {ok:true,status:200,json:async()=>({version:2,pricing_status:'not_priced',interpretation:{
   trade:'electrical',tasks:[
    {category:'electrical',description_en:'Standard outlets',description_es:'Tomacorrientes normales',quantity:'3',unit:'each',status:'included_now'},
    {category:'electrical',description_en:'GFCI outlets',description_es:'Tomacorrientes GFCI',quantity:'2',unit:'each',status:'included_now'}
   ],excluded_work:[],future_work:[],unknown_details:['Confirm wiring']
  }})};
 });
 assert.deepEqual(JSON.parse(JSON.stringify(response.tasks.map(x=>x.quantity))),[3,2]);
 assert.equal(Object.hasOwn(response.tasks[0],'rate'),false);
});

test('backend receives direct unit cost, NOT selling-price override; overhead is applied once',()=>{
 const request=bridge.toSharedPriceRequest({
  lines:[{id:'a',description_en:'Outlets',description_es:'Tomacorrientes',quantity:3,unit:'each',rate:70,
   status:'allowance_to_confirm',priceEvidence:{kind:'planning_allowance'}}],
  overheadPct:10,profitPct:20,language:'en'
 });
 const line=request.items[0];
 assert.equal(line.direct_cost.other_cost_per_unit,70);
 assert.equal(line.direct_cost.material_cost_per_unit,0);
 assert.equal(line.unit_selling_price_override,undefined);
 assert.equal(request.overhead_pct,10);
 assert.equal(request.profit_pct,20);
});

test('unknown quantities, zero rates and unsupported units prevent false total verification',()=>{
 const base={description_en:'Outlet',description_es:'Tomacorriente',id:'a',status:'included_now',quantity:3,unit:'each',rate:50};
 for(const change of [{quantity:0},{rate:0},{unit:'not-a-unit'}]){
  assert.throws(()=>bridge.toSharedPriceRequest({lines:[{...base,...change}],overheadPct:10,profitPct:20,language:'en'}));
 }
});

test('private provider/server errors are not leaked into UI',async()=>{
 await assert.rejects(
  bridge.interpretWithDerek(config,session,'Replace five outlets, two GFCI',mock(502,{internal:'private transcript and secret'})),
  e=>!String(e.message).includes('private transcript')&&!String(e.message).includes('secret')
 );
});

test('price verification returns only private draft and preserves local data',async()=>{
 const project={lines:[{id:'b',description_en:'GFCI',description_es:'GFCI',quantity:2,unit:'each',rate:100,status:'included_now'}],overheadPct:10,profitPct:20,language:'en'};
 const old=JSON.stringify(project);
 const result=await bridge.verifyWithDerek(config,session,project,async (url,init)=>{
  assert.equal(url,'https://api.example.test/v1/estimate/price');
  assert.equal(JSON.parse(init.body).items[0].direct_cost.other_cost_per_unit,100);
  return {ok:true,status:200,json:async()=>({status:'ready_for_contractor_review',selling_total:'264.00',missing:[],preliminary:true})};
 });
 assert.equal(result.selling_total,'264.00');
 assert.equal(JSON.stringify(project),old);
});
