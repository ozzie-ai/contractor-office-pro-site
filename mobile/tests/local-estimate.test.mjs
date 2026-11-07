import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const file=path.resolve('src/localEstimate.ts');
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const module={exports:{}};
vm.runInNewContext(js,{module,exports:module.exports,require,console});
const {localEstimate}=module.exports;
const find=(r,id)=>r.lines.find(x=>x.id==='local-'+id);

test('3x5 shower, 8ft three walls and 5x7 floor remain separate',()=>{
 const t='Remodelar baño de 5 por 7 pies. Quitar la tina y poner shower de 3 por 5 pies con puerta de vidrio. Las tres paredes se van a poner losa, son de 8 pies de altura. Cambiar el piso del baño. Reinstalar toilet. Vanity de 36 pulgadas con un sink.';
 const r=localEstimate(t,'remodel');
 assert.equal(find(r,'floor').quantity,35);
 assert.equal(find(r,'wall-tile').quantity,88);
 assert.match(find(r,'shower').description_en,/3 × 5 ft/);
 assert.match(find(r,'wall-tile').description_en,/88 sq ft/);
 assert.equal(find(r,'mirror'),undefined);
 assert.equal(find(r,'toilet').description_en,'Remove and reinstall existing toilet');
 assert.match(find(r,'vanity').description_en,/36 in/);
 assert.equal(r.lines.filter(x=>x.id==='local-wall-tile').length,1);
});
test('no invented mirror, walls or floor when unmentioned',()=>{
 const r=localEstimate('Remover tina e instalar shower de 3 por 5 pies con vidrio.', 'remodel');
 assert.ok(find(r,'shower'));
 assert.equal(find(r,'mirror'),undefined);
 assert.equal(find(r,'wall-tile'),undefined);
 assert.equal(find(r,'floor'),undefined);
});
test('unknown shower height gives zero measured wall quantity',()=>{
 const r=localEstimate('Shower 3x5 pies. Poner tile en las paredes.', 'remodel');
 assert.equal(find(r,'wall-tile').quantity,0);
 assert.ok(r.unknowns.some(x=>x.includes('wall height')));
});
