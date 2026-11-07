import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const filename=path.resolve('src/estimate.ts');
const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
vm.runInNewContext(js,{module:mod,exports:mod.exports,require:createRequire(import.meta.url)});
const {estimateReadiness,proposalHtml,totals}=mod.exports;
const sample={trade:'remodel',contractor:'Builder',customer:'Customer',city:'Los Angeles',description:'PRIVATE JOB NOTES: DO NOT DISPLAY',lines:[],exclusions:[],futureWork:[],unknowns:[],customerNotes:'',language:'en',overheadPct:10,profitPct:20};
const item=(quantity,rate=18)=>({id:'wall',description_en:'Tile shower walls',description_es:'Loseta en paredes',quantity,unit:'sq ft',rate,status:'allowance_to_confirm'});
test('zero shower wall quantity prevents export readiness',()=>{
 const r=estimateReadiness({...sample,lines:[item(0)]});
 assert.equal(r.ready,false);
 assert.match(r.issues[0],/Tile shower walls/);
});
test('measured quantities and positive rates permit draft export',()=>{
 const p={...sample,lines:[item(88)]};
 assert.equal(estimateReadiness(p).ready,true);
 assert.equal(totals(p).total,88*18*1.1*1.2);
});
test('customer PDF excludes internal dictated transcript',()=>{
 const p={...sample,lines:[item(88)]};
 const html=proposalHtml(p);
 assert.ok(html.includes('Tile shower walls'));
 assert.equal(html.includes('PRIVATE JOB NOTES'),false);
});
