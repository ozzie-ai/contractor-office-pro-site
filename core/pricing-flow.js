// Original app extension: adds an unobtrusive cost check to the existing estimate screen.
// Does not change navigation, language buttons, microphone, intake, or customer transcripts.
(function(){
'use strict';
if(!window.COPCosting || !document.getElementById('estimateHint'))return;
const cost=window.COPCosting,$=id=>document.getElementById(id);
const es=()=>lang==='es';
const text=(en,sp)=>es()?sp:en;
const tag=(name,props={},content)=>{
 const el=document.createElement(name);
 for(const [k,v] of Object.entries(props))if(k==='className')el.className=v;else if(k==='type'||k==='value'||k==='min'||k==='max'||k==='step'||k==='placeholder'||k==='id')el[k]=v;else el.setAttribute(k,v);
 if(content!==undefined)el.textContent=content;return el;
};
const field=(label,element)=>{const box=tag('div',{className:'field'});box.append(tag('label',{},label),element);return box};
const input=(id,placeholder='',type='number')=>tag('input',{id,type,placeholder,min:'0',step:type==='number'?'0.01':'any'});
const row=(...els)=>{const r=tag('div',{className:'grid'});els.forEach(e=>r.append(e));return r};
const detail=tag('details',{id:'copCostPanel',className:'panel'}),heading=tag('summary',{},'');
heading.style.cssText='cursor:pointer;font-weight:800';
const content=tag('div',{id:'copCostBody'});detail.style.boxShadow='none';detail.append(heading,content);
$('estimateHint').insertAdjacentElement('afterend',detail);
const general=tag('details',{id:'copRetailPanel',className:'panel'}),gHeading=tag('summary',{},'');
gHeading.style.cssText='cursor:pointer;font-weight:800';general.style.boxShadow='none';
const gContent=tag('div',{id:'copRetailBody'});general.append(gHeading,gContent);detail.after(general);
let activeOutlet=null,confirmedOutlet=false,pricingEvidence=new Map();
const retailerOptions=['','Home Depot',"Lowe's",'Other retailer','Contractor invoice'];
function retailChoice(id){
 const el=tag('select',{id});for(const val of retailerOptions)el.add(new Option(val||text('Select price source','Selecciona fuente'),val));return el;
}
function searchLinks(query){
 const links=cost.retailerSearch(query),wrap=tag('div',{className:'help'});
 for(const [label,url] of [['Home Depot',links.homeDepot],["Lowe's",links.lowes]]){
  const a=tag('a',{},label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.style.marginRight='13px';wrap.append(a);
 }return wrap;
}
function materialRow(id,en,sp,term){
 const box=tag('div',{className:'field'});box.style.cssText='padding:10px;border:1px solid #d7e5e6;border-radius:10px;margin:8px 0';
 box.append(tag('strong',{},text(en,sp)),searchLinks(term));
 const costInput=input('cop_'+id+'_cost',text('Retail unit cost ($)','Costo unitario en tienda ($)'));
 const source=retailChoice('cop_'+id+'_store');
 box.append(row(field(text('Verified unit cost ($)','Costo unitario verificado ($)'),costInput),
   field(text('Retailer / receipt','Tienda / factura'),source)));
 const status=tag('div',{className:'help'},text('Confirm the exact model, quantity and price. This is not a live price feed.','Verifica modelo, cantidad y precio. No es una consulta automática de precios.'));
 box.append(status);return box;
}
function actualCheckDate(){return new Date().toISOString().slice(0,10)}
function resetCostPanels(){
 activeOutlet=null;confirmedOutlet=false;detail.hidden=true;general.hidden=false;
 content.replaceChildren();$('copRetailBody').replaceChildren();
}
function renderOutletForm(parsed){
 const key=[job,$('description').value].join('|');
 if(activeOutlet?.key===key)return;
 activeOutlet={key,parsed};confirmedOutlet=false;general.hidden=true;detail.hidden=false;detail.open=true;
 heading.textContent=text('Verify job costs — one visit, no duplicate service calls','Verifica costos del trabajo — una visita, sin duplicar servicios');
 content.replaceChildren();
 content.append(tag('p',{className:'help'},text('We recognized '+parsed.total+' outlet replacements. Please confirm the GFCI quantity before calculating. The voice transcript is kept private.','Reconocimos '+parsed.total+' cambios de tomacorrientes. Confirma cuántos serán GFCI antes de calcular. El dictado queda privado.')));
 if(parsed.questions.includes('confirm_gfci_transcript'))content.append(tag('p',{className:'notice'},text('Speech may have turned “GFCI” into “10 si hay.” Confirm the count below.','El dictado posiblemente escribió “10 si hay” en lugar de “GFCI”. Confirma la cantidad.')));
 const gfi=input('cop_gfci',text('GFCI count (confirm)','Cantidad de GFCI (confirma)'));
 gfi.type='number';gfi.min='0';gfi.max=String(parsed.total);gfi.step='1';
 if(parsed.gfciCount!==null)gfi.value=String(parsed.gfciCount);
 if(parsed.suspectedGfciCount!==null)gfi.placeholder=String(parsed.suspectedGfciCount)+'?';
 const supplier=tag('select',{id:'cop_supplier'});
 for(const [v,tx] of [['',text('Confirm who supplies materials','Confirma quién compra los materiales')],['contractor',text('Contractor supplies','Contratista compra')],['owner',text('Customer supplies','Cliente compra')]])supplier.add(new Option(tx,v));
 supplier.value=parsed.contractorSupplies?'contractor':parsed.ownerSupplies?'owner':'';
 const gfiField=field(text('Of the '+parsed.total+' replacements, how many GFCI?','De los '+parsed.total+' cambios, ¿cuántos GFCI?'),gfi);
 content.append(row(gfiField,field(text('Materials supplied by','Materiales proporcionados por'),supplier)));
 const materialBox=tag('div',{id:'cop_materialBox'});
 materialBox.append(materialRow('standard', 'Standard 15A/125V outlets','Tomacorrientes estándar 15A/125V','15 amp tamper resistant duplex outlet white'),
   materialRow('gfci','15A GFCI outlets','Tomacorrientes GFCI 15A','15 amp tamper resistant GFCI receptacle white'));
 content.append(materialBox);
 function reflectMaterial(){
  const count=Number(gfi.value);
  const customer=supplier.value==='owner';
  materialBox.hidden=customer;
  const standard=(Number.isInteger(count)&&count>=0&&count<=parsed.total)?parsed.total-count:null;
  const std= $('cop_standard_cost').closest('.field').parentElement;
  const gf= $('cop_gfci_cost').closest('.field').parentElement;
  std.hidden=standard===0;gf.hidden=count===0;
 }
 gfi.addEventListener('input',reflectMaterial);supplier.addEventListener('change',reflectMaterial);
 content.append(row(
   field(text('Total labor hours for this visit','Horas de trabajo de esta visita'),input('cop_hours',text('E.g. 2.5','Ej. 2.5'))),
   field(text('Actual loaded labor cost per hour ($)','Costo real de mano de obra por hora ($)'),input('cop_hourRate',text('Your cost, not retail rate','Tu costo, no tarifa de venta')))
 ));
 content.append(row(
   field(text('One-time trip + purchasing ($)','Viaje y compra, una sola vez ($)'),input('cop_trip',text('0 if none','0 si no aplica'))),
   field(text('Plates, connectors and incidentals ($)','Tapas, conectores y consumibles ($)'),input('cop_misc',text('0 if none','0 si no aplica')))
 ));
 const ack=tag('label',{className:'checkrow'}),ackBox=tag('input',{id:'cop_verified',type:'checkbox'});
 ackBox.style.cssText='width:20px;height:20px';
 ack.append(ackBox,tag('span',{},text('I checked the exact material types and entered current retailer or invoice prices above.','Verifiqué el tipo de material y escribí los precios actuales de tienda o factura.')));
 content.append(ack);
 const apply=tag('button',{type:'button',className:'btn wide'},text('Calculate from verified costs','Calcular usando costos verificados'));
 const status=tag('p',{id:'cop_status',className:'status'},text('No final estimate until material prices, labor and the shared trip cost are confirmed.','No se genera precio final hasta confirmar materiales, mano de obra y viaje.'));
 content.append(apply,status);reflectMaterial();
 apply.onclick=()=>{
  try{
   const gfciCount=gfi.value===''?NaN:Number(gfi.value);
   const scope=cost.finalOutletScope(parsed,{gfciCount,contractorSupplies:supplier.value==='contractor'});
   if(supplier.value==='')throw Error(text('Confirm the supplier.','Confirma quién compra.'));
   if(scope.contractorSupplies&&!ackBox.checked)throw Error(text('Verify the selected material prices first.','Primero confirma que verificaste los precios del material.'));
   const parsedNum=id=>$(id).value===''?null:Number($(id).value);
   const materials=[],entries=[];
   if(scope.contractorSupplies){
    for(const [id,qty,title] of [['standard',scope.standardCount,text('Standard duplex receptacle — material','Tomacorriente estándar — material')],['gfci',scope.gfciCount,text('GFCI receptacle — material','Tomacorriente GFCI — material')]]){
     if(!qty)continue;
     const val=parsedNum('cop_'+id+'_cost'),store=$('cop_'+id+'_store').value;
     const pricing={unitCost:val,retailer:store,checkedOn:store&&val!==null?actualCheckDate():''};
     materials.push({id,quantity:qty,description:title,pricing});
     entries.push({description:title,quantity:qty,unit:'ea',rate:val,source:{retailer:store,checkedOn:pricing.checkedOn}});
    }
   }
   const hours=parsedNum('cop_hours'),hourRate=parsedNum('cop_hourRate'),
     trip=parsedNum('cop_trip'),misc=parsedNum('cop_misc');
   const audited=cost.visitCost({materials,laborHours:hours,laborCostPerHour:hourRate,
     tripAndPurchaseCost:trip,miscSupplyCost:misc,overheadPct:0,profitPct:0});
   if(!audited.complete)throw Error(text('Check missing amounts and material sources: ','Verifica cantidades y fuentes de precio: ')+audited.blockers.join(', '));
   estimateItems=[...entries,
     {description:text('Outlet replacement — labor for one visit','Cambiar tomacorrientes — mano de obra de una visita'),quantity:1,unit:'job',rate:audited.totals.laborCost},
     {description:text('Travel and purchasing — once per job','Viaje y compra — una vez por trabajo'),quantity:1,unit:'job',rate:audited.totals.trip},
     {description:text('Plates, connectors and supplies','Tapas, conectores y consumibles'),quantity:1,unit:'job',rate:audited.totals.supplies}
   ].filter(x=>Number(x.quantity)>0);
   confirmedOutlet=true;pricingEvidence=new Map(entries.map((x,i)=>[i,x.source]));
   initialized=true;renderItems();buildCustomerScope();calculateTakeoff();
   status.textContent=text('Cost-based estimate created. Review overhead and profit below before sharing.','Estimado por costos preparado. Revisa gastos generales y ganancia abajo antes de compartir.');
   detail.open=false;renderGenericResearch();
  }catch(e){confirmedOutlet=false;status.textContent=e.message}
 };
}
function isMaterial(item){
 const d=String(item.description||'').toLowerCase();
 if(/labor|mano de obra|instalaci[oó]n|trabajo de|viaje|travel|purchasing|compra|servicio|testing|prueba/.test(d))return false;
 return /material|materiales|suppl|suministr|paint|pintura|concrete|concreto|drywall sheet|panel|cable|conductor|grout|tile|loseta|breaker|receptacle|tomacorriente|enchufe|outlet|fixture|grifo|equipment|equipo|gabinete|cabinet|underlayment|membrana|tapajuntas|hardware/.test(d);
}
function renderGenericResearch(){
 const wrap=$('copRetailBody');
 gHeading.textContent=text('Check retail prices for materials','Consulta precios de materiales');
 wrap.replaceChildren();
 if(activeOutlet){general.hidden=true;return}
 general.hidden=false;
 wrap.append(tag('p',{className:'help'},text('Open Home Depot or Lowe’s for each material, choose the exact product and enter its verified unit price in your existing estimate table. No real-time product feed is connected yet.','Consulta Home Depot o Lowe’s para cada material, elige el producto correcto y escribe el costo unitario verificado en la tabla del estimado. Todavía no hay conexión automática de precios.')));
 const matches=estimateItems.map((item,index)=>({item,index})).filter(({item})=>isMaterial(item));
 if(!matches.length)wrap.append(tag('p',{className:'help'},text('No separately identified materials. Confirm whether supplies are included in any combined work items.','No se encontraron materiales separados. Confirma si hay materiales incluidos en partidas combinadas.')));
 for(const {item,index} of matches){
  const r=tag('div',{className:'field'});r.style.cssText='padding-bottom:10px;border-bottom:1px solid #ddd';
  r.append(tag('strong',{},item.description+' · '+item.quantity+' '+(item.unit||'ea')),searchLinks(item.description));
  const source=retailChoice('cop_source_'+index),check=tag('button',{type:'button',className:'btn secondary'},text('Mark price verified','Confirmar precio verificado'));
  const message=tag('span',{className:'help'},pricingEvidence.has(index)?text('Price verified','Precio verificado'):text('Unverified sample / editable rate','Tarifa de ejemplo sin verificar'));
  const actions=tag('div',{className:'actions'});actions.append(source,check);r.append(actions,message);
  check.onclick=()=>{
   if(!source.value){message.textContent=text('Choose the store or invoice source.','Selecciona tienda o fuente de factura.');return}
   if(!(Number(item.rate)>0)){message.textContent=text('Enter the verified unit price in the estimate table first.','Primero escribe el costo unitario verificado en la tabla.');return}
   pricingEvidence.set(index,{retailer:source.value,checkedOn:actualCheckDate(),unitCost:Number(item.rate)});
   message.textContent=text('Verified source recorded.','Fuente verificada guardada.');
  };
  wrap.append(r);
 }
 const laborRows=estimateItems.filter(x=>/(?:labor|mano de obra)/i.test(x.description||'')&&!/(?:material|supplies)/i.test(x.description||''));
 if(laborRows.length){
  const box=tag('details',{className:'panel'});box.style.boxShadow='none';
  const summary=tag('summary',{},text('Optional: price labor as ONE job visit','Opcional: calcular mano de obra como UNA visita'));
  summary.style.cursor='pointer';summary.style.fontWeight='700';box.append(summary);
  box.append(tag('p',{className:'help'},text('For one-trade visits, replace the explicitly labeled labor lines with total job hours and one trip cost. Review combined task rates separately.','Para trabajos de un oficio, reemplaza partidas de mano de obra por horas totales y un solo viaje. Revisa aparte cualquier partida combinada.')));
  const hours=input('cop_job_hours',text('Total hours','Horas totales'));
  const rate=input('cop_job_rate',text('Actual hourly labor cost','Costo real por hora'));
  const trip=input('cop_job_trip',text('One trip/purchasing cost','Costo de un viaje y compra'));
  const form=row(field(text('Total labor hours','Horas totales de mano de obra'),hours),
    field(text('Loaded labor cost per hour ($)','Costo completo por hora ($)'),rate),
    field(text('Travel/purchasing ONCE ($)','Viaje y compra UNA vez ($)'),trip));
  const apply=tag('button',{type:'button',className:'btn secondary'},text('Use one-visit labor cost','Usar costo de una visita'));
  const status=tag('p',{className:'status'},'');
  box.append(form,apply,status);
  apply.onclick=()=>{
   const nums=[hours.value,rate.value,trip.value].map(v=>v===''?NaN:Number(v));
   if(nums.some(v=>!Number.isFinite(v)||v<0)){status.textContent=text('Enter confirmed hours, hourly cost and one trip allowance (zero allowed).','Confirma horas, costo por hora y un viaje (puede ser cero).');return}
   const [h,r,t]=nums;
   estimateItems=estimateItems.filter(x=>!laborRows.includes(x)&&x.copSharedLabor!==true);
   estimateItems.push({description:text('Total job labor — one visit','Mano de obra total — una visita'),quantity:1,unit:'job',rate:Math.round(h*r*100)/100,copSharedLabor:true});
   estimateItems.push({description:text('Travel and purchasing — once','Viaje y compra — una vez'),quantity:1,unit:'job',rate:t,copSharedLabor:true});
   renderItems();buildCustomerScope();calculateTakeoff();
   status.textContent=text('Replaced '+laborRows.length+' labor rows with a single visit calculation. Review the estimate for any combined labor/material rows.','Se reemplazaron '+laborRows.length+' partidas de mano de obra por una visita. Revisa que no quede duplicada mano de obra en otras partidas.');
  };
  wrap.append(box);
 }
}
const previousSuggestedItems=suggestedItems;
suggestedItems=function(){
 pricingEvidence=new Map();activeOutlet=null;confirmedOutlet=false;
 const parsed=cost.parseOutletRequest($('description').value);
 const suitable=['electrical','other','handyman'].includes(job)&&parsed?.replacement&&parsed.total>0&&parsed.additional===0&&
 !evActive&&!upgradeActive;
 if(suitable){
  estimateItems=[{description:text('Outlet replacement — pricing pending review','Cambio de tomacorrientes — precio pendiente'),quantity:1,unit:'job',rate:0}];
  initialized=true;renderItems();calculateTakeoff();buildCustomerScope();renderOutletForm(parsed);
  $('estimateHint').textContent=text('Pricing pending — confirm the GFCI count and one-visit costs below. No unverified $30/$42 material rates will be used.','Precio pendiente — confirma cantidad GFCI y costos de una visita. No se usarán costos de materiales de $30/$42 sin verificar.');
  return;
 }
 resetCostPanels();previousSuggestedItems();
 renderGenericResearch();
};
const previousNext=$('next4').onclick;
$('next4').onclick=function(){
 if(activeOutlet&&!confirmedOutlet){alert(text('Confirm one-visit costs before preparing a proposal.','Confirma los costos de la visita antes de preparar la propuesta.'));detail.open=true;return}
 // The original app remains available, but sample prices may not be described as store-verified.
 return previousNext.call(this);
};
const previousRender=render;
render=function(){previousRender();heading.textContent=text('Verify job costs — one visit','Verificar costos del trabajo — una visita');gHeading.textContent=text('Check retail prices for materials','Consulta precios de materiales')};
resetCostPanels();
})();
