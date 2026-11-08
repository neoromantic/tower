/* Drive an isolated installed ordinary Chrome; server: make web + port 8620. */
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const session='tower-three-proof-'+process.pid;
const results=[];
const browser=(...args)=>execFileSync('agent-browser',['--session',session,'--engine','chrome','--headed','false',...args],{encoding:'utf8',maxBuffer:2**20}).trim();
const evaluate=code=>JSON.parse(browser('eval',code));
const assert=(condition,label)=>{if(!condition)throw new Error(label);results.push(label);};
const world=()=>evaluate('JSON.parse(Module.ccall("ct_world_state","string",[],[]))');
const command=(action,floor,cell,endFloor=floor,endCell=cell)=>evaluate(`Module.ccall('ct_world_command','number',['string','number','number','number','number'],${JSON.stringify([action,floor,cell,endFloor,endCell])})`);
const ui=(action,value,text='')=>evaluate(`Module.ccall('ct_ui_action','number',['string','number','string'],${JSON.stringify([action,value,text])})`);
const tool=id=>evaluate(`Module.ccall('ct_tool',null,['number'],[${id}])`);
(async()=>{
  browser('open','http://localhost:8620/');
  for(let i=0;i<80;i++){if(evaluate('Boolean(Module.engineReady && !startBtn.disabled)'))break;await new Promise(r=>setTimeout(r,250));}
  evaluate('(()=>{document.getElementById("sandbox").checked=true;startBtn.click();return true})()');
  await new Promise(r=>setTimeout(r,500));
  assert(evaluate('JSON.parse(Module.ccall("ct_panel_state","string",[],[])).catalog.every(item=>item.enabled)'),'Sandbox starts with all 25 tools unlocked');
  ui('menu',500);
  tool(1);ui('lobby-height',2);
  const before=evaluate('Module.ccall("ct_ui_state","string",[],[])');
  command('preview',0,148,0,220);
  const preview=world().ghost;
  assert(preview.valid && preview.width>4 && preview.count>1 && preview.cost>0,'Full row preview reports geometry/count/cost');
  assert(before===evaluate('Module.ccall("ct_ui_state","string",[],[])'),'Preview leaves live HUD state unchanged');
  assert(command('drag',0,148,0,220)===1,'Previewed lobby row commits');
  tool(3);assert(command('drag',2,160,2,195)===1,'Office row builds on chosen upper lobby');
  const id=world().rooms.find(room=>room.type===3).id;
  tool(-2);command('inspect',2,160);
  assert(evaluate('JSON.parse(Module.ccall("ct_panel_state","string",[],[])).panels.some(p=>p.kind==="inspect")'),'Tenant inspection is structured DOM panel');
  assert(ui('rent',2)===1,'Real rent changes through C action');ui('close',0,'inspect');
  const state=world();
  for(let index=0;index<4;index++){
    await evaluate(`(async()=>{await ctView.style(${index});return true})()`);
    assert(world().rooms.length===state.rooms.length && world().rooms.find(room=>room.id===id).rent===2,`Style ${index} preserves rooms and rent`);
  }
  await evaluate('(async()=>{await ctView.style(2);return true})()');
  const anchor=evaluate('ctView.pick(640,350)');evaluate('ctView.zoom(2,640,350)');await new Promise(r=>setTimeout(r,120));
  const after=evaluate('ctView.pick(640,350)');assert(Math.hypot(anchor.x-after.x,anchor.y-after.y)<1,'Zoom preserves pointer anchor');
  assert(evaluate('(async()=>{const blob=await ctView.capture();return blob.size>10000})()'),'Three screenshot is a real nonempty PNG');
  ui('menu',800);assert(evaluate('JSON.parse(Module.ccall("ct_panel_state","string",[],[])).panels.some(p=>p.kind==="finance")'),'Finance statement reachable');ui('close',0,'finance');
  assert(evaluate('(async()=>{return await saveTower()})()'),'Save awaits successful IndexedDB persistence');
  browser('set','viewport','390','844','3');await new Promise(r=>setTimeout(r,150));
  assert(evaluate('canvas.width===canvas.clientWidth*3 && document.documentElement.scrollWidth===innerWidth'),'Mobile DPR 3 buffer with no horizontal overflow');
  browser('screenshot','/tmp/tower-three-proof-mobile.png');
  assert(browser('errors')==='','No browser errors');
  await evaluate('(async()=>{const registration=await navigator.serviceWorker.ready;return registration.active.state})()');
  browser('set','offline','on');browser('open','http://localhost:8620/');
  for(let i=0;i<80;i++){if(evaluate('Boolean(Module.engineReady && playing)'))break;await new Promise(r=>setTimeout(r,250));}
  assert(evaluate('JSON.parse(Module.ccall("ct_world_state","string",[],[])).rooms.some(room=>room.type===3 && room.rent===2)'),'Offline reload restores saved room and rent');
  assert(await evaluate('(async()=>{await ctView.style(3);return !navigator.onLine})()'),'Full-resolution style switches offline');
  browser('set','offline','off');
  fs.writeFileSync('/tmp/tower-three-proof.json',JSON.stringify({results,mobileScreenshot:'/tmp/tower-three-proof-mobile.png'},null,2));
  console.log(JSON.stringify({passed:results.length,results},null,2));
  browser('close');
})().catch(error=>{console.error(error);process.exitCode=1;});
