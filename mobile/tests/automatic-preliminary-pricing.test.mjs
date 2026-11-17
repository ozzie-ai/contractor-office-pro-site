import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
function resolvePaintingModule(id){
 if(id==='./paintingEstimate'){
  const js=ts.transpileModule(fs.readFileSync('src/paintingEstimate.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const p={exports:{}};
  vm.runInNewContext(js,{module:p,exports:p.exports,require:createRequire(import.meta.url)});
  return p.exports;
 }
 return createRequire(import.meta.url)(id);
}
function load(file,requireFn){
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require:requireFn||resolvePaintingModule});
 return m.exports;
}
const {localEstimate}=load('src/localEstimate.ts');
const {suggestPreliminaryPrices}=load('src/preliminaryPricing.ts');
const estimate=load('src/estimate.ts');
const script='Ok voy a hacer un upgrade de un panel eléctrico. Panel actualmente es de 100 A y lo voy a upgrade a 200 A. El permiso costará aproximadamente $500 y necesito cambiar 20 de los existen circuitos a nuevos circuitos. Voy a agregar un breaker de 100 A solamente para posteriormente en otro trabajo hacer las conexiones.';
test('quoted electrical example produces a usable, editable and non-$660 preliminary estimate',()=>{
 const parsed=localEstimate(script,'electrical');
 const quote=suggestPreliminaryPrices('electrical',parsed.lines);
 assert.equal(quote.lines.length,4);
 assert.equal(quote.lines[0].rate,2100);
 assert.equal(quote.lines[1].quantity,20);
 assert.equal(quote.lines[1].rate,35);
 assert.equal(quote.lines[2].rate,220);
 assert.equal(quote.lines[3].rate,500);
 assert.ok(quote.lines.every(x=>x.rate>0));
 const total=estimate.totals({lines:quote.lines,overheadPct:10,profitPct:20});
 assert.equal(total.total,4646.4);
 assert.equal(estimate.estimateReadiness({lines:quote.lines}).ready,true);
 assert.equal(quote.suggested,3);
 assert.ok(quote.notes.some(x=>x.includes('NOT live quotes')||x.includes('not live quotes')));
});
test('quoted permit and edited contractor rates never get overwritten',()=>{
 const p=localEstimate(script,'electrical');
 p.lines[0].rate=3200;
 const q=suggestPreliminaryPrices('electrical',p.lines);
 assert.equal(q.lines[0].rate,3200);
 assert.equal(q.lines[3].rate,500);
});
test('a permit-only transcript does not hallucinate a panel or fake whole-job quote',()=>{
 const p=localEstimate('Electrical permit cost $500.','electrical');
 const q=suggestPreliminaryPrices('electrical',p.lines);
 assert.equal(q.suggested,0);
 assert.equal(q.lines.length,1);
 assert.equal(estimate.totals({lines:q.lines,overheadPct:10,profitPct:20}).total,660);
});
test('the native app actually calls automatic pricing during Create Work Items',()=>{
 const app=fs.readFileSync('App.tsx','utf8');
 assert.match(app,/const suggested=suggestPreliminaryPrices\(project\.trade,lines,project\.description\)/);
 assert.match(app,/lines:\[\.\.\.suggested\.lines,\.\.\.manual\]/);
});

test('specific device-only replacement gets a nonzero but explicitly unapproved preliminary breakdown',()=>{
 const description='Install five new electrical outlets total: three standard outlets and two GFCI outlets. All wiring already exists. Replace the existing devices only.';
 const p=localEstimate(description,'electrical');
 const q=suggestPreliminaryPrices('electrical',p.lines,description);
 assert.equal(q.lines.length,2);
 assert.equal(q.lines.find(x=>x.id==='local-outlets-standard').quantity,3);
 assert.equal(q.lines.find(x=>x.id==='local-outlets-gfci').quantity,2);
 assert.equal(q.lines.find(x=>x.id==='local-outlets-standard').rate,140);
 assert.equal(q.lines.find(x=>x.id==='local-outlets-gfci').rate,199.5);
 assert.equal(q.lines.reduce((n,x)=>n+x.quantity*x.rate,0),819);
 assert.equal(Math.round(estimate.totals({lines:q.lines,overheadPct:10,profitPct:20}).total*100)/100,1081.08);
 assert.equal(estimate.estimateReadiness({lines:q.lines}).ready,false);
 assert.ok(q.notes.some(x=>x.includes('NOT approved')));
});
test('uncertain wiring or new installation cannot inherit example replacement prices',()=>{
 const descriptions=[
  'Install five new electrical outlets: three standard and two GFCI outlets.',
  'Run new wiring for five outlets, two GFCI outlets.'
 ];
 for(const description of descriptions){
  const parsed=localEstimate(description,'electrical');
  const quote=suggestPreliminaryPrices('electrical',parsed.lines,description);
  assert.equal(quote.suggested,0);
  assert.ok(quote.lines.every(x=>x.rate===0));
 }
});
test('contractor-entered outlet prices cannot be overwritten by sample pricing',()=>{
 const description='Replace five outlets, two are GFCI; existing wiring.';
 const parsed=localEstimate(description,'electrical');
 parsed.lines[0].rate=175;
 parsed.lines[0].rateSource='Contractor-entered rate';
 const quote=suggestPreliminaryPrices('electrical',parsed.lines,description);
 assert.equal(quote.lines[0].rate,175);
 assert.equal(quote.lines[0].rateSource,'Contractor-entered rate');
});

