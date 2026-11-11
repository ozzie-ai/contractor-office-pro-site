import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import http from 'node:http';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
const root=resolve(new URL('../',import.meta.url).pathname);
const html=readFileSync(join(root,'index.html'),'utf8');
const injected="<script>\nwindow.addEventListener('load',()=>{\n const $=id=>document.getElementById(id), check=(c,msg)=>{if(!c)throw Error(msg)};\n try{\n  check($('mic') && $('es') && $('en'),'Original voice and bilingual controls missing');\n  check(window.COPCosting?.visitCost,'Costing module failed to load');\n  job='electrical';selected=new Set(['electrical']);\n  $('description').value='Okay necesito reemplazar cinco outlets viejitos o nuevos outlets con dos de ellos van a ser 10 si hay yo voy a poner los materiales';\n  suggestedItems();\n  check(!$('copCostPanel').hidden,'One-visit costing panel not shown');\n  $('es').click();\n  check(lang==='es'&&$('copCostPanel').querySelector('summary').textContent.includes('Verificar'),'Spanish pricing review did not translate');\n  $('en').click();\n  check(lang==='en','English language toggle stopped working');\n\n  check($('cop_gfci').value==='','Garbled GFCI incorrectly accepted as certain');\n  check($('cop_supplier').value==='contractor','Supplier should be contractor');\n  check(estimateItems.length===1&&Number(estimateItems[0].rate)===0,'Sample $1865 quote not removed');\n  $('copCostBody').querySelector('button.btn.wide').click();\n  check($('cop_status').textContent.includes('Confirm')||$('cop_status').textContent.includes('Check'),'Incomplete estimate not blocked');\n  $('cop_gfci').value='2';\n  $('cop_standard_cost').value='3.68';$('cop_standard_store').value='Home Depot';\n  $('cop_gfci_cost').value='18.98';$('cop_gfci_store').value=\"Lowe's\";\n  $('cop_hours').value='2.5';$('cop_hourRate').value='90';$('cop_trip').value='45';$('cop_misc').value='10';\n  $('cop_verified').checked=true;\n  $('overhead').value='10';$('profit').value='20';\n  $('copCostBody').querySelector('button.btn.wide').click();\n  check(!($('cop_status').textContent||'').includes('Check missing'),'Valid review rejected: '+$('cop_status').textContent);\n  check(estimateItems.length===5,'Wrong count of cost lines: '+estimateItems.length);\n  check(estimateItems[0].quantity===3 && estimateItems[1].quantity===2,'Replacement counts are double-billed');\n  const total=calculate().total;\n  check(Math.abs(total-434.28)<0.001,'Wrong estimate total '+total);\n  $('next4').onclick();\n  check(!($('step5').classList.contains('hidden')),'Original proposal stage blocked');\n  check(!($('proposalDocument').textContent.includes('10 si hay')),'Private transcript leaked to proposal');\n  check($('proposalDocument').textContent.includes('434'),'Correct amount absent');\n  // A second trade workflow must share labor time once when the contractor selects it.\n  job='electrical';selected=new Set(['electrical']);\n  $('description').value='Replace 2 damaged breakers';\n  prepareTradeRows();suggestedItems();\n  check(!$('copRetailPanel').hidden,'General retailer research unavailable');\n  check($('cop_job_hours') && $('cop_job_rate') && $('cop_job_trip'),'Shared labor options missing for ordinary jobs');\n  $('cop_job_hours').value='2';$('cop_job_rate').value='50';$('cop_job_trip').value='35';\n  $('copRetailPanel').open=true;const laborDetails=$('copRetailBody').querySelector('details');laborDetails.open=true;laborDetails.querySelector('button.btn').click();\n  check(estimateItems.filter(x=>x.copSharedLabor).length===2,'Per-visit labor and travel were not added once: '+JSON.stringify(estimateItems.map(x=>({description:x.description,rate:x.rate,shared:x.copSharedLabor})))+' status='+$('copRetailBody').textContent.slice(-250));\n  check(estimateItems.filter(x=>/labor|mano de obra/i.test(x.description)).length===1,'Duplicate labor charges remained');\n  check(estimateItems.some(x=>Number(x.rate)===35&&x.copSharedLabor),'Trip charged incorrectly');\n  document.body.dataset.costingTest='PASS';\n }catch(e){document.body.dataset.costingTest='FAIL:'+e.message;console.error(e)}\n});\n</script>";
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
assert.ok(chrome,'Chrome/Chromium is required for the browser test');
const dir=mkdtempSync(join(tmpdir(),'cop-costing-'));
const server=http.createServer((req,res)=>{
 try{
  const p=new URL(req.url,'http://localhost').pathname;
  const file=resolve(root,'.'+p);
  if(!file.startsWith(root)){res.writeHead(403);res.end();return}
  let bytes=readFileSync(file);
  if(p==='/index.html')bytes=Buffer.from(html.replace(/<\/body>\s*<\/html>\s*$/,injected+'</body></html>'));
  res.writeHead(200,{'Content-Type':extname(file)==='.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8'});
  res.end(bytes);
 }catch{res.writeHead(404);res.end()}
});
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port+'/index.html';
 const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking',
   '--user-data-dir='+dir,'--virtual-time-budget=20000','--dump-dom',url];
 const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';
 child.stdout.on('data',d=>stdout+=d.toString());
 child.stderr.on('data',d=>stderr+=d.toString());
 const timer=setTimeout(()=>child.kill('SIGKILL'),50000);
 const code=await new Promise(resolve=>child.on('exit',resolve));clearTimeout(timer);
 const marker=stdout.match(/data-costing-test="([^"]+)"/)?.[1];
 assert.equal(marker,'PASS','Original app integration failed: '+marker+' exit='+code+' output='+stdout.slice(-700)+' stderr='+stderr.slice(-1300));
 console.log('PASS Chrome: original bilingual/voice UI, outlet scope, verified prices, one-visit labor, correct total, private customer proposal');
}finally{server.close();rmSync(dir,{recursive:true,force:true})}
