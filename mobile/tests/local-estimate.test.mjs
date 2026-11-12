import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';

const file=path.resolve('src/localEstimate.ts');
function resolvePaintingModule(id){
 if(id==='./paintingEstimate'){
  const js=ts.transpileModule(fs.readFileSync('src/paintingEstimate.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const p={exports:{}};
  vm.runInNewContext(js,{module:p,exports:p.exports,require:createRequire(import.meta.url)});
  return p.exports;
 }
 return createRequire(import.meta.url)(id);
}
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

test('latest voice dictation includes both GFCI and recessed light, and leaves unknown wall height pending',()=>{
 const t='OK tengo la remodelacion de un pequeno bano de 7 por 5 donde voy a eliminar o demoler una tina el sink con el vanity de 36 pulgadas voy a remover el espejo y tambien el toilet. Tambien voy a remover el actual piso del bano. Luego voy a instalar un nuevo shower de 3 por 5 pegado a la pared donde las losas van a llegar hasta el ceiling y va a llevar una puerta de vidrio. El piso va a ser nuevo de losa voy a instalar un nuevo toilet un nuevo vanity de 36 pulgadas con un solo bowl y un espejo de luz. Tambien voy a instalar un recessed light y un GFCI en lugar del outlet normal que existe. voy a pintar las paredes que queden libres de losa y el ceiling de color blanco.';
 const r=localEstimate(t,'remodel');
 for(const id of ['gfci','recessed-light','floor','floor-demo','paint-walls','paint-ceiling','wall-tile','mirror'])assert.ok(find(r,id),'Missing '+id);
 assert.equal(find(r,'floor').quantity,35);
 assert.equal(find(r,'wall-tile').quantity,0);
 assert.equal(r.lines.filter(x=>x.id==='local-vanity').length,1);
 assert.match(find(r,'gfci').description_en,/Replace existing/);
 assert.match(find(r,'paint-ceiling').description_en,/white/);
 assert.match(find(r,'paint-walls').description_en,/white/);
});

test('Electrical: five recessed lights at 8 ft and dimmer replacing existing switch',()=>{
 const t='Quiero cinco recessed lights en un apartamento, en un ceiling de ocho pies de altura, y necesito un dimmer instead del apagador.';
 const r=localEstimate(t,'electrical');
 assert.equal(find(r,'recessed-light').quantity,5);
 assert.equal(find(r,'recessed-light').unit,'each');
 assert.match(find(r,'recessed-light').description_en,/8 ft ceiling/);
 assert.equal(find(r,'dimmer').quantity,1);
 assert.match(find(r,'dimmer').description_en,/Replace existing wall switch/);
 assert.equal(find(r,'unclassified'),undefined);
 assert.equal(r.lines.length,2);
});
test('Electrical: numeric counts and no invented bathroom items',()=>{
 const r=localEstimate('Install 5 recessed lights in 8 feet ceiling and replace old switch with a dimmer.','electrical');
 assert.equal(find(r,'recessed-light').quantity,5);
 assert.ok(find(r,'dimmer'));
 assert.equal(find(r,'shower'),undefined);
 assert.equal(find(r,'floor'),undefined);
});
test('Electrical: one light is not mistaken for an 8-foot ceiling quantity',()=>{
 const r=localEstimate('Instalar un recessed light en techo de 8 pies.','electrical');
 assert.equal(find(r,'recessed-light').quantity,1);
});


test('Real customer panel dictation: 100A to 200A, 20 existing circuits, breaker only, $500 permit',()=>{
 const t='Ok voy a hacer un upgrade de un panel eléctrico. Panel actualmente es de 100 A y lo voy a upgrade a 200 A. El permiso costará aproximadamente $500 y necesito cambiar 20 de los existen circuitos a nuevos circuitos. Voy a agregar un breaker de 100 A solamente para posteriormente en otro trabajo hacer las conexiones.';
 const r=localEstimate(t,'electrical');
 assert.equal(r.lines.length,4);
 assert.match(find(r,'panel-upgrade').description_en,/100A to 200A/);
 assert.equal(find(r,'existing-circuits').quantity,20);
 assert.match(find(r,'future-breaker').description_en,/100A breaker only/);
 assert.equal(find(r,'permit').rate,500);
 assert.equal(find(r,'recessed-light'),undefined);
 assert.equal(find(r,'shower'),undefined);
 assert.equal(find(r,'floor'),undefined);
});
test('Electrical: recessed fixture and dimmer counts remain recognized',()=>{
 const r=localEstimate('Quiero cinco recessed lights en un apartamento, en un ceiling de ocho pies de altura, y necesito un dimmer instead del apagador.','electrical');
 assert.equal(find(r,'recessed-light').quantity,5);
 assert.match(find(r,'recessed-light').description_en,/8 ft ceiling/);
 assert.equal(find(r,'dimmer').quantity,1);
 assert.match(find(r,'dimmer').description_en,/Replace existing wall switch/);
 assert.equal(r.lines.length,2);
});
test('Electrical: never invent recessed lights or bathroom tasks for panel jobs',()=>{
 const r=localEstimate('Upgrade main panel from 100A to 200A, move 20 existing circuits and install 100A breaker only for later wiring. Permit $500.','electrical');
 assert.equal(find(r,'recessed-light'),undefined);
 assert.equal(find(r,'wall-tile'),undefined);
 assert.equal(find(r,'panel-upgrade').quantity,1);
 assert.equal(find(r,'existing-circuits').quantity,20);
 assert.equal(find(r,'permit').rate,500);
});
test('Concrete and plumbing descriptions cannot silently become bathroom items',()=>{
 const c=localEstimate('Pour a concrete driveway 600 square feet','concrete');
 const p=localEstimate('Replace water heater and connect supply pipes','plumbing');
 assert.equal(c.lines.length,1);
 assert.equal(p.lines.length,1);
 assert.equal(c.lines[0].rate,0);
 assert.equal(p.lines[0].rate,0);
 assert.equal(find(c,'shower'),undefined);
 assert.equal(find(p,'shower'),undefined);
});
