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
const panelStart=html.indexOf('function parsePanelUpgradeSpeech(');
const panelEnd=html.indexOf('function initUpgrade(){',panelStart);
assert.ok(panelStart>=0&&panelEnd>panelStart,'Contextual panel parser must exist');
const evSource=html.slice(html.indexOf('function evIsProject(d){'),html.indexOf('function evData(){'));
const parsePanel=new Function(evSource+html.slice(panelStart,panelEnd)+';return parsePanelUpgradeSpeech')();
const mixed=scenarios.find(x=>x.id==='MIXED-001');
assert.ok(mixed,'Expected mixed EV and panel fixture');
const mixedPanel=parsePanel(mixed.voice),mixedEV=parseEvSpeech(mixed.voice);
for(const field of ['old','now','existing','circuits','adu','ev'])assert.deepEqual(mixedPanel[field],mixed.expected[field],'MIXED-001 panel: '+field);
assert.equal(mixedEV.run,mixed.expected.evRun,'MIXED-001 EV length');
assert.equal(mixedEV.breaker,mixed.expected.evBreaker,'MIXED-001 EV breaker');
assert.ok(html.includes('estimateItems=[...upgradeItems(),...(evActive?evItems():[])]'),'Mixed work must combine both cost catalogs');
assert.ok(html.includes('if(d.adu)add(\'ADU feeder breaker — material\''),'ADU breaker not inserted without ADU request');

assert.ok(html.includes("d.scope==='breaker'"),'Breaker-only panel upgrade distinction must exist');
assert.ok(html.includes("englishProposalMeta"),'Customer English proposal must exist');
assert.ok(html.includes("englishProposalReady"),'English description review gate must exist');
assert.ok(html.includes('function quoteSchedule(){'),'Proposed payment schedule calculation must exist');
assert.ok(html.includes('Math.min(1000,total*.1)'),'California ordinary deposit cap must be computed as lower of $1,000 and 10%');
assert.ok(html.includes('Acknowledgment of Estimate Review'),'Estimate acknowledgment signatures must appear');
assert.ok(html.includes('Specific Exclusions and Scope Limitations'),'Customer scope exclusions must appear');
assert.ok(html.includes('do not replace a legally required home-improvement contract'),'Acknowledgment must not claim to replace required contract');
console.log('PASS: '+checked+' electrical speech cases + panel scope and English proposal checks');
console.log('PANEL-001 still requires browser workflow validation for complete end-to-end acceptance.');
