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
 assert.match(app,/const suggested=suggestPreliminaryPrices\(project\.trade,lines\)/);
 assert.match(app,/lines:\[\.\.\.suggested\.lines,\.\.\.manual\]/);
});
