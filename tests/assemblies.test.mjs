import assert from 'node:assert/strict';
import {TRADES, CAPABILITIES, ASSEMBLIES, createProfile, visibleTrades, availableAssemblies, identifyAssembly,
  expandAssembly, toEstimatingJob, profileCanSeeJob} from '../core/assemblies.mjs';
import {priceEstimate} from '../core/estimate-engine.mjs';
let passed=0;
function test(title,fn){fn();passed++;console.log('PASS '+title);}
test('Trade catalog supports multiple specialties, not a panel-only engine',()=>{
  assert.ok(TRADES.length>=14);
  assert.ok(ASSEMBLIES.some(x=>x.trade==='cleaning'));
  assert.ok(ASSEMBLIES.some(x=>x.trade==='drywall'));
  assert.ok(ASSEMBLIES.some(x=>x.trade==='roofing'));
});
test('Electrician profile sees only electrical workflows',()=>{
  const p=createProfile({primaryTrade:'electrical'});
  assert.deepEqual(visibleTrades(p).map(x=>x.id),['electrical']);
  assert.ok(availableAssemblies(p).every(x=>x.trade==='electrical'));
  assert.equal(profileCanSeeJob(p,'cleaning'),false);
  assert.equal(profileCanSeeJob(p,'painting'),false);
});
test('Plumber cannot quote drywall repairs unless explicitly enabled',()=>{
  const p=createProfile({primaryTrade:'plumbing'});
  const x=expandAssembly({profile:p,assemblyId:'faucet_replacement',values:{fixtures:2,patchAreaSf:12},choices:{patchWall:true}});
  assert.equal(x.tasks.some(t=>t.code==='patch_wall'),false);
  assert.ok(x.exclusions.some(t=>t.id==='patch_wall'&&t.reason==='outside_contractor_scope'));
  assert.equal(x.tasks.filter(t=>t.trade!=='plumbing').length,0);
});
test('Plumber can elect wall-repair service and opt into the particular job',()=>{
  const p=createProfile({primaryTrade:'plumbing',capabilities:['wall_repair']});
  const x=expandAssembly({profile:p,assemblyId:'faucet_replacement',values:{fixtures:2,patchAreaSf:12},choices:{patchWall:true}});
  assert.equal(x.tasks.find(t=>t.code==='patch_wall').quantity,12);
  const y=expandAssembly({profile:p,assemblyId:'faucet_replacement',values:{fixtures:2,patchAreaSf:12},choices:{patchWall:false}});
  assert.equal(y.tasks.some(t=>t.code==='patch_wall'),false);
});
test('Residential cleaner declines pet-waste cleaning without adding cost',()=>{
  const p=createProfile({primaryTrade:'cleaning'});
  const x=expandAssembly({profile:p,assemblyId:'house_cleaning',values:{floorAreaSf:1200,petAreaSf:70},choices:{petWaste:true}});
  assert.equal(x.tasks.some(t=>t.code==='pet_waste_clean'),false);
  assert.ok(x.exclusions.some(t=>t.id==='pet_waste_clean'));
  assert.equal(x.tasks.some(t=>t.trade!=='cleaning'),false);
});
test('Cleaner explicitly offering pet waste may include it on one job only',()=>{
  const p=createProfile({primaryTrade:'cleaning',capabilities:['pet_waste']});
  const x=expandAssembly({profile:p,assemblyId:'house_cleaning',values:{floorAreaSf:800,petAreaSf:35},choices:{petWaste:true}});
  assert.equal(x.tasks.find(t=>t.code==='pet_waste_clean').quantity,35);
  const y=expandAssembly({profile:p,assemblyId:'house_cleaning',values:{floorAreaSf:800,petAreaSf:35}});
  assert.equal(y.tasks.some(t=>t.code==='pet_waste_clean'),false);
});
test('Drywall: correct ordered core sequence, insulation and painting not assumed',()=>{
  const p=createProfile({primaryTrade:'drywall'});
  const x=expandAssembly({profile:p,assemblyId:'drywall_install',values:{wallAreaSf:250}});
  assert.deepEqual(x.tasks.map(t=>t.code),['check_framing','drywall_boards','hang_drywall','tape_finish','sand_finish','clean_drywall']);
  assert.equal(x.questions.length,0);
  assert.equal(x.readyForPricing,true);
});
test('Drywall: insulation, texture and painting are independent opt-ins',()=>{
  const p=createProfile({primaryTrade:'drywall',capabilities:['insulation','painting_finishes']});
  const x=expandAssembly({profile:p,assemblyId:'drywall_install',values:{wallAreaSf:300},choices:{addInsulation:true,addTexture:true,addPaint:false}});
  assert.ok(x.tasks.some(t=>t.code==='insulate'));
  assert.ok(x.tasks.some(t=>t.code==='texture_finish'));
  assert.equal(x.tasks.some(t=>t.code==='paint_after_drywall'),false);
});
test('Concrete: task-level measurements, 10 by 20 by 6 inch slab',()=>{
  const p=createProfile({primaryTrade:'concrete'});
  const x=expandAssembly({profile:p,assemblyId:'concrete_slab',values:{lengthFt:10,widthFt:20,depthIn:6}});
  assert.equal(x.tasks.find(t=>t.code==='ready_mix_concrete').quantity,3.704);
  assert.equal(x.tasks.find(t=>t.code==='forms_concrete').quantity,60);
  assert.equal(x.tasks.some(t=>t.code==='reinforcement_concrete'),false);
  assert.equal(x.readyForPricing,true);
});
test('Concrete: missing depth prompts about depth rather than silently pricing zero',()=>{
  const p=createProfile({primaryTrade:'concrete'});
  const x=expandAssembly({profile:p,assemblyId:'concrete_slab',values:{lengthFt:10,widthFt:20}});
  assert.deepEqual(x.questions.map(q=>q.id),['depthIn']);
  assert.equal(x.readyForPricing,false);
  assert.equal(priceEstimate(toEstimatingJob(x)).totals.total,null);
});
test('Painting: gallons derived only from explicit wall area/coats/coverage',()=>{
  const p=createProfile({primaryTrade:'painting'});
  const x=expandAssembly({profile:p,assemblyId:'room_painting',values:{wallAreaSf:1440,coats:2,coverageSfPerGal:350}});
  assert.equal(x.tasks.find(t=>t.code==='paint_supply').quantity,9);
  assert.equal(x.tasks.find(t=>t.code==='apply_paint').quantity,1440);
  assert.equal(x.tasks.some(t=>t.code==='paint_ceiling'),false);
});
test('Painting: missing material coverage asks for real inputs, not fictional gallons',()=>{
  const p=createProfile({primaryTrade:'painting'});
  const x=expandAssembly({profile:p,assemblyId:'room_painting',values:{wallAreaSf:900}});
  assert.deepEqual(x.questions.map(q=>q.id),['coats','coverageSfPerGal']);
  assert.equal(x.tasks.find(t=>t.code==='paint_supply').quantity,null);
});
test('Flooring: removal is conditional and appears before installation',()=>{
  const p=createProfile({primaryTrade:'flooring'});
  const x=expandAssembly({profile:p,assemblyId:'floor_tile',values:{floorAreaSf:100,wastePct:10},choices:{removeExisting:true}});
  const codes=x.tasks.map(t=>t.code);
  assert.ok(codes.indexOf('remove_old_floor')<codes.indexOf('tile_install'));
  assert.equal(x.tasks.find(t=>t.code==='tile_material').quantity,110);
});
test('Roofing: repair does not auto-add unrelated stucco/painting',()=>{
  const p=createProfile({primaryTrade:'roofing'});
  const x=expandAssembly({profile:p,assemblyId:'roof_patch',values:{repairAreaSf:85}});
  assert.ok(x.tasks.every(t=>t.trade==='roofing'));
  assert.equal(x.questions.length,0);
});
test('Multi-trade is a deliberate selection, not an automatic unlock',()=>{
  const p=createProfile({primaryTrade:'remodel',additionalTrades:['painting','drywall']});
  assert.deepEqual(visibleTrades(p).map(x=>x.id),['painting','drywall','remodel']);
  assert.ok(availableAssemblies(p).every(x=>['painting','drywall','remodel'].includes(x.trade)));
  assert.equal(profileCanSeeJob(p,'electrical'),false);
});
test('Unrecognized and ambiguous jobs require confirmation, not guesses',()=>{
  const p=createProfile({primaryTrade:'remodel',additionalTrades:['painting','drywall']});
  assert.equal(identifyAssembly(p,'Move things around'),null);
  assert.equal(identifyAssembly(p,'Paint and hang drywall'),null);
  assert.equal(identifyAssembly(p,'Paint the walls','painting')?.id,'room_painting');
});
test('Price validation uses existing core; no inferred market rates',()=>{
  const p=createProfile({primaryTrade:'drywall'});
  const x=expandAssembly({profile:p,assemblyId:'drywall_install',values:{wallAreaSf:250}});
  const draft=priceEstimate(toEstimatingJob(x));
  assert.equal(draft.proposal.status,'draft_review_required');
  assert.equal(draft.totals.total,null);
  assert.ok(draft.missingPrices.length>0);
  const rates=Object.fromEntries(x.tasks.map(t=>[t.code, t.unit==='job'?90:2]));
  const priced=priceEstimate(toEstimatingJob(x),rates,{overheadRate:.10,profitRate:.20});
  assert.equal(priced.missingPrices.length,0);
  assert.equal(priced.readyForReview,true);
  assert.equal(priced.proposal.status,'priced_draft');
});
test('All assembly tasks have stable IDs and valid trades and units',()=>{
  for(const a of ASSEMBLIES){
    const codes=new Set();
    for(const t of a.tasks){
      assert.ok(t.id&&t.en&&t.es&&t.unit&&t.measure&&t.costType);
      assert.ok(!codes.has(t.id));codes.add(t.id);
      assert.ok(TRADES.some(x=>x.id===t.trade));
      if(t.capability)assert.ok(CAPABILITIES.some(x=>x.id===t.capability));
    }
  }
});
console.log('PASS '+passed+' trade-scoped assembly regression tests');
