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
  assert.equal(JSON.parse(init.body).create_user,true);
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


test('email sign-in alone is not a confirmed backend connection',async()=>{
 let checked=false;
 await bridge.verifyBackendAccess(config,session,async(url,init)=>{
  checked=true;
  assert.equal(url,'https://api.example.test/v1/account/status');
  assert.equal(init.headers.Authorization,'Bearer test-jwt');
  return {ok:true,status:200,json:async()=>({status:'authorized'})};
 });
 assert.equal(checked,true);
 await assert.rejects(bridge.verifyBackendAccess(config,session,mock(403,{})),
  e=>String(e.message).includes('organization membership'));
 await assert.rejects(bridge.verifyBackendAccess(config,session,mock(200,{status:'unverified'})));
});

test('verified labor and material cost details stay separate without double markup',()=>{
 const request=bridge.toSharedPriceRequest({
  lines:[{id:'l1',description_en:'Install GFCI',description_es:'Instalar GFCI',quantity:2,unit:'each',
   rate:130,costHoursPerUnit:1,costHourlyWage:50,costLaborBurdenMultiplier:1.5,
   costMaterialsPerUnit:45,costEquipmentPerUnit:10}],
  overheadPct:10,profitPct:20,language:'en'
 });
 const cost=request.items[0].direct_cost;
 assert.equal(cost.labor_hours_per_unit,1);
 assert.equal(cost.loaded_labor_rate,75);
 assert.equal(cost.material_cost_per_unit,45);
 assert.equal(cost.equipment_cost_per_unit,10);
 assert.equal(cost.other_cost_per_unit,0);
 assert.equal(request.items[0].unit_selling_price_override,undefined);
});

test('edited unit selling amounts do not reuse obsolete component breakdowns',()=>{
 const request=bridge.toSharedPriceRequest({
  lines:[{id:'l2',description_en:'Install outlet',description_es:'Instalar tomacorriente',quantity:1,unit:'each',
   rate:155,costHoursPerUnit:1,costHourlyWage:50,costLaborBurdenMultiplier:1.5,
   costMaterialsPerUnit:45,costEquipmentPerUnit:10}],
  overheadPct:10,profitPct:20,language:'en'
 });
 const cost=request.items[0].direct_cost;
 assert.equal(cost.labor_hours_per_unit,0);
 assert.equal(cost.material_cost_per_unit,0);
 assert.equal(cost.equipment_cost_per_unit,0);
 assert.equal(cost.other_cost_per_unit,155);
});


test('new verified contractor can bootstrap only own organization via bearer token',async()=>{
 let called=false;
 await bridge.bootstrapBusiness(config,session,'Contractor Office Pro','Builder','en',async(url,init)=>{
  called=true;
  assert.equal(url,'https://api.example.test/v1/account/bootstrap');
  assert.equal(init.headers.Authorization,'Bearer test-jwt');
  assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(init.body))),{
   business_name:'Contractor Office Pro',display_name:'Builder',language:'en'
  });
  return {ok:true,status:200,json:async()=>({status:'authorized'})};
 });
 assert.equal(called,true);
 await assert.rejects(bridge.bootstrapBusiness(config,session,'Contractor Office Pro','Builder','en',
  async()=>({ok:true,status:200,json:async()=>({status:'unverified'})})));
});


test('residential research references require JWT and cannot be final selling rates',async()=>{
 const approved={reference_id:'COP-PL-001',reference_kind:'reviewed_budget',trade:'Plumbing',
  service:'Replace toilet',unit:'each',locality:'US national',
  low_usd:'200.00',high_usd:'500.00',planning_rate_usd:null,
  scope:'Existing installation',exclusions:'Toilet purchase',
  review_status:'reviewed_preliminary_budget',budget_usable:true,automatic_final_quote:false};
 const rows=await bridge.listResearchReferences(config,session,{budgetOnly:true,limit:50},async(url,init)=>{
  assert.equal(url,'https://api.example.test/v1/research-references?budget_only=true&limit=50');
  assert.equal(init.headers.Authorization,'Bearer test-jwt');
  return {ok:true,status:200,json:async()=>[approved]};
 });
 assert.equal(rows.length,1);
 assert.equal(rows[0].automatic_final_quote,false);
 await assert.rejects(bridge.listResearchReferences(config,session,{},async()=>({
  ok:true,status:200,json:async()=>[{...approved,automatic_final_quote:true}]
 })));
});

