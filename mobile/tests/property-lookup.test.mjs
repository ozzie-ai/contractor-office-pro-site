import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const filepath=path.resolve('src/propertyLookup.ts');
const js=ts.transpileModule(fs.readFileSync(filepath,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(js,{module,exports:module.exports,require:createRequire(import.meta.url),Date,Number,JSON,RegExp,encodeURIComponent,fetch:async()=>{throw new Error('Unexpected network call');}});
const {findPropertyArea,areaMatchesAddress}=module.exports;
test('unconfigured property service gives an honest fallback and never invents square footage',async()=>{
 const x=await findPropertyArea('123 Main Street, Santa Clarita, CA 91390','');
 assert.equal(x.status,'unavailable');
});
test('property record lookup returns provenance and accepts only valid square footage',async()=>{
 let request='';
 const fake=async(url)=>{request=url;return {ok:true,status:200,json:async()=>({squareFootage:1840,matchedAddress:'123 Main Street, Santa Clarita, CA 91390',source:'RentCast property records'})};};
 const r=await findPropertyArea('123 Main Street, Santa Clarita, CA 91390','https://example.test/api/property-lookup',fake);
 assert.equal(r.status,'found');
 assert.equal(r.property.squareFootage,1840);
 assert.ok(request.includes('123%20Main%20Street'));
 assert.equal(areaMatchesAddress(r.property,'123 Main Street, Santa Clarita, CA 91390'),true);
 assert.equal(areaMatchesAddress(r.property,'456 Other Drive'),false);
});
test('invalid and ambiguous property areas never populate estimates',async()=>{
 const fake=async()=>({ok:true,status:200,json:async()=>({squareFootage:0,source:'Unknown',matchedAddress:'123 Main Street'})});
 const x=await findPropertyArea('123 Main Street, Santa Clarita, CA 91390','https://example.test/lookup',fake);
 assert.equal(x.status,'not_found');
});
test('HTTPS required for private property addresses',async()=>{
 const r=await findPropertyArea('123 Main Street, Santa Clarita, CA 91390','http://example.test/lookup');
 assert.equal(r.status,'error');
});
