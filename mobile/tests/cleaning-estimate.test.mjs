import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const load=(name)=>{const filename=path.resolve('src/'+name+'.ts');const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};vm.runInNewContext(js,{module,exports:module.exports,require:createRequire(import.meta.url)});return module.exports;};
const {priceCleaning,cleaningToProject}=load('cleaningEstimate');
const {proposalHtml,totals,TRADES}=load('estimate');
const c={type:'residential',frequency:'twice_monthly',bedrooms:3,bathrooms:2,livingRooms:2,areaSqFt:1800,workers:2,firstHoursPerWorker:5,repeatHoursPerWorker:3,laborCostPerHour:25,firstSupplies:25,repeatSupplies:15,travelPerVisit:15};
test('cleaning calculates first deep clean and repeat visit separately',()=>{
 const q=priceCleaning(c,10,20);
 assert.equal(q.initialBase,290);
 assert.ok(Math.abs(q.initialPrice-382.8)<0.001);
 assert.equal(q.recurringBase,180);
 assert.ok(Math.abs(q.recurringPrice-237.6)<0.001);
 assert.equal(q.lines.length,1);
});
test('cleaning does not double-charge recurring visits in first-visit total',()=>{
 const priced=cleaningToProject(c,{overheadPct:10,profitPct:20});
 assert.equal(priced.cleaning.repeatPricePerVisit,237.6);
 assert.ok(Math.abs(totals({...priced,overheadPct:10,profitPct:20}).total-382.8)<0.001);
});
test('bilingual cleaning proposal displays separate recurring price without private notes',()=>{
 const priced=cleaningToProject(c,{overheadPct:10,profitPct:20});
 const project={...priced,trade:'cleaning',contractor:'Cleaning Co',customer:'Client',city:'Santa Clarita',address:'123 Sample Street',description:'PRIVATE VOICE DICTATION',customerNotes:'',exclusions:[],futureWork:[],status:'sent',followUpNotes:'PRIVATE FOLLOWUP',language:'es',overheadPct:10,profitPct:20};
 const html=proposalHtml(project,'proposal');
 assert.ok(html.includes('PROPUESTA DE TRABAJO'));
 assert.ok(html.includes('SERVICIO RECURRENTE'));
 assert.ok(html.includes('237.60'));
 assert.equal(html.includes('PRIVATE VOICE'),false);
 assert.equal(html.includes('PRIVATE FOLLOWUP'),false);
 assert.equal(TRADES.cleaning.en,'Cleaning Services');
});
test('rejects invalid crew-size so no misleading zero price',()=>{
 assert.throws(()=>priceCleaning({...c,workers:0},10,20));
});