test('public AI capabilities check does not send transcript, auth token or API secrets',async()=>{
 const flags=await bridge.getAiCapabilities(config,async(url,init)=>{
  assert.equal(url,'https://api.example.test/v1/capabilities');
  assert.equal(init.method,'GET');
  assert.equal(init.body,undefined);
  assert.equal(init.headers.Authorization,undefined);
  return {ok:true,status:200,json:async()=>({
   auth_environment_configured:true,ai_environment_configured:false,
   deterministic_device_interpretation:true,pricing_math_available:true,
   live_provider_verification:false
  })};
 });
 assert.equal(flags.ai_environment_configured,false);
 assert.equal(flags.pricing_math_available,true);
 await assert.rejects(bridge.getAiCapabilities(config,mock(200,{ai_environment_configured:true})),
  e=>e.message.includes('could not be verified'));
});

test('app shows AI configuration status and requires explicit consent before overwriting work',()=>{
 const app=readFileSync('App.tsx','utf8');
 assert.match(app,/getAiCapabilities\(sharedConfig\)/);
 assert.match(app,/Check AI readiness/);
 assert.match(app,/AI model is NOT configured on the server/);
 assert.match(app,/Keep current estimate/);
 assert.match(app,/Apply AI draft \(unpriced\)/);
 assert.match(app,/if\(!draft\.lines\.length\)/);
});

test('AI photo review requires explicit consent; preserves unpriced observations',async()=>{
 let called=0;
 const safePhoto='a'.repeat(120);
 const observation={observations:{visible_conditions:['An existing junction box is visible'],
   possible_work:['Verify device replacement'],missing_information:['Check wiring'],
   limitations:['Scale not established']},pricing_status:'not_priced',approved_for_scope:false};
 const http=async(url,init)=>{
  called++;
  assert.equal(url,'https://api.example.test/v1/photo/inspect');
  assert.equal(init.headers.Authorization,'Bearer test-jwt');
  const payload=JSON.parse(init.body);
  assert.equal(payload.contractor_consent,true);
  assert.equal(payload.image_base64,safePhoto);
  assert.equal(payload.mime_type,'image/jpeg');
  return {ok:true,status:200,json:async()=>observation};
 };
 await assert.rejects(bridge.inspectPhotoWithDerek(config,session,{
  base64:safePhoto,mimeType:'image/jpeg',context:'Existing electrical work'},false,http));
 assert.equal(called,0,'Without consent, no photo or text is uploaded');
 const result=await bridge.inspectPhotoWithDerek(config,session,{
  base64:safePhoto,mimeType:'image/jpeg',context:'Existing electrical work'},true,http);
 assert.equal(result.observations.visible_conditions.length,1);
 assert.equal(result.approved_for_scope,false);
 assert.equal(result.pricing_status,'not_priced');
 assert.equal(called,1);
});
test('AI photo rejects fabricated pricing and oversized payload before leaking observations',async()=>{
 const photo={base64:'a'.repeat(120),mimeType:'image/png',context:'notes'};
 await assert.rejects(bridge.inspectPhotoWithDerek(config,session,photo,true,
  async()=>({ok:true,status:200,json:async()=>({
   observations:{visible_conditions:[],possible_work:[],missing_information:[],limitations:[]},
   pricing_status:'priced',approved_for_scope:true
  })})));
 await assert.rejects(bridge.inspectPhotoWithDerek(config,session,{
  ...photo,base64:'a'.repeat(5_500_004)},true,async()=>{throw new Error('Should not connect');}));
});
test('iPhone AI photo workflow keeps client PDF separate and requires on-device consent',()=>{
 const app=readFileSync('App.tsx','utf8');
 assert.match(app,/Share this photo with AI\?/);
 assert.match(app,/inspectPhotoWithDerek\(sharedConfig,session/);
 assert.match(app,/base64:await file\.base64\(\)/);
 assert.match(app,/photoAiNotes\?\.jobId===activeJobId/);
});
