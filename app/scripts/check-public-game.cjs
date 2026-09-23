/**
 * Public release check. Requires Node 22+ and ws (already in app/node_modules).
 * GAME_ORIGIN=https://novaris-fleet-vanguard.novaris-fleet-vanguard.workers.dev
 * CLIENT_ORIGIN=https://phantomsolider.github.io
 * node app/scripts/check-public-game.cjs
 * No source imports, state injection, private tokens in output or admin endpoints.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
let WS;try{WS=require('ws');}catch{WS=createRequire(path.resolve(__dirname,'../package.json'))('ws');}
const raw=process.env.GAME_ORIGIN;if(!raw)throw new Error('Set GAME_ORIGIN to the deployed HTTPS game origin.');
const target=new URL(raw);assert(['https:','http:','wss:','ws:'].includes(target.protocol));target.protocol=target.protocol==='https:'||target.protocol==='wss:'?'wss:':'ws:';target.pathname='/';target.search='';target.hash='';
const origin=process.env.CLIENT_ORIGIN||'https://novaris-release-check.github.io';
const room='QA'+Date.now().toString(36).toUpperCase();
const connections=[];const bots=[];const tokens=new Set();const allStates=[];const failures=[];
let runAI=false;let previousCores=-1;let completed=false;const witnessedTelegraphs=new Set();let witnessedBossPhase=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const neutral={type:'input',mx:0,my:0,mz:0,yaw:0,pitch:0,fire:false,boost:false};
async function until(test,label,timeout=15000){const start=Date.now();while(!test()){assert(Date.now()-start<timeout,'Timed out: '+label);assert(!failures.length,failures.join('; '));await sleep(25);}return test();}
function send(c,msg){assert.equal(c.ws.readyState,WS.OPEN,'socket is open');c.ws.send(JSON.stringify(msg));}
function action(c,a){send(c,{type:'action',action:a});}
function open(name,identity){
  const c={name,ws:null,id:null,token:null,view:null,frames:[],lastTick:-1,lastAt:Date.now(),errors:[],observedZones:new Set(),stateCount:0,lastInteract:-99,expectedClose:false};connections.push(c);
  const ws=new WS(new URL('/ws/'+room,target),{headers:{Origin:origin},handshakeTimeout:15000});c.ws=ws;
  ws.on('open',()=>send(c,{type:'join',name,...identity}));
  ws.on('error',e=>failures.push(name+': '+e.message));
  ws.on('close',()=>{if(!c.expectedClose&&!completed)failures.push(name+': unexpected connection close');});
  ws.on('message',raw=>{
    try{
      const text=String(raw);if(text==='__pong')return;const m=JSON.parse(text);c.frames.push(m);if(c.frames.length>30)c.frames.shift();
      if(m.type==='welcome'){c.id=m.playerId;c.token=m.token;tokens.add(m.token);assert(typeof m.token==='string'&&m.token.length>=32);}
      if(m.type==='error'){c.errors.push(m.error);return;}
      if(m.type!=='state')return;
      for(const token of tokens)assert(!text.includes(token),'private token leaked in a state frame');assert(!Object.hasOwn(m,'tokens'));assert(!Object.hasOwn(m.view,'tokens'));
      c.view=m.view;for(const n of m.view.npcs){if(n.telegraph)witnessedTelegraphs.add(n.telegraph.kind);if(n.boss&&n.phase===2)witnessedBossPhase=true;}c.lastAt=Date.now();c.stateCount++;const me=m.view.players.find(p=>p.id===c.id);if(me)c.observedZones.add(me.zone);
      if(allStates.length<12)allStates.push({state:m,owner:c.name});
      if(runAI&&bots.includes(c)&&m.view.phase==='playing'&&m.view.tick!==c.lastTick){c.lastTick=m.view.tick;pilot(c);}
    }catch(error){failures.push(name+': '+error.message);}
  });
  return c;
}
function pilot(c){
  const v=c.view,p=v.players.find(x=>x.id===c.id);if(!p)return;
  if(!p.alive){if(p.respawn<=0)action(c,{type:'respawn'});return;}
  if(p.weapon!=='lance')action(c,{type:'equip',weapon:'lance'});
  const enemies=v.npcs.filter(n=>n.alive&&n.zone===p.zone).sort((a,b)=>distance(a,p)-distance(b,p));let enemy=enemies[0],point=null;
  const missing=['ember','veil','dreadnought'].filter(z=>!v.objective.cores.includes(z));
  if(p.zone==='space'){
    point=v.interactables.find(t=>t.id===(missing.length?(missing[0]==='dreadnought'?'board-dreadnought':'land-'+missing[0]):'extract'));
    if(enemy&&distance(enemy,p)>65)enemy=null;
  }else if(p.zone.startsWith('ship:'))point=v.interactables.find(t=>t.kind==='exit'&&t.zone===p.zone);
  else if(!enemies.length)point=v.interactables.find(t=>t.zone===p.zone&&t.id===(v.objective.cores.includes(p.zone)?'launch:':'core:')+p.zone);
  if(point&&point.zone===p.zone&&point.available&&distance(p,point)<=point.range-1&&v.tick-c.lastInteract>=10){
    action(c,{...neutral,yaw:p.yaw,pitch:p.pitch});action(c,{type:'interact',targetId:point.id});c.lastInteract=v.tick;return;
  }
  let mx=0,my=0,mz=0;if(point){const d=Math.max(1,distance(point,p));mx=(point.x-p.x)/d;my=(point.y-p.y)/d;mz=(point.z-p.z)/d;}
  const aim=enemy||point;const yaw=aim?Math.atan2(aim.x-p.x,aim.z-p.z):p.yaw;const pitch=aim&&p.zone==='space'?Math.atan2(aim.y-p.y,Math.hypot(aim.x-p.x,aim.z-p.z)):0;
  if(enemy&&!point){mx=Math.sin(yaw+Math.PI/2)*.6;mz=Math.cos(yaw+Math.PI/2)*.6;}
  action(c,{type:'input',mx,my:p.zone==='space'?my:0,mz,yaw,pitch:Math.max(-1.39,Math.min(1.39,pitch)),fire:!!enemy,boost:!!point&&!enemy&&distance(p,point)>15&&p.energy>35});
}
async function main(){
  console.log('PUBLIC_CHECK_START',JSON.stringify({backend:target.origin,clientOrigin:origin,room}));
  const a=open('Release Alpha');await until(()=>a.view,'first join');
  const b=open('Release Beta');await until(()=>b.view?.players.length===2,'second join');
  assert.equal(a.view.phase,'lobby');assert.equal(b.view.phase,'lobby');assert.equal(a.view.hostId,a.id);assert.equal(a.view.players[0].ready,false);
  // Unknown actions cannot replace state, apply direct damage, teleport or advance time.
  send(b,{type:'state',state:{phase:'over',winner:b.id}});await until(()=>b.errors.includes('unknown message type'),'state injection rejection');
  send(b,{type:'action',playerId:a.id,action:{type:'start'}});await until(()=>b.errors.some(e=>e.includes('host')),'forged host rejection');
  const probe=open('Identity Probe',{playerId:a.id,token:'00000000-0000-4000-8000-000000000000'});await until(()=>probe.errors.some(e=>e.includes('token')),'impersonation rejection');assert.equal(probe.id,null);probe.expectedClose=true;probe.ws.close();
  // Reconnect the second pilot with its private token before starting.
  b.expectedClose=true;b.ws.close();await until(()=>a.view.players.find(p=>p.id===b.id)?.connected===false,'disconnect notification');
  const reconnected=open('Release Beta',{playerId:b.id,token:b.token});await until(()=>reconnected.view,'token reconnect');assert.equal(reconnected.id,b.id);assert.equal(reconnected.view.players.length,2);
  bots.push(a,reconnected);
  for(const c of bots)action(c,{type:'ready',ready:true});await until(()=>a.view.players.every(p=>p.ready),'both ready');
  action(a,{type:'start'});await until(()=>a.view.phase==='playing'&&reconnected.view.phase==='playing','explicit host launch');
  assert(a.view.obstacles.some(o=>o.zone==='ember'&&o.hx===5),'shared solid cover missing');
  action(a,{...neutral,guard:true,fire:true});await until(()=>a.view.players.find(p=>p.id===a.id)?.guard,'held guard state');assert(!a.view.projectiles.some(p=>p.ownerId===a.id),'guard must suppress fire');action(a,neutral);
  action(a,{type:'dash'});await until(()=>a.errors.some(e=>e.includes('ground dodge')),'ground-only dodge validation');
  action(a,{type:'tick'});await until(()=>a.errors.includes('unknown action'),'tick injection rejection');
  const tickBefore=a.view.tick;action(a,{type:'input',mx:999,my:0,mz:0,yaw:0,pitch:0,fire:true,boost:false});await until(()=>a.errors.some(e=>e.includes('range')),'movement injection rejection');
  runAI=true;for(const c of bots)pilot(c);
  const began=Date.now();let lastLog=0;
  while(a.view.phase!=='over'){
    await sleep(100);assert(!failures.length,failures.join('; '));assert(Date.now()-began<480000,'full mission exceeded eight minutes');assert(Date.now()-a.lastAt<15000,'server stopped broadcasting');
    if(a.view.objective.cores.length!==previousCores||Date.now()-lastLog>10000){previousCores=a.view.objective.cores.length;lastLog=Date.now();console.log('PUBLIC_PROGRESS',JSON.stringify({tick:a.view.tick,cores:a.view.objective.cores,players:a.view.players.map(p=>({name:p.name,zone:p.zone,kills:p.kills,deaths:p.deaths}))}));}
  }
  runAI=false;await until(()=>reconnected.view.phase==='over','both clients see victory');assert.equal(a.view.result.winner,'team');assert.deepEqual(a.view.result,reconnected.view.result);assert.deepEqual(a.view.objective.cores,['ember','veil','dreadnought']);assert(a.view.tick>tickBefore+100);assert(a.stateCount>100&&reconnected.stateCount>100);
  for(const c of bots)for(const z of ['space','ember','veil','dreadnought'])assert(c.observedZones.has(z),'client did not traverse '+z);
  assert(witnessedTelegraphs.has('lance')&&witnessedTelegraphs.has('volley'),'both charged attack warnings must appear');assert(witnessedBossPhase,'boss second phase must be observed');
  for(const {state} of allStates)for(const token of tokens)assert(!JSON.stringify(state).includes(token));
  const result={passed:true,backend:target.origin,clientOrigin:origin,room,elapsedSeconds:(Date.now()-began)/1000,tick:a.view.tick,result:a.view.result,cores:a.view.objective.cores,players:a.view.players.map(p=>({name:p.name,kills:p.kills,deaths:p.deaths,score:p.score})),stateFrames:bots.map(c=>c.stateCount),checks:['cross-origin websocket','two distinct clients','private token isolation','impersonation rejection','forged host rejection','raw state rejection','internal tick rejection','movement bounds','disconnect and token reconnect','manual ready and host start','server NPC damage and kills','both planets and ship interior','all cores and shared victory','shared solid cover','guard state and fire suppression','ground-only dodge validation','charged lance and fan warnings','boss second phase']};
  console.log('PUBLIC_CHECK_PASS',JSON.stringify(result));
  if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(result,null,2));
  completed=true;
}
main().catch(e=>{console.error('PUBLIC_CHECK_FAIL',e.stack||e);process.exitCode=1;}).finally(()=>{completed=true;for(const c of connections){c.expectedClose=true;c.ws?.close();setTimeout(()=>c.ws?.terminate(),250).unref();}});
