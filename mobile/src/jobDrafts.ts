import {File,Paths} from 'expo-file-system';
import type {Project} from './estimate';

export type SavedJob={id:string;updatedAt:string;project:Project;photos:string[];stage:0|1|2|3};
type JobStore={version:1;activeId:string|null;jobs:SavedJob[]};
const filename='contractor-office-pro-drafts-v1.json';
const file=()=>new File(Paths.document,filename);
const empty=():JobStore=>({version:1,activeId:null,jobs:[]});
export const newJobId=()=>String(Date.now())+'-'+Math.random().toString(36).slice(2,8);
export function readStore():JobStore{
 try{
  const f=file();
  if(!f.exists)return empty();
  const parsed:unknown=JSON.parse(f.textSync());
  if(!parsed||typeof parsed!=='object'||!Array.isArray((parsed as JobStore).jobs))return empty();
  const loaded=parsed as JobStore;
  return {version:1,activeId:typeof loaded.activeId==='string'?loaded.activeId:null,jobs:loaded.jobs.slice(0,30)};
 }catch(err){console.warn('Could not read saved jobs:',err);return empty();}
}
function writeStore(store:JobStore){
 const f=file();
 if(!f.exists)f.create({intermediates:true});
 f.writeSync(JSON.stringify(store));
}
export function saveJob(job:SavedJob){
 const store=readStore();
 const existing=store.jobs.filter(x=>x.id!==job.id);
 writeStore({version:1,activeId:job.id,jobs:[job,...existing].slice(0,30)});
}
export function findSavedJob(id:string):SavedJob|undefined{return readStore().jobs.find(x=>x.id===id);}
export function makeActive(id:string|null){
 const store=readStore();
 writeStore({...store,activeId:id});
}
export function deleteSavedJob(id:string){
 const store=readStore();
 writeStore({...store,jobs:store.jobs.filter(j=>j.id!==id),activeId:store.activeId===id?null:store.activeId});
}
export async function retainJobPhoto(uri:string){
 const original=new File(uri);
 const ext=/\.(png|jpe?g|heic|webp)(?:\?|$)/i.exec(uri)?.[1]?.toLowerCase()||'jpg';
 const target=new File(Paths.document,'cop-job-photo-'+newJobId()+'.'+ext);
 await original.copy(target);
 return target.uri;
}
export function hasJobContent(job:Project,photos:string[]){
 return Boolean(job.description.trim()||job.customer.trim()||job.contractor.trim()||job.city.trim()||job.lines.length||photos.length);
}
