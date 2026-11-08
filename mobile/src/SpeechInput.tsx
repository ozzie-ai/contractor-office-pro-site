import React,{useRef,useState} from 'react';
import {Keyboard,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';

type Props={description:string;onChange:(text:string)=>void;language?:'en'|'es'};

/**
 * Stable keyboard dictation UI while investigating the iOS native speech crash.
 * Both the button and the editable field are inside this component, so focus
 * does not depend on a cross-component ref.
 */
export default function SpeechInput({description,onChange,language='en'}:Props){
  const tr=(en:string,es:string)=>language==='es'?es:en;
  const field=useRef<React.ElementRef<typeof TextInput>>(null);
  const [focused,setFocused]=useState(false);
  const activate=()=>{
    field.current?.focus();
  };
  return <View style={styles.container}>
    <Text style={styles.title}>{tr('🎙 Describe the job','🎙 Describe el trabajo')}</Text>
    <Text style={styles.note}>{tr('Tap the button, then use your keyboard microphone to dictate.','Toca el botón y luego el micrófono del teclado para dictar.')}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={tr("Open keyboard","Abrir teclado")} onPress={activate} style={styles.button}>
      <Text style={styles.buttonText}>{tr('🎙 Open keyboard','🎙 Abrir teclado')}</Text>
    </Pressable>
    <Text style={styles.label}>{tr('Job description','Descripción del trabajo')}</Text>
    <TextInput
      ref={field}
      style={styles.input}
      multiline
      autoCapitalize="sentences"
      scrollEnabled
      value={description}
      onChangeText={onChange}
      onFocus={()=>setFocused(true)}
      onBlur={()=>setFocused(false)}
      placeholder={tr("Describe the work, or use keyboard dictation.","Describe el trabajo o usa el micrófono del teclado.")}
      placeholderTextColor="#84969a"
      accessibilityLabel={tr("Editable job description","Descripción de trabajo editable")}
      returnKeyType="default"
    />
    <Text style={styles.help}>{focused?tr('Tap the iPhone microphone to speak.','Toca el micrófono del iPhone para hablar.'):tr('You can type or dictate your description.','Puedes escribir o dictar la descripción.')}</Text>
    <Text style={styles.small}>{tr('Keyboard dictation is available.','Puedes usar el dictado del teclado.')}</Text>
  </View>;
}
const styles=StyleSheet.create({
  container:{borderWidth:1,borderColor:'#9ecdc1',backgroundColor:'#edf8f5',borderRadius:12,padding:14,marginVertical:10},
  title:{fontWeight:'800',fontSize:18,color:'#163942'},
  note:{fontSize:13,lineHeight:20,marginTop:8,color:'#526e70'},
  button:{backgroundColor:'#116b60',padding:14,borderRadius:10,marginTop:12,alignItems:'center'},
  buttonText:{color:'#fff',fontSize:15,fontWeight:'800',textAlign:'center'},
  label:{fontWeight:'700',fontSize:13,color:'#163942',marginTop:14,marginBottom:8},
  input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#b8c9c6',borderRadius:9,minHeight:140,padding:12,color:'#163942',fontSize:16,textAlignVertical:'top'},
  help:{fontSize:13,color:'#235d5a',marginTop:8},
  small:{fontSize:12,color:'#526e70',lineHeight:18,marginTop:10}
});
