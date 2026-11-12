import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,extname} from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const root=resolve(new URL('../',import.meta.url).pathname),html=readFileSync(join(root,'index.html'),'utf8');
const script="<script>\nwindow.addEventListener('load',()=>{\n const $=id=>document.getElementById(id),check=(ok,msg)=>{if(!ok)throw Error(msg)};\n try{\n  check($('mic')&&$('es')&&$('en'),'Original voice/language controls unavailable');\n  check(window.COPReferencePrices?.catalog?.length>=5,'Offline material database did not load');\n  job='electrical';selected=new Set(['electrical']);$('description').value='Reemplazar cinco outlets viejitos por nuevos, dos de ellos son GFCI. Yo pongo los materiales.';\n  prepareTradeRows();suggestedItems();\n  check(!$('copCostPanel').hidden,'Original outlet review is unavailable');\n  check($('cop_standard_cost').value==='3.68','Standard outlet cached material price not filled');\n  check($('cop_gfci_cost').value==='23.98','GFCI cached material price not filled');\n  check($('cop_standard_store').value==='Home Depot','Cached source absent');\n  check($('cop_gfci').value==='2','GFCI quantity not understood');\n  $('cop_hours').value='2.5';$('cop_hourRate').value='90';$('cop_trip').value='45';$('cop_misc').value='10';\n  $('overhead').value='10';$('profit').value='20';$('cop_verified').checked=true;\n  $('copCostBody').querySelector('button.btn.wide').click();\n  check(estimateItems.length===5,'Incorrect number of material/labor/trip lines');\n  check(estimateItems[0].quantity===3&&estimateItems[1].quantity===2,'Outlet quantity double-charged');\n  check(Math.abs(calculate().total-447.48)<0.01,'Unexpected verified-reference example total: '+calculate().total);\n  const savedPolicy=JSON.parse(localStorage.getItem('cop-labor-cost-policy-v1')||'null');\n  check(savedPolicy?.hourlyCost===90&&savedPolicy?.tripCost===45,'Contractor labor and trip defaults were not saved');\n\n  check(!$('estimateProjectNotes').textContent.includes('GFCI test marker'),'No transcript should appear unexpectedly');\n  $('es').click();check(lang==='es','Original Spanish mode broken');\n  $('en').click();check(lang==='en','Original English mode broken');\n\n  job='electrical';selected=new Set(['electrical']);\n  $('description').value='Install 100 ft of 14/2 Romex NM-B cable';\n  prepareTradeRows();suggestedItems();\n  const cable=estimateItems.find(x=>x.copPricebookId==='romex-14-2-100ft');\n  check(cable&&cable.quantity===1&&cable.rate===88&&cable.unit==='roll','Cable reference not automatically added');\n  check(estimateItems.filter(x=>x.copPricebookId==='romex-14-2-100ft').length===1,'Duplicate wire material');\n  check(estimateItems.some(x=>x.copMissingLabor),'Missing labor cost silently assumed');\n  \n  job='drywall';selected=new Set(['drywall']);\n  $('description').value='Install 10 sheets of 1/2 4x8 drywall and two bags of 20 minute joint compound';\n  prepareTradeRows();suggestedItems();\n  const sheets=estimateItems.find(x=>x.copPricebookId==='drywall-half-4x8');\n  const mud=estimateItems.find(x=>x.copPricebookId==='joint-20min-18lb');\n  check(sheets&&sheets.quantity===10&&sheets.rate===16.68,'Drywall materials reference missing');\n  check(mud&&mud.quantity===2&&mud.rate===13.62,'20-minute compound reference missing');\n  check(estimateItems.filter(x=>x.copPricebookId).length===2,'Double-counting material references');\n  check(estimateItems.some(x=>x.copMissingLabor),'Drywall labor needs review');\n\n  job='plumbing';selected=new Set(['plumbing']);paintingActive=false;\n  $('description').value='Replace two bathroom faucets 4 inch centerset chrome';\n  prepareTradeRows();suggestedItems();\n  const faucets=estimateItems.find(x=>x.copPricebookId==='bathroom-faucet-4in');\n  check(faucets&&faucets.quantity===2&&faucets.rate===39.98,'Plumbing material price reference not recognized');\n\n  job='painting';selected=new Set(['paint']);paintingActive=true;\n  $('pPaintRate').value='45';\n  $('description').value='Pintar paredes interiores con dos galones de pintura eggshell';\n  suggestedItems();\n  check($('pPaintRate').value==='37.98','Interior paint reference was not applied to original painter controls');\n  document.body.dataset.pricebookTest='PASS';\n }catch(e){document.body.dataset.pricebookTest='FAIL:'+e.message;console.error(e)}\n});\n</script>";
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
assert.ok(chrome,'Chrome/Chromium required');
const temp=mkdtempSync(join(tmpdir(),'cop-pricebook-'));
const server=http.createServer((req,res)=>{
 try{
  const requestPath=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+requestPath);
  if(!file.startsWith(root)){res.writeHead(403);res.end();return}
  let contents=readFileSync(file);
  if(requestPath==='/index.html')contents=Buffer.from(html.replace(/<\/body>\s*<\/html>\s*$/,script+'</body></html>'));
  res.writeHead(200,{'Content-Type':extname(file)==='.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8'});
  res.end(contents);
 }catch{res.writeHead(404);res.end()}
});
try{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--disable-background-networking','--user-data-dir='+temp,'--virtual-time-budget=20000',
   '--dump-dom','http://127.0.0.1:'+server.address().port+'/index.html'];
 const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
 let out='',err='';child.stdout.on('data',b=>out+=b.toString());child.stderr.on('data',b=>err+=b.toString());
 const timeout=setTimeout(()=>child.kill('SIGKILL'),45000);
 const code=await new Promise(ok=>child.on('exit',ok));clearTimeout(timeout);
 const mark=out.match(/data-pricebook-test="([^"]+)"/)?.[1];
 assert.equal(mark,'PASS','Original app pricebook test failed: '+mark+'; exit '+code+' stderr '+err.slice(-900));
 console.log('PASS original bilingual voice-first app: offline outlet, 14/2 Romex, drywall and compound reference pricing');
}finally{server.close();rmSync(temp,{recursive:true,force:true})}
