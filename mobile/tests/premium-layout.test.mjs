import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync('App.tsx','utf8');
const speech=fs.readFileSync('src/SpeechInput.tsx','utf8');
test('approved indigo design is implemented as real native controls',()=>{
 assert.match(app,/accentDark:'#13256F'/);
 assert.match(app,/backgroundColor:'#101F52'/);
 assert.match(app,/styles\.hero/);
 assert.match(app,/styles\.languageSwitch/);
 assert.match(app,/styles\.homeNavigation/);
 assert.match(app,/styles\.serviceGrid/);
 assert.match(app,/styles\.stepCircle/);
 assert.doesNotMatch(app,/MOBILE UI 24/);
});
test('approved stepper keeps text out of tiny numbered tiles',()=>{
 assert.match(app,/numberOfLines=\{1\} adjustsFontSizeToFit style=\{\[styles\.stepText/);
 assert.match(app,/styles\.stepCircle/);
});
test('plumbing, concrete mixer and cleaning glyphs distinguish services',()=>{
 assert.match(app,/plumbing:'🚰'/u);
 assert.match(app,/trade==='concrete'/);
 assert.match(app,/cleaning:'🧹'/u);
});
test('saved jobs, language switch and pricing logic remain wired',()=>{
 assert.match(app,/onPress=\{goToMyJobs\}/);
 assert.match(app,/onPress=\{\(\)=>chooseLanguage\(lang\)\}/);
 assert.match(app,/const pricedProject=currentCleaningProject\(project\)/);
 assert.match(speech,/backgroundColor:'#13256F'/);
});
