/** Novaris: deterministic authoritative simulation. All elapsed time is tick based. */
export const meta = { game: "Novaris: Fleet Vanguard", minPlayers: 1, maxPlayers: 6 };
const COLORS = ["#61f4df", "#ffbc70", "#bc93ff", "#ff6e91", "#80c4ff", "#e5ed89"];
const PLANETS = [{id:"ember",name:"Ember Reach",x:-104,y:-24,z:86,radius:27,color:"#ff714d"},{id:"veil",name:"Veil Garden",x:113,y:24,z:98,radius:31,color:"#76dfc4"}];
const PORTS={ember:{x:-62,y:0,z:43},veil:{x:68,y:12,z:54},dreadnought:{x:0,y:4,z:108}};
const WEAPONS={pulse:{damage:18,cooldown:3,cost:3,speed:85,ttl:20},scatter:{damage:9,cooldown:8,cost:10,speed:62,ttl:9},lance:{damage:58,cooldown:13,cost:20,speed:160,ttl:22},blade:{damage:34,cooldown:6,cost:8,speed:0,ttl:0}};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const copy=s=>JSON.parse(JSON.stringify(s));
const neutral=()=>({mx:0,my:0,mz:0,yaw:0,pitch:0,fire:false,boost:false,guard:false,at:-99});
// Shared, axis-aligned solids. The renderer uses these exact half-extents.
function obstacles(zone){
  const list=[];
  const add=(x,z,hx,hy,hz,kind)=>list.push({id:`${zone}-cover-${list.length}`,zone,x,y:hy,z,hx,hy,hz,kind});
  if(zone==="ember")for(const x of [-18,18])for(const z of [-5,5])add(x,z,5,3,2.5,"basalt");
  if(zone==="veil")for(const x of [-18,18])for(const z of [-7,7])add(x,z,3,4,4,"crystal");
  if(zone==="dreadnought")for(const x of [-9,9])for(const z of [-6,6])add(x,z,3,2.8,3,"bastion");
  if(zone.startsWith("ship:"))for(const x of [-9,9])add(x,0,3,2.8,5,"bastion");
  return list;
}
function segmentBox(a,b,o,pad=0,ground=false){
  let near=0,far=1;
  for(const axis of ground?["x","z"]:["x","y","z"]){
    const d=b[axis]-a[axis],min=o[axis]-o["h"+axis]-pad,max=o[axis]+o["h"+axis]+pad;
    if(Math.abs(d)<1e-9){if(a[axis]<min||a[axis]>max)return null;continue;}
    const t1=(min-a[axis])/d,t2=(max-a[axis])/d;near=Math.max(near,Math.min(t1,t2));far=Math.min(far,Math.max(t1,t2));if(near>far)return null;
  }
  return near;
}
function clearLine(a,b,solids,pad=0){return !solids.some(o=>segmentBox(a,b,o,pad,true)!==null);}
function move(entity,dx,dy,dz,solids){
  // Sweep each horizontal axis to slide along cover without tunnelling during a dodge.
  const radius=.9;
  for(const [axis,delta] of [["x",dx],["z",dz]]){
    let allowed=delta;const to={x:entity.x,y:entity.y,z:entity.z};to[axis]+=delta;
    for(const o of solids){const t=segmentBox(entity,to,o,radius,true);if(t!==null&&t<1)allowed=Math.sign(delta)*Math.min(Math.abs(allowed),Math.max(0,Math.abs(delta)*t-.001));}
    entity[axis]+=allowed;if(Math.abs(allowed)<Math.abs(delta))entity["v"+axis]=0;
  }
  entity.y+=dy;bounds(entity);
}
function navigation(a,b,solids){
  if(clearLine(a,b,solids,1.15))return b;
  // A tiny visibility graph routes combatants around cover; no random or hidden teleporting.
  const nodes=[{x:a.x,z:a.z},{x:b.x,z:b.z}];
  for(const o of solids)for(const x of [o.x-o.hx-1.3,o.x+o.hx+1.3])for(const z of [o.z-o.hz-1.3,o.z+o.hz+1.3])nodes.push({x,z});
  const cost=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),used=new Set();cost[0]=0;
  for(let step=0;step<nodes.length;step++){
    let at=-1;for(let i=0;i<nodes.length;i++)if(!used.has(i)&&(at<0||cost[i]<cost[at]))at=i;
    if(at<0||!Number.isFinite(cost[at]))break;if(at===1)break;used.add(at);
    for(let i=1;i<nodes.length;i++)if(!used.has(i)&&clearLine(nodes[at],nodes[i],solids,1.15)){const next=cost[at]+Math.hypot(nodes[i].x-nodes[at].x,nodes[i].z-nodes[at].z);if(next<cost[i]){cost[i]=next;prev[i]=at;}}
  }
  if(prev[1]<0)return a;let first=1;while(prev[first]>0)first=prev[first];return {...nodes[first],y:a.y};
}
function player(id,index,name) {
  return {id,name:name||`Pilot ${index+1}`,color:COLORS[index%6],x:(index-2.5)*8,y:0,z:-42,yaw:0,pitch:0,zone:"space",hp:100,maxHp:100,shield:70,maxShield:70,energy:100,weapon:"pulse",kills:0,deaths:0,score:0,ready:false,alive:true,connected:true,respawn:0,ship:{x:(index-2.5)*8,y:0,z:-42,yaw:0},boosting:false,guard:false,vx:0,vy:0,vz:0,dashAt:-99,dashUntil:0,transitGuardAt:-100,dashDir:{x:0,z:1},input:neutral(),shotAt:-50,hurtAt:-50,interactAt:-50,repairAt:-100,sabotagedAt:-200,spawnAt:0,launchUntil:0,deadAt:0};
}
function event(s,type,entity,extra={}) {s.eventSeq++;s.events.push({seq:s.eventSeq,type,tick:s.tick,zone:entity?.zone||"space",x:entity?.x||0,y:entity?.y||0,z:entity?.z||0,...extra});s.events=s.events.slice(-64);}
function makeNpcs(pilotCount=1) {
  const list=[],scale=1+Math.min(5,Math.max(0,pilotCount-1))*.12;
  for(const zone of ["space","ember","veil","dreadnought"]){
    const count=zone==="space"?5:zone==="dreadnought"?4:3;
    for(let i=0;i<count;i++){
      const space=zone==="space",interior=zone==="dreadnought",boss=interior&&i===3;
      const role=boss?"captain":space?["interceptor","interceptor","marksman","interceptor","bulwark"][i]:["flanker","warden","marksman"][i];
      const pos=space?{x:-46+i*24,y:(i%3-1)*12,z:35+i*12}:interior?{x:i===3?0:i===0?-4.5:4.5,y:0,z:i===3?23:i===2?18:4}:{x:i===0?-30:i===1?30:0,y:0,z:i===2?36:14};
      const hp=Math.ceil((boss?260:space?role==="bulwark"?135:80:role==="warden"?100:70)*scale);
      const weapon=role==="marksman"?"lance":["bulwark","warden","captain"].includes(role)?"scatter":"pulse";
      const name=boss?"Jarl of the Hollow":{interceptor:"Oni Interceptor",bulwark:"Aegis Bulwark",marksman:"Rift Longbow",flanker:"Ashen Strider",warden:"Hoplite Warden"}[role];
      list.push({id:`npc-${zone}-${i}`,name,kind:space?"fighter":boss?"captain":"sentinel",role,boss,phase:1,telegraph:null,zone,...pos,home:{...pos},yaw:Math.PI,pitch:0,hp,maxHp:hp,hpMax:hp,shield:space?25:role==="warden"?20:0,alive:true,weapon,shotAt:-i*3,hurtAt:-99,deadAt:0,seed:i});
    }
  }
  return list;
}
function objectiveDetails(s){
  if(s.mode==="skirmish")return {stage:"Vanguard Skirmish",briefing:"Earn 12 points from eliminations and core captures. NPCs reconstruct after 12 seconds."};
  const planets=s.objective.cores.filter(z=>z==="ember"||z==="veil").length;
  if(s.objective.cores.length===3)return {stage:"IV · Homeward burn",briefing:"All Rift Cores secured. Return to the extraction beacon and choose Extract."};
  if(planets===2)return {stage:"III · The Hollow throne",briefing:"The dreadnought seal is broken. Board it, defeat the Jarl and claim the final core."};
  return {stage:planets?"II · Twin-world accord":"I · Into the rift",briefing:"Clear the guardians on Ember Reach and Veil Garden, then claim each core to unlock the dreadnought."};
}
function placeOutsideCover(entity){
  const solids=obstacles(entity.zone);
  for(let pass=0;pass<solids.length+1;pass++){
    const o=solids.find(o=>Math.abs(entity.x-o.x)<o.hx+.901&&Math.abs(entity.z-o.z)<o.hz+.901);if(!o)break;
    const choices=[{x:o.x-o.hx-.902,z:entity.z},{x:o.x+o.hx+.902,z:entity.z},{x:entity.x,z:o.z-o.hz-.902},{x:entity.x,z:o.z+o.hz+.902}].sort((a,b)=>Math.hypot(a.x-entity.x,a.z-entity.z)-Math.hypot(b.x-entity.x,b.z-entity.z));
    const free=choices.find(q=>solids.every(b=>Math.abs(q.x-b.x)>=b.hx+.901||Math.abs(q.z-b.z)>=b.hz+.901))||choices[0];entity.x=free.x;entity.z=free.z;
  }
  bounds(entity);
}
function upgrade(s){
  if(s.schemaVersion===2)return s;
  const templates=makeNpcs(s.players.filter(p=>p.connected).length);
  for(const p of s.players){
    p.guard=!!p.guard;p.vx=Number.isFinite(p.vx)?p.vx:0;p.vy=Number.isFinite(p.vy)?p.vy:0;p.vz=Number.isFinite(p.vz)?p.vz:0;p.dashAt=Number.isFinite(p.dashAt)?p.dashAt:-99;p.dashUntil=Number.isFinite(p.dashUntil)?p.dashUntil:0;p.dashDir=p.dashDir||{x:0,z:1};p.input={...neutral(),...p.input,guard:!!p.input?.guard};placeOutsideCover(p);
  }
  for(const n of s.npcs){const template=templates.find(t=>t.id===n.id);n.role=n.role||template?.role||(n.zone==="space"?"interceptor":"flanker");n.boss=!!(n.boss||template?.boss);n.phase=n.phase===2?2:1;n.telegraph=n.telegraph||null;n.maxHp=Number.isFinite(n.maxHp)?n.maxHp:Math.max(1,n.hp);n.hpMax=n.maxHp;n.weapon=template?.weapon||n.weapon||"pulse";placeOutsideCover(n);if(n.home){const home={...n.home,zone:n.zone};placeOutsideCover(home);n.home={x:home.x,y:home.y,z:home.z};}}
  s.schemaVersion=2;return s;
}
export function setup(players){return {schemaVersion:2,phase:"lobby",mode:"expedition",hostId:players[0]||null,tick:0,eventSeq:0,projectileSeq:0,players:players.map((id,i)=>player(id,i)),npcs:[],projectiles:[],planets:copy(PLANETS),events:[],objective:{cores:[],required:3,targetScore:12,text:"Collect three Rift Cores, then extract together."},result:null};}
function points(s,p){
  const arr=[];
  const add=(id,label,kind,zone,x,y,z,range,available=true,more={})=>arr.push({id,label,kind,zone,x,y,z,range,available,...more});
  for(const zone of ["ember","veil","dreadnought"]){
    const port=PORTS[zone];const sealed=zone==="dreadnought"&&s.mode==="expedition"&&!["ember","veil"].every(z=>s.objective.cores.includes(z));
    add(zone==="dreadnought"?"board-dreadnought":`land-${zone}`,zone==="dreadnought"?(sealed?"Dreadnought sealed · recover both planet cores":"Board the Hollow Dreadnought"):`Land on ${PLANETS.find(x=>x.id===zone).name}`,zone==="dreadnought"?"board":"land","space",port.x,port.y,port.z,22,!sealed,{targetZone:zone});
    add(`launch:${zone}`,zone==="dreadnought"?"Return to your fighter":"Launch to orbit","launch",zone,0,0,-23,7,true,{targetZone:"space"});
    const clear=!s.npcs.some(n=>n.zone===zone&&n.alive);
    add(`core:${zone}`,s.objective.cores.includes(zone)?"Rift Core secured":clear?"Claim Rift Core":"Eliminate guardians to unlock core","core",zone,0,0,zone==="dreadnought"?23:28,6,clear&&!s.objective.cores.includes(zone));
    add(`repair:${zone}`,"Repair and recharge","repair",zone,-10,0,-23,5,s.tick-p.repairAt>=80);
  }
  add("extract",s.objective.cores.length===3?"Extract · finish expedition":"Extraction · 3 cores required","extract","space",0,0,-62,20,s.mode==="expedition"&&s.objective.cores.length===3);
  for(const owner of s.players){
    const own=owner.id===p.id;
    add(own?`own-ship:${owner.id}`:`board:${owner.id}`,own?"Enter your ship":"Board "+owner.name+"'s ship","board","space",owner.ship.x,owner.ship.y,owner.ship.z,14,owner.alive,{targetZone:`ship:${owner.id}`,ownerId:owner.id});
    add(`exit:${owner.id}`,"Return to your fighter","exit",`ship:${owner.id}`,0,0,-23,6,true,{targetZone:"space"});
    add(`repair:ship:${owner.id}`,"Repair and recharge","repair",`ship:${owner.id}`,-10,0,-22,5,s.tick-p.repairAt>=80);
    add(`reactor:${owner.id}`,own?"Your ship reactor":s.mode==="expedition"?"Allied reactor protected":"Sabotage enemy reactor","reactor",`ship:${owner.id}`,0,0,23,5,!own&&s.mode==="skirmish"&&owner.alive&&owner.connected&&s.tick>=owner.launchUntil&&s.tick-owner.spawnAt>=20&&s.tick-owner.sabotagedAt>=200,{ownerId:owner.id});
  }
  return arr;
}
export function validateAction(s,id,a){
  const fail=error=>({ok:false,error});
  if(!s||!a||typeof a!=="object"||Array.isArray(a))return fail("invalid action");
  if(id==="@system")return ["tick","add","disconnect","reconnect","reset"].includes(a.type)?{ok:true}:fail("invalid system action");
  const p=s.players.find(x=>x.id===id);if(!p)return fail("join first");if(!p.connected)return fail("pilot disconnected");
  if(a.type==="configure"){
    if(s.phase!=="lobby")return fail("configuration is available in the lobby");
    if(a.name!==undefined&&(typeof a.name!=="string"||a.name.trim().length<1||a.name.length>24||/[<>\x00-\x1f]/.test(a.name)))return fail("use a name of 1–24 plain characters");
    if(a.mode!==undefined&&(id!==s.hostId||!["expedition","skirmish"].includes(a.mode)))return fail("only the host can choose a valid mode");
    return {ok:true};
  }
  if(a.type==="dismiss"){
    const target=s.players.find(q=>q.id===a.playerId);
    return s.phase==="lobby"&&id===s.hostId&&target&&target.id!==id&&!target.connected?{ok:true}:fail("only the host can release an offline pilot in the lobby");
  }
  if(a.type==="ready")return s.phase==="lobby"&&typeof a.ready==="boolean"?{ok:true}:fail("ready is available in the lobby");
  if(a.type==="start")return s.phase==="lobby"&&id===s.hostId&&s.players.filter(x=>x.connected).every(x=>x.ready)?{ok:true}:fail("the host can start when every connected pilot is ready");
  if(s.phase!=="playing")return fail("game is not in progress");
  if(a.type==="respawn")return !p.alive&&s.tick-p.deadAt>=50?{ok:true}:fail("reconstruction is not ready");
  if(!p.alive)return fail("reconstruct your pilot to continue");
  if(a.type==="input"){
    for(const key of ["mx","my","mz","yaw","pitch"])if(typeof a[key]!=="number"||!Number.isFinite(a[key]))return fail("movement must be finite numbers");
    if([a.mx,a.my,a.mz].some(x=>Math.abs(x)>1.001)||Math.abs(a.yaw)>1e6||Math.abs(a.pitch)>1.6)return fail("movement is out of range");
    return typeof a.fire==="boolean"&&typeof a.boost==="boolean"&&(a.guard===undefined||typeof a.guard==="boolean")?{ok:true}:fail("fire, boost and guard must be booleans");
  }
  if(a.type==="dash")return p.zone!=="space"&&p.energy>=25&&s.tick-(p.dashAt??-99)>=35?{ok:true}:fail("ground dodge needs 25 energy and a ready cooldown");
  if(a.type==="equip")return typeof a.weapon==="string"&&Object.prototype.hasOwnProperty.call(WEAPONS,a.weapon)?{ok:true}:fail("unknown weapon");
  if(a.type==="interact"){
    const point=points(s,p).find(t=>t.id===a.targetId);
    if(!point||point.zone!==p.zone||distance(point,p)>point.range)return fail("move closer to that interaction");
    if(!point.available)return fail("that interaction is not available yet");
    if(s.tick-p.interactAt<8)return fail("interaction cooling down");return {ok:true};
  }
  return fail("unknown action");
}
function finish(s,winner,title,reason){s.phase="over";s.projectiles=[];for(const n of s.npcs)n.telegraph=null;s.result={over:true,winner,title,reason};event(s,"victory",null,{text:title});for(const p of s.players){p.input=neutral();p.boosting=false;p.guard=false;p.vx=0;p.vy=0;p.vz=0;p.dashUntil=0;}}
function damage(s,victim,amount,attackerId,weapon,incoming=null){
  if(s.phase!=="playing"||!victim.alive)return;
  if(victim.connected!==undefined&&(s.tick<victim.launchUntil||s.tick-victim.spawnAt<20||!victim.connected))return;
  if(weapon!=="reactor"&&victim.dashUntil>s.tick)return;
  if(weapon!=="reactor"&&victim.guard){const attacker=s.players.concat(s.npcs).find(q=>q.id===attackerId);if(incoming||(attacker&&attacker.zone===victim.zone)){const dx=incoming?incoming.x:attacker.x-victim.x,dz=incoming?incoming.z:attacker.z-victim.z,front=(Math.sin(victim.yaw)*dx+Math.cos(victim.yaw)*dz)/Math.max(.01,Math.hypot(dx,dz));if(front>.15){amount*=.4;event(s,"block",victim,{actorId:victim.id,targetId:attackerId});}}}
  const previousShield=victim.shield;const absorbed=Math.min(victim.shield,amount);victim.shield-=absorbed;victim.hp=Math.max(0,victim.hp-(amount-absorbed));victim.hurtAt=s.tick;if(previousShield>0&&victim.shield<=0)event(s,"shieldBreak",victim,{targetId:victim.id,actorId:attackerId});
  event(s,"hit",victim,{targetId:victim.id,actorId:attackerId,weapon});if(victim.hp>0)return;
  victim.alive=false;victim.deadAt=s.tick;victim.boosting=false;victim.guard=false;victim.vx=0;victim.vy=0;victim.vz=0;
  if(victim.input){victim.input=neutral();victim.deaths++;victim.respawn=5;}
  const killer=s.players.find(x=>x.id===attackerId);if(killer&&killer.id!==victim.id){killer.kills++;killer.score++;}
  event(s,"kill",victim,{targetId:victim.id,actorId:attackerId,weapon,text:`${killer?.name||"Rift forces"} eliminated ${victim.name}`});
  if(killer&&s.mode==="skirmish"&&killer.score>=s.objective.targetScore)finish(s,killer.id,`${killer.name} owns the Rift`,"12 points secured.");
}
function bounds(p){const interior=p.zone==="dreadnought"||p.zone.startsWith("ship:");p.x=clamp(p.x,interior?-15:p.zone==="space"?-180:-65,interior?15:p.zone==="space"?180:65);p.z=clamp(p.z,interior?-29:p.zone==="space"?-180:-65,interior?29:p.zone==="space"?180:65);p.y=p.zone==="space"?clamp(p.y,-100,100):0;}
function npcCombat(n){
  const role=n.role||"interceptor";
  if(role==="marksman")return {cooldown:40,speed:68,damage:28,ttl:30};
  if(role==="captain")return {cooldown:n.phase===2?23:34,speed:n.phase===2?38:30,damage:n.phase===2?11:9,ttl:25};
  if(role==="bulwark"||role==="warden")return {cooldown:27,speed:40,damage:5,ttl:22};
  return {cooldown:15+(n.seed%3),speed:n.zone==="space"?42:30,damage:7,ttl:30};
}
function fire(s,shooter,npc=false,charged=false){
  const spec=WEAPONS[shooter.weapon],enemySpec=npc?npcCombat(shooter):null;
  if(!charged&&s.tick-shooter.shotAt<(npc?enemySpec.cooldown:spec.cooldown))return;if(!npc&&shooter.energy<spec.cost)return;
  shooter.shotAt=s.tick;if(!npc){shooter.energy-=spec.cost;shooter.spawnAt=Math.min(shooter.spawnAt,s.tick-20);shooter.launchUntil=Math.min(shooter.launchUntil,s.tick);}
  const aim=charged?shooter.telegraph:shooter,pitch=shooter.zone==="space"?aim.pitch:0;const targets=npc?s.players:s.npcs.concat(s.mode==="skirmish"?s.players:[]);
  if(shooter.weapon==="blade"){
    event(s,"melee",shooter,{actorId:shooter.id,weapon:"blade"});
    for(const target of targets){const dx=target.x-shooter.x,dz=target.z-shooter.z;const front=(Math.sin(shooter.yaw)*dx+Math.cos(shooter.yaw)*dz)/Math.max(.01,Math.hypot(dx,dz));if(target.id!==shooter.id&&target.alive&&target.zone===shooter.zone&&distance(target,shooter)<(shooter.zone==="space"?9:4.8)&&front>-.25&&clearLine(shooter,target,obstacles(shooter.zone)))damage(s,target,spec.damage,shooter.id,"blade");}return;
  }
  const angles=shooter.role==="captain"?(shooter.phase===2?[-.6,-.4,-.2,0,.2,.4,.6]:[-.4,-.2,0,.2,.4]):shooter.weapon==="scatter"?[-.14,-.07,0,.07,.14]:[0];
  for(const spread of angles){const yaw=aim.yaw+spread;const dx=Math.sin(yaw)*Math.cos(pitch),dy=Math.sin(pitch),dz=Math.cos(yaw)*Math.cos(pitch);const speed=npc?enemySpec.speed:spec.speed;const muzzle={x:shooter.x+dx*1.8,y:shooter.y+dy*1.8,z:shooter.z+dz*1.8};
    // A barrel pressed against solid cover must not spawn its shot through it.
    if(obstacles(shooter.zone).some(o=>segmentBox(shooter,muzzle,o)!==null))continue;
    s.projectileSeq++;s.projectiles.push({id:`b${s.projectileSeq}`,ownerId:shooter.id,kind:npc?"npc":"player",weapon:shooter.weapon,zone:shooter.zone,origin:{x:shooter.x,y:shooter.y,z:shooter.z},...muzzle,vx:dx*speed,vy:dy*speed,vz:dz*speed,ttl:npc?enemySpec.ttl:spec.ttl,damage:npc?enemySpec.damage:spec.damage});}
  event(s,"shot",shooter,{actorId:shooter.id,weapon:shooter.weapon});
}
function segmentHit(a,b,target,radius){
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,ox=a.x-target.x,oy=a.y-target.y,oz=a.z-target.z;
  const c=ox*ox+oy*oy+oz*oz-radius*radius;if(c<=0)return 0;
  const length=dx*dx+dy*dy+dz*dz;if(length<=0)return null;
  const projection=ox*dx+oy*dy+oz*dz,discriminant=projection*projection-length*c;if(discriminant<0)return null;
  const time=(-projection-Math.sqrt(discriminant))/length;return time>=0&&time<=1?time:null;
}
function tick(s){
  if(s.phase!=="playing")return;s.tick++;
  const firing=[];
  for(const p of s.players){
    p.respawn=p.alive?0:Math.max(0,(50-(s.tick-p.deadAt))/10);if(!p.alive||!p.connected)continue;
    const input=s.tick-p.input.at<=10?p.input:neutral();p.yaw=input.at<0?p.yaw:input.yaw;p.pitch=input.at<0?p.pitch:clamp(input.pitch,-1.4,1.4);
    const dashing=(p.dashUntil??0)>s.tick,guard=!!input.guard&&p.energy>=2&&!dashing;
    if(guard&&!p.guard)event(s,"guard",p,{actorId:p.id});p.guard=guard;
    const dy=p.zone==="space"?input.my:0;const boost=input.boost&&!guard&&!dashing&&p.energy>=1.5&&(input.mx!==0||dy!==0||input.mz!==0);if(boost&&!p.boosting)event(s,"boost",p,{actorId:p.id});p.boosting=boost;
    const speed=(p.zone==="space"?24:9)*(dashing?3:boost?2:1)*(guard?.45:1),n=Math.max(1,Math.hypot(input.mx,dy,input.mz));
    const desire={x:(dashing?p.dashDir.x:input.mx/n)*speed,y:dy/n*speed,z:(dashing?p.dashDir.z:input.mz/n)*speed},response=p.zone==="space"?.38:.75;
    for(const axis of ["x","y","z"]){const key="v"+axis;p[key]=(p[key]??0)+(desire[axis]-(p[key]??0))*response;if(Math.abs(p[key])<.04||input.at<0&&!dashing)p[key]=0;}
    move(p,p.vx*.1,p.vy*.1,p.vz*.1,obstacles(p.zone));
    if(p.zone==="space")p.ship={x:p.x,y:p.y,z:p.z,yaw:p.yaw};
    p.energy=clamp(p.energy+(guard?-2:boost?-1.5:dashing?0:1.4),0,100);if(s.tick-p.hurtAt>30)p.shield=Math.min(p.maxShield,p.shield+.65);if(input.fire&&!guard&&!dashing)firing.push(p);
  }
  // Resolve every pilot's movement and paid defence before any attack this tick.
  for(const p of firing){if(p.alive&&p.connected)fire(s,p);if(s.phase!=="playing")return;}
  for(const n of s.npcs){
    if(!n.alive){if(s.mode==="skirmish"&&s.tick-n.deadAt>=120){n.alive=true;n.hp=n.maxHp;n.phase=1;n.telegraph=null;n.shield=n.zone==="space"?25:n.role==="warden"?20:0;Object.assign(n,n.home);event(s,"spawn",n,{actorId:n.id});}continue;}
    if(n.role==="captain"&&n.phase!==2&&n.hp<=n.maxHp*.5){n.phase=2;event(s,"bossPhase",n,{actorId:n.id,phase:2,text:"Jarl overdrive · dodge the fan volley"});}
    const targets=s.players.filter(p=>p.alive&&p.connected&&p.zone===n.zone).sort((a,b)=>distance(a,n)-distance(b,n));const target=targets[0];
    if(!target){n.telegraph=null;continue;}
    const d=distance(target,n),dx=target.x-n.x,dy=target.y-n.y,dz=target.z-n.z;n.yaw=Math.atan2(dx,dz);n.pitch=n.zone==="space"?Math.atan2(dy,Math.hypot(dx,dz)):0;
    const space=n.zone==="space",role=n.role||"interceptor",solids=obstacles(n.zone),visible=clearLine(n,target,solids),comfort=role==="marksman"?(space?58:30):role==="captain"?18:space?29:role==="warden"?15:10;
    const approach=!visible||d>comfort+4?1:d<comfort-7?-.6:0,side=role==="interceptor"?.8:role==="flanker"?.7:role==="captain"&&n.phase===2?.5:role==="marksman"?0:.2;
    const direction=(n.seed%2?1:-1),speed=space?role==="bulwark"?6:role==="marksman"?7:11:role==="flanker"?4.8:role==="captain"?3.2:3;
    if(!n.telegraph){
      const desired=visible?{x:n.x+dx/Math.max(d,1)*approach*8+Math.cos(n.yaw)*side*direction*8,y:n.y+dy/Math.max(d,1)*approach*8,z:n.z+dz/Math.max(d,1)*approach*8-Math.sin(n.yaw)*side*direction*8}:target;
      const waypoint=space?desired:navigation(n,desired,solids),mx=waypoint.x-n.x,my=space?waypoint.y-n.y:0,mz=waypoint.z-n.z,len=Math.max(1,Math.hypot(mx,my,mz));move(n,mx/len*speed*.1,my/len*speed*.1,mz/len*speed*.1,solids);
    }
    if(n.telegraph){if(s.tick>=n.telegraph.endTick){fire(s,n,true,true);n.telegraph=null;}continue;}
    if(visible&&d<(space?108:60)){
      if(role==="marksman"||role==="captain"){
        if(s.tick-n.shotAt>=npcCombat(n).cooldown){n.telegraph={kind:role==="marksman"?"lance":"volley",endTick:s.tick+(role==="captain"?(n.phase===2?10:16):14),yaw:n.yaw,pitch:n.pitch};event(s,"telegraph",n,{actorId:n.id,kind:n.telegraph.kind,endTick:n.telegraph.endTick});}
      }else fire(s,n,true);
    }
  }
  const next=[];
  for(const b of s.projectiles){const old=b.origin||{x:b.x,y:b.y,z:b.z};delete b.origin;b.x+=b.vx*.1;b.y+=b.vy*.1;b.z+=b.vz*.1;b.ttl--;if(b.ttl<=0)continue;
    const solidHits=obstacles(b.zone).map(o=>({o,t:segmentBox(old,b,o)})).filter(h=>h.t!==null).sort((a,c)=>a.t-c.t),wall=solidHits[0];
    const candidates=(b.kind==="npc"?s.players:s.npcs.concat(s.mode==="skirmish"?s.players:[])).filter(t=>t.alive&&t.id!==b.ownerId&&t.zone===b.zone&&(t.connected===undefined||t.connected));
    const contact=candidates.map(target=>({target,t:segmentHit(old,b,target,b.zone==="space"?2.6:1.25)})).filter(h=>h.t!==null).sort((a,c)=>a.t-c.t)[0];
    if(wall&&(!contact||wall.t<=contact.t)){const point={zone:b.zone,x:old.x+(b.x-old.x)*wall.t,y:old.y+(b.y-old.y)*wall.t,z:old.z+(b.z-old.z)*wall.t};event(s,"impact",point,{actorId:b.ownerId,obstacleId:wall.o.id,weapon:b.weapon});}
    else if(contact)damage(s,contact.target,b.damage,b.ownerId,b.weapon,{x:-b.vx,z:-b.vz});else next.push(b);
    if(s.phase!=="playing")return;
  }
  s.projectiles=next.slice(-220);
}
function transit(s,p,zone,reconstruction=false){p.input=neutral();p.boosting=false;p.guard=false;p.vx=0;p.vy=0;p.vz=0;p.dashUntil=0;p.zone=zone;p.yaw=0;p.pitch=0;if(reconstruction||s.tick-(p.transitGuardAt??-100)>=100){p.spawnAt=s.tick;p.transitGuardAt=s.tick;}
  if(zone==="space"){p.x=p.ship.x;p.y=p.ship.y;p.z=p.ship.z-4;}else{p.x=0;p.y=0;p.z=-23;}bounds(p);event(s,"transit",p,{actorId:p.id,text:zone});
}
export function applyAction(state,id,a){
  const s=upgrade(copy(state));
  if(id==="@system"){
    if(a.type==="tick")tick(s);
    if(a.type==="add"&&!s.players.some(p=>p.id===a.id)&&s.players.length<meta.maxPlayers){const p=player(a.id,s.players.length,a.name);p.spawnAt=s.tick;if(s.phase==="playing")p.launchUntil=s.tick+100;s.players.push(p);if(!s.players.some(q=>q.id===s.hostId&&q.connected))s.hostId=a.id;}
    if(a.type==="disconnect"||a.type==="reconnect"){const p=s.players.find(p=>p.id===a.id);if(p){p.connected=a.type==="reconnect";p.input=neutral();p.boosting=false;p.guard=false;p.vx=0;p.vy=0;p.vz=0;p.dashUntil=0;}if(!s.players.find(p=>p.id===s.hostId)?.connected)s.hostId=s.players.find(p=>p.connected)?.id||s.hostId;}
    if(a.type==="reset"){const fresh=setup(s.players.map(p=>p.id));fresh.mode=s.mode;fresh.objective.text=s.objective.text;fresh.hostId=s.hostId;fresh.eventSeq=s.eventSeq;for(const p of fresh.players){const prior=s.players.find(q=>q.id===p.id);p.name=prior.name;p.connected=prior.connected;}return fresh;}
    return s;
  }
  const p=s.players.find(p=>p.id===id);if(!p)return s;
  if(a.type==="configure"){if(a.name!==undefined)p.name=a.name.trim();if(a.mode!==undefined){s.mode=a.mode;for(const q of s.players)q.ready=false;s.objective.text=a.mode==="expedition"?"Collect three Rift Cores, then extract together.":"First to 12 points wins. Eliminations and core captures both count.";}}
  if(a.type==="dismiss"){s.players=s.players.filter(q=>q.id!==a.playerId);for(const [index,q] of s.players.entries()){q.x=(index-2.5)*8;q.y=0;q.z=-42;q.ship={x:q.x,y:0,z:q.z,yaw:0};q.color=COLORS[index%6];}}
  if(a.type==="ready")p.ready=a.ready;
  if(a.type==="start"){s.phase="playing";for(const q of s.players)q.launchUntil=s.tick+100;s.npcs=makeNpcs(s.players.filter(p=>p.connected).length);event(s,"start",p,{text:s.mode});}
  if(a.type==="input")p.input={mx:clamp(a.mx,-1,1),my:clamp(a.my,-1,1),mz:clamp(a.mz,-1,1),yaw:a.yaw%(Math.PI*2),pitch:a.pitch,fire:a.fire,boost:a.boost,guard:a.guard??false,at:s.tick};
  if(a.type==="dash"){const current=s.tick-p.input.at<=10?p.input:neutral(),x=current.mx,z=current.mz,len=Math.hypot(x,z);p.dashDir=len>.05?{x:x/len,z:z/len}:{x:Math.sin(p.yaw),z:Math.cos(p.yaw)};p.dashAt=s.tick;p.dashUntil=s.tick+4;p.energy-=25;p.guard=false;p.input.guard=false;event(s,"dash",p,{actorId:p.id});}
  if(a.type==="equip"&&p.weapon!==a.weapon){p.weapon=a.weapon;event(s,"equip",p,{actorId:p.id,weapon:a.weapon});}
  if(a.type==="respawn"){p.alive=true;p.hp=p.maxHp;p.shield=p.maxShield;p.energy=100;p.ship={x:(s.players.indexOf(p)-2.5)*8,y:0,z:-42,yaw:0};transit(s,p,"space",true);p.respawn=0;event(s,"spawn",p,{actorId:p.id});}
  if(a.type==="interact"){
    const point=points(s,p).find(t=>t.id===a.targetId);p.interactAt=s.tick;
    if(["land","board","launch","exit"].includes(point.kind))transit(s,p,point.targetZone);
    if(point.kind==="repair"){p.hp=p.maxHp;p.shield=p.maxShield;p.energy=100;p.repairAt=s.tick;event(s,"repair",p,{actorId:p.id});}
    if(point.kind==="core"){s.objective.cores.push(point.zone);p.score++;event(s,"core",p,{actorId:p.id,text:`${s.objective.cores.length} / 3 Rift Cores secured`});if(s.mode==="skirmish"&&p.score>=12)finish(s,p.id,`${p.name} owns the Rift`,"12 score secured.");}
    if(point.kind==="extract")finish(s,"team","Rift sealed. Crew extracted.","All three Rift Cores were recovered.");
    if(point.kind==="reactor"){const owner=s.players.find(q=>q.id===point.ownerId);owner.sabotagedAt=s.tick;owner.spawnAt=-100;damage(s,owner,200,p.id,"reactor");}
  }
  return s;
}
export function isGameOver(s){return s.phase==="over"?s.result:{over:false};}
export function viewFor(s,id){if(s.schemaVersion!==2)s=upgrade(copy(s));const p=s.players.find(x=>x.id===id);return {phase:s.phase,mode:s.mode,hostId:s.hostId,tick:s.tick,you:id,players:s.players.map(({input,shotAt,hurtAt,interactAt,repairAt,sabotagedAt,spawnAt,launchUntil,deadAt,dashAt,dashUntil,dashDir,transitGuardAt,...q})=>({...q,dashing:(dashUntil??0)>s.tick,dashCooldown:Math.max(0,(35-(s.tick-(dashAt??-99)))/10),launchProtection:Math.max(0,(launchUntil-s.tick)/10)})),npcs:s.npcs.map(({home,shotAt,hurtAt,deadAt,seed,...n})=>n),projectiles:s.projectiles.map(({damage,...b})=>b),planets:s.planets,interactables:p?points(s,p):[],events:s.events,objective:{...s.objective,...objectiveDetails(s)},obstacles:[...obstacles("ember"),...obstacles("veil"),...obstacles("dreadnought"),...s.players.flatMap(q=>obstacles(`ship:${q.id}`))],result:s.result};}
