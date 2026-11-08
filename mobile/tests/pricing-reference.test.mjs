import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const js=ts.transpileModule(fs.readFileSync(path.resolve('src/pricingReference.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(js,{module,exports:module.exports,require:createRequire(import.meta.url),console});
const {calculateUnitRate,LA_ELECTRICIAN_MEAN_WAGE_Q1_2026,ELECTRICAL_REFERENCES}=module.exports;

test('Los Angeles wage reference has explicit source and does not invent hours',()=>{
 assert.equal(LA_ELECTRICIAN_MEAN_WAGE_Q1_2026,40.57);
 assert.equal(ELECTRICAL_REFERENCES['local-panel-upgrade'].recommendedHours,null);
 assert.equal(ELECTRICAL_REFERENCES['local-existing-circuits'].recommendedHours,null);
});
test('Calculate transparent direct costs before overhead and profit',()=>{
 const out=calculateUnitRate({hoursPerUnit:2,materialsPerUnit:75,equipmentPerUnit:10,hourlyWage:40.57,laborBurdenMultiplier:1.35});
 assert.ok(Math.abs(out.laborPerUnit-109.539)<0.000001);
 assert.equal(out.rate,194.54);
});
test('Reject negative inputs and unreasonable burden multiplier',()=>{
 assert.throws(()=>calculateUnitRate({hoursPerUnit:-1,materialsPerUnit:0,equipmentPerUnit:0,hourlyWage:40.57,laborBurdenMultiplier:1.35}));
 assert.throws(()=>calculateUnitRate({hoursPerUnit:1,materialsPerUnit:0,equipmentPerUnit:0,hourlyWage:40.57,laborBurdenMultiplier:0}));
});
