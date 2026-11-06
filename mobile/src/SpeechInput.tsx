import React from 'react';
import {Platform,Text,View,StyleSheet} from 'react-native';
import Constants,{ExecutionEnvironment} from 'expo-constants';

type Props={description:string;onChange:(text:string)=>void};
const isExpoGo=Constants.executionEnvironment===ExecutionEnvironment.StoreClient;
export default function SpeechInput(props:Props){
 if(!isExpoGo&&Platform.OS!=='web'){
  // Load the native library only when the native development build includes it.
  const NativeSpeech=require('./NativeSpeech').default as React.ComponentType<Props>;
  return <NativeSpeech {...props}/>;
 }
 return <View style={styles.container}>
  <Text style={styles.title}>🎙 Dictado / Speech-to-text</Text>
  <Text style={styles.note}>In Expo Go, tap the editable transcript box below, then use the microphone on your iPhone keyboard. Your words will appear immediately — no OpenAI key required.</Text>
  <Text style={styles.note}>To use the large built-in dictation button, install the Contractor Office Pro development build with native speech recognition.</Text>
 </View>;
}
const styles=StyleSheet.create({
 container:{borderWidth:1,borderColor:'#9ecdc1',backgroundColor:'#edf8f5',borderRadius:12,padding:14,marginVertical:10},
 title:{fontWeight:'800',fontSize:18,color:'#163942'},note:{fontSize:13,lineHeight:20,marginTop:8,color:'#526e70'}
});
