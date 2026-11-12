import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import http from 'node:http';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
const root=resolve(new URL('../',import.meta.url).pathname);
const html=readFileSync(join(root,'index.html'),'utf8');
const injected="<script>\nwindow.addEventListener('load',()=>{\n const $=id=>document.getElementById(id),check=(ok,message)=>{if(!ok)throw Error(message)};\n try{\n  const dialogs=[];window.alert=msg=>dialogs.push('alert: '+msg);window.confirm=msg=>{dialogs.push('confirm: '+msg);return false};\n  check($('mic')&&$('es')&&$('en'),'Original bilingual microphone UI not loaded');\n  check(window.COPQuickPaint,'Backend quick paint planner not loaded');\n  $('es').click();check(lang==='es','Spanish mode not selected');\n  job='painting';\n  $('description').value=\"vamos a pintar una casa donde tiene tres habitaciones primera habitación 15 por 15 segunda habitación 12 * 15 tercera habitación 22 * 12 primer baño 7 por 10 segundo baño 7 por 5 cocina 10 por 10 comedor y sala 15 por 20 3 closets y tres por siete\";\n  $('next1').click();\n  check(step===4,'Not directly at estimate after one continue; step '+step+' dialogs '+dialogs.join(';'));\n  check($('paintingPanel').classList.contains('hidden'),'Old painting questionnaire is still visible');\n  check(estimateItems.length===4,'Should display only 4 editable cost groups: '+estimateItems.length);\n  check(estimateItems[0].quantity===19,'Paint gallons wrong: '+estimateItems[0].quantity);\n  check(Number(estimateItems[0].rate)===37.98,'Reference paint cost wrong');\n  check(Number(estimateItems[2].quantity)===42.5,'Labor hours not auto-estimated');\n  check(Number(estimateItems[2].rate)===60,'Labor cost must be a visible starter assumption');\n  check(Number(estimateItems[3].rate)===75,'One mobilization cost required');\n  check(Number($('overhead').value)===10&&Number($('profit').value)===20,'Editable markup defaults missing');\n  check(Math.abs(calculate().total-4807.20)<.01,'Expected initial planning estimate $4,807.20; got '+calculate().total);\n  check(takeoffItems.some(x=>x.id==='interior-paint'&&x.qty===19),'Material takeoff missing');\n  check($('customerScope').value.includes('Habitación 2: 12 × 15'),'Different bedroom dimensions were lost');\n  check($('customerScope').value.includes('3 × Clóset'),'Three closets should be grouped');\n  check(!$('customerScope').value.includes('vamos a pintar una casa'),'Raw speech transcript leaked into customer scope');\n  check($('estimateHint').textContent.includes('BORRADOR AUTOMÁTICO'),'Draft assumptions not identified');\n  $('next4').click();\n  check(step===5,'Could not view reviewable customer proposal; dialogs '+dialogs.join(';'));\n  check(!$('proposalDocument').textContent.includes('vamos a pintar una casa'),'Private transcript leaked to customer proposal');\n  document.body.dataset.quickpaint='PASS';\n }catch(e){document.body.dataset.quickpaint='FAIL:'+e.message;console.error(e)}\n});\n</script>";
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
 const marker=stdout.match(/data-quickpaint="([^"]+)"/)?.[1];
 assert.equal(marker,'PASS','Quick paint original UI failed: '+marker+' exit='+code+' output='+stdout.slice(-700)+' stderr='+stderr.slice(-1300));
 console.log('PASS Chrome: one dictation -> estimate; varied rooms/closets; 19 gallons; labor hours; editable overhead, customer proposal privacy');
}finally{server.close();rmSync(dir,{recursive:true,force:true})}
