import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Image,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import SpeechInput from './src/SpeechInput';
import {readStore,saveJob,newJobId,makeActive,retainJobPhoto,hasJobContent,SavedJob} from './src/jobDrafts';
import {localEstimate} from './src/localEstimate';
import {upsertRecessedLights} from './src/electricalItems';
import {Language,Project,Trade,TRADES,EstimateLine,JobStatus,JOB_STATUSES,totals,money,proposalHtml,estimateReadiness} from './src/estimate';

const PALETTE={ink:'#163942',accent:'#116b60',background:'#f3f7f5',line:'#cedfda',muted:'#526e70',white:'#fff'};
const initial:Project={trade:'electrical',contractor:'',customer:'',city:'',description:'',lines:[],exclusions:[],futureWork:[],unknowns:[],customerNotes:'',language:'en',overheadPct:10,profitPct:20,status:'draft',followUpDate:'',followUpNotes:''};
type Stage=0|1|2|3|4;

function Action({title,onPress,secondary=false,disabled=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
 return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,secondary&&styles.buttonSecondary,disabled&&{opacity:.5}]}><Text style={[styles.buttonText,secondary&&{color:PALETTE.ink}]}>{title}</Text></Pressable>;
}
function Input({label,value,onChangeText,placeholder,multiline=false,number=false,secure=false,inputRef}:{label:string;value:string;onChangeText:(x:string)=>void;placeholder?:string;multiline?:boolean;number?:boolean;secure?:boolean;inputRef?:React.Ref<React.ElementRef<typeof TextInput>>}){
 return <View style={{marginTop:12}}><Text style={styles.label}>{label}</Text><TextInput ref={inputRef} autoCapitalize="sentences" value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#84969a" keyboardType={number?'decimal-pad':'default'} secureTextEntry={secure} multiline={multiline} style={[styles.input,multiline&&{minHeight:100,textAlignVertical:'top'}]}/></View>;
}
export default function App(){
 const [project,setProject]=useState<Project>(initial);
 const [activeJobId,setActiveJobId]=useState(newJobId);
 const [savedJobs,setSavedJobs]=useState<SavedJob[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [saveStatus,setSaveStatus]=useState('');
 const [wallHeight,setWallHeight]=useState('');
 const [lightCount,setLightCount]=useState('5');
 const [electricalCeilingHeight,setElectricalCeilingHeight]=useState('8');
 const [shareDone,setShareDone]=useState(false);
 const scrollRef=useRef<React.ElementRef<typeof ScrollView>>(null);

 const [stage,setStage]=useState<Stage>(0);
 const [photos,setPhotos]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [info,setInfo]=useState('');
 const [aiConnected,setAiConnected]=useState(false);
 useEffect(()=>{
  const stored=readStore();
  setSavedJobs(stored.jobs);
  const active=stored.jobs.find(x=>x.id===stored.activeId);
  if(active){
   setActiveJobId(active.id);
   setProject(active.project);
   setPhotos(active.photos);
   setStage(active.stage);
   setSaveStatus('Previous job restored from this iPhone.');
  }
  setLoaded(true);
 },[]);
 useEffect(()=>{
  if(!loaded||!hasJobContent(project,photos))return;
  setSaveStatus('Saving changes…');
  const t=setTimeout(()=>{
   try{
    saveJob({id:activeJobId,updatedAt:new Date().toISOString(),project,photos,stage});
    setSavedJobs(readStore().jobs);
    setSaveStatus('Saved on this iPhone');
   }catch(e){
    setSaveStatus('Could not save job — tap Save now');
    console.warn('Draft autosave failed',e);
   }
  },650);
  return ()=>clearTimeout(t);
 },[project,photos,stage,activeJobId,loaded]);
 const saveCurrent=(showConfirmation=false):boolean=>{
  if(!hasJobContent(project,photos)){
   setSaveStatus('Add a job description or customer before saving.');
   if(showConfirmation)Alert.alert('Nothing to save','Enter a job description or customer to start.');
   return true;
  }
  try{
   saveJob({id:activeJobId,updatedAt:new Date().toISOString(),project,photos,stage});
   const disk=readStore();
   const confirmed=disk.jobs.some(j=>j.id===activeJobId&&j.project.description===project.description&&j.project.lines.length===project.lines.length);
   if(!confirmed)throw new Error('Could not verify saved data.');
   setSavedJobs(disk.jobs);
   setSaveStatus('✓ Saved locally · '+new Date().toLocaleTimeString());
   if(showConfirmation)Alert.alert('Job saved / Trabajo guardado','You can reopen this job under My Jobs / Mis trabajos.');
   return true;
  }catch(e){
   setSaveStatus('Save failed — job NOT confirmed.');
   Alert.alert('Save failed','Could not verify this job was saved on your iPhone. Keep this job open.');
   console.warn('Job save failed',e);
   return false;
  }
 };
 const goToMyJobs=()=>{
  saveCurrent();
  scrollRef.current?.scrollTo({y:0,animated:true});
 };
 const openSaved=(job:SavedJob)=>{
  if(!saveCurrent())return;
  setActiveJobId(job.id);
  setProject(job.project);
  setPhotos(job.photos);
  setStage(job.stage);
  setAiConnected(false);
  makeActive(job.id);
  setShareDone(false);
  setSaveStatus('Opened saved job');
  scrollRef.current?.scrollTo({y:0,animated:true});
 };
 const startNewJob=()=>{
  if(!saveCurrent())return;
  const id=newJobId();
  setActiveJobId(id);
  setProject({...initial,lines:[],exclusions:[],futureWork:[],unknowns:[]});
  setPhotos([]);
  setStage(0);
  setAiConnected(false);
  setInfo('');
  makeActive(null);
  setShareDone(false);
  setSaveStatus('New job — ready to dictate');
  scrollRef.current?.scrollTo({y:0,animated:true});
 };

 const patch=(updates:Partial<Project>)=>setProject(prev=>({...prev,...updates}));
 const setLine=(index:number,part:Partial<EstimateLine>)=>setProject(prev=>({...prev,lines:prev.lines.map((x,i)=>i===index?{...x,...part}:x)}));
 const addLine=()=>patch({lines:[...project.lines,{id:'manual-'+Date.now(),description_en:'',description_es:'',quantity:1,unit:'job',rate:0,status:'included_now'}]});
 const addPhoto=async(camera=false)=>{
  try{
   const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:.7}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:.7,allowsMultipleSelection:true});
   if(!result.canceled){
    const uris=await Promise.all(result.assets.map(async asset=>{
     try{return await retainJobPhoto(asset.uri);}
     catch(e){console.warn('Could not preserve photo',e);return asset.uri;}
    }));
    setPhotos(current=>[...current,...uris].slice(0,20));
   }
  }catch(e){Alert.alert('Photos','Unable to access camera or photos. Please check device permissions.')}
 };
 const applyWallHeight=()=>{
  const height=Number(wallHeight);
  if(!Number.isFinite(height)||height<5||height>15){
   Alert.alert('Check measurement','Enter the actual shower wall height in feet (between 5 and 15).');
   return;
  }
  const description=project.description+'\nShower walls are '+height+' feet high.';
  const draft=localEstimate(description,project.trade);
  const updated=draft.lines.map(item=>({
   ...item,
   rate:project.lines.find(previous=>previous.id===item.id)?.rate??item.rate
  }));
  patch({description,lines:updated,unknowns:draft.unknowns});
  setWallHeight('');
  setInfo('Shower wall area recalculated. Review the updated quantity and all rates.');
 };
 const addElectricalLights=()=>{
  const qty=Number(lightCount),height=electricalCeilingHeight.trim()?Number(electricalCeilingHeight):undefined;
  try{
   const lines=upsertRecessedLights(project.lines,qty,height);
   patch({lines});
   setInfo('Added '+qty+' recessed lights. Other items and edited rates were preserved.');
   Alert.alert('Lights added / Luces agregadas',qty+' recessed lights are now included. Review their rate and save this job.');
  }catch(e){Alert.alert('Check quantities',e instanceof Error?e.message:'Please check the values.');}
 };
 const createLocalDraft=()=>{
  if(project.description.trim().length<10){Alert.alert('Describe the job','Dictate or type the job description first.');setStage(0);return;}
  const draft=localEstimate(project.description,project.trade);
  patch({lines:draft.lines,unknowns:draft.unknowns,exclusions:[],futureWork:[]});
  setAiConnected(false);
  setInfo('Local draft created. Illustrative rates only; review every line and adjust before sharing.');
  setStage(2);
 };
 const sharePdf=async(mode:'estimate'|'proposal'='estimate')=>{
  const readiness=estimateReadiness(project);
  if(!readiness.ready){
   Alert.alert('Estimate is incomplete','Finish the missing quantities and prices before exporting. '+readiness.issues.slice(0,2).join(' '),[{text:'Review work items',onPress:()=>setStage(2)}]);
   return;
  }
  if(!saveCurrent())return;
  setBusy(true);
  try{
   const pdf=await Print.printToFileAsync({html:proposalHtml(project,mode)});
   if(await Sharing.isAvailableAsync()){
    await Sharing.shareAsync(pdf.uri,{mimeType:'application/pdf',UTI:'com.adobe.pdf',dialogTitle:'Share Contractor Office Pro Estimate'});
    setShareDone(true);
    setSaveStatus('✓ Job saved · Share sheet closed');
    if(mode==='proposal')patch({lastProposalPreparedAt:new Date().toISOString()});
   }else Alert.alert('Sharing unavailable','PDF was generated but sharing is not available on this device.');
  }catch(e){Alert.alert('PDF export','Could not create or share the estimate.')}
  finally{setBusy(false)}
 };
 const setStatus=(status:JobStatus)=>{
  patch({status});
  setSaveStatus('Status updated — saving on this iPhone');
 };
 const total=totals(project);
 const readiness=estimateReadiness(project);
 return <KeyboardAvoidingView style={{flex:1,backgroundColor:PALETTE.background}} behavior={Platform.OS==='ios'?'padding':undefined}>
  <StatusBar style="dark"/>
  <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
   <Text style={styles.eyebrow}>CONTRACTOR OFFICE PRO · MOBILE PILOT</Text>
   <Text style={styles.title}>You Build.{'\n'}We Handle the Office.</Text>
   <View style={styles.card}>
    <Text style={styles.h2}>My Jobs / Mis trabajos</Text>
    <Text style={styles.hint}>Save a job and return to it later. Drafts are stored on this iPhone, not in the cloud.</Text>
    <Text style={styles.hint}>{saveStatus||'Local drafts · Not synced to the cloud'}</Text>
    <View style={styles.row}>
     <View style={{flex:1}}><Action title="Save now / Guardar" secondary onPress={()=>saveCurrent(true)}/></View>
     <View style={{flex:1}}><Action title="+ New job / Nuevo" onPress={startNewJob}/></View>
    </View>
    {savedJobs.length===0?<Text style={styles.hint}>No saved jobs yet. Dictate your first job below.</Text>:
    savedJobs.slice(0,10).map(j=><Pressable key={j.id} accessibilityRole="button" onPress={()=>openSaved(j)} style={[styles.savedJob,j.id===activeJobId&&{borderColor:PALETTE.accent}]}>
     <Text style={{fontWeight:'800',color:PALETTE.ink}}>{j.project.customer||j.project.city||j.project.description.slice(0,42)||'Untitled job'}{j.id===activeJobId?' · Current':''}</Text>
     <Text style={styles.hint}>{TRADES[j.project.trade].en} · {JOB_STATUSES[j.project.status||'draft'].en} · {j.project.lines.length} items · {new Date(j.updatedAt).toLocaleString()}</Text>
     <Text style={{color:PALETTE.accent,fontWeight:'700'}}>Open / Continuar</Text>
    </Pressable>)}
   </View>
   <View style={styles.steps}>{['Job','Scope','Price','Send','Follow up'].map((name,i)=><Pressable key={name} onPress={()=>setStage(i as Stage)} style={[styles.step,stage===i&&styles.stepActive]}><Text style={[styles.stepText,stage===i&&{color:PALETTE.white}]}>{i+1}. {name}</Text></Pressable>)}</View>
   {stage===0&&<View style={styles.card}>
    <Text style={styles.h2}>1 · Start a job</Text>
    <Text style={styles.hint}>Choose the trade, describe the work in Spanish or English, and add site photos.</Text>
    <View style={styles.tradeGrid}>{(Object.keys(TRADES) as Trade[]).map(t=><Pressable key={t} onPress={()=>patch({trade:t})} style={[styles.trade,project.trade===t&&styles.selectedTrade]}><Text style={[styles.tradeText,project.trade===t&&{color:PALETTE.white}]}>{TRADES[t].en}</Text><Text style={[styles.tradeSub,project.trade===t&&{color:'#e2fbf3'}]}>{TRADES[t].es}</Text></Pressable>)}</View>
    <Input label="Contractor / Contratista" value={project.contractor} onChangeText={x=>patch({contractor:x})} placeholder="Business name"/>
    <Input label="Customer / Cliente" value={project.customer} onChangeText={x=>patch({customer:x})} placeholder="Customer name"/>
    <Input label="City / Ciudad" value={project.city} onChangeText={x=>patch({city:x})} placeholder="City only"/>
    <SpeechInput description={project.description} onChange={x=>patch({description:x})}/>
    <View style={styles.row}><View style={{flex:1}}><Action title="Take photo" secondary onPress={()=>addPhoto(true)}/></View><View style={{flex:1}}><Action title="Choose photos" secondary onPress={()=>addPhoto()}/></View></View>
    <View style={styles.photoRow}>{photos.map((uri,i)=><Pressable key={uri+i} onPress={()=>setPhotos(prev=>prev.filter((_,j)=>j!==i))}><Image source={{uri}} style={{width:82,height:82,borderRadius:8}}/><Text style={styles.remove}>Remove</Text></Pressable>)}</View>
    <Text style={styles.hint}>{photos.length} local photos selected. Photos stay on your device and are not uploaded in this pilot.</Text>
    <Action title="Next · Understand the job" onPress={()=>setStage(1)}/>
   </View>}
   {stage===1&&<View style={styles.card}>
    <Text style={styles.h2}>2 · Prepare the scope / Preparar trabajo</Text>
    <Text style={styles.hint}>Your dictated notes become editable work items. No backend address, developer code, or AI account is needed for this offline estimate.</Text>
    <Action title="Build work items from dictation / Crear partidas" onPress={createLocalDraft}/>
    <Action title="Start with blank items / Agregar manualmente" secondary onPress={()=>{patch({lines:[],unknowns:[]});setStage(2);}}/>
    {!!info&&<Text style={styles.notice}>{info}</Text>}
   </View>}
   {stage===2&&<View style={styles.card}>
    <Text style={styles.h2}>3 · Review quantities and prices</Text>
    <Text style={styles.hint}>{aiConnected?'AI interpretation received. ':'Draft estimate from dictated work or manual entry. '}Offline planning rates are illustrative, not verified supplier quotes. Review quantities and every rate.</Text>
    {project.lines.map((line,i)=><View key={line.id} style={styles.lineCard}>
     <Text style={styles.lineNumber}>WORK ITEM {i+1}</Text>
     <Input label="English customer description" value={line.description_en} onChangeText={x=>setLine(i,{description_en:x})}/>
     <Input label="Descripción profesional en español" value={line.description_es} onChangeText={x=>setLine(i,{description_es:x})}/>
     <View style={styles.row}><View style={{flex:1}}><Input label="Quantity" value={String(line.quantity||'')} number onChangeText={x=>setLine(i,{quantity:Number(x)||0})}/></View><View style={{flex:1}}><Input label="Unit" value={line.unit} onChangeText={x=>setLine(i,{unit:x})}/></View><View style={{flex:1}}><Input label="Rate ($)" value={String(line.rate||'')} number onChangeText={x=>setLine(i,{rate:Number(x)||0})}/></View></View>
     <Text style={styles.rate}>Line amount: {money(line.quantity*line.rate)}</Text>
     <Action title="Remove item" secondary onPress={()=>patch({lines:project.lines.filter((_,j)=>j!==i)})}/>
    </View>)}
    {project.trade==='electrical'&&<View style={styles.lineCard}>
      <Text style={styles.h2}>Electrical quick add / Agregar luces</Text>
      <Text style={styles.hint}>Add missing recessed lights without replacing your existing dimmer or other priced work.</Text>
      <View style={styles.row}>
       <View style={{flex:1}}><Input label="Number of lights / Cantidad" number value={lightCount} onChangeText={setLightCount}/></View>
       <View style={{flex:1}}><Input label="Ceiling height (ft)" number value={electricalCeilingHeight} onChangeText={setElectricalCeilingHeight}/></View>
      </View>
      <Action title="+ Add recessed lights / Agregar luces" onPress={addElectricalLights}/>
     </View>}
    <Action title="+ Add work item" secondary onPress={addLine}/>
    <Input label="Not included (one per line)" multiline value={project.exclusions.join('\n')} onChangeText={x=>patch({exclusions:x.split('\n').map(x=>x.trim()).filter(Boolean)})}/>
    <Input label="Future work (not part of this estimate)" multiline value={project.futureWork.join('\n')} onChangeText={x=>patch({futureWork:x.split('\n').map(x=>x.trim()).filter(Boolean)})}/>
    {project.unknowns.length>0&&<Text style={styles.notice}>Planning estimate — confirm before pricing: {project.unknowns.join('; ')}</Text>}
    {project.lines.some(item=>item.id==='local-wall-tile'&&item.quantity===0)&&<View style={styles.lineCard}>
      <Text style={styles.h2}>Missing measurement / Falta medida</Text>
      <Text style={styles.hint}>How high are the shower walls? Enter measured feet to calculate tile area. No default height is assumed.</Text>
      <Input label="Shower wall height (ft) / Altura de paredes (pies)" value={wallHeight} onChangeText={setWallHeight} number placeholder="e.g. 8"/>
      <Action title="Apply height & update estimate" onPress={applyWallHeight}/>
     </View>}
    <Action title="Regenerate work items from dictated description" secondary onPress={createLocalDraft}/>
    <View style={styles.row}><View style={{flex:1}}><Input label="Overhead %" number value={String(project.overheadPct)} onChangeText={x=>patch({overheadPct:Number(x)||0})}/></View><View style={{flex:1}}><Input label="Profit %" number value={String(project.profitPct)} onChangeText={x=>patch({profitPct:Number(x)||0})}/></View></View>
    <Text style={styles.total}>Estimated total: {money(total.total)}</Text>
    <Action title="Next · Customer estimate" onPress={()=>setStage(3)}/>
   </View>}
   {stage===3&&<View style={styles.card}>
    <Text style={styles.h2}>4 · Send a professional estimate</Text>
    <Text style={styles.hint}>Private job notes and selected photos are not included in the customer PDF.</Text>
    <View style={styles.row}><View style={{flex:1}}><Action title="English" secondary={project.language!=='en'} onPress={()=>patch({language:'en'})}/></View><View style={{flex:1}}><Action title="Español" secondary={project.language!=='es'} onPress={()=>patch({language:'es'})}/></View></View>
    <Text style={styles.total}>{project.language==='en'?'Estimated price':'Precio estimado'}: {money(total.total)}</Text>
    <Text style={styles.hint}>{project.lines.length} work items · {project.exclusions.length} exclusions · {photos.length} private site photos</Text>
    <Input label={project.language==='en'?'Extra customer notes (optional)':'Notas adicionales para el cliente (opcional)'} multiline value={project.customerNotes} onChangeText={x=>patch({customerNotes:x})}/>
    {!readiness.ready&&<View style={styles.lineCard}>
      <Text style={styles.h2}>Estimate incomplete / Estimado incompleto</Text>
      <Text style={styles.hint}>Resolve the following items before sharing a customer PDF. In particular, 0 sq ft of shower tile is not a complete price.</Text>
      {readiness.issues.slice(0,6).map((item,i)=><Text key={i} style={styles.hint}>• {item}</Text>)}
      {readiness.issues.length>6&&<Text style={styles.hint}>…and {readiness.issues.length-6} more items.</Text>}
      <Action title="Review missing quantities / Revisar cantidades" secondary onPress={()=>setStage(2)}/>
     </View>}
    <Action title={busy?'Creating PDF...':readiness.ready?'Create & share customer PDF':'Complete estimate before PDF'} disabled={busy||!readiness.ready} onPress={()=>sharePdf('estimate')}/>
    <Action title="Continue · Track proposal / Seguimiento" secondary onPress={()=>setStage(4)}/>
    {shareDone&&<View style={styles.lineCard}>
     <Text style={styles.h2}>PDF prepared / PDF preparado</Text>
     <Text style={styles.hint}>The sharing window closed. The job is saved on this phone. Please confirm delivery in the destination you selected.</Text>
     <Action title="Back to My Jobs / Mis trabajos" onPress={goToMyJobs}/>
     <Action title="+ Start another job / Nuevo trabajo" secondary onPress={startNewJob}/>
     <Action title="Share PDF again / Compartir otra vez" secondary onPress={()=>sharePdf('estimate')}/>
     <Action title="Next · Track this job / Dar seguimiento" onPress={()=>setStage(4)}/>
    </View>}
    {!shareDone&&<View style={styles.row}>
     <View style={{flex:1}}><Action title="Save job / Guardar" secondary onPress={()=>saveCurrent(true)}/></View>
     <View style={{flex:1}}><Action title="My Jobs / Mis trabajos" secondary onPress={goToMyJobs}/></View>
    </View>}
    <Action title="Back to prices" secondary onPress={()=>setStage(2)}/>
   </View>}
   {stage===4&&<View style={styles.card}>
    <Text style={styles.h2}>5 · Project follow-up / Seguimiento</Text>
    <Text style={styles.hint}>After preparing an estimate, record the customer's decision, plan the next action, and keep this project moving.</Text>
    <Text style={styles.total}>{project.customer||'Customer'} · {money(total.total)}</Text>
    <Text style={styles.label}>Current status / Estado actual</Text>
    <Text style={styles.notice}>{JOB_STATUSES[project.status||'draft'].en} / {JOB_STATUSES[project.status||'draft'].es}</Text>
    <View style={styles.statusGrid}>
     {(Object.keys(JOB_STATUSES) as JobStatus[]).map(status=><Pressable key={status} accessibilityRole="button" accessibilityState={{selected:(project.status||'draft')===status}} onPress={()=>setStatus(status)} style={[styles.statusChoice,(project.status||'draft')===status&&styles.selectedTrade]}>
      <Text style={[styles.tradeText,(project.status||'draft')===status&&{color:PALETTE.white}]}>{JOB_STATUSES[status].en}</Text>
      <Text style={[styles.tradeSub,(project.status||'draft')===status&&{color:'#e2fbf3'}]}>{JOB_STATUSES[status].es}</Text>
     </Pressable>)}
    </View>
    <Input label="Follow-up date / Próximo seguimiento (YYYY-MM-DD)" value={project.followUpDate||''} onChangeText={x=>patch({followUpDate:x})} placeholder="2026-11-15"/>
    <Input label="Internal follow-up notes / Notas internas" multiline value={project.followUpNotes||''} onChangeText={x=>patch({followUpNotes:x})} placeholder="Called customer; waiting for approval..."/>
    <Text style={styles.hint}>These notes remain private. Dates are saved locally; automated reminders are not included yet.</Text>
    <Action title="Save follow-up / Guardar seguimiento" onPress={()=>saveCurrent(true)}/>
    <Action title={busy?'Creating PDF...':'Prepare & share formal proposal / Propuesta formal'} disabled={busy||!readiness.ready} onPress={()=>sharePdf('proposal')}/>
    {!readiness.ready&&<Text style={styles.notice}>Complete quantities and prices before preparing the customer proposal.</Text>}
    <View style={styles.row}>
     <View style={{flex:1}}><Action title="My Jobs / Mis trabajos" secondary onPress={goToMyJobs}/></View>
     <View style={{flex:1}}><Action title="+ New job / Nuevo" secondary onPress={startNewJob}/></View>
    </View>
    <Action title="Back to estimate / Volver al estimado" secondary onPress={()=>setStage(3)}/>
   </View>}
   <Text style={styles.footer}>Drafts are stored on this phone only. Uninstalling removes local drafts. Keyboard dictation works offline. Planning rates are editable and not verified supplier bids.</Text>
  </ScrollView>
 </KeyboardAvoidingView>;
}
const styles=StyleSheet.create({
 container:{paddingTop:55,paddingHorizontal:16,paddingBottom:70,maxWidth:750,width:'100%',alignSelf:'center'},
 eyebrow:{fontSize:11,letterSpacing:1.5,color:PALETTE.accent,fontWeight:'800'},title:{fontWeight:'900',fontSize:29,lineHeight:35,color:PALETTE.ink,marginTop:8,marginBottom:16},
 steps:{flexDirection:'row',gap:4,marginBottom:12},step:{flex:1,backgroundColor:'#e0ebe7',paddingVertical:11,borderRadius:9,alignItems:'center'},stepActive:{backgroundColor:PALETTE.accent},stepText:{fontSize:11,color:PALETTE.ink,fontWeight:'700'},
 card:{borderRadius:16,backgroundColor:PALETTE.white,padding:16,borderWidth:1,borderColor:PALETTE.line,marginBottom:14},
 h2:{fontSize:20,fontWeight:'800',color:PALETTE.ink,marginBottom:4},hint:{fontSize:13,lineHeight:19,color:PALETTE.muted,marginVertical:8},label:{fontSize:13,fontWeight:'700',color:PALETTE.ink,marginBottom:6},
 input:{borderWidth:1,borderColor:'#b8c9c6',borderRadius:9,minHeight:44,padding:10,color:PALETTE.ink,fontSize:15,backgroundColor:'#fff'},
 tradeGrid:{flexDirection:'row',flexWrap:'wrap',gap:7,marginVertical:9},trade:{width:'48%',borderWidth:1,borderColor:PALETTE.line,borderRadius:10,padding:11,backgroundColor:'#f8fbfa'},selectedTrade:{backgroundColor:PALETTE.accent},tradeText:{fontWeight:'800',color:PALETTE.ink},tradeSub:{fontSize:12,color:PALETTE.muted,marginTop:2},
 button:{backgroundColor:PALETTE.accent,minHeight:45,borderRadius:10,alignItems:'center',justifyContent:'center',paddingHorizontal:12,marginTop:12},buttonSecondary:{backgroundColor:'#e3f0ed',borderWidth:1,borderColor:'#c5ded6'},buttonText:{fontSize:14,fontWeight:'800',color:PALETTE.white,textAlign:'center'},
 voiceCard:{borderWidth:1,borderColor:'#9ecdc1',backgroundColor:'#edf8f5',borderRadius:12,padding:12,marginVertical:12},
 row:{flexDirection:'row',gap:9},photoRow:{flexDirection:'row',flexWrap:'wrap',gap:9,marginTop:12},photo:{width:82,height:82,borderRadius:8},remove:{fontSize:10,color:'#9a4545',textAlign:'center'},
 notice:{fontSize:13,color:'#775d21',backgroundColor:'#fdf6e1',padding:12,borderRadius:9,marginTop:12},
 savedJob:{borderWidth:1,borderColor:PALETTE.line,borderRadius:9,padding:10,marginTop:9,backgroundColor:'#f6fbf9'},
 statusGrid:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10,marginBottom:12},
 statusChoice:{width:'48%',backgroundColor:'#f6fbf9',borderWidth:1,borderColor:PALETTE.line,borderRadius:10,padding:10},
 lineCard:{borderWidth:1,borderColor:PALETTE.line,borderRadius:10,padding:12,marginTop:12},lineNumber:{color:PALETTE.accent,fontWeight:'800',fontSize:11},rate:{fontSize:14,fontWeight:'700',color:PALETTE.ink,marginTop:10},total:{fontWeight:'900',fontSize:22,color:PALETTE.accent,marginVertical:17},footer:{fontSize:12,lineHeight:18,color:PALETTE.muted,margin:8}
});
