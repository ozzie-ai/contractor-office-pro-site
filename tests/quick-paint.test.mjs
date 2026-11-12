import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const paint=require('../core/quick-paint.js');
let passed=0;function test(label,fn){fn();passed++;console.log('PASS '+label)}
const script='vamos a pintar una casa donde tiene tres habitaciones primera habitación 15 por 15 segunda habitación 12 * 15 tercera habitación 22 * 12 primer baño 7 por 10 segundo baño 7 por 5 cocina 10 por 10 comedor y sala 15 por 20 3 closets y tres por siete';
test('Original spoken job: all bedrooms, bathrooms, kitchen, living/dining, closets recognized',()=>{
 const p=paint.parse(script);
 assert.ok(p);assert.equal(p.allMeasured,true);
 assert.deepEqual(p.zones.map(x=>[x.category,x.quantity,x.lengthFt,x.widthFt]),[
  ['bedroom',1,15,15],['bedroom',1,12,15],['bedroom',1,22,12],
  ['bathroom',1,7,10],['bathroom',1,7,5],['kitchen',1,10,10],
  ['living_dining',1,15,20],['closet',3,3,7]
 ]);
 assert.deepEqual([p.counts.bedroom,p.counts.bathroom,p.counts.closet],[3,2,3]);
 assert.equal(p.floorSf,1237);assert.equal(p.wallsGrossSf,3280);
 assert.equal(p.heightFt,8);assert.equal(p.assumedHeight,true);
});
test('Whole job estimate is calculated from quantities, one labor pool, one mobilization',()=>{
 const e=paint.estimate(paint.parse(script),{paintUnitCost:37.98});
 assert.equal(e.wallNetSf,2952);
 assert.equal(e.wallGallons,19);
 assert.equal(e.paintGallons,19);
 assert.equal(e.totalLaborHours,42.5);
 assert.equal(e.materialCost,721.62);
 assert.equal(e.prepCost,295.2);
 assert.equal(e.laborCost,2550);
 assert.equal(e.mobilization,75);
 assert.equal(e.total,4807.2);
 assert.equal(e.roomCount,10);
 assert.equal(e.includeCeilings,false);
});
test('Wall height is assumed only when missing and ceilings excluded by default',()=>{
 const d=paint.parse(script+' altura de paredes 9 pies. Solo paredes, no pintar el techo.');
 const e=paint.estimate(d,{paintUnitCost:37.98});
 assert.equal(d.heightFt,9);assert.equal(d.assumedHeight,false);assert.equal(d.includeCeilings,false);
 assert.equal(e.wallsGrossSf,3690);
});
test('Explicit ceiling painting is priced; closets share one job, not three trips',()=>{
 const d=paint.parse(script+' También pintar los techos.');
 const e=paint.estimate(d,{paintUnitCost:37.98});
 assert.equal(d.includeCeilings,true);
 assert.equal(e.ceilingGallons,8);
 assert.equal(e.mobilization,75);
 assert.ok(e.totalLaborHours>42.5);
});
test('English sizes and a closet count parsed naturally',()=>{
 const d=paint.parse('Paint the house: first bedroom 15 by 15, second bedroom 12x15, third bedroom 22 x 12, first bathroom 7 by 10, second bathroom 7x5, kitchen 10 by 10, living and dining 15 by 20, three closets 3 by 7.');
 assert.ok(d);
 assert.equal(d.floorSf,1237);assert.equal(d.counts.bedroom,3);assert.equal(d.counts.closet,3);
});
test('Incomplete dimensions are not silently priced as a complete house',()=>{
 const d=paint.parse('Pintar tres habitaciones primera habitacion 15 por 15 segunda habitacion 12 por 15 primer bano 7 por 10');
 assert.ok(d);assert.equal(d.allMeasured,false);
 assert.ok(d.missing.some(x=>x.includes('bedrooms')));
});
test('Single room and exterior painting keep earlier workflows',()=>{
 assert.equal(paint.parse('Pintar una habitación 15 por 15'),null);
 assert.equal(paint.parse(script+' y pintar el exterior'),null);
});
test('Unsupported rate values rejected rather than silently priced',()=>{
 const p=paint.parse(script);
 assert.throws(()=>paint.estimate(p,{paintUnitCost:0}));
 assert.throws(()=>paint.estimate(p,{paintUnitCost:37.98,settings:{coats:0}}));
 assert.throws(()=>paint.estimate(p,{paintUnitCost:37.98,settings:{loadedLaborCostPerHour:-5}}));
});
test('Contractor-specific labor cost changes only the relevant direct cost',()=>{
 const p=paint.parse(script),low=paint.estimate(p,{paintUnitCost:37.98,settings:{loadedLaborCostPerHour:45}}),high=paint.estimate(p,{paintUnitCost:37.98,settings:{loadedLaborCostPerHour:65}});
 assert.equal(low.paintGallons,high.paintGallons);
 assert.ok(high.laborCost>low.laborCost);
 assert.ok(high.total>low.total);
});
console.log('PASS '+passed+' quick-paint takeoff and cost regressions');
