/**
 * Contractor Office Pro: one-dictation interior painting takeoff.
 * Pure, bilingual, conservative parser and editable planning estimate.
 * No SKU, network request, questionnaire, or invisible compulsory confirmation.
 */
(function(root){
'use strict';
const numWords={un:1,una:1,uno:1,one:1,primera:1,primer:1,first:1,dos:2,two:2,segunda:2,segundo:2,second:2,tres:3,three:3,tercera:3,tercero:3,third:3,cuatro:4,four:4,cinco:5,five:5,seis:6,six:6,siete:7,seven:7,ocho:8,eight:8,nueve:9,nine:9,diez:10,ten:10,doce:12,twelve:12,quince:15,fifteen:15,veinte:20,twenty:20,veintidos:22,'twenty-two':22};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const term='(?:\\d+(?:[.,]\\d+)?|twenty-two|veintidos|twenty|veinte|fifteen|quince|twelve|doce|seven|siete|three|tres|five|cinco|eight|ocho|four|cuatro|nine|nueve|six|seis|ten|diez|two|dos|one|uno|una|un)';
const dimRE=new RegExp('\\b('+term+')\\s*(?:ft\\.?|feet|pies)?\\s*(?:\\*|x|×|por|by)\\s*('+term+')\\b','gi');
const val=s=>Object.prototype.hasOwnProperty.call(numWords,String(s).toLowerCase())?numWords[String(s).toLowerCase()]:Number(String(s).replace(',','.'));
const money=n=>Math.round((n+Number.EPSILON)*100)/100;
const roundHalf=n=>Math.ceil(n*2)/2;
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const categories={
 bedroom:{en:'Bedroom',es:'Habitación'},
 bathroom:{en:'Bathroom',es:'Baño'},
 kitchen:{en:'Kitchen',es:'Cocina'},
 living_dining:{en:'Living / dining',es:'Sala / comedor'},
 closet:{en:'Closet',es:'Clóset'},
 other:{en:'Area',es:'Área'}
};
function classify(prefix){
 // Use the words *nearest* the dimension, rather than "three bedrooms"
 // at the beginning of an entire transcript.
 if(/\b(?:closets?|closets? de|armarios?|vestidores?)\b/.test(prefix))return 'closet';
 if(/\b(?:banos?|bathrooms?|baths?)\b/.test(prefix))return 'bathroom';
 if(/\b(?:cocina|kitchen)\b/.test(prefix))return 'kitchen';
 if(/\b(?:sala|comedor|living|dining|family\s+room)\b/.test(prefix))return 'living_dining';
 if(/\b(?:habitaciones?|cuartos?|recamaras?|bedrooms?|bed\s+rooms?)\b/.test(prefix))return 'bedroom';
 return 'other';
}
function closetCount(prefix){
 const match=prefix.match(new RegExp('\\b('+term+')\\s*(?:closets?|armarios?|vestidores?)\\b','i'))
  ||prefix.match(new RegExp('(?:closets?|armarios?|vestidores?)\\s*(?:son|de)?\\s*('+term+')\\b','i'));
 return match?val(match[1]):1;
}
function ceilingHeight(text){
 const patterns=[
  /(?:altura|alto\s+de\s+(?:las\s+)?paredes|ceiling\s*height|wall\s*height)[^\d]{0,24}?(\d+(?:[.,]\d+)?)\s*(?:feet|ft|pies)?/,
  /(\d+(?:[.,]\d+)?)\s*(?:feet|ft|pies)\s*(?:de\s+altura|de\s+alto|high|tall)/
 ];
 for(const re of patterns){const found=text.match(re);if(found&&positive(val(found[1])))return {value:val(found[1]),assumed:false};}
 return {value:8,assumed:true};
}
function parse(text){
 const d=norm(text);
 if(!/(?:\bpintar\b|\bpintura\b|\bpaint\b|\bpainting\b)/.test(d)||/\b(?:exterior|outside|fachada)\b/.test(d))return null;
 const zones=[],unknown=[];
 let lastEnd=0, counts={bedroom:0,bathroom:0,kitchen:0,living_dining:0,closet:0,other:0};
 for(const match of d.matchAll(dimRE)){
  const l=val(match[1]),w=val(match[2]),prefix=d.slice(lastEnd,match.index);
  lastEnd=match.index+match[0].length;
  if(!positive(l)||!positive(w)||l>300||w>300){unknown.push('Review dimensions');continue;}
  const category=classify(prefix);
  const qty=category==='closet'?closetCount(prefix):1;
  if(!Number.isInteger(qty)||qty<1||qty>100){unknown.push('Review area count');continue}
  counts[category]+=qty;
  zones.push({category,index:counts[category]-(qty-1),quantity:qty,lengthFt:l,widthFt:w,
    floorSf:money(l*w*qty),perimeterLf:money(2*(l+w)*qty)});
 }
 if(zones.length<2)return null; // legacy single-room flow remains unchanged
 const expected={
  bedroom:(d.match(/\b(?:\d+|tres|three|dos|two|cuatro|four|cinco|five)\s+(?:habitaciones|bedrooms|cuartos|recamaras)\b/)||[])[0]
 };
 const reportedBedrooms=d.match(new RegExp('\\b('+term+')\\s+(?:habitaciones|bedrooms|cuartos|recamaras)\\b'));
 if(reportedBedrooms){
  const reported=val(reportedBedrooms[1]);
  if(reported>counts.bedroom)unknown.push('Some bedrooms have no dimensions');
 }
 const reportedBathrooms=d.match(new RegExp('\\b('+term+')\\s+(?:banos|bathrooms)\\b'));
 if(reportedBathrooms&&val(reportedBathrooms[1])>counts.bathroom)unknown.push('Some bathrooms have no dimensions');
 if(zones.some(x=>x.category==='other'))unknown.push('Check the type of unnamed areas');
 const height=ceilingHeight(d);
 const wallsGrossSf=money(zones.reduce((sum,z)=>sum+z.perimeterLf,0)*height.value);
 const floorSf=money(zones.reduce((sum,z)=>sum+z.floorSf,0));
 const explicitCeilings=/(?:pintar\s+(?:los|el)?\s*(?:techos|cielos|ceiling)|paint\s+(?:the\s+)?ceilings?)/.test(d);
 const excludedCeilings=/(?:sin\s+pintar\s+(?:los|el)?\s*(?:techos|cielos)|(?:no|not|without)\s+(?:paint|painting|pintar)\s+(?:the\s+)?ceilings?|solo\s+paredes|walls?\s+only)/.test(d);
 const includeCeilings=explicitCeilings&&!excludedCeilings;
 return {type:'interior_multiroom_paint',zones,counts,floorSf,wallsGrossSf,
  heightFt:height.value,assumedHeight:height.assumed,includeCeilings,
  missing:unknown,allMeasured:unknown.length===0,originalTextLen:String(text||'').length};
}
const DEFAULTS=Object.freeze({
 openingDeductionPct:10,coats:2,coverageSfPerGallon:350,paintWastePct:10,
 productiveWallSfPerHour:75,setupHours:3,loadedLaborCostPerHour:60,
 prepAllowancePerSf:0.10,jobMobilization:75,overheadPct:10,profitPct:20
});
function estimate(parsed,{settings={},paintUnitCost}={}){
 if(!parsed?.zones?.length)throw Error('Recognized room dimensions are required');
 const a={...DEFAULTS,...settings};
 for(const k of Object.keys(DEFAULTS))if(!Number.isFinite(a[k])||a[k]<0)throw Error('Invalid assumption: '+k);
 if(a.coverageSfPerGallon===0||a.productiveWallSfPerHour===0||a.coats===0||a.openingDeductionPct>=100)throw Error('Invalid estimation assumptions');
 if(!positive(paintUnitCost))throw Error('A material price reference is required');
 const wallNetSf=money(parsed.wallsGrossSf*(1-a.openingDeductionPct/100));
 const wallGallons=Math.ceil(wallNetSf*a.coats*(1+a.paintWastePct/100)/a.coverageSfPerGallon);
 const wallLaborHours=roundHalf(wallNetSf/a.productiveWallSfPerHour+a.setupHours);
 const ceilingGallons=parsed.includeCeilings?Math.ceil(parsed.floorSf*a.coats*(1+a.paintWastePct/100)/a.coverageSfPerGallon):0;
 const ceilingHours=parsed.includeCeilings?roundHalf(parsed.floorSf/(a.productiveWallSfPerHour*0.8)):0;
 const totalLaborHours=wallLaborHours+ceilingHours;
 const paintGallons=wallGallons+ceilingGallons;
 const prepCost=money(wallNetSf*a.prepAllowancePerSf+(parsed.includeCeilings?parsed.floorSf*a.prepAllowancePerSf:0));
 const materialCost=money(paintGallons*paintUnitCost);
 const laborCost=money(totalLaborHours*a.loadedLaborCostPerHour);
 const direct=money(materialCost+prepCost+laborCost+a.jobMobilization);
 const overhead=money(direct*a.overheadPct/100);
 const profit=money((direct+overhead)*a.profitPct/100);
 return {zones:parsed.zones,counts:parsed.counts,roomCount:parsed.zones.reduce((n,x)=>n+x.quantity,0),
  floorSf:parsed.floorSf,heightFt:parsed.heightFt,assumedHeight:parsed.assumedHeight,
  wallsGrossSf:parsed.wallsGrossSf,wallNetSf,wallGallons,ceilingGallons,paintGallons,
  includeCeilings:parsed.includeCeilings,coats:a.coats,coverageSfPerGallon:a.coverageSfPerGallon,
  totalLaborHours,paintUnitCost,prepCost,materialCost,laborCost,mobilization:a.jobMobilization,
  direct,overhead,profit,total:money(direct+overhead+profit),settings:a,
  missing:parsed.missing,allMeasured:parsed.allMeasured,
  assumptions:[...(parsed.assumedHeight?['8 ft wall height assumed']:[]),
   'Walls only unless ceilings were specifically requested',
   a.openingDeductionPct+'% provisional allowance for windows/doors',
   a.coats+' coats, '+a.paintWastePct+'% paint waste',
   'Normal prep only; major repairs, trim, doors and exterior excluded',
   'Labor time/rate, mobilization, overhead and profit are editable planning assumptions']};
}
const api=Object.freeze({parse,estimate,DEFAULTS});
root.COPQuickPaint=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
