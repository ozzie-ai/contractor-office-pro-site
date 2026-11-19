import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
function resolvePaintingModule(id){
 if(id==='./legacyFieldParity'){
  const js=ts.transpileModule(fs.readFileSync('src/legacyFieldParity.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const p={exports:{}};
  vm.runInNewContext(js,{module:p,exports:p.exports});
  return p.exports;
 }
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


test('mixed existing-wiring dictation prices 2 switches + 2 regular + 3 GFCI for contractor review',()=>{
 const description='Need to replace two switches, two regular outlets, wiring is already in place, and three GFCIs.';
 const parsed=localEstimate(description,'electrical');
 const item=(id)=>parsed.lines.find(x=>x.id==='local-'+id);
 assert.equal(item('standard-switches')?.quantity,2);
 assert.equal(item('standard-outlets')?.quantity,2);
 assert.equal(item('gfci')?.quantity,3);
 assert.equal(parsed.lines.length,3,'Mixed electrical scope may not omit any device');
 const preliminary=suggestPreliminaryPrices('electrical',parsed.lines,description);
 assert.equal(preliminary.suggested,3);
 assert.equal(preliminary.lines.find(x=>x.id==='local-standard-switches')?.rate,105);
 assert.equal(preliminary.lines.find(x=>x.id==='local-standard-outlets')?.rate,95);
 assert.equal(preliminary.lines.find(x=>x.id==='local-gfci')?.rate,145);
 assert.equal(preliminary.lines.reduce((sum,x)=>sum+x.quantity*x.rate,0),835);
 assert.equal(Math.round(estimate.totals({lines:preliminary.lines,overheadPct:10,profitPct:20}).total*100)/100,1102.2);
 assert.equal(estimate.estimateReadiness({lines:preliminary.lines}).ready,false,'preliminary quote must require approval');
 assert.ok(preliminary.notes.some(x=>x.includes('UNVERIFIED')));
 const approved=preliminary.lines.map(x=>({...x,rateSource:'Contractor-reviewed device planning allowance'}));
 assert.equal(estimate.estimateReadiness({lines:approved}).ready,true);
 const app=fs.readFileSync('App.tsx','utf8');
 assert.match(app,/Approve these reviewed rates for this job/);
});
test('Spanish reordered device dictation recognizes all three quantities',()=>{
 const parsed=localEstimate('Cambiar dos switches, dos outlets regulares y tres GFCIs. El cableado ya existe.','electrical');
 const get=id=>parsed.lines.find(x=>x.id==='local-'+id)?.quantity;
 assert.equal(get('standard-switches'),2);
 assert.equal(get('standard-outlets'),2);
 assert.equal(get('gfci'),3);
});
test('new wiring does not get device replacement rates',()=>{
 const description='Replace 2 switches, 2 regular outlets and 3 GFCIs with new wiring and circuits.';
 const parsed=localEstimate(description,'electrical');
 const suggested=suggestPreliminaryPrices('electrical',parsed.lines,description);
 assert.equal(suggested.suggested,0);
 assert.ok(suggested.lines.every(x=>x.rate===0));
});


test('five-device dictation: two standard plus three GFCI gets a provisional $625 reviewable amount',()=>{
 const description='Replace five outlets, two normal outlets and three GFCIs.';
 const scope=localEstimate(description,'electrical');
 assert.equal(scope.lines.find(x=>x.id==='local-standard-outlets')?.quantity,2);
 assert.equal(scope.lines.find(x=>x.id==='local-gfci')?.quantity,3);
 const draft=suggestPreliminaryPrices('electrical',scope.lines,description);
 assert.equal(draft.lines.find(x=>x.id==='local-standard-outlets')?.rate,95);
 assert.equal(draft.lines.find(x=>x.id==='local-gfci')?.rate,145);
 assert.equal(draft.lines.reduce((n,x)=>n+x.quantity*x.rate,0),625);
 assert.equal(estimate.estimateReadiness({lines:draft.lines}).ready,false,'Contractor review remains mandatory');
 assert.ok(draft.notes.some(x=>x.includes('Confirm wiring')));
});

test('quick five-device ID variant: two standard and three GFCI receives the same cautious model',()=>{
 const description='Replace 5 outlets total, 2 standard and 3 GFCI.';
 const parsed=localEstimate(description,'electrical');
 assert.equal(parsed.lines.find(x=>x.id==='local-outlets-standard')?.quantity,2);
 assert.equal(parsed.lines.find(x=>x.id==='local-outlets-gfci')?.quantity,3);
 const draft=suggestPreliminaryPrices('electrical',parsed.lines,description);
 assert.equal(draft.lines.reduce((n,x)=>n+x.quantity*x.rate,0),625);
 assert.equal(estimate.estimateReadiness({lines:draft.lines}).ready,false);
});
