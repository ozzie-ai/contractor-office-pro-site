import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const load=(filename,requireFn)=>{
 const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};
 vm.runInNewContext(js,{module:m,exports:m.exports,require:requireFn||createRequire(import.meta.url)});
 return m.exports;
};
const {reviewUniversalEstimate}=load('src/universalEstimateContract.ts');
const {DEMO_UNIVERSAL_CASES}=load('src/demoUniversalReview.ts');
const demo=DEMO_UNIVERSAL_CASES.find(x=>x.id==='demo-panel');
test('review demo includes five trades but never impersonates live AI data',()=>{
 assert.equal(DEMO_UNIVERSAL_CASES.length,5);
 const trades=new Set(DEMO_UNIVERSAL_CASES.map(x=>x.interpretation.trade));
 for(const trade of ['electrical','remodel','cleaning','concrete','plumbing'])assert.ok(trades.has(trade));
 assert.ok(DEMO_UNIVERSAL_CASES.every(x=>x.interpretation.private_notes.length>0));
 assert.ok(DEMO_UNIVERSAL_CASES.every(x=>x.pricing.lines.every(l=>l.rate_status!=='verified_reference')));
});
test('panel demo includes breaker, 20 circuits and $500 permit',()=>{
 assert.deepEqual(Array.from(demo.interpretation.scope_items.map(x=>x.id)),['panel','circuits','breaker','permit']);
 assert.equal(demo.interpretation.scope_items[1].quantity,20);
 assert.equal(demo.pricing.lines.find(x=>x.scope_item_id==='permit').unit_rate,500);
 const reviewed=reviewUniversalEstimate(demo.interpretation,demo.pricing,{},true);
 assert.equal(reviewed.readyForProposal,true);
 assert.equal(reviewed.estimatedTotal,4646.4);
 assert.equal(JSON.stringify(reviewed).includes('private contractor transcription'),false);
});
test('incomplete trade demos cannot be approved or passed as priced quotes',()=>{
 for(const item of DEMO_UNIVERSAL_CASES.slice(1)){
  const reviewed=reviewUniversalEstimate(item.interpretation,item.pricing,{},true);
  assert.equal(reviewed.readyForProposal,false,item.id);
  assert.equal(reviewed.estimatedTotal,null,item.id);
 }
});
test('review screen has clear labels, actual editing, approval, and opt-in demo only',()=>{
 const ui=fs.readFileSync('src/ContractorEstimateReview.tsx','utf8');
 const dev=fs.readFileSync('src/UniversalReviewDemoScreen.tsx','utf8');
 const app=fs.readFileSync('App.tsx','utf8');
 for(const phrase of ['Approve work and prices','Aprobar trabajo y precios','Preliminary allowance','Precio preliminar','Partial amount — not a quote','Importe parcial — no es cotización','Changing a price automatically recalculates','setEdits','onApprove?.(review)'])assert.ok(ui.includes(phrase),phrase);
 assert.ok(dev.includes('DEMO'));
 assert.ok(dev.includes('No customer document was sent.'));
 assert.ok(app.includes('__DEV__&&showAiReviewDemo'));
 assert.ok(app.includes('Preview AI review (demo only)'));
});
