import React,{useState} from 'react';
import {ActivityIndicator,Alert,Image,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {Language,Project,Trade,TRADES,EstimateLine,Interpretation,mapInterpretation,totals,money,proposalHtml} from './src/estimate';

const PALETTE={ink:'#163942',accent:'#116b60',background:'#f3f7f5',line:'#cedfda',muted:'#526e70',white:'#fff'};
const SAMPLE='Vamos a reemplazar un panel de 100 amperios por uno de 200. Transferir 20 circuitos existentes. Agregar un circuito de 40 amperios con breaker bipolar para un cargador de carro eléctrico a 100 pies. Instalar otro breaker bipolar de 100 amperios reservado para un futuro subpanel; no correr cable ni instalar subpanel en este proyecto.';
const initial:Project={trade:'electrical',contractor:'',customer:'',city:'',description:'',lines:[],exclusions:[],futureWork:[],unknowns:[],customerNotes:'',language:'en',overheadPct:10,profitPct:20};
type Stage=0|1|2|3;

function Action({title,onPress,secondary=false,disabled=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
 return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,secondary&&styles.buttonSecondary,disabled&&{opacity:.5}]}><Text style={[styles.buttonText,secondary&&{color:PALETTE.ink}]}>{title}</Text></Pressable>;
}
function Input({label,value,onChangeText,placeholder,multiline=false,number=false}:{label:string;value:string;onChangeText:(x:string)=>void;placeholder?:string;multiline?:boolean;number?:boolean}){
 return <View style={{marginTop:12}}><Text style={styles.label}>{label}</Text><TextInput autoCapitalize="sentences" value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#84969a" keyboardType={number?'decimal-pad':'default'} multiline={multiline} style={[styles.input,multiline&&{minHeight:100,textAlignVertical:'top'}]}/></View>;
}
export default function App(){
 const [project,setProject]=useState<Project>(initial);
 const [stage,setStage]=useState<Stage>(0);
 const [photos,setPhotos]=useState<string[]>([]);
 const [apiUrl,setApiUrl]=useState('');
 const [betaToken,setBetaToken]=useState('');
 const [busy,setBusy]=useState(false);
 const [info,setInfo]=useState('');
 const [aiConnected,setAiConnected]=useState(false);
 const [editItems,setEditItems]=useState(true);
 const patch=(updates:Partial<Project>)=>setProject(prev=>({...prev,...updates}));
 const setLine=(index:number,part:Partial<EstimateLine>)=>setProject(prev=>({...prev,lines:prev.lines.map((x,i)=>i===index?{...x,...part}:x)}));
 const addLine=()=>patch({lines:[...project.lines,{id:'manual-'+Date.now(),description_en:'',description_es:'',quantity:1,unit:'job',rate:0,status:'included_now'}]});
 const addPhoto=async(camera=false)=>{
  try{
   const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:.7}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:.7,allowsMultipleSelection:true});
   if(!result.canceled) setPhotos(current=>[...current,...result.assets.map(asset=>asset.uri)].slice(0,20));
  }catch(e){Alert.alert('Photos','Unable to access camera or photos. Please check device permissions.')}
 };
 const interpret=async()=>{
  if(project.description.trim().length<10){Alert.alert('Describe the job','Add a short description before using the AI interpreter.');return;}
  if(!apiUrl.trim()||!betaToken.trim()){setInfo('AI is not connected yet. You can still enter and price work items manually. Derek can configure the secure endpoint.');return;}
  if(!/^https:\/\//i.test(apiUrl)||!apiUrl.endsWith('/api/interpret')){setInfo('Enter an HTTPS endpoint ending in /api/interpret.');return;}
  setBusy(true);setInfo('');
  try{
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
   let response:Response;
   try{response=await fetch(apiUrl,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','X-Beta-Access':betaToken},body:JSON.stringify({description:project.description})});}
   finally{clearTimeout(timer)}
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||'AI service error');
   const parsed:Interpretation=body.interpretation;
   if(!parsed||!Array.isArray(parsed.tasks))throw new Error('Invalid AI interpretation');
   const mapped=mapInterpretation(parsed);
   patch({...mapped});
   setAiConnected(true);setStage(2);setInfo('AI organized the scope. Review every quantity, enter your prices, and confirm exclusions.');
  }catch(e){setInfo('AI connection failed: '+(e instanceof Error?e.message:'Unknown error')+'. Your job notes are still on this phone.');}
  finally{setBusy(false)}
 };
 const sharePdf=async()=>{
  const t=totals(project);
  if(!project.lines.length){Alert.alert('No work items','Add work items before exporting.');return}
  if(project.lines.some(x=>x.quantity<=0||x.rate<=0)){Alert.alert('Review prices','At least one quantity or rate needs review. The exported PDF will be marked as a draft.');}
  setBusy(true);
  try{
   const pdf=await Print.printToFileAsync({html:proposalHtml(project)});
   if(await Sharing.isAvailableAsync())await Sharing.shareAsync(pdf.uri,{mimeType:'application/pdf',UTI:'com.adobe.pdf',dialogTitle:'Share Contractor Office Pro Estimate'});
   else Alert.alert('Sharing unavailable','PDF was generated but sharing is not available on this device.');
  }catch(e){Alert.alert('PDF export','Could not create or share the estimate.')}
  finally{setBusy(false)}
 };
 const total=totals(project);
 return <KeyboardAvoidingView style={{flex:1,backgroundColor:PALETTE.background}} behavior={Platform.OS==='ios'?'padding':undefined}>
  <StatusBar style="dark"/>
  <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
   <Text style={styles.eyebrow}>CONTRACTOR OFFICE PRO · MOBILE PILOT</Text>
   <Text style={styles.title}>You Build.{'\n'}We Handle the Office.</Text>
   <View style={styles.steps}>{['Job','AI','Price','Send'].map((name,i)=><Pressable key={name} onPress={()=>setStage(i as Stage)} style={[styles.step,stage===i&&styles.stepActive]}><Text style={[styles.stepText,stage===i&&{color:PALETTE.white}]}>{i+1}. {name}</Text></Pressable>)}</View>
   {stage===0&&<View style={styles.card}>
    <Text style={styles.h2}>1 · Start a job</Text>
    <Text style={styles.hint}>Choose the trade, describe the work in Spanish or English, and add site photos.</Text>
    <View style={styles.tradeGrid}>{(Object.keys(TRADES) as Trade[]).map(t=><Pressable key={t} onPress={()=>patch({trade:t})} style={[styles.trade,project.trade===t&&styles.selectedTrade]}><Text style={[styles.tradeText,project.trade===t&&{color:PALETTE.white}]}>{TRADES[t].en}</Text><Text style={[styles.tradeSub,project.trade===t&&{color:'#e2fbf3'}]}>{TRADES[t].es}</Text></Pressable>)}</View>
    <Input label="Contractor / Contratista" value={project.contractor} onChangeText={x=>patch({contractor:x})} placeholder="Business name"/>
    <Input label="Customer / Cliente" value={project.customer} onChangeText={x=>patch({customer:x})} placeholder="Customer name"/>
    <Input label="City / Ciudad" value={project.city} onChangeText={x=>patch({city:x})} placeholder="City only"/>
    <Input label="Job notes / Descripción del trabajo" value={project.description} multiline onChangeText={x=>patch({description:x})} placeholder="Tell us everything to install, replace or exclude..."/>
    <Action title="Load our mixed electrical test" secondary onPress={()=>patch({description:SAMPLE,trade:'electrical'})}/>
    <View style={styles.row}><View style={{flex:1}}><Action title="Take photo" secondary onPress={()=>addPhoto(true)}/></View><View style={{flex:1}}><Action title="Choose photos" secondary onPress={()=>addPhoto()}/></View></View>
    <View style={styles.photoRow}>{photos.map((uri,i)=><Pressable key={uri+i} onPress={()=>setPhotos(prev=>prev.filter((_,j)=>j!==i))}><Image source={{uri}} style={styles.photo}/><Text style={styles.remove}>Remove</Text></Pressable>)}</View>
    <Text style={styles.hint}>{photos.length} local photos selected. Photos stay on your device and are not uploaded in this pilot.</Text>
    <Action title="Next · Understand the job" onPress={()=>setStage(1)}/>
   </View>}
   {stage===1&&<View style={styles.card}>
    <Text style={styles.h2}>2 · AI interprets the job</Text>
    <Text style={styles.hint}>The AI separates each task, included work, exclusions and future work. No AI key is stored in the app.</Text>
    <Input label="Backend URL (configured by Derek)" value={apiUrl} onChangeText={setApiUrl} placeholder="https://your-service.vercel.app/api/interpret"/>
    <Input label="Private beta access code (not OpenAI key)" value={betaToken} onChangeText={setBetaToken} placeholder="Code provided by the project developer"/>
    <Text style={styles.hint}>This pilot uses a temporary tester code. A public paid version will require real user accounts and usage limits.</Text>
    <Action title={busy?'Analyzing...':'Interpret with AI'} onPress={interpret} disabled={busy}/>
    <Action title="Skip AI · Add work items manually" secondary onPress={()=>setStage(2)}/>
    {!!info&&<Text style={styles.notice}>{info}</Text>}
   </View>}
   {stage===2&&<View style={styles.card}>
    <Text style={styles.h2}>3 · Review quantities and prices</Text>
    <Text style={styles.hint}>{aiConnected?'AI interpretation received. ':'Manual estimate. '}Rates start at $0 until verified. The contractor approves every line.</Text>
    {project.lines.map((line,i)=><View key={line.id} style={styles.lineCard}>
     <Text style={styles.lineNumber}>WORK ITEM {i+1}</Text>
     <Input label="English customer description" value={line.description_en} onChangeText={x=>setLine(i,{description_en:x})}/>
     <Input label="Descripción profesional en español" value={line.description_es} onChangeText={x=>setLine(i,{description_es:x})}/>
     <View style={styles.row}><View style={{flex:1}}><Input label="Quantity" value={String(line.quantity||'')} number onChangeText={x=>setLine(i,{quantity:Number(x)||0})}/></View><View style={{flex:1}}><Input label="Unit" value={line.unit} onChangeText={x=>setLine(i,{unit:x})}/></View><View style={{flex:1}}><Input label="Rate ($)" value={String(line.rate||'')} number onChangeText={x=>setLine(i,{rate:Number(x)||0})}/></View></View>
     <Text style={styles.rate}>Line amount: {money(line.quantity*line.rate)}</Text>
     <Action title="Remove item" secondary onPress={()=>patch({lines:project.lines.filter((_,j)=>j!==i)})}/>
    </View>)}
    <Action title="+ Add work item" secondary onPress={addLine}/>
    <Input label="Not included (one per line)" multiline value={project.exclusions.join('\n')} onChangeText={x=>patch({exclusions:x.split('\n').map(x=>x.trim()).filter(Boolean)})}/>
    <Input label="Future work (not part of this estimate)" multiline value={project.futureWork.join('\n')} onChangeText={x=>patch({futureWork:x.split('\n').map(x=>x.trim()).filter(Boolean)})}/>
    {project.unknowns.length>0&&<Text style={styles.notice}>Confirm before pricing: {project.unknowns.join('; ')}</Text>}
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
    <Action title={busy?'Creating PDF...':'Create & share customer PDF'} disabled={busy} onPress={sharePdf}/>
    <Action title="Back to prices" secondary onPress={()=>setStage(2)}/>
   </View>}
   <Text style={styles.footer}>Pilot · No automatic cloud save, live supplier prices, or voice transcription yet. These are next development steps. Keep private API keys off the mobile app.</Text>
  </ScrollView>
 </KeyboardAvoidingView>;
}
const styles=StyleSheet.create({
 container:{paddingTop:55,paddingHorizontal:16,paddingBottom:70,maxWidth:750,width:'100%',alignSelf:'center'},
 eyebrow:{fontSize:11,letterSpacing:1.5,color:PALETTE.accent,fontWeight:'800'},title:{fontWeight:'900',fontSize:29,lineHeight:35,color:PALETTE.ink,marginTop:8,marginBottom:16},
 steps:{flexDirection:'row',gap:4,marginBottom:12},step:{flex:1,backgroundColor:'#e0ebe7',paddingVertical:11,borderRadius:9,alignItems:'center'},stepActive:{backgroundColor:PALETTE.accent},stepText:{fontSize:11,color:PALETTE.ink,fontWeight:'700'},
 card:{borderRadius:16,backgroundColor:PALETTE.white,padding:16,borderWidth:1,borderColor:PALETTE.line,marginBottom:14},
 h2:{fontSize:20,fontWeight:'800',color:PALETTE.ink,marginBottom:4},hint:{fontSize:13,lineHeight:19,color:PALETTE.muted,marginVertical:8},label:{fontSize:13,fontWeight:'750',color:PALETTE.ink,marginBottom:6},
 input:{borderWidth:1,borderColor:'#b8c9c6',borderRadius:9,minHeight:44,padding:10,color:PALETTE.ink,fontSize:15,backgroundColor:'#fff'},
 tradeGrid:{flexDirection:'row',flexWrap:'wrap',gap:7,marginVertical:9},trade:{width:'48%',borderWidth:1,borderColor:PALETTE.line,borderRadius:10,padding:11,backgroundColor:'#f8fbfa'},selectedTrade:{backgroundColor:PALETTE.accent},tradeText:{fontWeight:'800',color:PALETTE.ink},tradeSub:{fontSize:12,color:PALETTE.muted,marginTop:2},
 button:{backgroundColor:PALETTE.accent,minHeight:45,borderRadius:10,alignItems:'center',justifyContent:'center',paddingHorizontal:12,marginTop:12},buttonSecondary:{backgroundColor:'#e3f0ed',borderWidth:1,borderColor:'#c5ded6'},buttonText:{fontSize:14,fontWeight:'800',color:PALETTE.white,textAlign:'center'},
 row:{flexDirection:'row',gap:9},photoRow:{flexDirection:'row',flexWrap:'wrap',gap:9,marginTop:12},photo:{width:82,height:82,borderRadius:8},remove:{fontSize:10,color:'#9a4545',textAlign:'center'},
 notice:{fontSize:13,color:'#775d21',backgroundColor:'#fdf6e1',padding:12,borderRadius:9,marginTop:12},
 lineCard:{borderWidth:1,borderColor:PALETTE.line,borderRadius:10,padding:12,marginTop:12},lineNumber:{color:PALETTE.accent,fontWeight:'800',fontSize:11},rate:{fontSize:14,fontWeight:'700',color:PALETTE.ink,marginTop:10},total:{fontWeight:'900',fontSize:22,color:PALETTE.accent,marginVertical:17},footer:{fontSize:12,lineHeight:18,color:PALETTE.muted,margin:8}
});
