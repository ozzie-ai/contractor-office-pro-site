import React,{useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import type {Language} from './estimate';
import ContractorEstimateReview from './ContractorEstimateReview';
import {DEMO_UNIVERSAL_CASES} from './demoUniversalReview';

/**
 * Isolated UI preview; never initiates real AI or pricing requests.
 * The approval callback only records a local confirmation on this demo screen.
 */
export default function UniversalReviewDemoScreen({language,onClose}:{language:Language;onClose:()=>void}){
 const [caseId,setCaseId]=useState(DEMO_UNIVERSAL_CASES[0].id);
 const [confirmation,setConfirmation]=useState('');
 const sample=DEMO_UNIVERSAL_CASES.find(x=>x.id===caseId)||DEMO_UNIVERSAL_CASES[0];
 const es=language==='es';
 return <View style={styles.container}>
  <View style={styles.header}>
   <Text style={styles.heading}>{es?'DEMO · Estimados con IA':'DEMO · AI estimate review'}</Text>
   <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
    <Text style={styles.closeText}>{es?'Cerrar':'Close'}</Text>
   </Pressable>
  </View>
  <View style={styles.tabs}>{DEMO_UNIVERSAL_CASES.map(x=><Pressable accessibilityRole="button" accessibilityState={{selected:caseId===x.id}} key={x.id}
   style={[styles.tab,caseId===x.id&&styles.selected]} onPress={()=>{setCaseId(x.id);setConfirmation('');}}>
   <Text style={[styles.tabText,caseId===x.id&&styles.selectedText]}>{es?x.es:x.en}</Text>
  </Pressable>)}</View>
  {!!confirmation&&<Text style={styles.confirmation}>{confirmation}</Text>}
  <ContractorEstimateReview key={sample.id} language={language} interpretation={sample.interpretation} pricing={sample.pricing} overheadPct={10} profitPct={20}
   onApprove={()=>setConfirmation(es?'✓ Demo aprobado. No se envió ningún documento.':'✓ Demo approved. No customer document was sent.')}/>
 </View>;
}
const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:'#F3F6FC'},
 header:{backgroundColor:'#12244B',paddingHorizontal:16,paddingTop:52,paddingBottom:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 heading:{fontWeight:'900',fontSize:15,color:'#FFFFFF',flex:1},
 close:{backgroundColor:'#385A9B',paddingHorizontal:15,paddingVertical:10,borderRadius:11},
 closeText:{fontWeight:'800',color:'#FFFFFF'},
 tabs:{flexDirection:'row',flexWrap:'wrap',gap:6,padding:10,backgroundColor:'#F3F6FC'},
 tab:{paddingVertical:9,paddingHorizontal:10,borderRadius:11,backgroundColor:'#FFFFFF',borderColor:'#DCE4F1',borderWidth:1},
 selected:{backgroundColor:'#13256F',borderColor:'#13256F'},
 tabText:{fontWeight:'700',fontSize:11,color:'#12244B'},
 selectedText:{color:'#FFFFFF'},
 confirmation:{fontSize:12,color:'#0A737B',paddingHorizontal:16,paddingBottom:4,fontWeight:'800'}
});
