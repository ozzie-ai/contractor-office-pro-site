import {File,Paths} from 'expo-file-system';
import type {Language,Trade} from './estimate';
export type BusinessProfile={name:string;language:Language;enabledTrades:Trade[];overheadPct:number;profitPct:number;cleaningLaborCostPerHour:number};
export const defaultProfile:BusinessProfile={name:'',language:'en',enabledTrades:['electrical','plumbing','painting','concrete','handyman','remodel','cleaning'],overheadPct:10,profitPct:20,cleaningLaborCostPerHour:25};
const file=()=>new File(Paths.document,'contractor-office-profile-v1.json');
export function readProfile():BusinessProfile{
 try{
  const f=file();if(!f.exists)return {...defaultProfile};
  const raw=JSON.parse(f.textSync()) as Partial<BusinessProfile>;
  return {...defaultProfile,...raw,enabledTrades:Array.isArray(raw.enabledTrades)&&raw.enabledTrades.length?raw.enabledTrades:defaultProfile.enabledTrades};
 }catch{return {...defaultProfile};}
}
export function saveProfile(profile:BusinessProfile){
 const f=file();if(!f.exists)f.create({intermediates:true});f.writeSync(JSON.stringify(profile));
}
