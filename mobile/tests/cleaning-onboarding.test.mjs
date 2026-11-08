import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const filename='src/cleaningNotes.ts';
const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(js,{module,exports:module.exports});
const {cleaningDetailsFromNotes}=module.exports;
const base={type:'residential',cleaningTypeConfirmed:false,frequency:'once',bedrooms:0,bathrooms:0,livingRooms:0,areaSqFt:0,workers:2,firstHoursPerWorker:0,repeatHoursPerWorker:0,dustLevel:'moderate'};
test('dictated Spanish post-construction cleaning details feed the estimate',()=>{
 const found=cleaningDetailsFromNotes('Limpieza después de obra de 4,034 pies cuadrados, 4 dormitorios, 4 baños, mucho polvo',base);
 assert.equal(found.type,'post_construction');
 assert.equal(found.cleaningTypeConfirmed,true);
 assert.equal(found.areaSqFt,4034);
 assert.equal(found.bedrooms,4);
 assert.equal(found.bathrooms,4);
 assert.equal(found.dustLevel,'heavy');
 assert.equal(found.frequency,'once');
});
test('notes never invent rooms or weekly frequency when not said',()=>{
 const found=cleaningDetailsFromNotes('Need to clean this home',base);
 assert.equal(found.cleaningTypeConfirmed,false);
 assert.equal(found.frequency,'once');
 assert.equal(found.bedrooms,0);
 assert.equal(found.areaSqFt,0);
});
test('customer PDF language is independent of app language',()=>{
 const app=fs.readFileSync('App.tsx','utf8');
 assert.match(app,/const \[pdfLanguage,setPdfLanguage\]=useState<Language>\('en'\)/);
 assert.match(app,/const quote=\{\.\.\.currentCleaningProject\(project\),language:pdfLanguage\}/);
 assert.doesNotMatch(app,/saveProfile\(updated\);setBusinessProfile\(updated\);patch\(\{language\}\)/);
});
