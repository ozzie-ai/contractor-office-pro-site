import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const workspace=readFileSync(new URL('../workspace.html',import.meta.url),'utf8');
const old=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=workspace.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Workspace must load a module script');
assert.ok(script.includes("from './core/assemblies.mjs'"),'Assembly core must be imported');
assert.ok(script.includes("from './core/estimate-engine.mjs'"),'Existing price core must be reused');
assert.ok(script.includes("createProfile("),'Contractor profile required');
assert.ok(script.includes("availableAssemblies(profile)"),'Assembly menu must be restricted to the profile');
assert.ok(script.includes("expandAssembly("),'A job must expand into individual tasks');
assert.ok(script.includes("priceEstimate(toEstimatingJob(plan)"),'Price calculation must use the shared engine');
assert.ok(script.includes("profile?.primaryTrade"),'Ratebook must be associated with profile');
assert.ok(script.includes("cop-scope-profile-v1"),'Profile is saved locally');
assert.ok(script.includes("$('approved').checked"),'Contractor must approve before generating proposal');
assert.ok(script.includes("const validMarkup="),'Markup input must be validated');
assert.ok(script.includes("&&Number(overhead)<=100&&Number(profit)<=100"),'Rates must be bounded');
assert.ok(old.includes('href="./workspace.html"'),'Legacy app must link to scoped workspace');
assert.ok(old.includes('applyTradeProfileToMenu()'),'Legacy menu must respect scoped trade selection');
assert.ok(old.includes('.tile[hidden]{display:none!important}'),'Filtered tiles must actually be hidden');
const ids=new Set([...workspace.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
const refs=[...script.matchAll(/\$\('([^']+)'\)/g)].map(x=>x[1]);
for(const id of refs)assert.ok(ids.has(id),'Workspace references missing DOM ID '+id);
const proposal=script.slice(script.indexOf('function proposalDocument(){'),script.indexOf("$('showProposal').onclick"));
assert.ok(proposal.includes("const result=prices"),'Customer proposal reads reviewed task prices');
assert.ok(!proposal.includes("$('description')"),'Private transcript must not enter customer proposal');
const folder=mkdtempSync(join(tmpdir(),'cop-source-check-'));
try{
  for(const [name,js] of [['workspace.mjs',script],['legacy.js',old.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'']]){
    const filename=join(folder,name);writeFileSync(filename,js);
    const check=spawnSync(process.execPath,['--check',filename],{encoding:'utf8'});
    assert.equal(check.status,0,name+' has invalid JavaScript: '+check.stderr);
  }
}finally{rmSync(folder,{recursive:true,force:true})}
console.log('PASS workspace module syntax, profile gating, pricing, DOM refs and transcript separation');
