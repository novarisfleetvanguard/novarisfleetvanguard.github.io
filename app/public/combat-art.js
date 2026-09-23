import * as T from 'three';
const V=T.Vector3,TAU=Math.PI*2;
const basic=(color,opacity=1)=>new T.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity===1,side:T.DoubleSide});
function add(parent,g,m,p=[0,0,0],s=[1,1,1]){const o=new T.Mesh(g,m);o.position.set(...p);o.scale.set(...s);parent.add(o);return o;}
function halo(parent,r,c){return add(parent,new T.TorusGeometry(r,.035,4,48),basic(c));}
export function decorateCombatant(rec,hostile,space){
 const {group,model,entity:e}=rec,col=hostile?0xfc795a:0x8ee5e6;
 rec.baseScale=model.scale.x;rec.recoil=0;rec.flashUntil=0;rec.lastShot=0;
 const muzzle=add(group,new T.OctahedronGeometry(1,0),basic(col),space?[0,0,2.3]:[.31,1.35,1.25],[.18,.18,.45]);muzzle.visible=false;rec.muzzle=muzzle;
 const shield=add(group,new T.SphereGeometry(space?2.3:1.3,16,10,0,Math.PI),new T.MeshBasicMaterial({color:col,transparent:true,opacity:.13,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending}),space?[0,0,0]:[0,1.15,0]);shield.visible=false;rec.shield=shield;
 if(e.role){
  const captain=e.role==='captain',heavy=e.role==='bulwark'||captain,marksman=e.role==='marksman';
  model.scale.multiplyScalar(captain?1.34:heavy?1.16:marksman?.93:1);rec.baseScale=model.scale.x;
  if(captain||e.role==='warden'){
   const crest=halo(group,space?2.5:1.05,captain?0xfcc478:0xff8862);crest.position.y=space?.9:2.4;crest.rotation.x=.18;rec.crown=crest;
  }
  if(heavy&&!space){const pauldron=add(group,new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:0x664039,metalness:.65,roughness:.45}),[-.67,1.66,0],[.5,.8,.65]);}
  if(marksman){const barrel=add(group,new T.CylinderGeometry(.05,.06,space?2:1.3,6),new T.MeshStandardMaterial({color:0x95a8aa,metalness:.8,roughness:.4}),space?[0,0,2.2]:[.30,1.26,1.51]);barrel.rotation.x=Math.PI/2;}
  const warning=new T.Group();group.add(warning);warning.visible=false;
  const floor=add(warning,new T.RingGeometry(space?2.8:1.7,space?3.05:1.9,48),basic(0xff654f,.7),[0,space?-.65:.2,0]);floor.rotation.x=-Math.PI/2;
  const beam=add(warning,new T.BoxGeometry(1,1,1),basic(0xff8066,.2),[0,space?0:1.2,12],[.3,.12,24]);
  const point=halo(warning,space?1.8:.8,0xffad74);point.position.set(0,space?0:1.2,3);
  rec.warning={group:warning,beam,floor,point};
 }
}
export function animateCombatant(world,rec,dt,speed,space){
 const e=rec.entity,now=world.time,active=now<rec.flashUntil;
 rec.muzzle.visible=active;rec.muzzle.rotation.z=world.reducedMotion?0:now*15;rec.muzzle.scale.setScalar(active?(world.reducedMotion?.28:.24+Math.random()*.15):.01);rec.muzzle.scale.z*=2.2;
 rec.recoil=Math.max(0,rec.recoil-dt*5);
 const weapon=rec.model.getObjectByName('weapon');if(weapon){weapon.rotation.x=-rec.recoil*.21;weapon.position.z=.6-rec.recoil*.15;weapon.rotation.y=!world.reducedMotion&&speed>.3?Math.sin(now*7)*.025:0;}
 const cloak=rec.model.getObjectByName('cloak');if(cloak){cloak.rotation.x=world.reducedMotion?0:-.08-Math.min(speed*.012,.3)+Math.sin(now*3+e.x)*.07;cloak.rotation.z=world.reducedMotion?0:Math.sin(now*1.8)*.04;}
 if(!space&&rec.type!=='AlienDrone'){rec.model.rotation.x=e.dashing?-.22:e.guard?.08:Math.min(speed*.007,.08);rec.model.rotation.z=!world.reducedMotion&&speed>.3?Math.sin(now*7)*.025:0;}
 rec.shield.visible=!!e.guard||now<(rec.blockUntil||0);if(rec.shield.visible){rec.shield.material.opacity=e.guard?.13:.34;rec.shield.rotation.y=0;}
 if(rec.crown){rec.crown.rotation.z=world.reducedMotion?0:now*.2;if(e.phase===2)rec.crown.material.color.set(0xff6043);}
 if(rec.warning){const w=rec.warning;w.group.visible=!!e.telegraph;if(e.telegraph){w.group.rotation.y=(e.telegraph.yaw||0)-rec.group.rotation.y;w.group.rotation.x=space?-(e.telegraph.pitch||0):0;const left=Math.max(0,(e.telegraph.endTick-(world.state?.tick||0))/10),pulse=world.reducedMotion?1:1+Math.sin(now*18)*.08;w.floor.scale.setScalar(pulse);w.floor.material.opacity=.4+(1-Math.min(left/1.2,1))*.55;w.point.scale.setScalar(.8+Math.min(left,1)*.7);w.beam.material.opacity=.18+(1-Math.min(left,1))*.16;}}
 if(e.dashing&&!world.reducedMotion&&(rec.nextTrail||0)<now){rec.nextTrail=now+.025;for(let i=0;i<3;i++)world.particles.push({p:rec.group.position.clone().add(new V((Math.random()-.5)*.6,.5+Math.random(),0)),v:new V(0,.2,0),life:.22,max:.22,color:new T.Color(0x95e9ec)});}
}
export function combatEvent(world,e){
 const id=e.actorId||e.playerId||e.ownerId||e.attackerId||e.shooterId||e.id;let rec=world.entities.get(id);
 if(e.type==='shot'){
  // Server event schemas carry ownerId for projectiles; spatial fallback matches NPC shots.
  if(!rec&&Number.isFinite(e.x)){let d=Infinity;for(const r of world.entities.values()){if(!r.group.visible)continue;const v=r.group.position.distanceToSquared(new V(e.x,e.y||0,e.z));if(v<d&&v<25){d=v;rec=r;}}}
  if(rec){rec.flashUntil=world.time+.07;rec.recoil=1;}
 }
 if(e.type==='block'||e.type==='guard'){const target=world.entities.get(e.targetId)||rec;if(target)target.blockUntil=world.time+.22;}
 if(e.type==='bossPhase')world.shake=world.reducedMotion?0:.16;
}
