import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('src/universalEstimateContract.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(compiled,{module,exports:module.exports});
const {validateInterpretation,validatePricing,reviewUniversalEstimate}=module.exports;
const item=(id,q=1)=>({id,description_en:'Work '+id,description_es:'Trabajo '+id,quantity:q,unit:'job',quantity_status:'stated',included_now:true});
const scope=(items=[item('panel')])=>({schema_version:'1.0',request_id:'one',status:'complete',trade:'electrical',scope_items:items,exclusions:[],future_work:[],questions:[],private_notes:['Never export this transcript or phone number'],confidence:'medium'});
const rate=(id,q=1,r=100)=>({scope_item_id:id,quantity:q,unit:'job',unit_rate:r,extended_amount:q*r,rate_status:'modeled_allowance',source:{title:'Illustrative LA model',assumptions:'Contractor must review local labor and equipment'}});
const prices=(items=[rate('panel')])=>({schema_version:'1.0',request_id:'one',status:'complete',lines:items,priced_subtotal:items.reduce((a,x)=>a+(x.extended_amount||0),0),direct_subtotal:100,overhead:10,profit:22,estimated_total:132,questions:[]});
test('valid backend shape becomes an editable contractor-approved safe review',()=>{
 const s=scope(),p=prices();
 assert.equal(validateInterpretation(s),true);
 assert.equal(validatePricing(p),true);
 const draft=reviewUniversalEstimate(s,p,{},true);
 assert.equal(draft.readyForProposal,true);
 assert.equal(draft.estimatedTotal,132);
 assert.equal(draft.lines[0].id,'panel');
 assert.equal(JSON.stringify(draft).includes('Never export this transcript'),false);
});
test('cannot export unapproved draft even with every price',()=>{
 const d=reviewUniversalEstimate(scope(),prices());
 assert.equal(d.readyForProposal,false);
 assert.ok(d.issues.some(x=>x.includes('Contractor approval')));
});
test('unpriced or missing scope items block proposal, never permit-only final',()=>{
 const s=scope([item('panel'),item('circuits',20),item('permit')]);
 const p=prices([rate('permit')]);
 const d=reviewUniversalEstimate(s,p,{},true);
 assert.equal(d.readyForProposal,false);
 assert.equal(d.estimatedTotal,null);
 assert.ok(d.issues.some(x=>x.includes('panel')));
 assert.ok(d.issues.some(x=>x.includes('circuits')));
});
test('unknown quantities must stay null and block final quote',()=>{
 const s=scope([{...item('concrete'),quantity:null,quantity_status:'unknown'}]);
 const p=prices([{...rate('concrete'),quantity:null,unit_rate:null,extended_amount:null,rate_status:'unavailable'}]);
 const d=reviewUniversalEstimate(s,p,{},true);
 assert.equal(d.readyForProposal,false);
 assert.ok(d.issues.some(x=>x.includes('Unknown quantity')));
});
test('model price needs assumptions; verified price needs date and region',()=>{
 const s=scope();
 const withoutAssumptions=prices([{...rate('panel'),source:{title:'Model only'}}]);
 assert.equal(reviewUniversalEstimate(s,withoutAssumptions,{},true).readyForProposal,false);
 const fakeVerified=prices([{...rate('panel'),rate_status:'verified_reference',source:{title:'Website'}}]);
 assert.equal(reviewUniversalEstimate(s,fakeVerified,{},true).readyForProposal,false);
});
test('detects mismatched IDs, conflicting quantities, arithmetic errors and unknown work',()=>{
 const s=scope();
 assert.equal(reviewUniversalEstimate(s,{...prices(),request_id:'two'},{},true).readyForProposal,false);
 assert.equal(reviewUniversalEstimate(s,prices([{...rate('panel'),quantity:2}]),{},true).readyForProposal,false);
 assert.equal(reviewUniversalEstimate(s,prices([{...rate('panel'),extended_amount:250}]),{},true).readyForProposal,false);
 assert.equal(reviewUniversalEstimate(s,prices([rate('other')]),{},true).readyForProposal,false);
});
test('manual price overrides survive, but require re-running totals before PDF',()=>{
 const d=reviewUniversalEstimate(scope(),prices(),{panel:240},true);
 assert.equal(d.lines[0].rate,240);
 assert.equal(d.readyForProposal,false);
 assert.equal(d.estimatedTotal,null);
 assert.ok(d.issues.some(x=>x.includes('Recalculate')));
});
test('bad arrays, zero rates and duplicated ids are rejected',()=>{
 assert.equal(validateInterpretation({...scope(),scope_items:[item('x'),item('x')]}),false);
 assert.equal(validateInterpretation({...scope(),scope_items:[{...item('x'),quantity:null,quantity_status:'stated'}]}),false);
 assert.equal(validatePricing({...prices(),lines:[{...rate('panel'),unit_rate:0}]}),false);
 assert.equal(validatePricing({...prices(),lines:[rate('panel'),rate('panel')]}),false);
});
test('six cross-trade acceptance examples exist for future Derek integration',()=>{
 const fixture=JSON.parse(fs.readFileSync('../docs/fixtures/universal-estimator-acceptance.json','utf8'));
 const trades=new Set(fixture.cases.map(x=>x.trade));
 for(const t of ['electrical','remodel','cleaning','concrete','plumbing'])assert.ok(trades.has(t));
 assert.equal(fixture.cases.length,6);
});
