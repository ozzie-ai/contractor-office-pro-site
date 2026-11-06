// Run with: node tests/run-tests.mjs
// Only pure, source-extracted parser logic is executed here. No customer data.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const scenarios=JSON.parse(readFileSync(new URL('./scenarios.json',import.meta.url),'utf8')).cases;
const start=html.indexOf('function parseEvSpeech(');
const end=html.indexOf('function evInit(){',start);
assert.ok(start>=0&&end>start,'EV parser must exist');
const parseEvSpeech=new Function(html.slice(start,end)+';return parseEvSpeech;')();
let checked=0;
for(const item of scenarios){
 if(!item.id.startsWith('ELEC-'))continue;
 const actual=parseEvSpeech(item.voice);
 for(const [key,value] of Object.entries(item.expected))assert.deepEqual(actual[key],value,item.id+': '+key);
 checked++;
}
assert.ok(checked>=3,'Expected at least three electrical speech fixtures');
assert.ok(html.includes("d.scope==='breaker'"),'Breaker-only panel upgrade distinction must exist');
assert.ok(html.includes("englishProposalMeta"),'Customer English proposal must exist');
assert.ok(html.includes("englishProposalReady"),'English description review gate must exist');
console.log('PASS: '+checked+' electrical speech cases + panel scope and English proposal checks');
console.log('PANEL-001 still requires browser workflow validation for complete end-to-end acceptance.');
