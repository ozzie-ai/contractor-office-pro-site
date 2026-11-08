import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const load=(name)=>{const filename=path.resolve('src/'+name+'.ts');const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};vm.runInNewContext(js,{module,exports:module.exports,require:createRequire(import.meta.url)});return module.exports;};
const {priceCleaning,cleaningToProject,recommendedPostConstructionWorkerHours,isCleaningQuoteCurrent,currentCleaningProject}=load('cleaningEstimate');
const {proposalHtml,totals,TRADES,recurringCleaningPrice}=load('estimate');
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
 assert.ok(html.includes('PLAN DE LIMPIEZA'));
 assert.ok(html.includes('Precio por visita posterior:'));
 assert.ok(html.includes('237.60'));
 assert.equal(html.includes('PRIVATE VOICE'),false);
 assert.equal(html.includes('PRIVATE FOLLOWUP'),false);
 assert.equal(TRADES.cleaning.en,'Cleaning Services');
});
test('rejects invalid crew-size so no misleading zero price',()=>{
 assert.throws(()=>priceCleaning({...c,workers:0},10,20));
});

test('recurring price recalculates with edited profit setting',()=>{
 const priced=cleaningToProject(c,{overheadPct:10,profitPct:20});
 assert.equal(recurringCleaningPrice({...priced,overheadPct:10,profitPct:20}),237.6);
 assert.equal(recurringCleaningPrice({...priced,overheadPct:10,profitPct:15}),227.7);
});

test('one-time cleaning proposal explicitly says one-time and labels service address',()=>{
 const one={...c,frequency:'once'};
 const priced=cleaningToProject(one,{overheadPct:10,profitPct:20});
 const p={...priced,trade:'cleaning',contractor:'Cleaner',customer:'Clarisse',city:'Santa Clarita',address:'123 Test Road',description:'PRIVATE',customerNotes:'',exclusions:[],futureWork:[],language:'en',overheadPct:10,profitPct:20};
 const html=proposalHtml(p,'estimate');
 assert.ok(html.includes('One-time service'));
 assert.ok(html.includes('Service address:'));
 assert.ok(html.includes('123 Test Road'));
 assert.ok(!html.includes('Price per subsequent visit:'));
});
test('recurring cleaning proposal names monthly frequency and price per visit',()=>{
 const monthly={...c,frequency:'twice_monthly'};
 const priced=cleaningToProject(monthly,{overheadPct:10,profitPct:20});
 const p={...priced,trade:'cleaning',contractor:'Cleaner',customer:'Clarisse',city:'Santa Clarita',description:'PRIVATE',customerNotes:'',exclusions:[],futureWork:[],language:'en',overheadPct:10,profitPct:20};
 const html=proposalHtml(p,'proposal');
 assert.ok(html.includes('Twice monthly'));
 assert.ok(html.includes('Price per subsequent visit:'));
 assert.ok(html.includes('237.60'));
});

test('cleaning customer PDF hides direct costs, overhead and profit but shows final service price',()=>{
 const priced=cleaningToProject(c,{overheadPct:10,profitPct:20});
 const p={...priced,trade:'cleaning',contractor:'Cleaning Co',customer:'Client',city:'Santa Clarita',description:'PRIVATE',customerNotes:'',exclusions:[],futureWork:[],language:'en',overheadPct:10,profitPct:20};
 const html=proposalHtml(p);
 assert.ok(html.includes('$382.80'));
 assert.equal(html.includes('$290.00'),false);
 assert.equal(html.includes('Overhead'),false);
 assert.equal(html.includes('Profit'),false);
 assert.equal(html.includes('10%'),false);
 assert.equal(html.includes('worker(s) × 5 hours'),false);
});
test('heavy construction dust produces a detailed scope and a labor time review',()=>{
 const heavy={...c,type:'post_construction',dustLevel:'heavy',areaSqFt:1800,postConstructionTasks:['dust','cabinets','floors']};
 const priced=priceCleaning(heavy,10,20);
 assert.equal(recommendedPostConstructionWorkerHours(heavy),18);
 assert.ok(priced.unknowns.some(x=>x.includes('AREA-BASED LABOR APPLIED')));
 assert.match(priced.lines[0].description_en,/Fine construction dust removal/);
 assert.match(priced.lines[0].description_en,/cabinets/);
 assert.equal(priced.lines[0].description_en.includes('interior windows'),false);
});

