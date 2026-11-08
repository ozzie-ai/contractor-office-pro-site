import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';

const js=ts.transpileModule(fs.readFileSync(path.resolve('src/electricalItems.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(js,{module,exports:module.exports,require:createRequire(import.meta.url)});
const {upsertRecessedLights}=module.exports;
const dimmer={id:'local-dimmer',description_en:'Replace dimmer',description_es:'Reemplazar dimmer',quantity:1,unit:'each',rate:175,status:'allowance_to_confirm'};
test('upsert 5 lights preserves dimmer and creates correct quantity',()=>{
 const r=upsertRecessedLights([dimmer],5,8);
 assert.equal(r.length,2);
 assert.equal(r[0].id,'local-dimmer');
 assert.equal(r[1].quantity,5);
 assert.match(r[1].description_en,/8 ft ceiling/);
});
test('readding lights does not duplicate work and preserves edited rate',()=>{
 const r=upsertRecessedLights([dimmer,{...upsertRecessedLights([],5,8)[0],rate:390}],5,8);
 assert.equal(r.length,2);
 assert.equal(r[1].rate,390);
});
