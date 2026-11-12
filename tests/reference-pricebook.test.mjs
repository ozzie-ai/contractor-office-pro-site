import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const book=require('../core/reference-pricebook.js');
let n=0;
function test(label,run){run();n++;console.log('PASS '+label)}
test('Five old outlets replaced; two GFCI; never counted as ten',()=>{
 const r=book.fromTranscript('Necesito reemplazar cinco outlets viejos con cinco nuevos, dos de ellos GFCI');
 assert.deepEqual(r.lines.map(x=>[x.id,x.quantity]),[['duplex-15a',3],['gfci-15a',2]]);
 assert.equal(book.totals(r).materialSubtotal,59);
 assert.equal(book.totals(r).complete,true);
});
test('Do not guess GFCI when speech says 10 si hay',()=>{
 const r=book.fromTranscript('Voy a reemplazar cinco outlets, dos de ellos son 10 si hay');
 assert.ok(r.questions.some(x=>x.code==='confirm_gfci'));
 assert.equal(r.lines[0].total,null);
 assert.equal(book.totals(r).complete,false);
});
test('100 feet 14/2 indoor cable priced as ONE full roll, not $8/ft',()=>{
 const r=book.fromTranscript('Install 100 ft of 14/2 Romex NM-B cable');
 assert.equal(r.lines.length,1);
 assert.equal(r.lines[0].unit,'roll');
 assert.equal(r.lines[0].quantity,1);
 assert.equal(r.lines[0].total,88);
 assert.equal(r.lines[0].unitCost,88);
 assert.ok(r.questions.some(x=>x.code==='wire_waste'));
});
test('Cable 14/2 longer than roll: whole rolls not fractional, no double circuit assumption',()=>{
 const r=book.fromTranscript('Install 150 ft of 14/2 Romex');
 assert.equal(r.lines[0].quantity,2);
 assert.equal(r.lines[0].total,176);
 const ambiguous=book.fromTranscript('Necesito 100 pies de cable Romex calibre 14 para dos circuitos');
 assert.ok(ambiguous.questions.some(x=>x.code==='wire_conductors'));
 assert.equal(ambiguous.lines.length,0);
 assert.equal(book.totals(ambiguous).materialSubtotal,null);
});
test('Reject 20 amp or 240 volt generic outlet matching against 15 amp prices',()=>{
 for(const desc of ['Replace 3 240 volt outlets','Reemplazar 3 outlets 20A']){
  const r=book.fromTranscript(desc);
  assert.equal(r.lines.length,0);
  assert.ok(r.questions.some(x=>x.code==='outlet_spec'));
 }
});
test('10 half-inch 4x8 drywall sheets and two 20-minute compound bags',()=>{
 const r=book.fromTranscript('Instalar 10 hojas de drywall de 1/2 4x8 y 2 sacos de compuesto 20 minutos');
 assert.deepEqual(r.lines.map(x=>[x.id,x.quantity,x.total]),[['drywall-half-4x8',10,166.8],['joint-20min-18lb',2,27.24]]);
 assert.equal(book.totals(r).materialSubtotal,194.04);
});
test('Drywall area converts to sheets but cutting waste remains review question',()=>{
 const r=book.fromTranscript('Hang 100 sq ft of 1/2 inch 4x8 drywall');
 assert.equal(r.lines[0].quantity,4);
 assert.ok(r.questions.some(x=>x.code==='drywall_waste'));
});
test('Unspecified compound quantity is pending, not one bag guessed',()=>{
 const r=book.fromTranscript('Use 20 minute Easy Sand joint compound on drywall');
 assert.ok(r.lines.some(x=>x.id==='joint-20min-18lb'&&x.total===null));
 assert.equal(book.totals(r).materialSubtotal,null);
});
test('Two to three simple grade options, no SKU matching field or external fetching',()=>{
 assert.ok(book.catalog.every(x=>x.options.length>=2&&x.options.length<=3));
 assert.ok(book.catalog.every(x=>x.options.every(o=>o.cost>=0&&o.store&&o.observedOn&&o.url)));
 const bookString=require('node:fs').readFileSync(new URL('../core/reference-pricebook.js',import.meta.url),'utf8');
 assert.ok(!/sku\s*[:=]/i.test(bookString));
 assert.ok(!/\bfetch\s*\(/.test(bookString));
});
test('Date-aware stale prices work offline',()=>{
 assert.equal(book.choose('duplex-15a','standard','2026-11-11').isStale,false);
 assert.equal(book.choose('duplex-15a','standard','2027-02-11').isStale,true);
 assert.ok(book.fromTranscript('Replace 3 outlets',{now:'2027-02-11'}).questions.some(q=>q.code==='stale_prices'));
});
test('Unrecognized plumbing and painting materials never get invented costs',()=>{
 for(const s of ['Paint a bedroom with unknown brand and 2 coats','Replace a kitchen faucet']){
  const r=book.fromTranscript(s);
  assert.equal(r.lines.length,0);
  assert.equal(book.totals(r).materialSubtotal,null);
  assert.equal(r.status,'needs_review');
 }
});
test('Concrete: only 80lb bagged mix explicitly described, no ready-mix substitution',()=>{
 const r=book.fromTranscript('Pour small curb using five 80 lb bags of Quikrete concrete');
 assert.deepEqual(r.lines.map(x=>[x.id,x.quantity,x.total]),[['concrete-80lb-bag',5,32.35]]);
 assert.equal(book.fromTranscript('Pour 10 yards of ready-mix concrete').lines.length,0);
});
test('Painting: standard interior gallon reference, flat paint is different tier',()=>{
 const r=book.fromTranscript('Pintar paredes interiores con dos galones de pintura eggshell');
 assert.deepEqual(r.lines.map(x=>[x.id,x.quantity,x.total]),[['interior-paint-1gal',2,75.96]]);
 const flat=book.fromTranscript('Paint walls inside using 2 gallons flat interior paint');
 assert.equal(flat.lines[0].unitCost,23.98);
});
test('Plumbing: 4-inch bathroom faucet material reference, not kitchen or customer-supplied',()=>{
 const r=book.fromTranscript('Replace two bathroom faucets 4 inch centerset chrome');
 assert.deepEqual(r.lines.map(x=>[x.id,x.quantity,x.total]),[['bathroom-faucet-4in',2,79.96]]);
 const owner=book.fromTranscript('Replace two bathroom faucets, customer supplies fixtures');
 assert.equal(owner.lines.length,0);
 assert.ok(owner.questions.some(x=>x.code==='customer_supplied_fixture'));
 assert.equal(book.fromTranscript('Replace one kitchen faucet').lines.length,0);
});
console.log('PASS '+n+' generic offline pricebook regression cases');
