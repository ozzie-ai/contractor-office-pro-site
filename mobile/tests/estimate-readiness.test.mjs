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
const {estimateReadiness,proposalHtml,totals,money,JOB_STATUSES}=mod.exports;
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
 assert.ok(Math.abs(totals(p).total-88*18*1.1*1.2)<0.001);
});
test('customer PDF excludes internal dictated transcript',()=>{
 const p={...sample,lines:[item(88)]};
 const html=proposalHtml(p);
 assert.ok(html.includes('Tile shower walls'));
 assert.equal(html.includes('PRIVATE JOB NOTES'),false);
});

test('formal proposal contains proposal title but not private follow-up notes or transcript',()=>{
 const p={...sample,status:'sent',followUpNotes:'PRIVATE: ask client to call on Monday',followUpDate:'2026-11-15',lines:[item(88)]};
 const html=proposalHtml(p,'proposal');
 assert.ok(html.includes('WORK PROPOSAL'));
 assert.equal(html.includes('PRIVATE JOB NOTES'),false);
 assert.equal(html.includes('PRIVATE: ask client'),false);
 assert.ok(html.includes('Tile shower walls'));
});
test('Every trade customer PDF hides individual labor, material purchase rates, overhead and profit',()=>{
 const trades=['electrical','plumbing','painting','concrete','handyman','remodel','cleaning'];
 for(const trade of trades){
  const p={...sample,trade,cleaning:undefined,unknowns:[],lines:[
   {id:'material',description_en:'Interior eggshell paint',description_es:'Pintura eggshell interior',quantity:9,unit:'gal',rate:37.98,status:'allowance_to_confirm'},
   {id:'labor',description_en:'Painting labor total crew hours',description_es:'Mano de obra horas totales',quantity:38.5,unit:'hr',rate:60,status:'allowance_to_confirm'},
   {id:'mobilization',description_en:'Mobilization and purchasing cost',description_es:'Movilización y compras',quantity:1,unit:'job',rate:75,status:'allowance_to_confirm'}
  ]};
  const html=proposalHtml(p);
  assert.ok(html.includes('Interior eggshell paint'),trade+' scope missing');
  assert.ok(html.includes('total project price'),trade+' bundled selling price missing');
  for(const leaked of ['Painting labor total crew hours','Mobilization and purchasing cost','$37.98','$60.00','$75.00','Overhead','Profit markup','>Profit<','>Subtotal<'])assert.equal(html.includes(leaked),false,trade+' leaked '+leaked);
  assert.ok(html.includes(money(totals(p).total)),trade+' selling price missing');
 }
});
test('Shared actionable missing scope detector recognizes omitted dimensions but not ordinary planning cautions',()=>{
 const {estimationScopeIssues}=mod.exports;
 const issues=estimationScopeIssues({unknowns:[
  'Living-room area not measured; not included in priced quantities',
  'Normal prep only, verify wall condition',
  'Missing quantity for outlets',
  'Living-room area not measured; not included in priced quantities'
 ]});
 assert.equal(issues.length,2);
 assert.ok(issues.some(x=>x.includes('Living-room')));
 assert.ok(issues.some(x=>x.includes('outlets')));
});
test('follow-up pipeline provides six status choices',()=>{
 assert.deepEqual(Object.keys(JOB_STATUSES).sort(),['accepted','completed','declined','draft','in_progress','sent'].sort());
});

test('Material price provenance is correctly classified in all trades, never invented as live',()=>{
 const {itemCostEvidence,priceEvidenceSummary}=mod.exports;
 for(const trade of ['electrical','plumbing','painting','concrete','handyman','remodel','cleaning']){
  const lines=[
   {...item(3,37.98),priceEvidence:{kind:'cached_retail_reference',merchant:'Home Depot',observedOn:'2026-11-11'}},
   {...item(2,45),id:'unverified',rateSource:'Illustrative pricing assumption'},
   {...item(1,20),id:'contractor',rateSource:'Contractor-entered rate / Tarifa ingresada por contratista'}
  ];
  const counts=priceEvidenceSummary(lines);
  assert.equal(counts.cached_retail_reference,1,trade);
  assert.equal(counts.planning_allowance,1,trade);
  assert.equal(counts.contractor_entered,1,trade);
  assert.equal(itemCostEvidence(lines[1]).kind,'planning_allowance');
 }
});
