import type {CleaningDetails} from './estimate';

// Conservative structured hints from a contractor's dictated cleaning notes.
// No inference is made when a detail is missing or ambiguous.
export function cleaningDetailsFromNotes(notes:string,existing:CleaningDetails):CleaningDetails{
 const text=notes.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const updates:Partial<CleaningDetails>={};
 const findCount=(unit:string)=> {
  const before=new RegExp('\\b(\\d{1,3})\\s*(?:'+unit+')\\b','i').exec(text);
  const after=new RegExp('\\b(?:'+unit+')\\s*[:=]?\\s*(\\d{1,3})\\b','i').exec(text);
  return before?Number(before[1]):after?Number(after[1]):undefined;
 };
 if(existing.cleaningTypeConfirmed===false&&/post[ -]?construction|construction cleanup|after construction|post[ -]?construccion|despues de (?:la )?(?:obra|construccion)|limpieza (?:de |tras )?obra|after remodel|despues de remodelacion/.test(text)){
  updates.type='post_construction';
  updates.cleaningTypeConfirmed=true;
 }
 if(existing.areaSqFt<=0){
  const m=/\b(\d{1,6})(?:[,.](\d{3}))?\s*(?:sq\.?\s*ft\.?|square feet|square foot|ft²|ft2|pies cuadrados|pies2|pies²)\b/i.exec(text);
  if(m){
   const area=Number(m[1]+(m[2]||''));
   if(area>=100&&area<=200000)updates.areaSqFt=area;
  }
 }
 const roomFields=[
  ['bedrooms','bedrooms?|dormitorios?|recamaras?|habitaciones?'],
  ['bathrooms','bathrooms?|banos?'],
  ['livingRooms','living rooms?|salas?']
 ] as const;
 for(const [field,expr] of roomFields){
  if(existing[field]===0){
   const count=findCount(expr);
   if(count!==undefined&&count>=0&&count<=100)updates[field]=count;
  }
 }
 if(updates.type==='post_construction'){
  if(/heavy dust|mucho polvo|polvo abundante|polvo pesado/.test(text))updates.dustLevel='heavy';
  else if(/moderate dust|polvo moderado/.test(text))updates.dustLevel='moderate';
  else if(/light dust|poco polvo|polvo ligero/.test(text))updates.dustLevel='light';
 }
 if(existing.frequency==='once'){
  if(/\b(weekly|semanal|every week|cada semana)\b/.test(text))updates.frequency='weekly';
  else if(/\b(biweekly|every two weeks|cada dos semanas)\b/.test(text))updates.frequency='biweekly';
  else if(/\b(monthly|mensual|cada mes)\b/.test(text))updates.frequency='monthly';
 }
 return {...existing,...updates};
}
