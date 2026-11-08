import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync('App.tsx','utf8');
const estimate=fs.readFileSync('src/estimate.ts','utf8');
test('Handyman is accurately labeled Trabajos varios in Spanish',()=>{
 assert.match(estimate,/handyman:\{en:'Handyman',es:'Trabajos varios'\}/);
 assert.doesNotMatch(estimate,/handyman:\{en:'Handyman',es:'Mantenimiento'\}/);
});
test('Concrete service is drawn as an actual cab drum and wheels',()=>{
 assert.match(app,/function ConcreteMixerGlyph/);
 assert.match(app,/accessibilityLabel="Concrete mixer truck"/);
 assert.match(app,/function ServiceGlyph[\s\S]*trade==='concrete'\)return <ConcreteMixerGlyph/);
});
test('Remodeling icon renders a house roof and door, not a glyph dependent on font',()=>{
 assert.match(app,/function HouseGlyph/);
 assert.match(app,/accessibilityLabel="House remodeling"/);
 assert.match(app,/trade==='remodel'\)return <HouseGlyph/);
 assert.doesNotMatch(app,/remodel:'⌂'/);
});
