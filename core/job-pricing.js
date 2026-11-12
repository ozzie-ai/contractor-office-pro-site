/* Contractor Office Pro — independent cost and retail-check helpers.
   Pure functions in a classic script so the original bilingual, voice-first app can use them.
   No fabricated store prices and no hidden retailer scraping. */
(function(root){
'use strict';
const NUMBER_WORDS={un:1,uno:1,una:1,one:1,dos:2,two:2,tres:3,three:3,cuatro:4,four:4,cinco:5,five:5,seis:6,six:6,siete:7,seven:7,ocho:8,eight:8,nueve:9,nine:9,diez:10,ten:10};
const numberToken=x=>Object.prototype.hasOwnProperty.call(NUMBER_WORDS,String(x).toLowerCase())?NUMBER_WORDS[String(x).toLowerCase()]:Number(x);
const numRE='(\\d+|un|uno|una|one|dos|two|tres|three|cuatro|four|cinco|five|seis|six|siete|seven|ocho|eight|nueve|nine|diez|ten)';
const outletRE='(?:outlets?|enchufes?|tomacorrientes?|recept[aá]culos?)';
const gfciRE=/(?:\bg\s*f\s*c\s*i\b|\bgfci\b|\bgfi\b|ge\s+efe\s+ce\s+i)/i;
const replaceRE=/(?:reemplaz|cambi|sustitu|replace|swapp?)/i;
const newInstallRE=/(?:agreg|a[nñ]ad|add|additional|extra|install(?:ar)?\s+(?:un|dos|tres|\d+)\s+(?:new|additional|nuevos?))/i;
const sourceNames=new Set(['Home Depot',"Lowe's",'Other retailer','Contractor invoice']);
function normalize(raw){return String(raw||'').replace(/\s+/g,' ').trim()}
function firstCount(notes,verb){
 const r1=new RegExp('(?:'+verb+')\\w*[^.\\n;]{0,85}?\\b'+numRE+'\\s*(?:\\w+\\s+){0,2}?'+outletRE,'i');
 const r2=new RegExp('\\b'+numRE+'\\s*(?:\\w+\\s+){0,2}?'+outletRE+'[^.\\n;]{0,55}?(?:'+verb+')','i');
 const a=notes.match(r1)||notes.match(r2);return a?numberToken(a[1]):null;
}
function isOutletRequest(raw){
 const s=normalize(raw);return new RegExp(outletRE,'i').test(s)&&
   (replaceRE.test(s)||newInstallRE.test(s));
}
/** Returns a tentative scope; never convert a garbled GFCI term into a fact. */
function parseOutletRequest(raw){
 const text=normalize(raw);if(!isOutletRequest(text))return null;
 const replace=replaceRE.test(text);
 const total=replace?firstCount(text,'(?:reemplaz|cambi|sustitu|replace|swapp?)'):null;
 const standaloneAdd=/\b(?:agregar|agrega|a[nñ]adir|add|instalar|install)\s+(?:otros?|adicionales?|additional|extra)?\s*(?:\d+|un|una|uno|one|dos|two|tres|three|cuatro|four|cinco|five)\s*(?:nuevos?|new|additional|extra)?\s*(?:outlets?|enchufes?|tomacorrientes?|recept[aá]culos?)/i;
 const extraMatch=text.match(standaloneAdd);
 const additional=extraMatch&&newInstallRE.test(extraMatch[0])?numberToken((extraMatch[0].match(new RegExp(numRE,'i'))||[])[1]):0;
 const hasGfci=gfciRE.test(text);
 const garbledGfci=/(?:10|ten)\s+si\s+(?:hay|ai)|ye\s+efe\s+ce\s+i/i.test(text);
 const subset=text.match(new RegExp('\\b'+numRE+'\\s+(?:de\\s+ellos?|of\\s+them|ser[aá]n|van\\s+a\\s+ser)[\\s\\S]{0,45}?(?:gfci|gfi|g\\s*f\\s*c\\s*i|10\\s+si\\s+hay)','i'))
  ||text.match(new RegExp('\\b'+numRE+'\\s*(?:gfci|gfi|g\\s*f\\s*c\\s*i)','i'));
 const specialtyCount=subset?numberToken(subset[1]):null;
 const contractorSupplies=/(?:yo\s+(?:voy\s+a\s+)?(?:poner|pongo|ponemos|comprar|compro|compramos|suministrar|suministro|traer|traigo)[\s\S]{0,30}?(?:material|materials?)|contratista[\s\S]{0,30}?(?:material|suministra)|(?:i|we)\s+(?:will\s+)?(?:supply|provide|buy)\s+(?:the\s+)?materials?|contractor\s+suppl)/i.test(text);
 const ownerSupplies=/(?:cliente|due[nñ]o|owner|homeowner)[\s\S]{0,30}?(?:pone|compra|suministra|provides?|suppl)/i.test(text);
 const questions=[];
 if(replace&&!(total>0))questions.push('total_outlets');
 if(hasGfci&&specialtyCount===null)questions.push('gfci_count');
 if(garbledGfci&&!hasGfci)questions.push('confirm_gfci_transcript');
 if(specialtyCount!==null&&total!==null&&specialtyCount>total)questions.push('gfci_exceeds_total');
 if(!contractorSupplies&&!ownerSupplies)questions.push('material_supplier');
 return {replacement:replace,total:total??null,additional:additional||0,
   gfciCount:hasGfci?specialtyCount:null,
   suspectedGfciCount:garbledGfci&&!hasGfci?specialtyCount:null,
   contractorSupplies:contractorSupplies&&!ownerSupplies,
   ownerSupplies:ownerSupplies&&!contractorSupplies,
   questions,transcript:text};
}
function finalOutletScope(parsed,{gfciCount,contractorSupplies}={}){
 if(!parsed||!parsed.replacement||!(parsed.total>0))throw Error('Confirm the quantity and replacement scope.');
 const count=Number(gfciCount);
 if(!Number.isInteger(count)||count<0||count>parsed.total)throw Error('Confirm how many of the replacements are GFCI.');
 if(typeof contractorSupplies!=='boolean')throw Error('Confirm who supplies the materials.');
 return {replacementCount:parsed.total,standardCount:parsed.total-count,gfciCount:count,
   additionalCount:parsed.additional||0,contractorSupplies,notes:parsed.questions.slice()};
}
function money(n){return Math.round((n+Number.EPSILON)*100)/100}
function nonnegative(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0}
function validRetailEntry(p){
 if(!p||!nonnegative(p.unitCost)||!sourceNames.has(p.retailer)||!p.checkedOn)return false;
 const date=new Date(p.checkedOn+'T12:00:00Z');
 if(!Number.isFinite(date.getTime()))return false;
 if(p.productUrl&&!/^https:\/\/(?:www\.)?(?:homedepot\.com|lowes\.com)\//i.test(p.productUrl))return false;
 return true;
}
function retailerSearch(term){
 const query=encodeURIComponent(String(term||'').trim());
 return {homeDepot:'https://www.homedepot.com/s/'+query,
   lowes:'https://www.lowes.com/search?searchTerm='+query};
}
/** One trip, shared labor hours; costs must be provided rather than guessed.
 * Materials use checked retailer prices or a verified contractor invoice.
 * Numbers are internal COSTS, not a retailer's proposed selling price.
 */
function visitCost({materials=[],laborHours,laborCostPerHour,tripAndPurchaseCost,miscSupplyCost,overheadPct,profitPct}={}){
 const blockers=[];
 const parts=[];
 for(const m of materials){
  if(!Number.isInteger(m.quantity)||m.quantity<0){blockers.push('quantity:'+m.id);continue}
  if(!validRetailEntry(m.pricing)){blockers.push('material_price:'+m.id);continue}
  parts.push({id:m.id,category:'material',description:m.description,quantity:m.quantity,
    unitCost:m.pricing.unitCost,extended:money(m.quantity*m.pricing.unitCost),retailer:m.pricing.retailer,
    checkedOn:m.pricing.checkedOn,productUrl:m.pricing.productUrl||''});
 }
 for(const [name,value] of [['laborHours',laborHours],['laborCostPerHour',laborCostPerHour],
    ['tripAndPurchaseCost',tripAndPurchaseCost],['miscSupplyCost',miscSupplyCost],['overheadPct',overheadPct],['profitPct',profitPct]]){
  if(!nonnegative(value))blockers.push(name);
 }
 if(nonnegative(overheadPct)&&overheadPct>100)blockers.push('overheadPct');
 if(nonnegative(profitPct)&&profitPct>100)blockers.push('profitPct');
 if(blockers.length)return {complete:false,blockers,parts,totals:null};
 const materialCost=money(parts.reduce((n,p)=>n+p.extended,0));
 const laborCost=money(laborHours*laborCostPerHour);
 const trip=money(tripAndPurchaseCost),supplies=money(miscSupplyCost);
 const directCost=money(materialCost+laborCost+trip+supplies);
 const overhead=money(directCost*overheadPct/100);
 const profit=money((directCost+overhead)*profitPct/100);
 const total=money(directCost+overhead+profit);
 return {complete:true,blockers:[],parts,totals:{materialCost,laborCost,trip,supplies,directCost,overhead,profit,total},
   breakdown:[...parts,{id:'visit_labor',category:'labor',quantity:laborHours,unit:'hr',unitCost:laborCostPerHour,extended:laborCost},
    {id:'trip_purchasing',category:'service',quantity:1,unit:'job',unitCost:trip,extended:trip},
    {id:'incidentals',category:'service',quantity:1,unit:'job',unitCost:supplies,extended:supplies}]};
}
const api=Object.freeze({parseOutletRequest,finalOutletScope,isOutletRequest,visitCost,validRetailEntry,retailerSearch});
root.COPCosting=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
