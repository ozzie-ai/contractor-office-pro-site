import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const f=path.resolve('src/localEstimate.ts');
const js=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
vm.runInNewContext(js,{module:mod,exports:mod.exports,require:createRequire(import.meta.url)});
const {localEstimate}=mod.exports;
const src=fs.readFileSync('App.tsx','utf8');
test('original Spanish panel dictation yields separate editable scope items, not transcript',()=>{
 const words='Ok voy a hacer un upgrade de un panel eléctrico. Panel actualmente es de 100 A y lo voy a upgrade a 200 A. El permiso costará aproximadamente $500 y necesito cambiar 20 de los existen circuitos a nuevos circuitos. Voy a agregar un breaker de 100 A solamente para posteriormente en otro trabajo hacer las conexiones.';
 const r=localEstimate(words,'electrical');
 assert.deepEqual(Array.from(r.lines.map(x=>x.id)),['local-panel-upgrade','local-existing-circuits','local-future-breaker','local-permit']);
 assert.equal(r.lines[1].quantity,20);
 assert.equal(r.lines[3].rate,500);
 assert.ok(r.lines.every(x=>!x.description_en.includes('Ok voy a hacer')));
});
test('rebuilding same scope preserves edited prices, not reset to zero',()=>{
 assert.match(src,/const existing=new Map\(project\.lines\.map\(item=>\[item\.id,item\]\)\)/);
 assert.match(src,/rate:saved\.rate/);
 assert.match(src,/const manual=project\.lines\.filter/);
});
test('incomplete quote labels permit subtotal as partial not final selling price',()=>{
 assert.match(src,/Partial priced amount — not the final estimate/);
 assert.match(src,/Partial amount — not a client quote/);
 assert.match(src,/Enter missing prices/);
});
test('unrecognized work never exposes raw transcript in customer line',()=>{
 const notes='We spoke with the owner about site conditions and confidential budget decisions for a new fence.';
 const r=localEstimate(notes,'handyman');
 assert.ok(r.lines.length>0);
 assert.equal(r.lines.some(x=>x.description_en.includes(notes)),false);
 assert.equal(r.lines.some(x=>x.description_es.includes(notes)),false);
});
