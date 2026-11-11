import assert from 'node:assert/strict';
import { interpretPanelUpgrade, createJob, priceEstimate } from '../core/estimate-engine.mjs';
const test = (name, fn) => { fn(); console.log('PASS ' + name); };
const input = 'Upgrade de un panel eléctrico panel actualmente es de 100 A lo voy a upgrade a 200 A. El permiso costará aproximadamente $500 y necesito cambiar 20 de los existentes circuitos a nuevos circuitos y voy a agregar un circuito de 100 A. Nomás no voy a agregar los Breakers para posteriormente en otro trabajo hacer unas conexiones.';
let panel;
test('SPANISH PANEL: 100A to 200A, 20 transfers, $500 permit and NO future breaker', () => {
  panel = interpretPanelUpgrade(input);
  assert.deepEqual({old:panel.attributes.oldAmps,now:panel.attributes.newAmps,circuits:panel.attributes.existingCircuits,permit:panel.attributes.permit,future:panel.attributes.futureAmps,mode:panel.attributes.futureMode},
    {old:100,now:200,circuits:20,permit:500,future:100,mode:'reserve_space'});
  assert.equal(panel.tasks.find(x=>x.code==='transfer_existing_circuits').quantity,20);
  assert.equal(panel.tasks.some(x=>x.code==='future_breaker_material'),false);
  assert.equal(panel.tasks.some(x=>x.code==='new_circuits'),false);
});
test('UNPRICED JOB: never false zero totals; retains $500 permit', () => {
  const p=priceEstimate(panel);
  assert.equal(p.totals.total,null);
  assert.deepEqual(p.missingPrices,['main_panel_material','panel_install_labor','transfer_existing_circuits']);
  assert.equal(p.items.find(x=>x.code==='permit_allowance').extendedCost,500);
  assert.equal(p.takeoff.length,1);
  assert.equal(p.proposal.total,null);
  assert.equal(p.proposal.status,'draft_review_required');
  assert.equal(JSON.stringify(p.proposal).includes('Nomás'),false);
});
test('PRICING: unit extension plus separate overhead and profit', () => {
  const p=priceEstimate(panel,{main_panel_material:1250,panel_install_labor:1800,transfer_existing_circuits:75},{overheadRate:.10,profitRate:.20});
  assert.equal(p.items.find(x=>x.code==='transfer_existing_circuits').extendedCost,1500);
  assert.equal(p.totals.baseCost,5050);
  assert.equal(p.totals.overhead,505);
  assert.equal(p.totals.profit,1111);
  assert.equal(p.totals.total,6666);
  assert.equal(p.proposal.total,null); // technical review still required
  assert.equal(p.missingPrices.length,0);
});
test('EXPLICIT FUTURE BREAKER: include breaker materials/labor once, not feeder', () => {
  const p=interpretPanelUpgrade('Reemplazar panel principal de 100 amperios por uno de 200 amperios. Transferir 20 circuitos existentes. Instalar breaker de 100 amperios reservado para el ADU. El alimentador y subpanel se harán después.');
  assert.equal(p.attributes.futureMode,'breaker_now');
  assert.equal(p.tasks.filter(x=>x.code==='future_breaker_material').length,1);
  assert.equal(p.tasks.filter(x=>x.code==='future_breaker_install').length,1);
  assert.equal(p.tasks.some(x=>/feeder|subpanel/.test(x.code)),false);
});
test('GENERAL SCHEMA: same pricing for painting, concrete and plumbing', () => {
  for(const trade of ['painting','concrete','plumbing']) {
    const job=createJob({trade,tasks:[
      {code:'material_qty',description_en:'Materials',description_es:'Materiales',quantity:30,unit:'ea',costType:'material',status:'included_now'},
      {code:'labor_qty',description_en:'Labor',description_es:'Mano de obra',quantity:4,unit:'hr',costType:'labor',status:'included_now'}
    ]});
    const p=priceEstimate(job,{material_qty:5,labor_qty:30},{overheadRate:0.1,profitRate:0.2});
    assert.equal(p.totals.baseCost,270);
    assert.equal(p.totals.total,356.4);
    assert.deepEqual(p.takeoff.map(t=>t.quantity),[30]);
    assert.equal(p.readyForReview,true);
  }
});
test('EXCLUSIONS: future and excluded tasks never priced', () => {
  const job=createJob({trade:'electrical',tasks:[
    {code:'now',description_en:'Now',quantity:1,unit:'ea',costType:'material',status:'included_now'},
    {code:'later',description_en:'Later',quantity:20,unit:'ea',costType:'material',status:'future'},
    {code:'excluded',description_en:'Not included',quantity:20,unit:'ea',costType:'material',status:'excluded'}
  ]});
  const p=priceEstimate(job,{now:10,later:200,excluded:200});
  assert.equal(p.totals.total,10);
  assert.equal(p.items.length,1);
});
test('VALIDATION: reject invalid quantities, codes and negative pricing', () => {
  assert.throws(()=>createJob({trade:'painting',tasks:[{code:'x',quantity:0,costType:'labor',status:'included_now'}]}));
  assert.throws(()=>priceEstimate(panel,{}, {profitRate:-.1}));
  assert.throws(()=>priceEstimate(panel,{main_panel_material:-100}));
});
test('MIXED EV: 40A charger circuit never mistaken for a future breaker', () => {
  const p=interpretPanelUpgrade('Vamos a instalar un cargador EV y hacer upgrade del panel de 100 a 200 amperios, remover el viejo que tiene 20 breakers, 20 circuitos, reemplazarlos por la misma cantidad y agregar el circuito EV de 40 amperios doble.');
  assert.equal(p.attributes.futureAmps,null);
  assert.equal(p.tasks.some(x=>x.code==='future_breaker_material'),false);
});
test('MIXED EV PLUS RESERVED BREAKER: future 100A distinct from EV 40A', () => {
  const p=interpretPanelUpgrade('Reemplazar panel existente de 100 amperios por uno de 200 amperios. Actualmente tiene 20 circuitos. Vamos a agregar un circuito doble de 40 amperios breaker para alimentar un cargador a 100 pies. También vamos a dejar otro breaker listo de 100 amperios doble para posteriormente en nuevo trabajo alimentar un subpanel. Solo dejamos el breaker de 100 amperios listo.');
  assert.equal(p.attributes.futureAmps,100);
  assert.equal(p.attributes.futureMode,'breaker_now');
  assert.equal(p.tasks.filter(x=>x.code==='future_breaker_material').length,1);
});
test('MIXED: original 20 circuits retained when spoken after breakers', () => {
  const p=interpretPanelUpgrade('Vamos a instalar un cargador de carro eléctrico, correr 100 pies de alambre, instalar un breaker de 40 amperios doble de 220 voltios y hacer upgrade del panel de 100 a 200 amperios, remover el viejo que tiene 20 breakers, 20 circuitos, reemplazarlos por la misma cantidad y agregar el circuito EV de 40 amperios doble.');
  assert.equal(p.attributes.existingCircuits,20);
  assert.equal(p.attributes.futureAmps,null);
});
console.log('PASS all new backend core regression cases');

test('UNKNOWN QUANTITY: priced allowance with no quantity is incomplete', () => {
  const j=createJob({trade:'painting',tasks:[{code:'paint',description_en:'Paint',quantity:null,unit:'gal',costType:'material',status:'allowance_to_confirm'}]});
  const r=priceEstimate(j,{paint:40});
  assert.deepEqual(r.missingQuantities,['paint']);
  assert.equal(r.totals.total,null);
  assert.equal(r.proposal.status,'draft_review_required');
});
