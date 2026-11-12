/**
 * Contractor Office Pro — general-material reference pricebook.
 * Offline, no SKU requirement, no network, no user account, no DOM.
 * Retailers were reviewed 2026-11-11. Prices are dated references, NOT live quotes.
 * A commodity family has a simple description, a few grades/choices and a unit.
 */
(function(root){
'use strict';
const DATE='2026-11-11';
function option(tier,cost,store,url,spec=''){
 return Object.freeze({tier,cost,store,url,observedOn:DATE,spec});
}
const catalog=Object.freeze([
 {id:'duplex-15a',trade:'electrical',en:'15A 125V residential duplex outlet',es:'Tomacorriente residencial 15A 125V',
  unit:'ea',defaultTier:'standard',options:[
   option('basic',1.68,'Home Depot','https://www.homedepot.com/p/100662608','15A tamper-resistant, traditional style'),
   option('standard',3.68,'Home Depot','https://www.homedepot.com/p/202066695','15A tamper-resistant, decorator style'),
   option('commercial',6.49,'Home Depot','https://www.homedepot.com/b/Electrical-Wiring-Devices-Light-Controls-Electrical-Outlets-Receptacles-Outlets/White/15-A/Tamper-Resistant/N-5yc1vZ2fkpdz5Z1z0vm5fZ1z11zkbZ1z241ti','15A commercial grade')
  ]},
 {id:'gfci-15a',trade:'electrical',en:'15A 125V self-test GFCI outlet',es:'Tomacorriente GFCI 15A 125V',
  unit:'ea',defaultTier:'standard',options:[
   option('basic',19.98,'Home Depot','https://www.homedepot.com/b/Electrical-Wiring-Devices-Light-Controls-Electrical-Outlets-Receptacles-Protection-Devices/Leviton/15-A/GFCI/N-5yc1vZ2fkpdzbZwcZ1z11zkbZ1z17vh7','15A self-test tamper resistant'),
   option('standard',23.98,'Home Depot','https://www.homedepot.com/p/206860596','15A self-test tamper resistant'),
   option('premium',26.98,'Home Depot','https://www.homedepot.com/b/Electrical-Wiring-Devices-Light-Controls-Electrical-Outlets-Receptacles/Leviton/15-A/GFCI/N-5yc1vZc33aZwcZ1z11zkbZ1z17vh7','15A lever-edge self-test GFCI')
  ]},
 {id:'romex-14-2-100ft',trade:'electrical',en:'14/2 NM-B copper cable with ground — 100 ft roll',es:'Cable Romex 14/2 cobre NM-B con tierra — rollo 100 pies',
  unit:'roll',lengthFt:100,defaultTier:'standard',options:[
   option('basic',84,'Lowe\'s','https://www.lowes.com/pd/southwire-romex-simpull-100-ft-14-2-non-metallic-wire-by-the-roll/1000131785','100ft 14/2 NM-B copper indoor'),
   option('standard',88,'Home Depot','https://www.homedepot.com/b/Electrical-Wire-Building-Wires/100-ft/14-2/N-5yc1vZc57aZ1z1uh6mZ1z1uhc6','100ft 14/2 NM-B copper indoor')
  ]},
 {id:'drywall-half-4x8',trade:'drywall',en:'1/2-inch drywall sheet — 4 × 8 ft',es:'Hoja de drywall de 1/2 pulgada — 4 × 8 pies',
  unit:'sheet',sqftPerUnit:32,defaultTier:'standard',options:[
   option('standard',16.68,'Home Depot','https://www.homedepot.com/b/Building-Materials-Drywall-Drywall-Sheets/Drywall/1-2-in/4x8/N-5yc1vZbb52Z1z0ppqdZ1z10nw4','Standard lightweight 1/2 x 4 x 8 drywall'),
   option('mold-resistant',23.58,'Home Depot','https://www.homedepot.com/b/Building-Materials-Drywall-Drywall-Sheets/Drywall/1-2-in/4x8/N-5yc1vZbb52Z1z0ppqdZ1z10nw4','Mold-resistant 1/2 x 4 x 8 drywall')
  ]},
 {id:'joint-20min-18lb',trade:'drywall',en:'20-minute setting joint compound — 18 lb bag',es:'Compuesto para juntas de 20 minutos — saco 18 lb',
  unit:'bag',defaultTier:'standard',options:[
   option('standard',13.62,'Home Depot','https://www.homedepot.com/b/Building-Materials-Drywall-Joint-Compound/USG-Sheetrock-Brand/USG-Corporation-Joint-Compound/Powder-Joint-Compound/N-5yc1vZard1ZomdZ1z10nw1Z1z23xuf','20-minute setting compound 18 lb'),
   option('alternative',18.49,'Lowe\'s Pro Supply','https://www.lowesprosupply.com/Product/Easy-Sand-20-Min-Joint-C-USG-EASY-SAND-804191','20-minute setting compound 18 lb')
  ]}
].map(x=>Object.freeze({...x,options:Object.freeze(x.options)})));
const byId=new Map(catalog.map(x=>[x.id,x]));
const lower=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const numWords={one:1,un:1,una:1,uno:1,two:2,dos:2,three:3,tres:3,four:4,cuatro:4,five:5,cinco:5,six:6,seis:6,seven:7,siete:7,eight:8,ocho:8,nine:9,nueve:9,ten:10,diez:10};
const words='(?:\\d+(?:[.,]\\d+)?|one|un|una|uno|two|dos|three|tres|four|cuatro|five|cinco|six|seis|seven|siete|eight|ocho|nine|nueve|ten|diez)';
const parseNumber=s=>numWords[s]||Number(String(s).replace(',','.'));
const money=n=>Math.round((n+Number.EPSILON)*100)/100;
const numUnit=(text,terms)=>{
 const p1=new RegExp('\\b('+words+')\\s*(?:\\w+\\s+){0,2}?(?:'+terms+')\\b','i');
 const m=text.match(p1);return m?parseNumber(m[1]):null;
};
function lookup(id,tier){
 const item=byId.get(id);if(!item)return null;
 const selected=item.options.find(o=>o.tier===(tier||item.defaultTier));
 if(!selected)return null;
 return {id:item.id,en:item.en,es:item.es,unit:item.unit,trade:item.trade,tier:selected.tier,
   unitCost:selected.cost,store:selected.store,sourceUrl:selected.url,observedOn:selected.observedOn,
   specification:selected.spec};
}
function isStale(observedOn,now=DATE,maxAgeDays=45){
 const start=Date.parse(observedOn+'T12:00:00Z'),end=Date.parse(now+'T12:00:00Z');
 if(!Number.isFinite(start)||!Number.isFinite(end))return true;
 return (end-start)/86400000>maxAgeDays;
}
function choose(id,tier,now=DATE){
 const result=lookup(id,tier);
 return result?{...result,isStale:isStale(result.observedOn,now),status:'cached_retail_reference'}:null;
}
function add(lines,questions,id,quantity,reason,choice,now){
 const p=choose(id,choice,now);
 if(!p)throw Error('No cached price: '+id);
 const positive=typeof quantity==='number'&&Number.isInteger(quantity)&&quantity>0;
 if(!positive)questions.push({id,code:'quantity_needed',message:'Confirm quantity for '+p.en});
 lines.push({...p,quantity:positive?quantity:null,total:positive?money(quantity*p.unitCost):null,quantityBasis:reason});
}
function parseOutlet(text,lines,questions,opts,now){
 const outlet=/(?:outlets?|enchufes?|tomacorrientes?|receptaculos?)/i.test(text);
 if(!outlet)return;
 if(/\b(?:240|220|208)\s*(?:v|volt|volts|voltios)\b/i.test(text)||/\b20\s*(?:a|amp|amperios)\b/i.test(text)){
  questions.push({code:'outlet_spec',message:'Confirm outlet amperage and voltage: 15A reference not applicable to this description'});
  return;
 }
 // One phrase "5 old outlets replaced with new outlets" is FIVE devices, not ten.
 const replacement=/(?:replace|reemplaz|cambi|sustitu|swap)/i.test(text);
 const repl=text.match(new RegExp('(?:replace|reemplaz\\w*|cambi\\w*|sustitu\\w*|swap)\\s+(?:\\w+\\s+){0,3}?('+words+')\\s*(?:\\w+\\s+){0,3}?(?:outlets?|enchufes?|tomacorrientes?|receptaculos?)','i')) ||
 text.match(new RegExp('\\b('+words+')\\s*(?:\\w+\\s+){0,3}?(?:outlets?|enchufes?|tomacorrientes?|receptaculos?)\\b','i'));
 const count=repl?parseNumber(repl[1]):null;
 const gfci=/\b(?:gfci|gfi)\b|g\s*f\s*c\s*i/i.test(text);
 const spokenMaybe=/(?:10|ten)\s+si\s+(?:hay|ai)/i.test(text);
 let speciality=null;
 const subset=text.match(new RegExp('\\b('+words+')\\s+(?:de\\s+ellos?|of\\s+them|seran|van\\s+a\\s+ser)[\\s\\S]{0,45}?(?:gfci|gfi|10\\s+si\\s+hay)','i'))
  ||text.match(new RegExp('\\b('+words+')\\s*(?:gfci|gfi)','i'));
 if(subset)speciality=parseNumber(subset[1]);
 if((gfci||spokenMaybe)&&speciality===null)questions.push({code:'gfci_quantity',message:'Confirm number of GFCI outlets'});
 if(spokenMaybe&&!gfci)questions.push({code:'confirm_gfci',message:'Speech may have misheard GFCI; confirm before pricing'});
 if(!Number.isInteger(count)||count<1){questions.push({code:'outlet_quantity',message:'Confirm how many outlets are involved'});return}
 if(speciality!==null&&speciality>count){questions.push({code:'outlet_subset',message:'GFCI subset cannot exceed outlet total'});return}
 if(!gfci && spokenMaybe){add(lines,questions,'duplex-15a',null,'pending GFCI confirmation',opts['duplex-15a'],now);return}
 const g=gfci?(speciality??0):0;
 const regular=count-g;
 if(regular>0)add(lines,questions,'duplex-15a',regular,replacement?'existing device replacements':'described devices',opts['duplex-15a'],now);
 if(g>0)add(lines,questions,'gfci-15a',g,'subset of '+count+' devices (not additional)',opts['gfci-15a'],now);
 if(!replacement)questions.push({code:'new_install_scope',message:'Confirm whether these are new installations, not just replacement devices'});
}
function parseWire(text,lines,questions,opts,now){
 if(!/\b(?:romex|nm-?b|cable|wire|alambre)\b/.test(text))return;
 if(/(?:12\s*\/\s*2|12\s*(?:gauge|awg)|10\s*\/\s*2|10\s*(?:awg|gauge))/.test(text))return;
 let type=/\b14\s*\/\s*2\b/.test(text);
 const fourteen=/(?:\b14\s*(?:gauge|awg)\b|\bcalibre\s*14\b)/.test(text);
 if(!type && fourteen && /(?:2\s*(?:conductores?|wires?)|dos\s+conductores?)/.test(text))type=true;
 if(!type){
  if(fourteen)questions.push({code:'wire_conductors',message:'Confirm cable construction (14/2 NM-B or another type)'});
  return;
 }
 if(!/\b(?:romex|nm-?b)\b/.test(text))questions.push({code:'wire_use',message:'Confirm this is indoor NM-B with ground, not a different cable'});
 const n= text.match(/(\d+(?:[.,]\d+)?)\s*(?:ft|feet|pies|linear feet)\b/);
 if(!n){questions.push({code:'wire_length',message:'Confirm total cable footage'});add(lines,questions,'romex-14-2-100ft',null,'roll quantity unknown',opts['romex-14-2-100ft'],now);return}
 const feet=parseNumber(n[1]);
 if(!(feet>0))return;
 const runs=text.match(new RegExp('\\b('+words+')\\s+(?:runs?|recorridos?|circuitos?)\\b','i'));
 // Two circuits with 100 ft spoken may mean 100 ft each or 100 ft total; never double guess.
 if(runs&&parseNumber(runs[1])>1)questions.push({code:'wire_total_run',message:'Confirm whether '+feet+' ft is total cable length or per circuit'});
 const rolls=Math.ceil(feet/100);
 add(lines,questions,'romex-14-2-100ft',rolls,feet+' ft nominal, '+rolls+' whole 100ft roll(s) with no extra waste',opts['romex-14-2-100ft'],now);
 questions.push({code:'wire_waste',message:'Confirm total route length includes slack and waste before purchase'});
}
function parseDrywall(text,lines,questions,opts,now){
 if(!/(?:drywall|sheetrock|tablaroca|gypsum|paneles?\s+de\s+yeso)/.test(text))return;
 if(/(?:5\s*\/\s*8|cinco\s+octavos)/.test(text))return;
 const half=/\b1\s*\/\s*2\b|media\s+pulgada|half[\s-]*inch/.test(text);
 const four8=/\b4\s*(?:x|×|by|por)\s*8\b|four\s+by\s+eight|cuatro\s+por\s+ocho/.test(text);
 if(!half||!four8){questions.push({code:'drywall_spec',message:'Confirm 1/2-inch, 4x8 standard drywall; other sizes/prices differ'});return}
 const sheets=numUnit(text,'(?:drywall\\s+)?(?:sheets?|hojas?|paneles?)');
 const area=text.match(/(\d+(?:[.,]\d+)?)\s*(?:sq\s*ft|square\s*feet|sf|pies\s*cuadrados)\b/);
 const count=(sheets&&sheets>0)?sheets:area?Math.ceil(parseNumber(area[1])/32):null;
 add(lines,questions,'drywall-half-4x8',count, sheets?'explicit sheet count':area?'area divided by 32 sq ft per sheet, no waste':'not measured',opts['drywall-half-4x8'],now);
 if(count&&!sheets)questions.push({code:'drywall_waste',message:'Confirm cutting/waste allowance and actual sheet count'});
}
function parseMud(text,lines,questions,opts,now){
 if(!/(?:joint\s+compound|easy\s+sand|mud|compuesto|masilla)/.test(text))return;
 if(!/(?:20[\s-]*(?:minute|minuto|min\b)|twenty[\s-]*minute|veinte\s+minutos)/.test(text))return;
 const count=numUnit(text,'(?:bags?|sacos?|bolsas?)');
 add(lines,questions,'joint-20min-18lb',count,'18lb bag count: '+(count||'missing'),opts['joint-20min-18lb'],now);
}
function fromTranscript(input,{tiers={},now=DATE}={}){
 const text=lower(input),lines=[],questions=[];
 if(!text)return {lines,questions:[{code:'description',message:'Describe the job'}],status:'needs_review',retailReferenceDate:DATE};
 parseOutlet(text,lines,questions,tiers,now);
 parseWire(text,lines,questions,tiers,now);
 parseDrywall(text,lines,questions,tiers,now);
 parseMud(text,lines,questions,tiers,now);
 if(!lines.length&&!questions.length)questions.push({code:'no_catalog_match',message:'This job has no matching priced reference yet; do not invent a material price'});
 const stale=lines.some(x=>x.isStale);
 if(stale)questions.push({code:'stale_prices',message:'Cached retail prices are older than 45 days; refresh when possible'});
 return {lines,questions,status:questions.length?'needs_review':'reference_ready',
   retailReferenceDate:DATE,source:'offline_cached_retail_references'};
}
function totals(result){
 const missing=result.lines.some(x=>x.total===null);
 return {materialSubtotal:missing?null:money(result.lines.reduce((s,x)=>s+x.total,0)),
   complete:!missing&&result.questions.length===0};
}
const api=Object.freeze({catalog,lookup,choose,fromTranscript,totals,isStale});
root.COPReferencePrices=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
