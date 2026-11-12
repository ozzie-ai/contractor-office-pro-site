import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const js=ts.transpileModule(fs.readFileSync('src/paintingEstimate.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports});
const {mobilePaintingEstimate}=m.exports;
const spoken='OK, este es para pintar tres habitaciones de 15 × 15 pies, una altura en paredes de ocho pies, una cocina de 10 por 15:03 baños de 7 × 5 una mano de primer y dos manos de pintura en la cocina y los baños pintura será semi Glass y las habitaciones y sala será egg Shell de mediana calidad Sherwin Williams o Behr';
const find=(r,id)=>r.lines.find(x=>x.id==='local-paint-'+id);
test('Actual iPhone speech generates useful costed job, not zero placeholder',()=>{
 const r=mobilePaintingEstimate(spoken);
 assert.ok(r,'painting speech not recognized');
 assert.equal(r.recognized,true);
 for(const id of ['eggshell','semigloss','primer','prep','labor','mobilization'])assert.ok(find(r,id),'Missing '+id);
 assert.ok(r.lines.every(x=>x.quantity>0&&x.rate>0),'A zero-priced line was created');
 assert.ok(r.unknowns.some(x=>x.includes('Living-room area not measured')),'Unmeasured living room was not flagged');
});
test('Known room dimensions are not double-counted; kitchen and baths are one shared visit',()=>{
 const r=mobilePaintingEstimate(spoken);
 assert.equal(find(r,'eggshell').quantity,9);
 assert.equal(find(r,'semigloss').quantity,6);
 assert.equal(find(r,'primer').quantity,3);
 assert.equal(find(r,'mobilization').quantity,1);
 assert.ok(find(r,'labor').quantity>=30 && find(r,'labor').quantity<65);
});
test('Do not invent primer when contractor does not mention it',()=>{
 const r=mobilePaintingEstimate('Pintar tres habitaciones 15 x 15 y una cocina 10 x 15 dos manos eggshell en habitaciones y semi-gloss en cocina');
 assert.ok(r);
 assert.equal(find(r,'primer'),undefined);
});
test('Not a painting job remains outside parser',()=>{
 assert.equal(mobilePaintingEstimate('Reemplazar cinco outlets eléctricos'),null);
});
test('Private transcript is not copied into line descriptions',()=>{
 const r=mobilePaintingEstimate(spoken);
 assert.ok(r);
 assert.ok(!r.lines.some(x=>x.description_en.includes('OK, este es')));
});

test('Only missing living room dimensions are requested, then recalculated into eggshell/labor',()=>{
 const old=mobilePaintingEstimate(spoken);
 assert.ok(old);assert.equal(old.missingMeasurements.join(','),'living');
 const filled=mobilePaintingEstimate(spoken,{livingLengthFt:15,livingWidthFt:20});
 assert.ok(filled);
 assert.equal(filled.missingMeasurements.length,0);
 assert.ok(find(filled,'eggshell').quantity>find(old,'eggshell').quantity);
 assert.ok(find(filled,'labor').quantity>find(old,'labor').quantity);
 assert.ok(!filled.unknowns.some(x=>x.includes('Living-room area not measured')));
});
test('Deliberate living room exclusion does not invent or price its area',()=>{
 const r=mobilePaintingEstimate(spoken,{excludeLivingRoom:true});
 assert.ok(r);assert.equal(r.missingMeasurements.length,0);
 assert.equal(find(r,'eggshell').quantity,9);
});
test('Saved retailer reference is dated, while primer and semi-gloss are clearly unverified',()=>{
 const r=mobilePaintingEstimate(spoken);
 assert.ok(r);
 assert.equal(find(r,'eggshell').priceEvidence.kind,'cached_retail_reference');
 assert.equal(find(r,'eggshell').priceEvidence.observedOn,'2026-11-11');
 assert.equal(find(r,'semigloss').priceEvidence.kind,'planning_allowance');
 assert.equal(find(r,'primer').priceEvidence.kind,'planning_allowance');
});
