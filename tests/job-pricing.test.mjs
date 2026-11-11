import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const c=require('../core/job-pricing.js');
let n=0;const test=(name,run)=>{run();n++;console.log('PASS '+name)};
const userSpeech='Okay necesito reemplazar cinco outlets viejitos o nuevos outlets con dos de ellos van a ser 10 si hay yo voy a poner los materiales';
test('User dictation: 5 existing replacements, 2 uncertain GFCIs, contractor supplies',()=>{
 const p=c.parseOutletRequest(userSpeech);
 assert.equal(p.replacement,true);assert.equal(p.total,5);assert.equal(p.additional,0);
 assert.equal(p.gfciCount,null);assert.equal(p.suspectedGfciCount,2);
 assert.equal(p.contractorSupplies,true);
 assert.ok(p.questions.includes('confirm_gfci_transcript'));
});
test('Confirmed five including two GFCIs, never five plus five',()=>{
 const p=c.finalOutletScope(c.parseOutletRequest(userSpeech),{gfciCount:2,contractorSupplies:true});
 assert.deepEqual([p.standardCount,p.gfciCount,p.replacementCount],[3,2,5]);
});
test('Spanish and English speech with explicit GFCI work',()=>{
 for(const raw of [
  'Reemplazar 5 tomacorrientes, 2 de ellos GFCI. Yo voy a poner los materiales.',
  'Replace five existing outlets, two of them GFCI. I will supply the materials.'
 ]){
  const p=c.parseOutletRequest(raw);
  assert.equal(p.total,5);assert.equal(p.gfciCount,2);
  assert.equal(p.contractorSupplies,true);
 }
});
test('Additional outlets are separate explicit work; not inferred from new replacements',()=>{
 assert.equal(c.parseOutletRequest('Replace 5 existing outlets with new outlets').additional,0);
 assert.equal(c.parseOutletRequest('Replace 5 old outlets and add 2 new outlets').additional,2);
});
test('Verified retail costs and one-visit labor reproduce transparent $434.28 scenario',()=>{
 const today='2026-11-11';
 const r=c.visitCost({materials:[
  {id:'standard',quantity:3,description:'Standard receptacles',pricing:{unitCost:3.68,retailer:'Home Depot',checkedOn:today}},
  {id:'gfci',quantity:2,description:'GFCI receptacles',pricing:{unitCost:18.98,retailer:"Lowe's",checkedOn:today}}
 ],laborHours:2.5,laborCostPerHour:90,tripAndPurchaseCost:45,miscSupplyCost:10,overheadPct:10,profitPct:20});
 assert.equal(r.complete,true);
 assert.deepEqual(r.totals,{materialCost:49,laborCost:225,trip:45,supplies:10,directCost:329,overhead:32.9,profit:72.38,total:434.28});
 assert.equal(r.breakdown.filter(x=>x.id==='trip_purchasing').length,1);
 assert.equal(r.breakdown.filter(x=>x.category==='labor').length,1);
});
test('Missing retailer quote must not become $0-priced or known',()=>{
 const r=c.visitCost({materials:[{id:'gfci',quantity:2,pricing:{unitCost:null,retailer:'Home Depot',checkedOn:'2026-11-11'}}],
  laborHours:2,laborCostPerHour:90,tripAndPurchaseCost:40,miscSupplyCost:8,overheadPct:10,profitPct:20});
 assert.equal(r.complete,false);assert.equal(r.totals,null);assert.ok(r.blockers.includes('material_price:gfci'));
});
test('Same job cost engine works for concrete, plumbing, and painting',()=>{
 for(const item of [{id:'concrete',quantity:4,cost:200},{id:'faucet',quantity:2,cost:75},{id:'paint',quantity:5,cost:30}]){
  const r=c.visitCost({materials:[{id:item.id,quantity:item.quantity,description:item.id,pricing:{unitCost:item.cost,retailer:'Contractor invoice',checkedOn:'2026-11-11'}}],
   laborHours:5,laborCostPerHour:40,tripAndPurchaseCost:60,miscSupplyCost:0,overheadPct:10,profitPct:15});
  assert.equal(r.complete,true);
  assert.equal(r.totals.materialCost,item.quantity*item.cost);
  assert.equal(r.breakdown.filter(x=>x.id==='trip_purchasing').length,1);
 }
});
test('No invented online prices or retailer API; links take contractor to actual retailers',()=>{
 const links=c.retailerSearch('15 amp GFCI outlet');
 assert.ok(links.homeDepot.startsWith('https://www.homedepot.com/s/'));
 assert.ok(links.lowes.startsWith('https://www.lowes.com/search?searchTerm='));
 assert.ok(links.homeDepot.includes('GFCI'));
});
test('Reject invalid prices, future-priced bypass and negative labor',()=>{
 assert.equal(c.validRetailEntry({unitCost:-5,retailer:'Home Depot',checkedOn:'2026-11-11'}),false);
 assert.equal(c.validRetailEntry({unitCost:10,retailer:'Unknown Store',checkedOn:'2026-11-11'}),false);
 assert.equal(c.validRetailEntry({unitCost:10,retailer:'Home Depot',checkedOn:'2026-11-11',productUrl:'http://bad.example'}),false);
 assert.throws(()=>c.finalOutletScope(c.parseOutletRequest(userSpeech),{gfciCount:6,contractorSupplies:true}));
 const r=c.visitCost({materials:[],laborHours:-1,laborCostPerHour:30,tripAndPurchaseCost:0,miscSupplyCost:0,overheadPct:0,profitPct:0});
 assert.equal(r.complete,false);
});
console.log('PASS '+n+' cost/scope regression cases');
