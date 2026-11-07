import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';

const file=path.resolve('src/localEstimate.ts');
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const module={exports:{}};
vm.runInNewContext(js,{module,exports:module.exports,require:createRequire(import.meta.url),console});
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

test('full dictated bathroom scope: demolition, wall tile, new toilet, lighted mirror, recessed light',()=>{
 const t='Necesito remodelar este pequeno bano de 7 por 5. Voy a retirar o remover la tina, el toilet, el vanity con el sink y el espejo, y voy a demoler el piso existente. Voy a instalar un nuevo shower de 3 por 5 y va a llevar una puerta de vidrio. Las paredes del shower van a ser de losa y van a llegar hasta el techo. Las paredes son de 8 pies de alto. Voy a instalar un nuevo toilet en la misma posicion que el anterior y un nuevo sink con el vanity de 36 pulgadas en la misma posicion que el anterior. Vamos a poner losa en el piso del bano. Tambien el espejo de 36 pulgadas de ancho por 36 pulgadas de alto, que va a ser un lighted mirror. Y vamos a pintar las paredes que sobren y vamos a pintar tambien el ceiling del area de este bano. Tambien vamos a instalar un nuevo recessed light en el bano.';
 const r=localEstimate(t,'remodel');
 assert.equal(find(r,'floor').quantity,35);
 assert.equal(find(r,'floor-demo').quantity,35);
 assert.equal(find(r,'wall-tile').quantity,88);
 for(const id of ['tub-remove','remove-toilet','remove-vanity','remove-mirror','shower','glass','toilet','vanity','mirror','paint-walls','paint-ceiling','recessed-light'])assert.ok(find(r,id),'Missing '+id);
 assert.match(find(r,'toilet').description_en,/new toilet/);
 assert.match(find(r,'vanity').description_en,/36 in/);
 assert.match(find(r,'mirror').description_en,/36 × 36 in/);
 assert.equal(r.lines.filter(x=>x.id==='local-wall-tile').length,1);
});
test('new toilet at same position must not be treated as reinstalling existing toilet',()=>{
 const r=localEstimate('Remove old toilet. Install new toilet in same position.','remodel');
 assert.match(find(r,'toilet').description_en,/new toilet/);
});

test('test 4 dictation captures GFCI and recessed light without inventing shower height',()=>{
 const speech='Remodelación de baño de 7 por 5. Eliminar tina y toilet, vanity y espejo, remover piso. Instalar nuevo shower de 3 por 5 con puerta de vidrio. Las losas llegan hasta el ceiling. Nuevo toilet, nuevo vanity de 36 pulgadas, un solo bowl y espejo de luz. Instalar recessed light y un GFCI en lugar del outlet normal. Pintar paredes libres de losa y ceiling de blanco.';
 const r=localEstimate(speech,'remodel');
 assert.equal(find(r,'floor').quantity,35);
 assert.equal(find(r,'wall-tile').quantity,0);
 assert.ok(r.unknowns.some(x=>x.includes('ACTION REQUIRED')));
 assert.ok(find(r,'recessed-light'));
 assert.match(find(r,'gfci').description_en,/Replace existing standard/);
 assert.ok(find(r,'paint-ceiling'));
 assert.match(find(r,'paint-ceiling').description_en,/white/);
});
