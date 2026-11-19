import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(filename){
 const source=fs.readFileSync(filename,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports});
 return mod.exports;
}
const {legacyFieldEstimate}=load('src/legacyFieldParity.ts');
const {estimateReadiness,totals,proposalHtml}=load('src/estimate.ts');
const item=(draft,tail)=>draft.lines.find(x=>x.id==='legacy-'+tail);
test('recover old concrete takeoff: 10x20 ft at 6 inches has accurate yardage, forms, prep and finishing components',()=>{
 const job='Pour new broom-finish concrete patio 10 x 20 feet and 6 inches thick. Use wire mesh. Direct truck access.';
 const draft=legacyFieldEstimate(job,'concrete');
 assert.equal(draft.recognized,true);
 assert.equal(item(draft,'site-grade').quantity,200);
 assert.equal(item(draft,'forms').quantity,60);
 assert.equal(item(draft,'ready-mix').quantity,4.1);
 assert.equal(item(draft,'reinforcement').quantity,200);
 assert.equal(item(draft,'place-finish').quantity,200);
 assert.ok(draft.lines.length>=8,'Should restore the breakdown instead of one zero item');
 assert.ok(draft.lines.every(x=>x.rate>0));
 const price=totals({lines:draft.lines,overheadPct:10,profitPct:20});
 assert.ok(price.total>3000);
 assert.equal(estimateReadiness(draft).ready,false,'Historic allowances need review before PDF');
});
test('concrete without thickness cannot be given invented yards or a finished quote',()=>{
 const draft=legacyFieldEstimate('Pour a 10 x 20 ft concrete patio with broom finish','concrete');
 assert.equal(draft.recognized,false);
 assert.equal(item(draft,'concrete-dimensions').quantity,0);
 assert.equal(estimateReadiness(draft).ready,false);
});
test('stamped concrete adds specified finish, not to every patio',()=>{
 const stamped=legacyFieldEstimate('Pour a 10 by 20 foot stamped concrete patio 4 inches thick with rebar','concrete');
 assert.ok(item(stamped,'finish-labor'));
 assert.ok(item(stamped,'finish-material'));
 const broom=legacyFieldEstimate('Pour concrete patio 10 by 20 feet 4 inches thick with mesh','concrete');
 assert.equal(item(broom,'finish-labor'),undefined);
});
test('faucet labor from old estimator returns owner-supplied counts in plumbing and handyman',()=>{
 const speech='Replace 2 bathroom sink faucets and 1 kitchen faucet; homeowner supplies faucets.';
 for(const trade of ['plumbing','handyman']){
  const draft=legacyFieldEstimate(speech,trade);
  assert.equal(draft.recognized,true);
  assert.equal(item(draft,'bath-faucet').quantity,2);
  assert.equal(item(draft,'kitchen-faucet').quantity,1);
  assert.equal(item(draft,'faucet-materials'),undefined);
  assert.equal(draft.lines.reduce((n,x)=>n+x.quantity*x.rate,0),375);
  assert.equal(estimateReadiness(draft).ready,false);
 }
});
test('unknown faucet supply does not invent material and does not permit PDF',()=>{
 const draft=legacyFieldEstimate('Replace two bathroom sink faucets','handyman');
 assert.equal(draft.recognized,true);
 assert.equal(item(draft,'faucet-materials').quantity,0);
 assert.equal(estimateReadiness(draft).ready,false);
});
test('approved restored component rates reach customer PDF without private unit costs',()=>{
 const speech='Pour concrete patio 10 by 20 feet 6 inches thick and wire mesh.';
 const draft=legacyFieldEstimate(speech,'concrete');
 const accepted=draft.lines.map(x=>({...x,rateSource:'Contractor-reviewed field pricing'}));
 const p={trade:'concrete',contractor:'Contractor',customer:'Client',city:'Santa Clarita',description:speech,lines:accepted,exclusions:[],futureWork:[],unknowns:[],customerNotes:'',language:'en',overheadPct:10,profitPct:20};
 assert.equal(estimateReadiness(p).ready,true);
 const html=proposalHtml(p,'proposal');
 assert.ok(html.includes('Ready-mix concrete'));
 assert.ok(html.includes('Perimeter formwork'));
 assert.ok(!html.includes(speech));
 assert.ok(!html.includes('$180.00'));
 assert.ok(!html.includes('Profit markup'));
});
