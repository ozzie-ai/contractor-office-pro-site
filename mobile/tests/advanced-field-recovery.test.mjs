import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path){
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports});return m.exports;
}
const {legacyFieldEstimate}=load('src/legacyFieldParity.ts');
const {estimateReadiness,proposalHtml}=load('src/estimate.ts');
const find=(x,id)=>x.lines.find(i=>i.id==='legacy-'+id);
const project=(draft,description,trade)=>({
 trade,contractor:'Contractor Test',customer:'Client',city:'Santa Clarita',description,
 lines:draft.lines,customerScope:draft.customerScope,unknowns:draft.unknowns,
 exclusions:[],futureWork:[],customerNotes:'',language:'en',overheadPct:10,profitPct:20
});

test('EV charger: recognize 65 ft circuit, 50A breaker, 40A charger, owner equipment, $500 permit',()=>{
 const dictation='Install EV charger at 40 amps, 240 volts, 65 ft run with 50 amp breaker. Owner supplies the charger. Permit $500.';
 const r=legacyFieldEstimate(dictation,'electrical');
 assert.equal(r.recognized,true);
 assert.equal(find(r,'ev-run-labor').quantity,65);
 assert.equal(find(r,'ev-wire').quantity,65);
 assert.equal(find(r,'ev-conduit').quantity,65);
 assert.equal(find(r,'ev-breaker').quantity,1);
 assert.equal(find(r,'ev-permit').rate,500);
 assert.equal(find(r,'ev-charger-supply'),undefined);
 assert.equal(r.lines.reduce((n,x)=>n+x.quantity*x.rate,0),65*(8+4+8)+110+350+500);
 assert.equal(estimateReadiness(project(r,dictation,'electrical')).ready,false);
 assert.ok(r.customerScope.en.some(x=>x.includes('Owner supplies')));
});
test('EV charger missing circuit measurements or breaker cannot produce finished quote',()=>{
 const r=legacyFieldEstimate('Install an EV charger for an electric vehicle. The customer supplies charger.','electrical');
 assert.equal(r.recognized,true);
 assert.equal(find(r,'ev-route-review').quantity,0);
 assert.equal(find(r,'ev-breaker-review').quantity,0);
 assert.equal(find(r,'ev-permit-review').quantity,0);
 assert.equal(estimateReadiness(project(r,'EV charger','electrical')).ready,false);
});
test('EV panel upgrade mentioned separately cannot be silently omitted',()=>{
 const r=legacyFieldEstimate('Upgrade the panel and install EV charger with 50 ft run and 50 amp breaker, 40 amp charger, 240 volts; permit $500.','electrical');
 assert.ok(find(r,'ev-panel-review'));
 assert.equal(estimateReadiness(project(r,'Panel and EV','electrical')).ready,false);
});
test('EV charger breaker is not automatically inferred from charge current',()=>{
 const r=legacyFieldEstimate('Install 240 V EV charger at 40 amps, 40 ft run; permit $350. Owner supplies the charger.','electrical');
 assert.equal(find(r,'ev-breaker-review').quantity,0);
 assert.ok(!find(r,'ev-breaker'));
});
test('kitchen 10x10: preserve unknown cabinet LF and quartz area, but measure floor; breakfast bar pending',()=>{
 const speech='Remodel kitchen 10 x 10 feet. Demolish existing cabinets. Install white shaker L shape cabinets with quartz countertop and breakfast bar for three. Replace tile floor and install kitchen sink.';
 const r=legacyFieldEstimate(speech,'remodel');
 assert.equal(r.recognized,true);
 assert.equal(find(r,'kitchen-demo').rate,1100);
 assert.equal(find(r,'kitchen-cabinets-review').quantity,0);
 assert.equal(find(r,'kitchen-quartz-review').quantity,0);
 assert.equal(find(r,'kitchen-floor-prep').quantity,100);
 assert.equal(find(r,'kitchen-tile-material').quantity,110);
 assert.equal(find(r,'kitchen-tile-labor').quantity,100);
 assert.equal(find(r,'kitchen-breakfast-bar').quantity,0);
 assert.equal(estimateReadiness(project(r,speech,'remodel')).ready,false);
 assert.ok(r.unknowns.some(x=>x.includes('cabinet linear feet')));
});
test('kitchen measured 16 linear ft cabinets and 40 square ft quartz has independent install & material pricing',()=>{
 const speech='Remodel kitchen 10 x 10 feet, install 16 linear feet of cabinets and 40 sq ft quartz, replace tile floor.';
 const r=legacyFieldEstimate(speech,'remodel');
 assert.equal(find(r,'kitchen-cabinets-material').quantity,16);
 assert.equal(find(r,'kitchen-cabinets-labor').quantity,16);
 assert.equal(find(r,'kitchen-quartz-material').quantity,40);
 assert.equal(find(r,'kitchen-quartz-install').quantity,40);
 assert.equal(find(r,'kitchen-tile-labor').quantity,100);
 assert.equal(find(r,'kitchen-cabinets-review'),undefined);
 assert.equal(find(r,'kitchen-quartz-review'),undefined);
 assert.equal(estimateReadiness(project(r,speech,'remodel')).ready,false);
 const accepted={...project(r,speech,'remodel'),lines:r.lines.map(x=>({...x,rateSource:'Contractor-reviewed allowance'}))};
 assert.equal(estimateReadiness(accepted).ready,true);
 const html=proposalHtml(accepted,'proposal');
 assert.ok(html.includes('Supply and install the selected kitchen cabinet layout'));
 assert.ok(html.includes('Fabricate and install measured quartz'));
 assert.ok(!html.includes('Cabinet module materials'));
 assert.ok(!html.includes('40 sq ft quartz'));
 assert.ok(!html.includes('$280.00'));
});
test('restored kitchen or EV workflows never respond to unrelated painting or bathroom descriptions',()=>{
 assert.equal(legacyFieldEstimate('Paint living room 10 x 15 two coats.','remodel'),null);
 assert.equal(legacyFieldEstimate('Replace vanity mirror in bathroom 5 x 7.','remodel'),null);
 assert.equal(legacyFieldEstimate('Replace panel 100A to 200A; 20 circuits.','electrical'),null);
});

test('EV with route, breaker and permit but missing charger current or voltage stays incomplete',()=>{
 const phrase='Install EV charger with 65 ft run and 50 amp breaker. Permit $500. Owner supplies charger.';
 const r=legacyFieldEstimate(phrase,'electrical');
 assert.equal(find(r,'ev-current-review').quantity,0);
 assert.equal(find(r,'ev-voltage-review').quantity,0);
 assert.equal(estimateReadiness(project(r,phrase,'electrical')).ready,false);
});
test('undersized EV breaker cannot be approved without resolving circuit sizing',()=>{
 const phrase='Install EV charger at 40 amps 240 volts, 40 ft run with 40 amp breaker. Owner supplies charger. Permit $500.';
 const r=legacyFieldEstimate(phrase,'electrical');
 assert.ok(find(r,'ev-sizing-review'));
 assert.equal(estimateReadiness(project(r,phrase,'electrical')).ready,false);
});
