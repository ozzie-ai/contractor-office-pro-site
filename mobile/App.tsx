import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Image,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import SpeechInput from './src/SpeechInput';
import {readStore,saveJob,newJobId,makeActive,retainJobPhoto,hasJobContent,SavedJob} from './src/jobDrafts';
import {localEstimate} from './src/localEstimate';
import {upsertRecessedLights} from './src/electricalItems';
import {readProfile,saveProfile,defaultProfile,BusinessProfile} from './src/businessProfile';
import {findPropertyArea,areaMatchesAddress} from './src/propertyLookup';
import {cleaningToProject,POST_CONSTRUCTION_TASKS,DEFAULT_POST_CONSTRUCTION_TASKS,recommendedPostConstructionWorkerHours,currentCleaningProject} from './src/cleaningEstimate';
import {Language,Project,Trade,TRADES,EstimateLine,CleaningDetails,CleaningType,CleaningFrequency,JobStatus,JOB_STATUSES,totals,recurringCleaningPrice,money,proposalHtml,estimateReadiness} from './src/estimate';

const PROPERTY_LOOKUP_URL=String(Constants.expoConfig?.extra?.propertyLookupUrl||'');
const PALETTE={ink:'#163942',accent:'#116b60',background:'#f3f7f5',line:'#cedfda',muted:'#526e70',white:'#fff'};
const defaultCleaning=(laborCostPerHour:number):CleaningDetails=>({type:'residential',frequency:'weekly',dustLevel:'moderate',postConstructionTasks:[...DEFAULT_POST_CONSTRUCTION_TASKS],bedrooms:3,bathrooms:2,livingRooms:1,areaSqFt:0,workers:2,firstHoursPerWorker:5,repeatHoursPerWorker:3,laborCostPerHour,firstSupplies:25,repeatSupplies:15,travelPerVisit:15});
const initial:Project={trade:'electrical',contractor:'',customer:'',city:'',description:'',lines:[],exclusions:[],futureWork:[],unknowns:[],customerNotes:'',language:'en',overheadPct:10,profitPct:20,status:'draft',followUpDate:'',followUpNotes:''};
type Stage=0|1|2|3|4;

