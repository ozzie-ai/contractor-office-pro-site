import React from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';

type Props={
  description:string;
  onChange:(text:string)=>void;
  onDictate:()=>void;
};

/**
 * Reliable iOS speech-input fallback.
 * Focuses the editable transcript so the user can use the iPhone keyboard microphone.
 * Intentionally does not import expo-speech-recognition: native start() has crashed
 * on the physical test device. Restore direct native recognition only after a
 * diagnosed and tested fix.
 */
export default function SpeechInput({onDictate}:Props){
  return <View style={styles.container}>
    <Text style={styles.title}>🎙 Dictado / Speech-to-text</Text>
    <Text style={styles.note}>Para dictar: toca el botón, luego toca el micrófono del teclado del iPhone. Tus palabras aparecerán en la descripción editable.</Text>
    <Text style={styles.note}>To dictate: tap the button, then the microphone on your iPhone keyboard. You can review and correct every word.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Open job description for keyboard dictation" onPress={onDictate} style={styles.button}>
      <Text style={styles.buttonText}>🎙 Dictar con teclado / Use iPhone mic</Text>
    </Pressable>
    <Text style={styles.small}>El dictado directo está temporalmente desactivado mientras solucionamos el cierre inesperado de la app.</Text>
  </View>;
}
const styles=StyleSheet.create({
  container:{borderWidth:1,borderColor:'#9ecdc1',backgroundColor:'#edf8f5',borderRadius:12,padding:14,marginVertical:10},
  title:{fontWeight:'800',fontSize:18,color:'#163942'},
  note:{fontSize:13,lineHeight:20,marginTop:8,color:'#526e70'},
  button:{backgroundColor:'#116b60',padding:14,borderRadius:10,marginTop:12,alignItems:'center'},
  buttonText:{color:'#fff',fontSize:15,fontWeight:'800',textAlign:'center'},
  small:{fontSize:12,color:'#526e70',lineHeight:18,marginTop:10}
});
