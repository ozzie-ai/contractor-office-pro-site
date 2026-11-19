import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';

function load(path,required){
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext(js,{module:mod,exports:mod.exports,require:required||createRequire(import.meta.url)});
 return mod.exports;
}
const painting=load('src/paintingEstimate.ts');
const legacyField=load('src/legacyFieldParity.ts');
const local=load('src/localEstimate.ts',id=>id==='./paintingEstimate'?painting:id==='./legacyFieldParity'?legacyField:createRequire(import.meta.url)(id));
const prices=load('src/preliminaryPricing.ts');
const quote=load('src/estimate.ts');

const dictated='Install five new electrical outlets total: three standard outlets and two GFCI outlets. All wiring already exists. Replace the existing devices only.';
const job=(lines,unknowns=[])=>({
 trade:'electrical',contractor:'Contractor Test',customer:'Test Customer',city:'Los Angeles',
 address:'',description:dictated,lines,unknowns,exclusions:[],futureWork:[],
 customerNotes:'',language:'en',overheadPct:10,profitPct:20,status:'draft'
});
test('end-to-end: actual field voice -> two item quantities -> preliminary rates -> approval -> confidential customer PDF',()=>{
 const scope=local.localEstimate(dictated,'electrical');
 assert.equal(scope.recognized,true);
 assert.deepEqual(Array.from(scope.lines,x=>[x.id,x.quantity]),[
  ['local-outlets-standard',3],['local-outlets-gfci',2]
 ]);
 const planning=prices.suggestPreliminaryPrices('electrical',scope.lines,dictated);
 assert.equal(planning.suggested,2);
 assert.equal(planning.lines.reduce((sum,x)=>sum+x.quantity*x.rate,0),819);
 assert.equal(Math.round(quote.totals(job(planning.lines)).total*100)/100,1081.08);
 const review=quote.estimateReadiness(job(planning.lines,scope.unknowns));
 assert.equal(review.ready,false,'unapproved example must never be an export-ready quote');
 assert.ok(review.issues.every(x=>x.includes('approve')));
 const accepted=planning.lines.map(x=>({
  ...x,rateSource:'Contractor-reviewed outlet example / Ejemplo revisado por contratista',
  priceEvidence:{kind:'contractor_entered',detail:'Reviewed illustrative estimate; NOT a live retailer price'}
 }));
 assert.equal(quote.estimateReadiness(job(accepted,scope.unknowns)).ready,true);
 const html=quote.proposalHtml(job(accepted,scope.unknowns),'proposal');
 for(const phrase of ['WORK PROPOSAL','Test Customer','Replace 3 standard receptacles','Replace 2 GFCI receptacles','$1,081.08'])
  assert.ok(html.includes(phrase),'Missing customer output '+phrase);
 for(const privateText of [dictated,'$140.00','$199.50','Overhead','Profit','NOT a live retailer price'])
  assert.equal(html.includes(privateText),false,'Internal item leaked to customer PDF: '+privateText);
});
test('end-to-end: unrelated or incomplete wiring scope is not given the historical outlet example',()=>{
 const description='Install five outlets with two GFCI on brand new circuits and new wiring.';
 const scope=local.localEstimate(description,'electrical');
 const price=prices.suggestPreliminaryPrices('electrical',scope.lines,description);
 assert.equal(price.suggested,0);
 assert.equal(quote.estimateReadiness(job(price.lines)).ready,false);
});
test('app preserves the local path without sign-in and prompts for independent approval',()=>{
 const app=fs.readFileSync('App.tsx','utf8');
 assert.match(app,/const draft=localEstimate\(project\.description,project\.trade/);
 assert.match(app,/suggestPreliminaryPrices\(project\.trade,lines,project\.description\)/);
 assert.match(app,/showCloudSettings&&/);
 assert.match(app,/Approve reviewed outlet allowances/);
 assert.match(app,/saveJob\(\{id:activeJobId/);
 assert.match(app,/const pdfReady=readiness\.ready/);
});

test('unified 0.1.1 seven-device job produces a reviewable private PDF after approval',()=>{
 const speech='Need to replace two switches, two regular outlets, wiring is already in place, and three GFCIs.';
 const scope=local.localEstimate(speech,'electrical');
 assert.deepEqual(Array.from(scope.lines,x=>[x.id,x.quantity]),[
  ['local-standard-outlets',2],['local-gfci',3],['local-standard-switches',2]
 ]);
 const priced=prices.suggestPreliminaryPrices('electrical',scope.lines,speech);
 assert.equal(priced.suggested,3);
 assert.equal(quote.estimateReadiness({lines:priced.lines}).ready,false);
 const approved=priced.lines.map(x=>({
  ...x,
  rateSource:'Contractor-reviewed device planning allowance',
  priceEvidence:{kind:'contractor_entered',detail:'Contractor explicitly reviewed illustrative cost'}
 }));
 const draft={...job(approved),description:speech,unknowns:scope.unknowns};
 assert.equal(quote.estimateReadiness(draft).ready,true);
 assert.equal(Math.round(quote.totals(draft).total*100)/100,1102.2);
 const html=quote.proposalHtml(draft,'proposal');
 for(const visible of ['Replace 2 standard receptacles','Replace 3 GFCI receptacles','Replace 2 standard wall switches','$1,102.20'])
  assert.ok(html.includes(visible),'Client output missing '+visible);
 for(const privateValue of [speech,'$95.00','$145.00','$105.00','Overhead','Profit','Contractor explicitly reviewed illustrative cost'])
  assert.equal(html.includes(privateValue),false,'Private cost or dictation leaked: '+privateValue);
});


test('Tad real PDF acceptance: show 2 regular and 3 GFCI line selling prices, never private markup',()=>{
 const speech='Necesito reemplazar cinco outlets existing wiring. Dos de ellos son regular outlets y tres de ellos son GFCI.';
 const scope=local.localEstimate(speech,'electrical');
 const prelim=prices.suggestPreliminaryPrices('electrical',scope.lines,speech);
 const approved=prelim.lines.map(x=>({...x,rateSource:'Contractor-reviewed device planning allowance',priceEvidence:{kind:'contractor_entered',detail:'Private actual purchase cost $12.34'}}));
 const project={...job(approved),description:speech,customer:'Tad',contractor:'Got a hand',
  city:'32140 Windrush Rd CA 91390',overheadPct:10,profitPct:20};
 assert.equal(quote.estimateReadiness(project).ready,true);
 assert.equal(Math.round(quote.totals(project).total*100)/100,825);
 const html=quote.proposalHtml(project,'estimate');
 assert.match(html,/<b>Job site:<\/b> 32140 Windrush Rd CA 91390/);
 assert.doesNotMatch(html,/<b>City:<\/b> 32140/);
 assert.match(html,/<td>Replace 2 standard receptacles[^<]*<\/td><td>2<\/td><td>each<\/td><td>\$250\.80<\/td>/);
 assert.match(html,/<td>Replace 3 GFCI receptacles[^<]*<\/td><td>3<\/td><td>each<\/td><td>\$574\.20<\/td>/);
 assert.match(html, /Estimated price/);
 assert.match(html, /\$825\.00/);
 for(const internal of ['$95.00','$145.00','$190.00','$435.00','Overhead','Profit','Private actual purchase cost','contractor-entered']){
  assert.equal(html.includes(internal),false,'Private estimate value leaked: '+internal);
 }
});

test('all-trades proposal: itemized selling prices, hidden job-cost rows, cents reconcile',()=>{
 const rows=[
  {id:'plumbing1',description_en:'Replace bathroom faucet',description_es:'Cambiar grifo',quantity:1,unit:'each',rate:175,status:'included_now'},
  {id:'plumbing2',description_en:'Repair drain',description_es:'Reparar desagüe',quantity:2,unit:'each',rate:85,status:'included_now'},
  {id:'internal',description_en:'Labor internal allocation',description_es:'Mano de obra costo interno',quantity:1,unit:'job',rate:50,status:'included_now'}
 ];
 for(const trade of ['plumbing','painting','concrete','handyman','remodel','electrical']){
  const p={...job(rows),trade,city:'Santa Clarita',address:'12 Test Way, Santa Clarita, CA',
   overheadPct:7,profitPct:11,description:'private contractor dictation do not print',language:'en'};
  const html=quote.proposalHtml(p,'proposal');
  assert.match(html,/<b>Job site:<\/b> 12 Test Way/);
  assert.equal((html.match(/<tr><td>Replace bathroom faucet<\/td>/g)||[]).length,1);
  assert.match(html,/<td>Repair drain<\/td><td>2<\/td><td>each<\/td><td>\$/);
  assert.ok(!html.includes('Labor internal allocation'));
  assert.ok(!html.includes('private contractor dictation'));
  const amounts=Array.from(html.matchAll(/<tr><td>[^<]*<\/td><td>\d+<\/td><td>[^<]*<\/td><td>\$([\d,]+\.\d{2})<\/td><\/tr>/g)).map(x=>Math.round(Number(x[1].replaceAll(',',''))*100));
  const expected=Math.round(quote.totals(p).total*100);
  assert.equal(amounts.reduce((n,x)=>n+x,0),expected,'Client items must sum exactly to final total for '+trade);
 }
});

test('Spanish proposal itemization escapes user input and preserves cleaning bundle',()=>{
 const row={id:'test',description_en:'Replace <valve>',description_es:'Cambiar <válvula>',quantity:1,unit:'each',rate:101,status:'included_now'};
 const p={...job([row]),language:'es',city:'Santa Clarita',customer:'A < B',overheadPct:10,profitPct:10};
 const html=quote.proposalHtml(p,'proposal');
 assert.match(html,/Cambiar &lt;válvula&gt;/);
 assert.match(html,/A &lt; B/);
 assert.match(html,/<b>Ciudad:<\/b> Santa Clarita/);
 assert.ok(!html.includes('Gastos generales'));
 assert.ok(!html.includes('Utilidad'));
 assert.match(html,/\$122\.21/);
 const clean={...p,trade:'cleaning',language:'en'};
 const cleanHtml=quote.proposalHtml(clean,'proposal');
 assert.match(cleanHtml,/Included work — total project price/);
 assert.match(cleanHtml,/\$122\.21/);
});
