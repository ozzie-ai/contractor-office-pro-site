import React,{useRef,useState} from 'react';
import {Text,View,Pressable,StyleSheet} from 'react-native';
import {ExpoSpeechRecognitionModule,useSpeechRecognitionEvent} from 'expo-speech-recognition';

type Props={description:string;onChange:(text:string)=>void};
const join=(a:string,b:string)=>[a.trim(),b.trim()].filter(Boolean).join('\n');
export default function NativeSpeech({description,onChange}:Props){
 const [locale,setLocale]=useState<'es-GT'|'en-US'>('es-GT');
 const [isListening,setIsListening]=useState(false);
 const [message,setMessage]=useState('Ready to dictate. No OpenAI API key required.');
 const base=useRef(description);
 const draft=useRef('');
 const accepting=useRef(false);
 const currentDescription=useRef(description);
 currentDescription.current=description;
 useSpeechRecognitionEvent('start',()=>setIsListening(true));
 useSpeechRecognitionEvent('result',event=>{
  if(!accepting.current)return;
  const transcript=event.results?.[0]?.transcript?.trim()||'';
  if(!transcript)return;
  draft.current=transcript;
  onChange(join(base.current,transcript));
  if(event.isFinal)setMessage('Transcript ready. Review or correct the text below.');
 });
 useSpeechRecognitionEvent('end',()=>{
  setIsListening(false);
  accepting.current=false;
  if(!draft.current)setMessage('Dictation ended. Tap the microphone to try again.');
 });
 useSpeechRecognitionEvent('error',event=>{
  accepting.current=false;setIsListening(false);
  setMessage('Speech recognition: '+(event.message||event.error)+'. Check microphone and speech permissions.');
 });
 const start=async()=>{
  try{
   if(!ExpoSpeechRecognitionModule.isRecognitionAvailable()){
    setMessage('Speech recognition is unavailable on this phone. Use keyboard dictation below.');
    return;
   }
   const permission=await ExpoSpeechRecognitionModule.requestPermissionsAsync();
   if(!permission.granted){setMessage('Allow Microphone and Speech Recognition in iPhone Settings.');return;}
   base.current=currentDescription.current;
   draft.current='';
   accepting.current=true;
   setMessage('Listening... Speak naturally, then tap Stop. You can dictate another section afterward.');
   ExpoSpeechRecognitionModule.start({
    lang:locale,interimResults:true,continuous:false,addsPunctuation:true,
    // Do not force local-only; the OS may use Apple/Google processing for this language.
    requiresOnDeviceRecognition:false
   });
  }catch(e){accepting.current=false;setIsListening(false);setMessage('Unable to start dictation: '+String(e));}
 };
 const stop=()=>{
  setMessage('Finishing transcription...');
  ExpoSpeechRecognitionModule.stop();
 };
 return <View style={styles.container}>
  <Text style={styles.title}>🎙 Dicta tu trabajo / Speak your job</Text>
  <Text style={styles.note}>Transcribe directly into the editable box below, without Derek’s AI service.</Text>
  <View style={styles.languages}>
   {(['es-GT','en-US'] as const).map(code=><Pressable key={code} disabled={isListening} onPress={()=>setLocale(code)} style={[styles.language,locale===code&&styles.selected]}><Text style={{color:locale===code?'#fff':'#194a49',fontWeight:'700'}}>{code==='es-GT'?'Español':'English'}</Text></Pressable>)}
  </View>
  <Pressable accessibilityRole="button" onPress={isListening?stop:start} style={styles.button}>
   <Text style={styles.buttonText}>{isListening?'■ Detener / Stop':'🎙 Dictar trabajo / Start dictation'}</Text>
  </Pressable>
  <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
  <Text style={styles.note}>Your transcript is editable. Device speech recognition may process audio through Apple or Google depending on settings and language.</Text>
 </View>;
}
const styles=StyleSheet.create({
 container:{backgroundColor:'#edf8f5',padding:14,borderColor:'#9ecdc1',borderWidth:1,borderRadius:12,marginVertical:10},
 title:{fontWeight:'800',fontSize:18,color:'#163942'},note:{fontSize:12,color:'#526e70',lineHeight:18,marginTop:7},
 languages:{flexDirection:'row',gap:8,marginTop:12},language:{flex:1,alignItems:'center',padding:10,borderRadius:9,backgroundColor:'#e2f0eb'},
 selected:{backgroundColor:'#116b60'},button:{backgroundColor:'#116b60',borderRadius:10,padding:15,alignItems:'center',marginTop:12},
 buttonText:{color:'#fff',fontWeight:'800',fontSize:16},message:{fontSize:13,color:'#235d5a',marginTop:10}
});