function Action({title,onPress,secondary=false,disabled=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
 return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,secondary&&styles.buttonSecondary,disabled&&{opacity:.5}]}><Text style={[styles.buttonText,secondary&&{color:PALETTE.ink}]}>{title}</Text></Pressable>;
}
function Input({label,value,onChangeText,placeholder,multiline=false,number=false,secure=false,inputRef,onEndEditing}:{label:string;value:string;onChangeText:(x:string)=>void;placeholder?:string;multiline?:boolean;number?:boolean;secure?:boolean;inputRef?:React.Ref<React.ElementRef<typeof TextInput>>;onEndEditing?:()=>void}){
 return <View style={{marginTop:12}}><Text style={styles.label}>{label}</Text><TextInput ref={inputRef} autoCapitalize="sentences" value={value} onChangeText={onChangeText} onEndEditing={onEndEditing} placeholder={placeholder} placeholderTextColor="#84969a" keyboardType={number?'decimal-pad':'default'} secureTextEntry={secure} multiline={multiline} style={[styles.input,multiline&&{minHeight:100,textAlignVertical:'top'}]}/></View>;
}
export default function App(){
 const [project,setProject]=useState<Project>(initial);
 const [businessProfile,setBusinessProfile]=useState<BusinessProfile>(defaultProfile);
 const [showProfile,setShowProfile]=useState(false);
 const [showJobs,setShowJobs]=useState(false);
 const [profileSaved,setProfileSaved]=useState('');

 const [activeJobId,setActiveJobId]=useState(newJobId);
 const [savedJobs,setSavedJobs]=useState<SavedJob[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [saveStatus,setSaveStatus]=useState('');
 const [wallHeight,setWallHeight]=useState('');
 const [lightCount,setLightCount]=useState('5');
 const [electricalCeilingHeight,setElectricalCeilingHeight]=useState('8');
 const [shareDone,setShareDone]=useState(false);
 const scrollRef=useRef<React.ElementRef<typeof ScrollView>>(null);
 const addressRef=useRef('');

 const [stage,setStage]=useState<Stage>(0);
 const [photos,setPhotos]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [propertyBusy,setPropertyBusy]=useState(false);
 const [propertyMessage,setPropertyMessage]=useState('');
 const [info,setInfo]=useState('');
 const [aiConnected,setAiConnected]=useState(false);
 useEffect(()=>{
  const profile=readProfile();
  setBusinessProfile(profile);
  const stored=readStore();
  setSavedJobs(stored.jobs);
  // The home screen always opens a NEW job, never the last active estimate.
  // Existing saved jobs are kept in My Jobs and opened only by tapping one.
  const id=newJobId();
  setActiveJobId(id);
  setProject({...initial,contractor:profile.name,language:profile.language,overheadPct:profile.overheadPct,profitPct:profile.profitPct,trade:profile.enabledTrades[0]||'electrical'});
  setPhotos([]);
  setStage(0);
  addressRef.current='';
  makeActive(null);
  setShowJobs(false);
  setSaveStatus('New job — ready to start.');
  setLoaded(true);
 },[]);
 useEffect(()=>{
  if(!loaded||!hasJobContent(project,photos))return;
  setSaveStatus('Saving changes…');
  const t=setTimeout(()=>{
   try{
    saveJob({id:activeJobId,updatedAt:new Date().toISOString(),project:currentCleaningProject(project),photos,stage});
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
   saveJob({id:activeJobId,updatedAt:new Date().toISOString(),project:currentCleaningProject(project),photos,stage});
   const disk=readStore();
   const confirmed=disk.jobs.some(j=>j.id===activeJobId&&j.project.description===project.description&&j.project.lines.length===currentCleaningProject(project).lines.length);
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
  if(!saveCurrent())return;
  setShowProfile(false);
  setShowJobs(true);
  scrollRef.current?.scrollTo({y:0,animated:true});
 };
 const openSaved=(job:SavedJob)=>{
  if(!saveCurrent())return;
  setActiveJobId(job.id);
  setProject(job.project);
  addressRef.current=job.project.address||'';
  setPhotos(job.photos);
  setStage(job.stage);
  setAiConnected(false);
  makeActive(job.id);
  setShareDone(false);
  setShowJobs(false);
  setShowProfile(false);
  setSaveStatus('Opened saved job');
  scrollRef.current?.scrollTo({y:0,animated:true});
 };
 const startNewJob=()=>{
  if(!saveCurrent())return;
  const id=newJobId();
  setActiveJobId(id);
  setProject({...initial,lines:[],exclusions:[],futureWork:[],unknowns:[],contractor:businessProfile.name,language:businessProfile.language,overheadPct:businessProfile.overheadPct,profitPct:businessProfile.profitPct,trade:businessProfile.enabledTrades[0]});
  setPhotos([]);
  addressRef.current='';
  setStage(0);
  setAiConnected(false);
  setInfo('');
  makeActive(null);
  setShareDone(false);
  setShowJobs(false);
  setShowProfile(false);
  setSaveStatus('New job — ready to dictate');
  scrollRef.current?.scrollTo({y:0,animated:true});
 };

 const patch=(updates:Partial<Project>)=>setProject(prev=>({...prev,...updates}));
 const tr=(en:string,es:string)=>businessProfile.language==='es'?es:en;
 const chooseLanguage=(language:Language)=>{
  const updated={...businessProfile,language};
  try{saveProfile(updated);setBusinessProfile(updated);patch({language});}
  catch{Alert.alert('Language','Could not save your language preference.');}
 };

 const patchProfile=(updates:Partial<BusinessProfile>)=>setBusinessProfile(prev=>({...prev,...updates}));
 const commitProfile=()=>{
  try{
   if(!businessProfile.enabledTrades.length){Alert.alert('Choose services','Select at least one trade or service.');return;}
   if([businessProfile.overheadPct,businessProfile.profitPct,businessProfile.cleaningLaborCostPerHour].some(x=>!Number.isFinite(x)||x<0)){Alert.alert('Check defaults','Use valid nonnegative numbers.');return;}
   saveProfile(businessProfile);
   setProfileSaved('Business settings saved on this iPhone.');
   setShowProfile(false);
   Alert.alert('Business profile saved','Your company name, trades, language, overhead and profit will be defaults for NEW projects.');
  }catch(e){Alert.alert('Save failed','Could not save business profile.');}
 };
 const lookupProperty=async()=>{
  if(propertyBusy)return;
  setPropertyBusy(true);
  setPropertyMessage('Finding property records…');
  const address=project.address||'';
  const result=await findPropertyArea(address,PROPERTY_LOOKUP_URL);
  setPropertyBusy(false);
  if(result.status!=='found'){setPropertyMessage(result.message);return;}
  const record=result.property;
  if(!areaMatchesAddress(record,addressRef.current)){
   setPropertyMessage('Property address changed. Search again for the new address.');
   return;
  }
  patch({propertyArea:record});
  setPropertyMessage('Record found: '+record.squareFootage.toLocaleString('en-US')+' sq ft ('+record.source+').');
  if(project.trade==='cleaning'){
   Alert.alert('Building area found / Área encontrada',
    record.squareFootage.toLocaleString('en-US')+' sq ft recorded for '+record.matchedAddress+'. This is reported property living area, not necessarily the area to clean. Use it as the cleaning-area starting value?',[
      {text:'Keep current area'},
      {text:'Use this area',onPress:()=>patchCleaning({areaSqFt:record.squareFootage})}
    ]);
  }else{
   Alert.alert('Property size found',record.squareFootage.toLocaleString('en-US')+' sq ft reported building living area. This is NOT the measured floor or remodel area. Use as reference only until scope is measured.');
  }
 };
 const patchCleaning=(updates:Partial<CleaningDetails>)=>patch({cleaning:{...(project.cleaning||defaultCleaning(businessProfile.cleaningLaborCostPerHour)),...updates, laborHoursConfirmed:updates.laborHoursConfirmed??false}});
 
 const cleaningInput=(v:string)=>Number(v)||0;
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
  if(project.trade==='cleaning'){
   const details=project.cleaning||defaultCleaning(businessProfile.cleaningLaborCostPerHour);
   if(details.type==='post_construction'&&details.areaSqFt<=0){
    Alert.alert('Need job size / Falta área','Enter an approximate or measured square-foot area for post-construction cleaning before preparing a quote.');
    setStage(0);return;
   }
   if(details.type==='post_construction'&&!(details.postConstructionTasks||DEFAULT_POST_CONSTRUCTION_TASKS).length){
    Alert.alert('Select scope / Seleccionar alcance','Select at least one cleaning task before preparing a quote.');
    setStage(0);return;
   }
   try{
    const drafted=cleaningToProject(details,project);
    patch({...drafted,exclusions:[],futureWork:[]});
    setInfo('Initial deep cleaning and recurring-visit price prepared separately. Review labor costs, hours and client scope.');
    setStage(2);
   }catch(e){Alert.alert('Check cleaning details',e instanceof Error?e.message:'Check service details.');setStage(0);}
   return;
  }
  if(project.description.trim().length<10){Alert.alert('Describe the job','Dictate or type the job description first.');setStage(0);return;}
  const draft=localEstimate(project.description,project.trade);
  patch({lines:draft.lines,unknowns:draft.unknowns,exclusions:[],futureWork:[]});
  setAiConnected(false);
  setInfo('Local draft created. Illustrative rates only; review every line and adjust before sharing.');
  setStage(2);
 };
 const sharePdf=async(mode:'estimate'|'proposal'='estimate')=>{
  const quote=currentCleaningProject(project);
  if(quote.trade==='cleaning'&&quote.cleaning?.type==='post_construction'&&(!quote.cleaning.areaSqFt||!(quote.cleaning.postConstructionTasks||DEFAULT_POST_CONSTRUCTION_TASKS).length)){
   Alert.alert('Missing cleaning details','Enter square footage and select the work included before sharing.',[{text:'Review job',onPress:()=>setStage(0)}]);
   return;
  }
  const readiness=estimateReadiness(quote);
  if(!readiness.ready){
   Alert.alert('Estimate is incomplete','Finish the missing quantities and prices before exporting. '+readiness.issues.slice(0,2).join(' '),[{text:'Review work items',onPress:()=>setStage(2)}]);
   return;
  }
  if(!saveCurrent())return;
  setBusy(true);
  try{
   const pdf=await Print.printToFileAsync({html:proposalHtml(quote,mode)});
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
 const pricedProject=currentCleaningProject(project);
 const total=totals(pricedProject);
 const readiness=estimateReadiness(pricedProject);
 return <KeyboardAvoidingView style={{flex:1,backgroundColor:PALETTE.background}} behavior={Platform.OS==='ios'?'padding':undefined}>
  <StatusBar style="dark"/>
  <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
   <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
    <Text style={styles.eyebrow}>CONTRACTOR OFFICE PRO</Text>
    <Text style={{fontSize:11,color:PALETTE.muted,fontWeight:'800'}}>MOBILE UI 24</Text>
   </View>
   <View style={styles.row}>
    <View style={{flex:1}}><Action title={tr('New Job','Nuevo trabajo')} onPress={startNewJob}/></View>
    <View style={{flex:1}}><Action title={tr('My Jobs','Mis trabajos')+(savedJobs.length?' ('+savedJobs.length+')':'')} secondary={!showJobs} onPress={goToMyJobs}/></View>
   </View>
   <View style={styles.row}>
    <View style={{flex:1}}><Action title="English" secondary={businessProfile.language!=='en'} onPress={()=>chooseLanguage('en')}/></View>
    <View style={{flex:1}}><Action title="Español" secondary={businessProfile.language!=='es'} onPress={()=>chooseLanguage('es')}/></View>
    <View style={{flex:1}}><Action title={tr('Settings','Ajustes')} secondary onPress={()=>{setShowJobs(false);setShowProfile(x=>!x);}}/></View>
   </View>
   {showProfile&&<View style={styles.card}>
    <Text style={styles.h2}>{tr('Business settings','Configuración del negocio')}</Text>
    <Text style={styles.hint}>{businessProfile.name||tr('Set up your business once.','Configura tu negocio una sola vez.')} · {businessProfile.enabledTrades.length} {tr('services','servicios')}</Text>
    {!!profileSaved&&<Text style={styles.hint}>{profileSaved}</Text>}
    <View>
      <Input label={tr("Business name","Nombre del negocio")} value={businessProfile.name} onChangeText={x=>patchProfile({name:x})}/>
      <Text style={styles.label}>{tr("Services offered","Servicios ofrecidos")}</Text>
      <View style={styles.tradeGrid}>
       {(Object.keys(TRADES) as Trade[]).map(t=><Pressable key={t} onPress={()=>patchProfile({enabledTrades:businessProfile.enabledTrades.includes(t)?businessProfile.enabledTrades.filter(x=>x!==t):[...businessProfile.enabledTrades,t]})} style={[styles.trade,businessProfile.enabledTrades.includes(t)&&styles.selectedTrade]}>
        <Text style={[styles.tradeText,businessProfile.enabledTrades.includes(t)&&{color:PALETTE.white}]}>{TRADES[t][businessProfile.language]}</Text>
       </Pressable>)}
      </View>
      <View style={styles.row}>
       <View style={{flex:1}}><Input label={tr("Default overhead %","Gastos generales predeterminados %")} number value={String(businessProfile.overheadPct)} onChangeText={x=>patchProfile({overheadPct:cleaningInput(x)})}/></View>
       <View style={{flex:1}}><Input label={tr("Default profit %","Utilidad predeterminada %")} number value={String(businessProfile.profitPct)} onChangeText={x=>patchProfile({profitPct:cleaningInput(x)})}/></View>
      </View>
      {businessProfile.enabledTrades.includes('cleaning')&&<Input label={tr("Labor cost per worker-hour ($)","Costo por hora-persona ($)")} number value={String(businessProfile.cleaningLaborCostPerHour)} onChangeText={x=>patchProfile({cleaningLaborCostPerHour:cleaningInput(x)})}/>}
      <Action title={tr("Save settings","Guardar ajustes")} onPress={commitProfile}/>
      <Text style={styles.hint}>{tr("Defaults apply to new jobs. Saved estimates keep their prices.","Los valores predeterminados se aplican a trabajos nuevos. Los estimados guardados conservan sus precios.")}</Text>
    </View>
   </View>}
   {showJobs&&<View style={styles.card}>
    <Text style={styles.h2}>{tr('My Jobs','Mis trabajos')}</Text>
    <Text style={styles.hint}>{tr('Tap a saved job to continue. Jobs are stored on this phone.','Toca un trabajo guardado para continuar. Los trabajos están en este teléfono.')}</Text>
    <Text style={styles.hint}>{saveStatus==='New job — ready to start.'?tr('Ready for a new job.','Listo para un trabajo nuevo.'):saveStatus==='New job — ready to dictate'?tr('Ready for a new job.','Listo para un trabajo nuevo.'):saveStatus==='Opened saved job'?tr('Job opened.','Trabajo abierto.'):saveStatus==='Saved on this iPhone'?tr('Saved on this phone.','Guardado en este teléfono.'):saveStatus}</Text>
    <View style={styles.row}>
     <View style={{flex:1}}><Action title={tr("Save","Guardar")} secondary onPress={()=>saveCurrent(true)}/></View>
     <View style={{flex:1}}><Action title={tr("New Job","Nuevo trabajo")} onPress={startNewJob}/></View>
    </View>
    {savedJobs.length===0?<Text style={styles.hint}>{tr('No saved jobs yet.','Aún no hay trabajos guardados.')}</Text>:
    savedJobs.slice(0,10).map(j=><Pressable key={j.id} accessibilityRole="button" onPress={()=>openSaved(j)} style={[styles.savedJob,j.id===activeJobId&&{borderColor:PALETTE.accent}]}>
     <Text style={{fontWeight:'800',color:PALETTE.ink}}>{j.project.customer||j.project.city||j.project.description.slice(0,42)||tr('Untitled job','Trabajo sin nombre')}{j.id===activeJobId?tr(' · Current',' · Actual'):''}</Text>
     <Text style={styles.hint}>{TRADES[j.project.trade][businessProfile.language]} · {JOB_STATUSES[j.project.status||'draft'][businessProfile.language]} · {j.project.lines.length} {tr('items','partidas')} · {new Date(j.updatedAt).toLocaleString()}</Text>
     <Text style={{color:PALETTE.accent,fontWeight:'700'}}>{tr('Open','Abrir')}</Text>
    </Pressable>)}
   </View>}
   {!showJobs&&<>
   <Text style={styles.h2}>{stage===0?tr('New Job','Nuevo trabajo'):tr('Job workspace','Área de trabajo')}{project.customer?' · '+project.customer:''}</Text>
   <View style={styles.steps}>{(businessProfile.language==='es'?['Trabajo','Alcance','Precio','Enviar','Seguimiento']:['Job','Scope','Price','Send','Follow up']).map((name,i)=><Pressable key={name} onPress={()=>setStage(i as Stage)} style={[styles.step,stage===i&&styles.stepActive]}><Text style={[styles.stepText,stage===i&&{color:PALETTE.white}]}>{i+1}. {name}</Text></Pressable>)}</View>
   {stage===0&&<View style={styles.card}>
    <Text style={styles.h2}>{tr("1 · New Job","1 · Nuevo trabajo")}</Text>
    <Text style={styles.hint}>{tr("Choose a service, describe the job, and add photos.","Elige un servicio, describe el trabajo y agrega fotos.")}</Text>
    <View style={styles.tradeGrid}>{businessProfile.enabledTrades.map(t=><Pressable key={t} onPress={()=>patch({trade:t,cleaning:t==='cleaning'?(project.cleaning||defaultCleaning(businessProfile.cleaningLaborCostPerHour)):project.cleaning})} style={[styles.trade,project.trade===t&&styles.selectedTrade]}><Text style={[styles.tradeText,project.trade===t&&{color:PALETTE.white}]}>{TRADES[t][businessProfile.language]}</Text></Pressable>)}</View>
    <Input label={tr("Business","Negocio")} value={project.contractor} onChangeText={x=>patch({contractor:x})} placeholder={tr('Your business name','Nombre de tu negocio')}/>
    <Input label={tr("Customer","Cliente")} value={project.customer} onChangeText={x=>patch({customer:x})} placeholder={tr('Customer name','Nombre del cliente')}/>
    <Input label={tr("City","Ciudad")} value={project.city} onChangeText={x=>patch({city:x})} placeholder={tr('City','Ciudad')}/>
    <Input label={tr("Service address","Dirección del trabajo")} value={project.address||''} onChangeText={x=>{addressRef.current=x;patch({address:x,propertyArea:undefined});setPropertyMessage('');}} onEndEditing={()=>{if(PROPERTY_LOOKUP_URL&&(project.address||'').trim().length>=12)void lookupProperty();}} placeholder={tr('Street, city, state, ZIP','Calle, ciudad, estado y código postal')}/>
    <Action title={propertyBusy?tr('Searching…','Buscando…'):tr('Find property size','Buscar tamaño de la propiedad')} disabled={propertyBusy} secondary onPress={lookupProperty}/>
    {!!propertyMessage&&<Text style={styles.hint}>{propertyMessage}</Text>}
    {project.propertyArea&&areaMatchesAddress(project.propertyArea,project.address||'')&&<Text style={styles.notice}>{tr('Property record','Registro de propiedad')}: {project.propertyArea.squareFootage.toLocaleString('en-US')} {tr('sq ft','pies²')} · {project.propertyArea.source}. {tr('Address','Dirección')}: {project.propertyArea.matchedAddress}. {tr('Verify the actual area of work.','Confirma el área real del trabajo.')}</Text>}
    {project.trade==='cleaning'&&<View style={styles.lineCard}>
     <Text style={styles.h2}>{tr("Cleaning details","Detalles de limpieza")}</Text>
     <Text style={styles.label}>{tr("Cleaning type","Tipo de limpieza")}</Text>
     <View style={styles.tradeGrid}>
      {([{id:'residential',en:'House / Casa'},{id:'office',en:'Office / Oficina'},{id:'post_construction',en:'Post-construction'},{id:'specialty',en:'Specialty / Especial'}] as {id:CleaningType;en:string}[]).map(item=><Pressable key={item.id} onPress={()=>patchCleaning({type:item.id})} style={[styles.trade,(project.cleaning?.type||'residential')===item.id&&styles.selectedTrade]}><Text style={[styles.tradeText,(project.cleaning?.type||'residential')===item.id&&{color:PALETTE.white}]}>{businessProfile.language==='es'?({residential:'Casa',office:'Oficina',post_construction:'Después de obra',specialty:'Especializada'} as Record<CleaningType,string>)[item.id]:item.en.split(' / ')[0]}</Text></Pressable>)}
     </View>
     <Text style={styles.label}>{tr("Frequency","Frecuencia")}</Text>
     <View style={styles.tradeGrid}>
      {([{id:'once',en:'One time'},{id:'weekly',en:'Weekly'},{id:'biweekly',en:'Every 2 weeks'},{id:'twice_monthly',en:'Twice a month'},{id:'monthly',en:'Monthly'}] as {id:CleaningFrequency;en:string}[]).map(item=><Pressable key={item.id} onPress={()=>patchCleaning({frequency:item.id})} style={[styles.trade,(project.cleaning?.frequency||'weekly')===item.id&&styles.selectedTrade]}><Text style={[styles.tradeText,(project.cleaning?.frequency||'weekly')===item.id&&{color:PALETTE.white}]}>{businessProfile.language==='es'?({once:'Una vez',weekly:'Semanal',biweekly:'Cada 2 semanas',twice_monthly:'Dos veces al mes',monthly:'Mensual'} as Record<CleaningFrequency,string>)[item.id]:item.en}</Text></Pressable>)}
     </View>
     <View style={styles.row}>
      <View style={{flex:1}}><Input label={tr("Bedrooms","Habitaciones")} number value={String(project.cleaning?.bedrooms??3)} onChangeText={x=>patchCleaning({bedrooms:cleaningInput(x)})}/></View>
      <View style={{flex:1}}><Input label={tr("Bathrooms","Baños")} number value={String(project.cleaning?.bathrooms??2)} onChangeText={x=>patchCleaning({bathrooms:cleaningInput(x)})}/></View>
      <View style={{flex:1}}><Input label={tr("Living rooms","Salas")} number value={String(project.cleaning?.livingRooms??1)} onChangeText={x=>patchCleaning({livingRooms:cleaningInput(x)})}/></View>
     </View>
     <Input label={tr("Square feet (optional)","Pies cuadrados (opcional)")} number value={String(project.cleaning?.areaSqFt??0)} onChangeText={x=>patchCleaning({areaSqFt:cleaningInput(x)})}/>
     <View style={styles.row}>
      <View style={{flex:1}}><Input label={tr("Workers","Personas")} number value={String(project.cleaning?.workers??2)} onChangeText={x=>patchCleaning({workers:cleaningInput(x)})}/></View>
      <View style={{flex:1}}><Input label={tr("First visit hours per worker","Horas por persona (primera visita)")} number value={String(project.cleaning?.firstHoursPerWorker??5)} onChangeText={x=>patchCleaning({firstHoursPerWorker:cleaningInput(x)})}/></View>
      <View style={{flex:1}}><Input label={tr("Repeat hours per worker","Horas por persona (visitas posteriores)")} number value={String(project.cleaning?.repeatHoursPerWorker??3)} onChangeText={x=>patchCleaning({repeatHoursPerWorker:cleaningInput(x)})}/></View>
     </View>
     <Input label={tr("Labor cost per worker-hour ($)","Costo laboral por hora-persona ($)")} number value={String(project.cleaning?.laborCostPerHour??businessProfile.cleaningLaborCostPerHour)} onChangeText={x=>patchCleaning({laborCostPerHour:cleaningInput(x)})}/>
     <View style={styles.row}>
      <View style={{flex:1}}><Input label={tr("First visit supplies $","Insumos primera visita $")} number value={String(project.cleaning?.firstSupplies??25)} onChangeText={x=>patchCleaning({firstSupplies:cleaningInput(x)})}/></View>
      <View style={{flex:1}}><Input label={tr("Recurring supplies $","Insumos visitas posteriores $")} number value={String(project.cleaning?.repeatSupplies??15)} onChangeText={x=>patchCleaning({repeatSupplies:cleaningInput(x)})}/></View>
      <View style={{flex:1}}><Input label={tr("Travel per visit $","Traslado por visita $")} number value={String(project.cleaning?.travelPerVisit??15)} onChangeText={x=>patchCleaning({travelPerVisit:cleaningInput(x)})}/></View>
     </View>
     {project.cleaning?.type==='post_construction'&&<View style={styles.lineCard}>
      <Text style={styles.h2}>{tr("Construction dust","Polvo de construcción")}</Text>
      <Text style={styles.hint}>{tr("Choose the dust level to calculate work hours.","Elige el nivel de polvo para calcular las horas de trabajo.")}</Text>
      <View style={styles.tradeGrid}>
       {(['light','moderate','heavy'] as const).map(level=><Pressable key={level} onPress={()=>patchCleaning({dustLevel:level})} style={[styles.trade,(project.cleaning?.dustLevel||'moderate')===level&&styles.selectedTrade]}><Text style={[styles.tradeText,(project.cleaning?.dustLevel||'moderate')===level&&{color:PALETTE.white}]}>{level==='light'?tr('Light','Ligero'):level==='heavy'?tr('Heavy','Abundante'):tr('Moderate','Moderado')}</Text></Pressable>)}
      </View>
      <Text style={styles.h2}>{tr("Included services","Servicios incluidos")}</Text>
      {POST_CONSTRUCTION_TASKS.map(task=><Pressable key={task.id} onPress={()=>{
       const selected=project.cleaning?.postConstructionTasks||DEFAULT_POST_CONSTRUCTION_TASKS;
       patchCleaning({postConstructionTasks:selected.includes(task.id)?selected.filter(x=>x!==task.id):[...selected,task.id]});
      }} style={styles.savedJob}>
       <Text style={styles.tradeText}>{(project.cleaning?.postConstructionTasks||DEFAULT_POST_CONSTRUCTION_TASKS).includes(task.id)?'☑':'☐'} {task[businessProfile.language]}</Text>
       
      </Pressable>)}
      <Text style={styles.notice}>{tr('Area-based hours','Horas calculadas por área')}: {recommendedPostConstructionWorkerHours(project.cleaning||defaultCleaning(businessProfile.cleaningLaborCostPerHour))}. {tr('Entered','Ingresadas')}: {(project.cleaning?.workers||2)*(project.cleaning?.firstHoursPerWorker||5)}. {tr('Pricing uses the higher amount unless you confirm measured hours.','El precio usa la cantidad mayor, salvo que confirmes horas medidas.')}</Text>
      <Text style={styles.hint}>{tr('Priced labor hours','Horas incluidas en el precio')}: {(project.cleaning?.laborHoursConfirmed&&project.cleaning?.laborHoursVerificationVersion===2)?(project.cleaning.workers*project.cleaning.firstHoursPerWorker):Math.max((project.cleaning?.workers||2)*(project.cleaning?.firstHoursPerWorker||5),recommendedPostConstructionWorkerHours(project.cleaning||defaultCleaning(businessProfile.cleaningLaborCostPerHour)))}. {tr('Planning estimate.','Estimado preliminar.')}</Text>
      <Action title={tr("Use measured hours","Usar horas medidas")} secondary onPress={()=>{
       const c=project.cleaning||defaultCleaning(businessProfile.cleaningLaborCostPerHour);
       Alert.alert('Confirm site-assessed labor / Confirmar horas','Use '+(c.workers*c.firstHoursPerWorker)+' actual worker-hours for this job instead of the area-based guideline only if you assessed the condition and scope.',[
        {text:'Cancel'},
        {text:'Confirm measured hours',onPress:()=>patchCleaning({laborHoursConfirmed:true,laborHoursVerificationVersion:2})}
       ]);
      }}/>
      <Action title={tr("Use suggested hours","Usar horas sugeridas")} secondary onPress={()=>{
       const c=project.cleaning||defaultCleaning(businessProfile.cleaningLaborCostPerHour);
       if(!c.areaSqFt){Alert.alert('Enter square feet','Measure or estimate the cleanable square footage first.');return;}
       patchCleaning({firstHoursPerWorker:Math.ceil(recommendedPostConstructionWorkerHours(c)/Math.max(1,c.workers))});
      }}/>
     </View>}
    <Text style={styles.hint}>{tr("Labor and supply amounts are editable planning costs.","Las horas y costos son estimados editables.")}</Text>
    </View>}
    <SpeechInput language={businessProfile.language} description={project.description} onChange={x=>patch({description:x})}/>
    <View style={styles.row}><View style={{flex:1}}><Action title={tr("Take photo","Tomar foto")} secondary onPress={()=>addPhoto(true)}/></View><View style={{flex:1}}><Action title={tr("Add photos","Agregar fotos")} secondary onPress={()=>addPhoto()}/></View></View>
    <View style={styles.photoRow}>{photos.map((uri,i)=><Pressable key={uri+i} onPress={()=>setPhotos(prev=>prev.filter((_,j)=>j!==i))}><Image source={{uri}} style={{width:82,height:82,borderRadius:8}}/><Text style={styles.remove}>{tr('Remove','Eliminar')}</Text></Pressable>)}</View>
    <Text style={styles.hint}>{photos.length} {tr('photos saved on this phone.','fotos guardadas en este teléfono.')}</Text>
    <Action title={tr("Next: Scope","Siguiente: Alcance")} onPress={()=>setStage(1)}/>
   </View>}
   {stage===1&&<View style={styles.card}>
    <Text style={styles.h2}>{tr("2 · Prepare scope","2 · Preparar alcance")}</Text>
    <Text style={styles.hint}>{project.trade==='cleaning'?tr('First cleaning and recurring visits are priced separately.','La primera limpieza y las visitas periódicas se calculan por separado.'):tr('Turn your job notes into an editable estimate.','Convierte tus notas en un estimado editable.')}</Text>
    <Action title={project.trade==='cleaning'?tr('Calculate cleaning price','Calcular precio de limpieza'):tr('Create work items','Crear partidas')} onPress={createLocalDraft}/>
    <Action title={tr("Enter items manually","Agregar partidas manualmente")} secondary onPress={()=>{patch({lines:[],unknowns:[]});setStage(2);}}/>
    {!!info&&<Text style={styles.notice}>{info}</Text>}
   </View>}
   {stage===2&&<View style={styles.card}>
    <Text style={styles.h2}>{tr("3 · Review prices","3 · Revisar precios")}</Text>
    <Text style={styles.hint}>{tr('Review quantities and prices before sharing.','Revisa cantidades y precios antes de compartir.')}</Text>
    {pricedProject.lines.map((line,i)=><View key={line.id} style={styles.lineCard}>
     {project.trade==='cleaning'&&line.id==='clean-initial'?<View>
      <Text style={styles.label}>{tr("Cleaning price","Precio de limpieza")}</Text>
      <Text style={styles.total}>{money(total.total)}</Text>
      <Text style={styles.hint}>{tr("Price updates automatically as job details change.","El precio se actualiza automáticamente cuando cambia el trabajo.")}</Text>
      <Action title={tr("Review labor hours","Revisar horas de trabajo")} secondary onPress={()=>setStage(0)}/>
     </View>:<>
     <Text style={styles.lineNumber}>{tr('ITEM','PARTIDA')} {i+1}</Text>
     <Input label={tr("Description in English","Descripción en inglés")} value={line.description_en} onChangeText={x=>setLine(i,{description_en:x})}/>
     <Input label={tr("Description in Spanish","Descripción en español")} value={line.description_es} onChangeText={x=>setLine(i,{description_es:x})}/>
     <View style={styles.row}><View style={{flex:1}}><Input label={tr("Quantity","Cantidad")} value={String(line.quantity||'')} number onChangeText={x=>setLine(i,{quantity:Number(x)||0})}/></View><View style={{flex:1}}><Input label={tr("Unit","Unidad")} value={line.unit} onChangeText={x=>setLine(i,{unit:x})}/></View><View style={{flex:1}}><Input label={tr("Rate ($)","Tarifa ($)")} value={String(line.rate||'')} number onChangeText={x=>setLine(i,{rate:Number(x)||0})}/></View></View>
     <Text style={styles.rate}>{tr('Amount','Importe')}: {money(line.quantity*line.rate)}</Text>
     <Action title={tr("Remove item","Eliminar partida")} secondary onPress={()=>patch({lines:project.lines.filter(x=>x.id!==line.id)})}/>
     </>}
    </View>)}
    {project.trade==='electrical'&&<View style={styles.lineCard}>
      <Text style={styles.h2}>{tr("Recessed lights","Luces empotradas")}</Text>
      <Text style={styles.hint}>{tr("Add lights without removing other electrical items.","Agrega luces sin borrar otras partidas eléctricas.")}</Text>
      <View style={styles.row}>
       <View style={{flex:1}}><Input label={tr("Number of lights","Cantidad de luces")} number value={lightCount} onChangeText={setLightCount}/></View>
       <View style={{flex:1}}><Input label={tr("Ceiling height (ft)","Altura de techo (pies)")} number value={electricalCeilingHeight} onChangeText={setElectricalCeilingHeight}/></View>
      </View>
      <Action title={tr("Add recessed lights","Agregar luces empotradas")} onPress={addElectricalLights}/>
     </View>}
    <Action title={tr("Add work item","Agregar partida")} secondary onPress={addLine}/>
    <Input label={tr("Exclusions (one per line)","Exclusiones (una por línea)")} multiline value={project.exclusions.join('\n')} onChangeText={x=>patch({exclusions:x.split('\n').map(x=>x.trim()).filter(Boolean)})}/>
    <Input label={tr("Future work (excluded)","Trabajo futuro (no incluido)")} multiline value={project.futureWork.join('\n')} onChangeText={x=>patch({futureWork:x.split('\n').map(x=>x.trim()).filter(Boolean)})}/>
    {project.unknowns.length>0&&<Text style={styles.notice}>{tr('Check before sharing','Revisar antes de compartir')}: {project.unknowns.join('; ')}</Text>}
    {project.lines.some(item=>item.id==='local-wall-tile'&&item.quantity===0)&&<View style={styles.lineCard}>
      <Text style={styles.h2}>{tr("Missing measurement","Falta una medida")}</Text>
      <Text style={styles.hint}>{tr("Enter the measured shower wall height in feet.","Ingresa la altura medida de las paredes de la regadera, en pies.")}</Text>
      <Input label={tr("Shower wall height (ft)","Altura de paredes (pies)")} value={wallHeight} onChangeText={setWallHeight} number placeholder="e.g. 8"/>
      <Action title={tr("Apply height","Aplicar altura")} onPress={applyWallHeight}/>
     </View>}
    <Action title={tr("Rebuild from description","Recalcular desde descripción")} secondary onPress={createLocalDraft}/>
    <View style={styles.row}><View style={{flex:1}}><Input label={tr("Overhead %","Gastos generales %")} number value={String(project.overheadPct)} onChangeText={x=>patch({overheadPct:Number(x)||0})}/></View><View style={{flex:1}}><Input label={tr("Profit %","Utilidad %")} number value={String(project.profitPct)} onChangeText={x=>patch({profitPct:Number(x)||0})}/></View></View>
    {project.trade==='cleaning'&&project.cleaning&&<View style={styles.lineCard}>
      <Text style={styles.h2}>{tr("Estimated labor hours","Horas de trabajo estimadas")}</Text>
      <Text style={styles.total}>{project.cleaning.type==='post_construction'&&!(project.cleaning.laborHoursConfirmed&&project.cleaning.laborHoursVerificationVersion===2)?Math.max(project.cleaning.workers*project.cleaning.firstHoursPerWorker,recommendedPostConstructionWorkerHours(project.cleaning)):project.cleaning.workers*project.cleaning.firstHoursPerWorker} {tr('worker-hours','horas-persona')}</Text>
      <Text style={styles.hint}>{project.cleaning.workers} {tr('workers','personas')} · {project.cleaning.areaSqFt||tr('Area pending','Área pendiente')} {tr('sq ft','pies²')} · {project.cleaning.type==='post_construction'?tr(({light:'Light',moderate:'Moderate',heavy:'Heavy'} as const)[project.cleaning.dustLevel||'moderate'],({light:'Ligero',moderate:'Moderado',heavy:'Abundante'} as const)[project.cleaning.dustLevel||'moderate']):tr('Deep cleaning','Limpieza profunda')}. {tr('Edit in Step 1.','Editar en el paso 1.')}</Text>
    </View>}
    <Text style={styles.total}>{project.trade==='cleaning'?tr('First cleaning','Primera limpieza'):tr('Estimated total','Total estimado')}: {money(total.total)}</Text>
    {project.trade==='cleaning'&&project.cleaning?.frequency!=='once'&&<Text style={styles.hint}>{tr('Recurring price per visit','Precio por visita periódica')}: {money(recurringCleaningPrice(project))}</Text>}
    <Action title={tr("Next: Proposal","Siguiente: Propuesta")} onPress={()=>setStage(3)}/>
   </View>}
   {stage===3&&<View style={styles.card}>
    <Text style={styles.h2}>{tr("4 · Customer proposal","4 · Propuesta al cliente")}</Text>
    <Text style={styles.hint}>{tr("Internal notes and photos stay out of the customer PDF.","Las notas privadas y fotos no aparecen en el PDF del cliente.")}</Text>
    <Text style={styles.hint}>{tr('Proposal language','Idioma de la propuesta')}: {project.language==='es'?'Español':'English'}</Text>
    <Action title={tr('Change proposal language','Cambiar idioma de propuesta')} secondary onPress={()=>patch({language:project.language==='en'?'es':'en'})}/>
    <Text style={styles.total}>{tr('Estimated price','Precio estimado')}: {money(total.total)}</Text>
    <Text style={styles.hint}>{project.lines.length} {tr('items','partidas')} · {project.exclusions.length} {tr('exclusions','exclusiones')} · {photos.length} {tr('private photos','fotos privadas')}</Text>
    <Input label={project.language==='en'?'Extra customer notes (optional)':'Notas adicionales para el cliente (opcional)'} multiline value={project.customerNotes} onChangeText={x=>patch({customerNotes:x})}/>
    {!readiness.ready&&<View style={styles.lineCard}>
      <Text style={styles.h2}>{tr("Estimate incomplete","Estimado incompleto")}</Text>
      <Text style={styles.hint}>{tr("Complete missing quantities and rates before sharing.","Completa las cantidades y tarifas pendientes antes de compartir.")}</Text>
      {readiness.issues.slice(0,6).map((item,i)=><Text key={i} style={styles.hint}>• {item}</Text>)}
      {readiness.issues.length>6&&<Text style={styles.hint}>{tr('and','y')} {readiness.issues.length-6} {tr('more items','partidas más')}.</Text>}
      <Action title={tr("Review missing quantities","Revisar cantidades pendientes")} secondary onPress={()=>setStage(2)}/>
     </View>}
    {project.trade==='cleaning'&&<Text style={styles.hint}>{tr("Cleaning prices update automatically.","Los precios de limpieza se actualizan automáticamente.")}</Text>}
    <Action title={busy?tr('Creating PDF…','Creando PDF…'):readiness.ready?tr('Share estimate PDF','Compartir estimado PDF'):tr('Complete estimate first','Completar estimado primero')} disabled={busy||!readiness.ready} onPress={()=>sharePdf('estimate')}/>
    <Action title={tr("Track proposal","Dar seguimiento")} secondary onPress={()=>setStage(4)}/>
    {shareDone&&<View style={styles.lineCard}>
     <Text style={styles.h2}>{tr("PDF ready","PDF preparado")}</Text>
     <Text style={styles.hint}>{tr("Your job is saved. Check the sharing app to confirm delivery.","Tu trabajo está guardado. Confirma el envío en la aplicación que elegiste.")}</Text>
     <Action title={tr("My Jobs","Mis trabajos")} onPress={goToMyJobs}/>
     <Action title={tr("New Job","Nuevo trabajo")} secondary onPress={startNewJob}/>
     <Action title={tr("Share PDF again","Compartir PDF de nuevo")} secondary onPress={()=>sharePdf('estimate')}/>
     <Action title={tr("Track this job","Dar seguimiento")} onPress={()=>setStage(4)}/>
    </View>}
    {!shareDone&&<View style={styles.row}>
     <View style={{flex:1}}><Action title={tr("Save job","Guardar trabajo")} secondary onPress={()=>saveCurrent(true)}/></View>
     <View style={{flex:1}}><Action title={tr("My Jobs","Mis trabajos")} secondary onPress={goToMyJobs}/></View>
    </View>}
    <Action title={tr("Back to prices","Volver a precios")} secondary onPress={()=>setStage(2)}/>
   </View>}
   {stage===4&&<View style={styles.card}>
    <Text style={styles.h2}>{tr("5 · Follow-up","5 · Seguimiento")}</Text>
    <Text style={styles.hint}>{tr("Track customer decisions and next steps.","Registra la decisión del cliente y los próximos pasos.")}</Text>
    <Text style={styles.total}>{project.customer||tr('Customer','Cliente')} · {money(total.total)}</Text>
    <Text style={styles.label}>{tr("Status","Estado")}</Text>
    <Text style={styles.notice}>{JOB_STATUSES[project.status||'draft'][businessProfile.language]}</Text>
    <View style={styles.statusGrid}>
     {(Object.keys(JOB_STATUSES) as JobStatus[]).map(status=><Pressable key={status} accessibilityRole="button" accessibilityState={{selected:(project.status||'draft')===status}} onPress={()=>setStatus(status)} style={[styles.statusChoice,(project.status||'draft')===status&&styles.selectedTrade]}>
      <Text style={[styles.tradeText,(project.status||'draft')===status&&{color:PALETTE.white}]}>{JOB_STATUSES[status][businessProfile.language]}</Text>
      
     </Pressable>)}
    </View>
    <Input label={tr("Follow-up date (YYYY-MM-DD)","Fecha de seguimiento (AAAA-MM-DD)")} value={project.followUpDate||''} onChangeText={x=>patch({followUpDate:x})} placeholder="2026-11-15"/>
    <Input label={tr("Private follow-up notes","Notas privadas de seguimiento")} multiline value={project.followUpNotes||''} onChangeText={x=>patch({followUpNotes:x})} placeholder={tr('Called client; waiting for approval...','Llamé al cliente; esperando aprobación...')}/>
    <Text style={styles.hint}>{tr("Notes stay private. Reminders are not automatic yet.","Las notas son privadas. Los recordatorios todavía no son automáticos.")}</Text>
    <Action title={tr("Save follow-up","Guardar seguimiento")} onPress={()=>saveCurrent(true)}/>
    <Action title={busy?tr('Creating PDF…','Creando PDF…'):tr('Share proposal PDF','Compartir propuesta PDF')} disabled={busy||!readiness.ready} onPress={()=>sharePdf('proposal')}/>
    {!readiness.ready&&<Text style={styles.notice}>{tr("Complete quantities and prices before sharing.","Completa cantidades y precios antes de compartir.")}</Text>}
    <View style={styles.row}>
     <View style={{flex:1}}><Action title={tr("My Jobs","Mis trabajos")} secondary onPress={goToMyJobs}/></View>
     <View style={{flex:1}}><Action title={tr("New Job","Nuevo trabajo")} secondary onPress={startNewJob}/></View>
    </View>
    <Action title={tr("Back to estimate","Volver al estimado")} secondary onPress={()=>setStage(3)}/>
   </View>}
   </>}
   <Text style={styles.footer}>{tr("Jobs are saved on this phone, not the cloud. Prices are editable estimates.","Los trabajos se guardan en este teléfono, no en la nube. Los precios son estimados editables.")}</Text>
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
