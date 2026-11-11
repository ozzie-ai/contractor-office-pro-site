// Headless browser regression with local-only test data, no cloud service.
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,extname} from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const root=resolve(new URL('../',import.meta.url).pathname);
const html=readFileSync(join(root,'workspace.html'),'utf8');
const testScript="<script>\nwindow.addEventListener('load',()=>{\n const $=id=>document.getElementById(id);\n const fire=(el,event='input')=>el.dispatchEvent(new Event(event,{bubbles:true}));\n const check=(condition,message)=>{if(!condition)throw new Error(message)};\n try{\n  check($('primaryTrade').options.length>=14,'Trade catalog did not load');\n  $('primaryTrade').value='cleaning';fire($('primaryTrade'),'change');\n  $('businessName').value='Smoke Test Cleaning Company';\n  $('saveProfile').click();\n  check(!$('workPanel').hidden,'Profile did not open workspace');\n  check($('jobTrade').options.length===1,'Unselected trades remain available');\n  check($('jobTrade').options[0].value==='cleaning','Wrong trade visible');\n  $('assembly').value='house_cleaning';\n  $('description').value='Clean 1200 square feet of interior space. TEST_PRIVATE_TRANSCRIPT_MARKER. No pet waste or patio cleaning.';\n  $('analyze').click();\n  check(!$('scopePanel').hidden,'Scope not displayed');\n  check($('measure_floorAreaSf').value==='1200','Area from transcript was not recognized');\n  $('expand').click();\n  check(!$('pricingPanel').hidden,'Task pricing did not open');\n  check($('taskTable').textContent.includes('Clean reachable interior surfaces'),'Cleaning tasks missing');\n  check(!$('taskTable').textContent.includes('Remove pet waste'),'Unrequested pet cleanup was added');\n  check($('showProposal').disabled,'Unpriced estimate was incorrectly shareable');\n  for(const inp of document.querySelectorAll('input.rate')){inp.value='10';fire(inp)}\n  $('overhead').value='10';fire($('overhead'));\n  $('profit').value='20';fire($('profit'));\n  $('approved').checked=true;fire($('approved'),'change');\n  check(!$('showProposal').disabled,'Verified estimate did not unlock proposal');\n  $('showProposal').click();\n  check(!$('proposalPanel').hidden,'Proposal was not produced');\n  check(!$('proposal').textContent.includes('TEST_PRIVATE_TRANSCRIPT_MARKER'),'Private transcript leaked to proposal');\n  check($('proposal').textContent.includes('Estimated total'),'Total missing from proposal');\n  $('editProfile').click();$('primaryTrade').value='plumbing';fire($('primaryTrade'),'change');\n  $('businessName').value='Smoke Test Plumbing';$('saveProfile').click();\n  check($('jobTrade').options.length===1&&$('jobTrade').value==='plumbing','Old cleaning trade remained visible');\n  $('assembly').value='faucet_replacement';\n  $('description').value='Replace 2 faucets and repair wall. Contractor does not offer wall repairs.';\n  $('analyze').click();$('expand').click();\n  check($('exclusions').textContent.includes('Patch disturbed wall area'),'Wall repair was not excluded');\n  check(!$('taskTable').textContent.includes('Patch disturbed wall area'),'Outside-trade repair entered priced tasks');\n  document.body.dataset.smoke='PASS';\n }catch(e){document.body.dataset.smoke='FAIL:'+e.message;console.error(e)}\n});\n</script>";
const binaries=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
const chrome=binaries.find(existsSync);
assert.ok(chrome,'Chrome/Chromium required for browser regressions.');
const dir=mkdtempSync(join(tmpdir(),'cop-headless-'));
const server=http.createServer((req,res)=>{
 try{
  const p=new URL(req.url,'http://localhost').pathname;
  const file=resolve(root,'.'+p);
  if(!file.startsWith(root)){res.writeHead(403);res.end();return}
  let body=readFileSync(file);
  if(p==='/workspace.html')body=Buffer.from(html.replace('</body>',testScript+'</body>'));
  res.writeHead(200,{'Content-Type':extname(file)==='.mjs'?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(body);
 }catch{res.writeHead(404);res.end()}
});
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port+'/workspace.html';
 const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking',
  '--user-data-dir='+dir,'--virtual-time-budget=10000','--dump-dom',url];
 const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
 let output='',errors='';
 child.stdout.on('data',d=>output+=d.toString());
 child.stderr.on('data',d=>errors+=d.toString());
 const killer=setTimeout(()=>child.kill('SIGKILL'),28000);
 const exit=await new Promise(resolve=>child.on('exit',resolve));clearTimeout(killer);
 const marker=output.match(/data-smoke="([^"]+)"/)?.[1];
 assert.equal(exit,0,'Chrome exited nonzero: '+errors.slice(-1500));
 assert.equal(marker,'PASS','Browser workflow failed: '+String(marker)+' '+errors.slice(-1200));
 console.log('PASS Chrome: cleaning, scope filtering, pricing, proposal privacy, cross-trade exclusions');
}finally{server.close();rmSync(dir,{recursive:true,force:true})}