test('editing area or crew time invalidates an older cleaning PDF quote',()=>{
 const priced=cleaningToProject({...c,type:'post_construction',areaSqFt:1800},{overheadPct:10,profitPct:20});
 const p={...priced,trade:'cleaning',overheadPct:10,profitPct:20};
 assert.equal(isCleaningQuoteCurrent(p),true);
 assert.equal(isCleaningQuoteCurrent({...p,cleaning:{...p.cleaning,areaSqFt:4034}}),false);
 assert.equal(isCleaningQuoteCurrent({...p,cleaning:{...p.cleaning,firstHoursPerWorker:12}}),false);
 assert.equal(isCleaningQuoteCurrent({...p,overheadPct:15}),false);
 assert.equal(isCleaningQuoteCurrent({...p,cleaningQuoteSignature:undefined}),false);
});
test('recalculating updated square footage refreshes quote signature',()=>{
 const c2={...c,type:'post_construction',areaSqFt:4034,dustLevel:'heavy',workers:2,firstHoursPerWorker:21};
 const quote=cleaningToProject(c2,{overheadPct:10,profitPct:20});
 assert.equal(isCleaningQuoteCurrent({...quote,trade:'cleaning',overheadPct:10,profitPct:20}),true);
 assert.ok(recommendedPostConstructionWorkerHours(c2)>c.workers*c.firstHoursPerWorker);
});

test('large heavy post-construction quote actually prices 41+ worker hours rather than stale 10',()=>{
 const c2={...c,type:'post_construction',dustLevel:'heavy',areaSqFt:4034,workers:2,firstHoursPerWorker:5,firstSupplies:25,travelPerVisit:15};
 const q=priceCleaning(c2,10,20);
 assert.equal(recommendedPostConstructionWorkerHours(c2),41);
 assert.equal(q.initialBase,1065);
 assert.equal(q.initialPrice,1405.8);
 assert.ok(q.initialPrice>382.8);
 assert.ok(q.unknowns.some(s=>s.includes('AREA-BASED LABOR APPLIED')));
});
test('saved cleaning job, on-screen total, and PDF derive same live quote when area changes',()=>{
 const old=cleaningToProject({...c,type:'post_construction',dustLevel:'heavy',areaSqFt:1800},{overheadPct:10,profitPct:20});
 const p={...old,trade:'cleaning',contractor:'Cleaner',customer:'Oswaldo',city:'Santa Clarita',description:'PRIVATE',customerNotes:'',exclusions:[],futureWork:[],language:'en',overheadPct:10,profitPct:20};
 const bigger={...p,cleaning:{...p.cleaning,areaSqFt:4034}};
 const repriced=currentCleaningProject(bigger);
 assert.equal(repriced.lines[0].rate,1065);
 assert.ok(Math.abs(totals(repriced).total-1405.8)<0.001);
 const html=proposalHtml(repriced);
 assert.ok(html.includes('$1,405.80'));
 assert.equal(html.includes('$382.80'),false);
 assert.equal(html.includes('$290.00'),false);
});
test('verified alternative worker-hours can override suggested planning hours explicitly',()=>{
 const c2={...c,type:'post_construction',dustLevel:'heavy',areaSqFt:4034,workers:2,firstHoursPerWorker:5,laborHoursConfirmed:true};
 assert.equal(priceCleaning(c2,10,20).initialBase,290);
});
test('changing dust, workers, hours and cost immediately recomputes cleaning quote',()=>{
 const base={...c,type:'post_construction',areaSqFt:4034,dustLevel:'moderate'};
 const p={...cleaningToProject(base,{overheadPct:10,profitPct:20}),trade:'cleaning',overheadPct:10,profitPct:20};
 const before=totals(currentCleaningProject(p)).total;
 const after=totals(currentCleaningProject({...p,cleaning:{...p.cleaning,dustLevel:'heavy'},profitPct:15})).total;
 assert.ok(after>before);
});
