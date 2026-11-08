import type {EstimateLine} from './estimate';

/** Adds or adjusts the number of recessed lights without replacing other edited work items.
 * The caller must explicitly confirm quantity. An 8-ft ceiling is not a fixture count.
 */
export function upsertRecessedLights(lines:EstimateLine[],quantity:number,ceilingHeight?:number):EstimateLine[]{
 if(!Number.isInteger(quantity)||quantity<1||quantity>40)throw new Error('Enter 1 to 40 recessed lights.');
 if(ceilingHeight!==undefined&&(!Number.isFinite(ceilingHeight)||ceilingHeight<5||ceilingHeight>25))throw new Error('Check ceiling height.');
 const detail=ceilingHeight?' ('+ceilingHeight+' ft ceiling)':' (ceiling height to confirm)';
 const existing=lines.find(l=>l.id==='local-recessed-light');
 const added:EstimateLine={
  id:'local-recessed-light',
  description_en:'Supply and install recessed LED ceiling lights'+detail+'; verify circuit, switching and wiring',
  description_es:'Suministrar e instalar luces LED empotradas en techo'+detail+'; verificar circuito, interruptor y cableado',
  quantity,unit:'each',rate:existing?.rate??325,status:'allowance_to_confirm'
 };
 return existing?lines.map(l=>l.id===added.id?{...added,rate:l.rate}:l):[...lines,added];
}
