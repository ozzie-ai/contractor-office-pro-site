import React,{useMemo,useState} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import type {Language} from './estimate';
import {reviewUniversalEstimate,validateInterpretation,validatePricing} from './universalEstimateContract';
import type {InterpretationResponse,PricingResponse,SafeReview} from './universalEstimateContract';

type Props={
 interpretation:unknown;
 pricing:unknown;
 language:Language;
 overheadPct:number;
 profitPct:number;
 onApprove?:(value:SafeReview)=>void;
};

/**
 * Frontend review screen, works with simulated API responses until Derek
 * deploys the agreed interface. Not a public customer PDF or live AI query.
 * No private transcript is rendered, passed in onApprove, or used as a work item.
 */
export default function ContractorEstimateReview({interpretation,pricing,language,overheadPct,profitPct,onApprove}:Props){
 const [edits,setEdits]=useState<Record<string,string>>({});
 const [approved,setApproved]=useState(false);
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const es=language==='es',tr=(en:string,spanish:string)=>es?spanish:en;
 const interpretationValid=validateInterpretation(interpretation);
 const pricingValid=validatePricing(pricing);
 const scope:InterpretationResponse|null=interpretationValid?interpretation:null;
 const priced:PricingResponse|null=pricingValid?pricing:null;
 const overrides=useMemo(()=>{
  const result:Record<string,number>={};
  for(const [id,value] of Object.entries(edits)){
   if(value.trim()!=='')result[id]=Number(value);
  }
  return result;
 },[edits]);
 const initial=reviewUniversalEstimate(scope,priced,overrides,false);
 const accepted=initial.accepted;
 const priceMap=new Map(priced?.lines.map(line=>[line.scope_item_id,line])||[]);
 const displayed=(scope?.scope_items||[]).filter(x=>x.included_now);
 const missing=displayed.filter(x=>{const p=priceMap.get(x.id);const proposed=edits[x.id]!==undefined?Number(edits[x.id]):p?.unit_rate;return !p||x.quantity===null||!Number.isFinite(proposed)||proposed===null||proposed===undefined||proposed<=0;});
 const amount=(n:number)=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const totals=useMemo(()=>{
  let partial=0;
  let complete=!!scope&&!!priced&&displayed.length>0;
  for(const item of displayed){
   const p=priceMap.get(item.id),override=edits[item.id];
   const rate=override!==undefined?Number(override):p?.unit_rate;
   if(item.quantity===null||item.quantity<=0||rate===null||rate===undefined||!Number.isFinite(rate)||rate<=0){
    complete=false;continue;
   }
   partial+=item.quantity*rate;
  }
  const overhead=partial*Math.max(0,overheadPct)/100;
  const profit=(partial+overhead)*Math.max(0,profitPct)/100;
  return {partial,overhead,profit,total:partial+overhead+profit,complete};
 },[scope,priced,edits,overheadPct,profitPct]);
 const criticalIssues=initial.issues.filter(issue=>issue!=='Contractor approval required.'&&!issue.startsWith('Recalculate overhead and profit after contractor edits'));
 // A changed rate is an explicit human quote override. Recalculate totals locally,
 // but keep all scope/source/quantity validation gates.
 const ready=accepted&&totals.complete&&criticalIssues.length===0&&missing.length===0&&approved;
 const update=(id:string,value:string)=>{
  setApproved(false);
  if(value.trim()!==''&&!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value))return;
  setEdits(prev=>({...prev,[id]:value}));
 };
 const approve=()=>{
  if(!accepted||!totals.complete||criticalIssues.length||missing.length)return;
  setApproved(true);
 };
 const submit=()=>{
  if(!ready)return;
  // No raw notes, photos or transcripts are emitted; customer-safe lines only.
  const review:SafeReview={
   ...initial,issues:[],readyForProposal:true,
   estimatedTotal:totals.total,pricedSubtotal:totals.partial,
   lines:displayed.map(item=>{
    const p=priceMap.get(item.id)!;
    const entered=edits[item.id];
    const rate=entered!==undefined?Number(entered):p.unit_rate!;
    return {id:item.id,description_en:item.description_en,description_es:item.description_es,
     quantity:item.quantity!,unit:item.unit,rate,
     status:p.rate_status==='verified_reference'&&entered===undefined?'included_now':'allowance_to_confirm',
     rateSource:entered!==undefined?'Contractor-edited / Revisado':p.source?.title||p.rate_status};
   })
  };
  onApprove?.(review);
 };
 return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
  <View style={styles.hero}>
   <Text style={styles.eyebrow}>{tr('AI ESTIMATE REVIEW','REVISIÓN DEL ESTIMADO IA')}</Text>
   <Text style={styles.title}>{tr('Review your estimate','Revisa tu estimado')}</Text>
   <Text style={styles.subtitle}>{tr('Check what is included, adjust prices and approve.','Verifica el trabajo, ajusta precios y aprueba.')}</Text>
  </View>
  {!scope||!priced?<View style={styles.warning}><Text style={styles.warningText}>{tr('Estimate data is unavailable or invalid. Nothing can be approved.','Los datos no están disponibles o son inválidos. No se puede aprobar.')}</Text></View>:<>
   <View style={styles.summary}>
    <View style={styles.summaryRow}><Text style={styles.smallLabel}>{tr('Trade','Oficio')}</Text><Text style={styles.summaryValue}>{scope.trade}</Text></View>
    <View style={styles.summaryRow}><Text style={styles.smallLabel}>{tr('Items identified','Partidas identificadas')}</Text><Text style={styles.summaryValue}>{displayed.length}</Text></View>
    <View style={styles.summaryRow}><Text style={styles.smallLabel}>{tr('Pending quantities or rates','Cantidades o precios pendientes')}</Text><Text style={styles.summaryValue}>{missing.length}</Text></View>
   </View>
   {displayed.map((item,index)=>{
    const p=priceMap.get(item.id),entered=edits[item.id];
    const rate=entered!==undefined?Number(entered):p?.unit_rate;
    const lineTotal=item.quantity!==null&&rate!==null&&rate!==undefined&&rate>0?item.quantity*rate:null;
    const isOpen=!!expanded[item.id];
    const modeled=p?.rate_status==='modeled_allowance';
    return <View key={item.id} style={styles.item}>
     <View style={styles.itemTop}>
      <View style={styles.index}><Text style={styles.indexText}>{index+1}</Text></View>
      <View style={{flex:1}}>
       <Text style={styles.itemTitle}>{es?item.description_es:item.description_en}</Text>
       <Text style={styles.itemMeta}>{item.quantity===null?'?':item.quantity} {item.unit} · {lineTotal===null?tr('Needs price or quantity','Falta precio o cantidad'):amount(lineTotal)}</Text>
      </View>
     </View>
     <Text style={styles.tag}>{entered!==undefined?tr('Contractor edited','Modificado por contratista'):modeled?tr('Preliminary allowance','Precio preliminar'):p?.rate_status==='verified_reference'?tr('Sourced reference','Referencia documentada'):tr('Price needs review','Precio por revisar')}</Text>
     {!!p?.source?.assumptions&&<Text style={styles.note}>{tr('Assumptions','Supuestos')}: {p.source.assumptions}</Text>}
     <Pressable style={styles.editButton} accessibilityRole="button" onPress={()=>setExpanded(prev=>({...prev,[item.id]:!isOpen}))}>
      <Text style={styles.editButtonText}>{isOpen?tr('Hide price editor','Cerrar edición'):tr('Review / Edit rate','Revisar / Editar tarifa')}</Text>
     </Pressable>
     {isOpen&&<View style={styles.editor}>
      <Text style={styles.smallLabel}>{tr('Price per','Precio por')} {item.unit} (USD)</Text>
      <TextInput accessibilityLabel={tr('Unit price for ','Tarifa por unidad para ')+(es?item.description_es:item.description_en)}
       value={entered!==undefined?entered:String(p?.unit_rate??'')} onChangeText={value=>update(item.id,value)}
       keyboardType="decimal-pad" style={styles.input} placeholder="0.00" placeholderTextColor="#75849C"/>
      <Text style={styles.note}>{tr('Changing a price automatically recalculates the total and requires new approval.','Cambiar una tarifa recalcula el total y requiere aprobar nuevamente.')}</Text>
     </View>}
    </View>;
   })}
   {!!scope.exclusions.length&&<View style={styles.section}><Text style={styles.sectionTitle}>{tr('Not included','No incluido')}</Text>{scope.exclusions.map((s,i)=><Text key={i} style={styles.note}>• {s}</Text>)}</View>}
   {!!scope.future_work.length&&<View style={styles.section}><Text style={styles.sectionTitle}>{tr('Future work (excluded)','Trabajo futuro (excluido)')}</Text>{scope.future_work.map((s,i)=><Text key={i} style={styles.note}>• {s}</Text>)}</View>}
   <View style={styles.totalCard}>
    <View style={styles.summaryRow}><Text>{tr('Work subtotal','Subtotal de trabajo')}</Text><Text style={styles.summaryValue}>{amount(totals.partial)}</Text></View>
    <View style={styles.summaryRow}><Text>{tr('Overhead','Gastos generales')} ({overheadPct}%)</Text><Text>{amount(totals.overhead)}</Text></View>
    <View style={styles.summaryRow}><Text>{tr('Profit','Utilidad')} ({profitPct}%)</Text><Text>{amount(totals.profit)}</Text></View>
    <View style={styles.totalDivider}/>
    <Text style={styles.totalLabel}>{totals.complete&&criticalIssues.length===0?tr('Preliminary total','Total preliminar'):tr('Partial amount — not a quote','Importe parcial — no es cotización')}</Text>
    <Text style={styles.totalText}>{amount(totals.total)}</Text>
   </View>
   {!!criticalIssues.length&&<View style={styles.warning}><Text style={styles.sectionTitle}>{tr('Needs attention','Necesita revisión')}</Text>{criticalIssues.slice(0,6).map((issue,i)=><Text key={i} style={styles.warningText}>• {issue}</Text>)}</View>}
   <Pressable accessibilityRole="button" disabled={!accepted||!totals.complete||criticalIssues.length>0||missing.length>0} onPress={approve}
    style={[styles.primary,(!accepted||!totals.complete||criticalIssues.length>0||missing.length>0)&&styles.disabled]}>
    <Text style={styles.primaryText}>{approved?tr('✓ Approved for review','✓ Revisado y aprobado'):tr('Approve work and prices','Aprobar trabajo y precios')}</Text>
   </Pressable>
   <Pressable accessibilityRole="button" disabled={!ready||!onApprove} onPress={submit} style={[styles.secondary,(!ready||!onApprove)&&styles.disabled]}>
    <Text style={styles.secondaryText}>{tr('Use approved estimate','Usar estimado aprobado')}</Text>
   </Pressable>
   <Text style={styles.footer}>{tr('Preview only until the AI backend is connected. No proposal will be sent from this screen.','Vista previa hasta conectar el servicio de IA. No se envía ninguna propuesta desde esta pantalla.')}</Text>
  </>}
 </ScrollView>;
}
const BLUE='#13256F',INK='#12244B',TEAL='#0B8E95';
const styles=StyleSheet.create({
 page:{padding:16,paddingBottom:42,backgroundColor:'#F3F6FC'},
 hero:{backgroundColor:BLUE,borderRadius:20,padding:19,marginBottom:14},
 eyebrow:{fontSize:10,color:'#B3DCE3',fontWeight:'800',letterSpacing:1.1},
 title:{color:'#FFFFFF',fontSize:22,fontWeight:'900',marginTop:7},
 subtitle:{color:'#DEEAF9',fontSize:13,marginTop:6,lineHeight:19},
 summary:{borderRadius:16,backgroundColor:'#FFFFFF',padding:14,marginBottom:12,borderWidth:1,borderColor:'#E0E7F1'},
 summaryRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginVertical:5,gap:10},
 summaryValue:{fontWeight:'800',color:INK},
 smallLabel:{fontSize:12,color:'#5B6C86',fontWeight:'700'},
 item:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#DCE4F1',borderRadius:17,padding:15,marginBottom:10},
 itemTop:{flexDirection:'row',gap:10,alignItems:'flex-start'},
 index:{height:28,width:28,borderRadius:14,backgroundColor:'#DFF3F4',alignItems:'center',justifyContent:'center'},
 indexText:{color:TEAL,fontWeight:'900'},
 itemTitle:{flexShrink:1,fontSize:15,color:INK,fontWeight:'800',lineHeight:21},
 itemMeta:{color:'#5A6D87',fontSize:13,marginTop:6},
 tag:{alignSelf:'flex-start',backgroundColor:'#E9F1FA',color:'#23417E',fontSize:11,fontWeight:'800',paddingHorizontal:10,paddingVertical:5,borderRadius:10,overflow:'hidden',marginTop:11},
 note:{color:'#5A6981',fontSize:12,lineHeight:18,marginTop:8},
 editButton:{alignSelf:'flex-start',paddingVertical:9,marginTop:5},
 editButtonText:{fontWeight:'800',color:BLUE,fontSize:13},
 editor:{padding:11,backgroundColor:'#F5F8FD',borderRadius:11},
 input:{minHeight:44,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#CBD7E8',borderRadius:10,paddingHorizontal:12,fontSize:16,color:INK,marginTop:7},
 section:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E2E8F3',borderRadius:15,padding:13,marginBottom:12},
 sectionTitle:{fontSize:14,fontWeight:'900',color:INK},
 totalCard:{backgroundColor:'#ECF1FB',borderRadius:18,padding:17,marginTop:4},
 totalDivider:{borderTopWidth:1,borderColor:'#C7D2E6',marginVertical:12},
 totalLabel:{fontWeight:'800',color:INK,fontSize:13},
 totalText:{fontSize:26,fontWeight:'900',color:BLUE,marginTop:6},
 warning:{padding:14,backgroundColor:'#FFF4E8',borderWidth:1,borderColor:'#EFD8B9',borderRadius:14,marginTop:12},
 warningText:{fontSize:12,color:'#745024',lineHeight:19,marginTop:5},
 primary:{backgroundColor:BLUE,alignItems:'center',padding:15,borderRadius:13,marginTop:18},
 primaryText:{fontWeight:'800',color:'#FFFFFF'},
 secondary:{backgroundColor:'#DDE9F7',alignItems:'center',padding:15,borderRadius:13,marginTop:10},
 secondaryText:{fontWeight:'800',color:BLUE},
 disabled:{opacity:.43},footer:{fontSize:11,textAlign:'center',lineHeight:17,color:'#6D7B91',marginTop:12}
});
