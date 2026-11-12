import type {EstimateLine} from './estimate';

/**
 * Local, no-network first draft for native iPhone painting jobs.
 * This is a costed planning allowance, not a verified supplier quotation.
 * Every explicitly measured area is counted, unmeasured areas remain visible
 * as scope notes (not silently assumed included).
 */
type Area={category:'bedroom'|'bathroom'|'kitchen'|'living';count:number;length:number;width:number};
export type PaintingMeasurements={livingLengthFt?:number;livingWidthFt?:number;excludeLivingRoom?:boolean};
export type NativePaintingDraft={lines:EstimateLine[];unknowns:string[];recognized:boolean;missingMeasurements:Array<'living'>};
const clean=(s:string)=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
const words:Record<string,number>={un:1,una:1,uno:1,one:1,dos:2,two:2,tres:3,three:3,cuatro:4,four:4,cinco:5,five:5,seis:6,six:6,siete:7,seven:7,ocho:8,eight:8,nueve:9,nine:9,diez:10,ten:10};
const count=(s:string)=>words[s]||Number(s)||0;
const reCount='(\\d{1,2}|un|una|uno|one|dos|two|tres|three|cuatro|four|cinco|five|seis|six|siete|seven|ocho|eight|nueve|nine|diez|ten)';
const money=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const line=(id:string,en:string,es:string,qty:number,unit:string,rate:number,basis:string):EstimateLine=>({
 id:'local-paint-'+id,description_en:en,description_es:es,quantity:qty,unit,rate,
 rateSource:basis,status:'allowance_to_confirm'
});
function findRoomSize(text:string,category:Area['category']){
 const rx=category==='bedroom'?/(?:habitaciones?|recamaras?|cuartos?|bedrooms?|rooms?)/:
   category==='bathroom'?/(?:banos?|bathrooms?|baths?)/:
   category==='kitchen'?/(?:cocina|kitchen)/:/(?:sala|comedor|living|dining)/;
 const items:Array<{start:number;end:number;a:number;b:number}>=[];
 const dimension=/\b(\d{1,2}(?:[.,]\d+)?)\s*(?:pies?|ft|feet)?\s*(?:por|x|×|\*)\s*(\d{1,2}(?:[.,]\d+)?)\b/g;
 for(const m of text.matchAll(dimension)){
  const a=Number(m[1].replace(',','.')),b=Number(m[2].replace(',','.'));
  if(a>0&&b>0&&a<=50&&b<=50)items.push({start:m.index,end:m.index+m[0].length,a,b});
 }
 const keyword=new RegExp(rx.source,'g');
 const tokens=[...text.matchAll(keyword)].map(m=>m.index);
 if(!tokens.length||!items.length)return null;
 const near=items.map(it=>({it,distance:Math.min(...tokens.map(i=>Math.abs(i-it.start)))})).sort((a,b)=>a.distance-b.distance);
 return near[0]&&near[0].distance<70?near[0].it:null;
}
function parsePaintingAreas(text:string,measurements:PaintingMeasurements={}):{areas:Area[];unknowns:string[];wallHeight:number;primerKitchenBath:boolean;missingMeasurements:Array<'living'>}|null{
 const s=clean(text);
 if(!/\b(?:pintar|pintura|paint|painting)\b/.test(s)||/\b(?:exterior|fachada)\b/.test(s))return null;
 const areas:Area[]=[],unknowns:string[]=[],missingMeasurements:Array<'living'>=[];
 const h=s.match(/(?:altura\s+(?:en\s+)?paredes?|paredes?\s+(?:de|son|tienen)|wall\s+height|ceiling\s+height)[^\d]{0,24}?(\d{1,2}|ocho|eight|nueve|nine|diez|ten)\s*(?:pies?|feet|ft)?/);
 const heightNames:Record<string,number>={ocho:8,eight:8,nueve:9,nine:9,diez:10,ten:10};
 const wallHeight=h?(heightNames[h[1]]||Number(h[1])):8;
 if(wallHeight<6||wallHeight>16)return null;
 if(!h)unknowns.push('Assumed wall height 8 ft / Se supuso altura de 8 pies.');
 const explicitBedroom=s.match(new RegExp('\\b'+reCount+'\\s+(?:habitaciones?|recamaras?|cuartos?|bedrooms?|rooms?)\\b'));
 const explicitBathroom=s.match(new RegExp('\\b'+reCount+'\\s+(?:banos?|bathrooms?|baths?)\\b'));
 const bedroomQty=explicitBedroom?count(explicitBedroom[1]):0;
 const bathQty=explicitBathroom?count(explicitBathroom[1]):0;
 // Grouped dimensions such as "3 bedrooms 15 x 15" or "3 bathrooms 7 x 5".
 const bedroom=findRoomSize(s,'bedroom');
 const bath=findRoomSize(s,'bathroom');
 const kitchen=findRoomSize(s,'kitchen');
 const living=findRoomSize(s,'living');
 if(bedroom&&bedroomQty>0)areas.push({category:'bedroom',count:bedroomQty,length:bedroom.a,width:bedroom.b});
 else if(bedroom&&/\b(?:habitacion|recamara|bedroom)\b/.test(s))areas.push({category:'bedroom',count:1,length:bedroom.a,width:bedroom.b});
 else if(bedroomQty>0)unknowns.push('Bedroom dimensions not recognized / Faltan medidas de habitaciones.');
 if(bath&&bathQty>0)areas.push({category:'bathroom',count:bathQty,length:bath.a,width:bath.b});
 else if(bath&&/\b(?:bano|bathroom)\b/.test(s))areas.push({category:'bathroom',count:1,length:bath.a,width:bath.b});
 else if(bathQty>0)unknowns.push('Bathroom dimensions not recognized / Faltan medidas de baños.');
 if(kitchen)areas.push({category:'kitchen',count:1,length:kitchen.a,width:kitchen.b});
 else if(/\b(?:cocina|kitchen)\b/.test(s))unknowns.push('Kitchen dimensions not recognized / Faltan medidas de cocina.');
 if(living)areas.push({category:'living',count:1,length:living.a,width:living.b});
 else if(measurements.livingLengthFt&&measurements.livingWidthFt &&
  measurements.livingLengthFt>0&&measurements.livingWidthFt>0&&
  measurements.livingLengthFt<=50&&measurements.livingWidthFt<=50 &&
  /\b(?:sala|living|comedor|dining)\b/.test(s))
  areas.push({category:'living',count:1,length:measurements.livingLengthFt,width:measurements.livingWidthFt});
 else if(/\b(?:sala|living|comedor|dining)\b/.test(s)&&!measurements.excludeLivingRoom){
  missingMeasurements.push('living');
  unknowns.push('Living-room area not measured; not included in priced quantities / Sala sin medidas; no incluida en cantidades cotizadas.');
 }
 if(!areas.length)return null;
 const primerKitchenBath=/(?:primer|sellador|imprimacion|base\s+coat)/.test(s);
 return {areas,unknowns,wallHeight,primerKitchenBath,missingMeasurements};
}
export function mobilePaintingEstimate(description:string,measurements:PaintingMeasurements={}):NativePaintingDraft|null{
 const parsed=parsePaintingAreas(description,measurements);
 if(!parsed)return null;
 const {areas,unknowns,wallHeight,primerKitchenBath,missingMeasurements}=parsed;
 const gross=(kind:Area['category'][])=>areas.filter(a=>kind.includes(a.category)).reduce((s,a)=>s+2*(a.length+a.width)*a.count*wallHeight,0);
 const eggshellSf=money(gross(['bedroom','living'])*0.9);
 const semiSf=money(gross(['kitchen','bathroom'])*0.9);
 const allSf=eggshellSf+semiSf;
 if(allSf<=0)return null;
 const coats=2,coverage=350,waste=1.1;
 const eggGallons=Math.ceil(eggshellSf*coats*waste/coverage);
 const semiGallons=Math.ceil(semiSf*coats*waste/coverage);
 const primerGallons=primerKitchenBath?Math.ceil(semiSf*waste/coverage):0;
 const hours=Math.ceil(((allSf/75)+3+(primerKitchenBath?semiSf/135:0))*2)/2;
 const prep=money(allSf*0.1);
 const pricedAreas=areas.map(a=>a.count+' '+a.category+' '+a.length+'×'+a.width+' ft').join('; ');
 const basis='2026 preliminary materials and labor assumptions, NOT live retail pricing. '+pricedAreas+
  '; 8-ft walls unless stated; 10% openings; two coats; 350 sq ft/gal/coat; 10% waste; estimated crew-hours';
 const lines:EstimateLine[]=[];
 if(eggGallons)lines.push({...line('eggshell','Interior eggshell paint — bedrooms / measured living areas',
  'Pintura eggshell interior — habitaciones / áreas de sala medidas',eggGallons,'gal',37.98,basis+'; $37.98/gal cached retailer example, not live'),
  priceEvidence:{kind:'cached_retail_reference',merchant:'Home Depot',observedOn:'2026-11-11',
   referenceUrl:'https://www.homedepot.com/p/204405954',detail:'Interior eggshell paint, one-gallon example; confirm grade and store price'}});
 if(semiGallons)lines.push({...line('semigloss','Interior semigloss paint — kitchen and bathrooms',
  'Pintura semi-gloss interior — cocina y baños',semiGallons,'gal',45,basis+'; $45/gal unverified planning allowance'),
  priceEvidence:{kind:'planning_allowance',detail:'Semigloss paint $45/gal; replace with actual retailer reference when refreshed'}});
 if(primerGallons)lines.push({...line('primer','One coat of primer — kitchen and bathrooms',
  'Una mano de primer — cocina y baños',primerGallons,'gal',25,basis+'; $25/gal unverified planning allowance'),
  priceEvidence:{kind:'planning_allowance',detail:'Primer $25/gal; replace with actual retailer reference when refreshed'}});
 lines.push(line('prep','Ordinary masking, surface preparation and supplies — one job',
  'Protección, preparación básica y materiales — un solo trabajo',1,'job',prep,basis+'; $0.10/sq ft provisional prep'));
 lines.push(line('labor','Painting labor for all measured rooms — total crew hours',
  'Mano de obra de pintura para todos los espacios medidos — horas totales',hours,'hr',60,basis+'; $60/crew-hour placeholder loaded labor COST'));
 lines.push(line('mobilization','Travel and purchasing — once for entire job',
  'Viaje y compras — una sola vez para todo el trabajo',1,'job',75,basis+'; once per job'));
 unknowns.push('Planning quote for measured walls only; ceilings, doors, trim and repairs not included. / Borrador solo para muros medidos; cielos, puertas, molduras y reparaciones excluidos.');
 unknowns.push('Paint brand/finish and all material allowances are editable; no live supplier quote. / Marca, acabados y costos de material son editables; no hay cotización de tienda en vivo.');
 return {lines,unknowns,recognized:true,missingMeasurements};
}
