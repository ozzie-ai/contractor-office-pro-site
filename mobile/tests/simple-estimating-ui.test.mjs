import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync('App.tsx','utf8');
test('contractor estimate requires no server setup or database buttons',()=>{
 for(const forbidden of ['Check my Mac pricing database','Mac server URL','Private access token','Local Mac price database','lookupLocalPrice','inspectLocalPrice','Local reference review'])assert.equal(app.includes(forbidden),false,forbidden);
});
test('estimator still supports electrical work items, editing rates, PDF and Spanish',()=>{
 assert.match(app,/const draft=localEstimate\(project\.description,project\.trade\)/);
 assert.match(app,/label=\{tr\("Rate \(\$\)","Tarifa \(\$\)"\)\}/);
 assert.match(app,/proposalHtml\(quote,mode\)/);
 assert.match(app,/onPress=\{\(\)=>chooseLanguage\(lang\)\}/);
});
