export type Trade='electrical'|'plumbing'|'painting'|'concrete'|'handyman'|'remodel';
export type Language='en'|'es';
export type EstimateLine={
 id:string;description_en:string;description_es:string;
 quantity:number;unit:string;rate:number;status:'included_now'|'allowance_to_confirm';
};
export type Interpretation={
 trade?:string;project_summary_en?:string;project_summary_es?:string;
 tasks?:Array<{category:string;description_en:string;description_es:string;quantity:number|null;unit:string|null;specifications?:string[];status?:'included_now'|'allowance_to_confirm'}>;
 excluded_work?:string[];future_work?:string[];unknown_details?:string[];
};
export type Project={
 trade:Trade;contractor:string;customer:string;city:string;description:string;
 lines:EstimateLine[];exclusions:string[];futureWork:string[];unknowns:string[];
 customerNotes:string;language:Language;overheadPct:number;profitPct:number;
};
export const TRADES:Record<Trade,{en:string;es:string}>={
 electrical:{en:'Electrical',es:'Electricidad'},
 plumbing:{en:'Plumbing',es:'Plomería'},
 painting:{en:'Painting',es:'Pintura'},
 concrete:{en:'Concrete',es:'Concreto'},
 handyman:{en:'Handyman',es:'Mantenimiento'},
 remodel:{en:'Remodeling',es:'Remodelación'},
};
export const money=(n:number)=>'$'+(Number.isFinite(n)?n:0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function totals(p:Pick<Project,'lines'|'overheadPct'|'profitPct'>){
 const subtotal=p.lines.reduce((sum,x)=>sum+Math.max(0,x.quantity||0)*Math.max(0,x.rate||0),0);
 const overhead=subtotal*Math.max(0,p.overheadPct||0)/100;
 const profit=(subtotal+overhead)*Math.max(0,p.profitPct||0)/100;
 return {subtotal,overhead,profit,total:subtotal+overhead+profit};
}
export function mapInterpretation(result:Interpretation):Pick<Project,'lines'|'exclusions'|'futureWork'|'unknowns'>{
 return {
  lines:(result.tasks||[]).filter(t=>t.status!=='allowance_to_confirm').map((task,i)=>({
   id:'ai-'+i,description_en:task.description_en||'Work item to review',
   description_es:task.description_es||'Trabajo por revisar',
   quantity:typeof task.quantity==='number'&&task.quantity>0?task.quantity:0,
   unit:task.unit||'job',rate:0,status:'included_now' as const
  })),
  exclusions:[...(result.excluded_work||[])],
  futureWork:[...(result.future_work||[])],
  unknowns:[...(result.unknown_details||[])],
 };
}
const esc=(s:string)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
export function proposalHtml(p:Project){
 const es=p.language==='es',tr=es?{
  title:'ESTIMADO DE TRABAJO',contractor:'Contratista',customer:'Cliente',location:'Ciudad',work:'Trabajo incluido',
  qty:'Cantidad',unit:'Unidad',rate:'Tarifa',amount:'Importe',excluded:'No incluido',future:'Trabajo futuro — no incluido',
  subtotal:'Subtotal',overhead:'Gastos generales',profit:'Utilidad',total:'Precio estimado',signature:'Firma del cliente',
  date:'Fecha',draft:'BORRADOR — El contratista debe confirmar precios y cantidades.',
  notice:'Este estimado resume el trabajo y precio propuesto. Confirmar los detalles antes de comenzar.'
 }:{
  title:'WORK ESTIMATE',contractor:'Contractor',customer:'Customer',location:'City',work:'Included work',
  qty:'Qty',unit:'Unit',rate:'Rate',amount:'Amount',excluded:'Not included',future:'Future work — excluded',
  subtotal:'Subtotal',overhead:'Overhead',profit:'Profit',total:'Estimated price',signature:'Customer signature',
  date:'Date',draft:'DRAFT — Contractor must confirm pricing and quantities.',
  notice:'This estimate summarizes the proposed work and pricing. Confirm details before starting.'
 };
 const sum=totals(p);
 const incomplete=p.lines.length===0||p.lines.some(x=>!x.description_en||!x.description_es||x.quantity<=0||x.rate<=0)||p.unknowns.length>0;
 const list=(title:string,items:string[])=>items.length?'<h3>'+esc(title)+'</h3><ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'';
 const rows=p.lines.map(x=>'<tr><td>'+esc(es?x.description_es:x.description_en)+'</td><td>'+esc(String(x.quantity))+'</td><td>'+esc(x.unit)+'</td><td>'+esc(money(x.rate))+'</td><td>'+esc(money(x.quantity*x.rate))+'</td></tr>').join('');
 const line=(label:string,value:string)=>'<div class="total"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>';
 return '<!doctype html><html lang="'+p.language+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+
 'body{font-family:Arial,sans-serif;color:#173b42;padding:28px;line-height:1.42}h1{font-size:24px;border-bottom:3px solid #177b6c;padding-bottom:10px}h3{margin-top:24px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:9px 5px;border-bottom:1px solid #d6dede;text-align:left}.total{display:flex;justify-content:space-between;margin-top:9px}.grand{font-size:21px;border-top:2px solid #173b42;padding-top:15px;margin-top:15px}.notice{font-size:12px;color:#4b6668}.sign{margin-top:45px}'+
 '</style></head><body><h1>'+tr.title+'</h1>'+
 (incomplete?'<p class="notice"><b>'+tr.draft+'</b></p>':'')+
 '<p><b>'+tr.contractor+':</b> '+esc(p.contractor||'—')+'<br><b>'+tr.customer+':</b> '+esc(p.customer||'—')+'<br><b>'+tr.location+':</b> '+esc(p.city||'—')+'</p>'+
 '<h3>'+tr.work+' — '+esc(TRADES[p.trade][p.language])+'</h3>'+
 '<table><thead><tr><th>'+tr.work+'</th><th>'+tr.qty+'</th><th>'+tr.unit+'</th><th>'+tr.rate+'</th><th>'+tr.amount+'</th></tr></thead><tbody>'+rows+'</tbody></table>'+
 list(tr.excluded,p.exclusions)+list(tr.future,p.futureWork)+
 (p.customerNotes.trim()?'<p>'+esc(p.customerNotes.trim())+'</p>':'')+
 '<section style="margin-top:22px">'+line(tr.subtotal,money(sum.subtotal))+line(tr.overhead,money(sum.overhead))+line(tr.profit,money(sum.profit))+'<div class="grand">'+line(tr.total,money(sum.total))+'</div></section>'+
 '<p class="notice">'+tr.notice+'</p><div class="sign">'+tr.signature+': ______________________________ &nbsp; '+tr.date+': ______________</div></body></html>';
}
