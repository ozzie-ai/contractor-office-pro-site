import React,{useRef,useState} from 'react';
import {Keyboard,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';

type Props={description:string;onChange:(text:string)=>void};

/**
 * Stable keyboard dictation UI while investigating the iOS native speech crash.
 * Both the button and the editable field are inside this component, so focus
 * does not depend on a cross-component ref.
 */
export default function SpeechInput({description,onChange}:Props){
  const field=useRef<React.ElementRef<typeof TextInput>>(null);
  const [focused,setFocused]=useState(false);
  const activate=()=>{
    field.current?.focus();
  };
  return <View style={styles.container}>
    <Text style={styles.title}>🎙 Dictado / Speech-to-text</Text>
    <Text style={styles.note}>Toca el botón verde. Cuando aparezca el teclado, toca su micrófono y describe tu trabajo en español o inglés.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Open transcript keyboard" onPress={activate} style={styles.button}>
      <Text style={styles.buttonText}>🎙 Abrir teclado / Open keyboard</Text>
    </Pressable>
    <Text style={styles.label}>Descripción del trabajo / Editable job transcript</Text>
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
      placeholder="Describe tu trabajo aquí. Usa el micrófono del teclado para dictar."
      placeholderTextColor="#84969a"
      accessibilityLabel="Editable job description"
      returnKeyType="default"
    />
    <Text style={styles.help}>{focused?'Teclado abierto: toca el micrófono del iPhone para hablar.':'También puedes tocar directamente la caja blanca y escribir o dictar.'}</Text>
    <Text style={styles.small}>El dictado nativo directo está desactivado temporalmente para evitar el cierre de la aplicación.</Text>
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
