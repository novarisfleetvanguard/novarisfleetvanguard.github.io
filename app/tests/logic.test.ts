// Boundary tests below use explicit trusted state fixtures; the full PvP route test uses only validated actions.
import {describe,it,expect} from "vitest";
import * as rules from "../src/logic.js";
const input={type:"input",mx:0,my:0,mz:0,yaw:0,pitch:0,fire:false,boost:false};
function act(s:any,id:string,a:any):any{expect(rules.validateAction(s,id,a)).toEqual({ok:true});return rules.applyAction(s,id,a);}
function advance(s:any,n=1):any{for(let i=0;i<n;i++)s=rules.applyAction(s,"@system",{type:"tick"});return s;}
function started(mode="expedition"):any{let s:any=rules.setup(["a","b"]);s=act(s,"a",{type:"configure",mode});s=act(s,"a",{type:"ready",ready:true});s=act(s,"b",{type:"ready",ready:true});return act(s,"a",{type:"start"});}
describe("authoritative simulation",()=>{
  it("lobby never advances or starts until the host explicitly starts",()=>{let s:any=rules.setup(["a","b"]);expect(advance(s,100).tick).toBe(0);expect(rules.validateAction(s,"a",{type:"start"}).ok).toBe(false);s=act(s,"a",{type:"ready",ready:true});s=act(s,"b",{type:"ready",ready:true});expect(rules.validateAction(s,"b",{type:"start"}).ok).toBe(false);s=act(s,"a",{type:"start"});expect(s.phase).toBe("playing");expect(s.npcs.length).toBe(15);});
  it("normalizes diagonal movement and cannot move or shoot by spamming inputs",()=>{let s=started();s.npcs=[];const original=JSON.stringify(s);let moved=act(s,"a",{...input,mx:1,my:1,mz:1,fire:true});for(let i=0;i<100;i++)moved=act(moved,"a",{...input,mx:1,my:1,mz:1,fire:true});expect(moved.players[0].x).toBe(s.players[0].x);expect(moved.projectiles).toHaveLength(0);moved=advance(moved);const p=moved.players[0],o=s.players[0];const step=Math.hypot(p.x-o.x,p.y-o.y,p.z-o.z);const cardinal=advance(act(s,"a",{...input,mz:1})).players[0];expect(step).toBeGreaterThan(0);expect(step).toBeLessThanOrEqual(2.4);expect(step).toBeCloseTo(cardinal.z-o.z);expect(moved.projectiles).toHaveLength(1);expect(JSON.stringify(s)).toBe(original);});
  it("rejects malformed inputs and internal-only clock actions",()=>{const s=started();for(const a of [{...input,mx:NaN},{...input,my:Infinity},{...input,mx:3},{...input,fire:"yes"},{type:"tick"},{type:"add",id:"evil"},{type:"equip",weapon:"__proto__"},{type:"equip",weapon:["pulse"]},{type:"interact",targetId:"core:ember"}])expect(rules.validateAction(s,"a",a).ok).toBe(false);});
  it("expires input and neutralizes disconnected pilots without stale NPC targets",()=>{let s=started();s.npcs=[];s=act(s,"a",{...input,mz:1});s=advance(s,11);const z=s.players[0].z;s=advance(s,20);expect(s.players[0].z).toBe(z);s=act(s,"a",{...input,mz:1,fire:true});s=rules.applyAction(s,"@system",{type:"disconnect",id:"a"});s=advance(s);expect(s.players[0].z).toBe(z);expect(s.hostId).toBe("b");expect(s.players[0].input.fire).toBe(false);});
  it("swept projectile collision damages NPCs and records kills",()=>{let s=started();s.tick=130;s.players[0].x=0;s.players[0].y=0;s.players[0].z=0;const n=s.npcs[0];Object.assign(n,{x:0,y:0,z:10,hp:18,shield:0,shotAt:130});s.npcs=[n];s=act(s,"a",{...input,fire:true});s=advance(s);expect(s.npcs[0].alive).toBe(false);expect(s.players[0].kills).toBe(1);expect(s.events.some((e:any)=>e.type==="hit")).toBe(true);});
  it("prevents friendly fire in expedition and enables PvP in skirmish",()=>{for(const mode of ["expedition","skirmish"]){let s=started(mode);s.tick=130;s.npcs=[];Object.assign(s.players[0],{x:0,y:0,z:0});Object.assign(s.players[1],{x:0,y:0,z:10});s=act(s,"a",{...input,fire:true});s=advance(s);expect(s.players[1].shield).toBe(mode==="expedition"?70:52);}});
  it("supports landing, guarded core claim, launch and other-player boarding",()=>{let s=started();const port=(rules.viewFor(s,"a") as any).interactables.find((x:any)=>x.id==="land-ember");Object.assign(s.players[0],{x:port.x,y:port.y,z:port.z});s=act(s,"a",{type:"interact",targetId:"land-ember"});expect(s.players[0].zone).toBe("ember");expect(s.players[0].y).toBe(0);s.tick+=10;s.players[0].z=28;expect(rules.validateAction(s,"a",{type:"interact",targetId:"core:ember"}).ok).toBe(false);s.npcs=s.npcs.filter((n:any)=>n.zone!=="ember");s=act(s,"a",{type:"interact",targetId:"core:ember"});expect(s.objective.cores).toEqual(["ember"]);s.tick+=10;s.players[0].z=-23;s=act(s,"a",{type:"interact",targetId:"launch:ember"});expect(s.players[0].zone).toBe("space");s.tick+=10;Object.assign(s.players[0],s.players[1].ship);s=act(s,"a",{type:"interact",targetId:"board:b"});expect(s.players[0].zone).toBe("ship:b");});
  it("finishes expedition and resets to lobby without auto-ready or auto-start",()=>{let s=started();s.objective.cores=["ember","veil","dreadnought"];Object.assign(s.players[0],{x:0,y:0,z:-62});s=act(s,"a",{type:"interact",targetId:"extract"});expect(rules.isGameOver(s)).toMatchObject({over:true,winner:"team"});const seq=s.eventSeq;s=rules.applyAction(s,"@system",{type:"reset"});expect(s.phase).toBe("lobby");expect(s.players.every((p:any)=>!p.ready)).toBe(true);expect(s.objective.cores).toEqual([]);expect(s.eventSeq).toBe(seq);});
  it("wins skirmish on the 12th elimination and requires manual reconstruction",()=>{let s=started("skirmish");s.tick=130;s.npcs=[];Object.assign(s.players[0],{x:0,y:0,z:0,score:11});Object.assign(s.players[1],{x:0,y:0,z:10,hp:18,shield:0,hurtAt:130});s=act(s,"a",{...input,fire:true});s=advance(s);expect(s.phase).toBe("over");expect(s.result.winner).toBe("a");s.phase="playing";s.result=null;s=advance(s,55);expect(s.players[1].alive).toBe(false);s=act(s,"b",{type:"respawn"});expect(s.players[1].alive).toBe(true);expect(s.players[1].zone).toBe("space");});
  it("lance, scatter and blade have distinct fire behavior with cooldowns",()=>{for(const weapon of ["lance","scatter","blade"]){let s=started();s.npcs=[];s=act(s,"a",{type:"equip",weapon});s=act(s,"a",{...input,fire:true});s=advance(s);expect(s.projectiles).toHaveLength(weapon==="scatter"?5:weapon==="lance"?1:0);const energy=s.players[0].energy;s=advance(s);expect(s.players[0].energy).toBeGreaterThan(energy);}});
  it("sabotage is PvP-only, range-gated and kills the boarded ship owner",()=>{let s=started("skirmish");s.tick=130;s.npcs=[];Object.assign(s.players[0],{zone:"ship:b",x:0,y:0,z:23});s=act(s,"a",{type:"interact",targetId:"reactor:b"});expect(s.players[1].alive).toBe(false);expect(s.players[0].kills).toBe(1);expect(rules.validateAction(s,"a",{type:"interact",targetId:"reactor:b"}).ok).toBe(false);});
  it("provides ten seconds of initial launch shielding, without renewing on transit",()=>{let s=started();expect((rules.viewFor(s,"a") as any).players[0].launchProtection).toBe(10);s=advance(s,50);expect(s.players[0].hp).toBe(100);expect(s.players[0].shield).toBe(70);expect((rules.viewFor(s,"a") as any).players[0].launchProtection).toBe(5);s=act(s,"a",{type:"interact",targetId:"own-ship:a"});expect((rules.viewFor(s,"a") as any).players[0].launchProtection).toBe(5);s=advance(s,60);expect((rules.viewFor(s,"a") as any).players[0].launchProtection).toBe(0);});
  it("hides input internals and yields deterministic bounded JSON state",()=>{const s=started();const a=advance(s,60),b=advance(s,60);expect(a).toEqual(b);const view=rules.viewFor(a,"a") as any;expect(view.players[0].input).toBeUndefined();expect(view.events.length).toBeLessThanOrEqual(64);expect(JSON.parse(JSON.stringify(view))).toEqual(view);});
  it("uses the renderer's cover boxes to sweep movement and dodge without tunnelling",()=>{
    let s=started();s.npcs=[];Object.assign(s.players[0],{zone:"ember",x:-26,y:0,z:-5});
    s=act(s,"a",{...input,mx:1});s=act(s,"a",{type:"dash"});s=advance(s,3);
    expect(s.players[0].x).toBeLessThanOrEqual(-23.89);expect(s.players[0].x).toBeGreaterThan(-26);
    const view=rules.viewFor(s,"a") as any;expect(view.obstacles.find((o:any)=>o.zone==="ember"&&o.x===-18&&o.z===-5)).toMatchObject({hx:5,hy:3,hz:2.5});
    expect(rules.validateAction(s,"a",{type:"dash"}).ok).toBe(false);
    for(let i=0;i<15;i++){s=act(s,"a",{...input,mx:1,mz:-1});s=advance(s);}
    expect(s.players[0].z).toBeLessThan(-9);expect(s.players[0].x).toBeGreaterThan(-23.9);
  });
  it("solid cover stops fast player projectiles and reports impacts",()=>{
    let s=started("skirmish");s.npcs=[];s.tick=130;
    Object.assign(s.players[0],{zone:"ember",x:-32,y:0,z:-5});Object.assign(s.players[1],{zone:"ember",x:-10,y:0,z:-5});
    s=act(s,"a",{type:"equip",weapon:"lance"});s=act(s,"a",{...input,yaw:Math.PI/2,fire:true});s=advance(s,5);
    expect(s.players[1].shield).toBe(70);expect(s.events.some((e:any)=>e.type==="impact")).toBe(true);
    expect(s.projectiles).toHaveLength(0);
  });
  it("blade attacks need a facing arc and clear line around cover",()=>{
    let s=started("skirmish");s.npcs=[];s.tick=130;
    Object.assign(s.players[0],{zone:"dreadnought",x:5,y:0,z:-4,yaw:Math.PI/4});Object.assign(s.players[1],{zone:"dreadnought",x:7,y:0,z:-2});
    s=act(s,"a",{type:"equip",weapon:"blade"});s=act(s,"a",{...input,yaw:Math.PI/4,fire:true});s=advance(s);expect(s.players[1].shield).toBe(70);
    Object.assign(s.players[0],{x:0,z:0,shotAt:0});Object.assign(s.players[1],{x:0,z:-3});s=act(s,"a",{...input,fire:true});s=advance(s);expect(s.players[1].shield).toBe(70);
  });
  it("held guard protects the front, drains energy and prevents firing",()=>{
    for(const facing of [0,Math.PI]){let s=started("skirmish");s.tick=130;s.npcs=[];Object.assign(s.players[0],{zone:"dreadnought",x:0,y:0,z:0});Object.assign(s.players[1],{zone:"dreadnought",x:0,y:0,z:8});
      s=act(s,"b",{...input,yaw:facing,guard:true,fire:true});s=act(s,"a",{...input,fire:true});s=advance(s);
      expect(s.players[1].shield).toBeCloseTo(facing===0?52:62.8);expect(s.players[1].energy).toBe(98);expect(s.projectiles.some((b:any)=>b.ownerId==="b")).toBe(false);
    }
    expect(rules.validateAction(started(),"a",{...input,guard:"yes"}).ok).toBe(false);
  });
  it("dodge evades a hit, costs energy and is unavailable in flight",()=>{
    let s=started("skirmish");s.tick=130;s.npcs=[];expect(rules.validateAction(s,"a",{type:"dash"}).ok).toBe(false);
    Object.assign(s.players[0],{zone:"dreadnought",x:0,y:0,z:0});Object.assign(s.players[1],{zone:"dreadnought",x:0,y:0,z:8});
    s=act(s,"b",{type:"dash"});expect(s.players[1].energy).toBe(75);s=act(s,"a",{...input,fire:true});s=advance(s);expect(s.players[1].shield).toBe(70);
    expect((rules.viewFor(s,"b") as any).players[1].dashing).toBe(true);s=advance(s,34);expect(rules.validateAction(s,"b",{type:"dash"}).ok).toBe(true);
  });
  it("charged shots lock their warning aim and the Jarl enters a faster second phase",()=>{
    let s=started();s.tick=130;Object.assign(s.players[0],{zone:"dreadnought",x:0,y:0,z:-12});const boss=s.npcs.find((n:any)=>n.role==="captain");s.npcs=[boss];s=advance(s);
    const warning=s.npcs[0].telegraph;expect(warning.kind).toBe("volley");expect(warning.endTick-s.tick).toBe(16);
    s.players[0].x=4;s=advance(s);expect(s.npcs[0].telegraph.yaw).toBe(warning.yaw);
    s.npcs[0].hp=s.npcs[0].maxHp/2;s=advance(s);expect(s.npcs[0].phase).toBe(2);expect(s.events.some((e:any)=>e.type==="bossPhase")).toBe(true);
    s=advance(s,15);expect(s.events.some((e:any)=>e.type==="shot"&&e.actorId===boss.id)).toBe(true);
  });
  it("NPCs route around solid cover instead of walking or shooting through it",()=>{
    let s=started();s.tick=130;Object.assign(s.players[0],{zone:"ember",x:-18,y:0,z:-20});s.players[1].connected=false;
    const npc=s.npcs.find((n:any)=>n.zone==="ember"&&n.role==="flanker");Object.assign(npc,{x:-18,z:20});s.npcs=[npc];
    for(let i=0;i<150;i++){s=advance(s);const n=s.npcs[0];for(const o of (rules.viewFor(s,"a") as any).obstacles.filter((o:any)=>o.zone==="ember"))expect(Math.abs(n.x-o.x)<o.hx+.89&&Math.abs(n.z-o.z)<o.hz+.89).toBe(false);}
    expect(s.npcs[0].z).toBeLessThan(-7.5);expect(Math.hypot(s.npcs[0].x+18,s.npcs[0].z+20)).toBeLessThan(20);
  });
  it("planetary cores unlock the dreadnought and the objective clearly advances",()=>{
    let s=started();const view=()=>rules.viewFor(s,"a") as any;expect(view().interactables.find((i:any)=>i.id==="board-dreadnought").available).toBe(false);
    s.objective.cores=["ember"];expect(view().objective.stage).toContain("II");s.objective.cores.push("veil");expect(view().interactables.find((i:any)=>i.id==="board-dreadnought").available).toBe(true);expect(view().objective.stage).toContain("III");
    s.objective.cores.push("dreadnought");expect(view().objective.stage).toContain("IV");
    const skirmish=rules.viewFor(started("skirmish"),"a") as any;expect(skirmish.interactables.find((i:any)=>i.id==="board-dreadnought").available).toBe(true);
  });

  it("places every ground enemy outside all shared collision volumes",()=>{
    const s=started(),view=rules.viewFor(s,"a") as any;
    for(const n of s.npcs.filter((n:any)=>n.zone!=="space"))for(const o of view.obstacles.filter((o:any)=>o.zone===n.zone))expect(Math.abs(n.x-o.x)<o.hx+.9&&Math.abs(n.z-o.z)<o.hz+.9).toBe(false);
  });

  it("reactor sabotage destroys the vessel even while its owner braces or dodges inside",()=>{
    for(const defensive of ["guard","dash"]){let s=started("skirmish");s.tick=130;s.npcs=[];Object.assign(s.players[0],{zone:"ship:b",x:0,y:0,z:23});Object.assign(s.players[1],{zone:"ship:b",x:0,y:0,z:20,yaw:0,guard:defensive==="guard",dashUntil:defensive==="dash"?134:0});s=act(s,"a",{type:"interact",targetId:"reactor:b"});expect(s.players[1].alive).toBe(false);expect(s.players[0].kills).toBe(1);}
  });

  it("upgrades persisted legacy rooms without exposing internals or resetting progress",()=>{
    let old=started();delete old.schemaVersion;old.tick=250;old.objective.cores=["ember"];old.players[0].score=7;Object.assign(old.players[0],{zone:"ember",x:-18,y:0,z:-5,hp:43,shield:22});
    for(const p of old.players){for(const key of ["guard","vx","vy","vz","dashAt","dashUntil","dashDir"])delete p[key];delete p.input.guard;}
    for(const n of old.npcs){for(const key of ["role","boss","phase","telegraph","hpMax"])delete n[key];n.weapon="pulse";}
    const before=JSON.stringify(old),view=rules.viewFor(old,"a") as any;
    expect(JSON.stringify(old)).toBe(before);expect(view.players[0]).toMatchObject({hp:43,shield:22,score:7,guard:false,vx:0,dashCooldown:0});expect(view.players[0].dashAt).toBeUndefined();expect(view.npcs.find((n:any)=>n.kind==="captain")).toMatchObject({boss:true,role:"captain",phase:1,telegraph:null});
    const s=advance(old);expect(s.schemaVersion).toBe(2);expect(s.tick).toBe(251);expect(s.objective.cores).toEqual(["ember"]);expect(s.players[0].hp).toBe(43);expect(s.players[0].score).toBe(7);expect(Math.abs(s.players[0].x+18)>5.9||Math.abs(s.players[0].z+5)>3.4).toBe(true);
    expect(()=>advance(s,100)).not.toThrow();
  });

  it("hands an empty room to a newly arriving pilot without taking it back on reconnect",()=>{
    let s:any=rules.setup(["old"]);s=rules.applyAction(s,"@system",{type:"disconnect",id:"old"});s=rules.applyAction(s,"@system",{type:"add",id:"new"});expect(s.hostId).toBe("new");s=act(s,"new",{type:"ready",ready:true});expect(rules.validateAction(s,"new",{type:"start"}).ok).toBe(true);s=rules.applyAction(s,"@system",{type:"reconnect",id:"old"});expect(s.hostId).toBe("new");
  });
  it("gives late entrants one initial shield without extending it on reconnect",()=>{
    let s=started();s.tick=200;s=rules.applyAction(s,"@system",{type:"add",id:"late"});expect((rules.viewFor(s,"late") as any).players.find((p:any)=>p.id==="late").launchProtection).toBe(10);s=advance(s,30);s=rules.applyAction(s,"@system",{type:"disconnect",id:"late"});s=rules.applyAction(s,"@system",{type:"reconnect",id:"late"});expect((rules.viewFor(s,"late") as any).players.find((p:any)=>p.id==="late").launchProtection).toBe(7);
  });
  it("ends all spawn protection when a pilot actually attacks",()=>{
    for(const weapon of ["pulse","blade"]){let s=started();s.npcs=[];s=act(s,"a",{type:"equip",weapon});s=act(s,"a",{...input,fire:true});s=advance(s);expect((rules.viewFor(s,"a") as any).players[0].launchProtection).toBe(0);expect(s.tick-s.players[0].spawnAt).toBeGreaterThanOrEqual(20);}
  });
  it("cannot maintain immunity by cycling ship doors and still protects reconstruction",()=>{
    let s=started();s.tick=130;s.npcs=[];for(let cycle=0;cycle<3;cycle++)for(const targetId of ["own-ship:a","exit:a"]){s=act(s,"a",{type:"interact",targetId});s=advance(s,8);}
    expect(s.players[0].spawnAt).toBe(130);expect(s.tick-s.players[0].spawnAt).toBeGreaterThanOrEqual(20);
    Object.assign(s.players[0],{alive:false,deadAt:s.tick-50});s=act(s,"a",{type:"respawn"});expect(s.players[0].spawnAt).toBe(s.tick);
  });
  it("does not allow sabotage during a target's reconstruction protection",()=>{
    let s=started("skirmish");s.tick=200;s.npcs=[];Object.assign(s.players[0],{zone:"ship:b",x:0,y:0,z:23});s.players[1].spawnAt=s.tick;expect(rules.validateAction(s,"a",{type:"interact",targetId:"reactor:b"}).ok).toBe(false);s=advance(s,20);expect(rules.validateAction(s,"a",{type:"interact",targetId:"reactor:b"}).ok).toBe(true);
  });
  it("blocks an incoming frontal projectile even after its shooter moves behind the defender",()=>{
    let s=started("skirmish");s.tick=130;s.npcs=[];Object.assign(s.players[0],{zone:"dreadnought",x:0,y:0,z:-12});Object.assign(s.players[1],{zone:"dreadnought",x:0,y:0,z:0});
    s.projectiles=[{id:"probe",ownerId:"a",kind:"player",weapon:"pulse",zone:"dreadnought",x:0,y:0,z:5,vx:0,vy:0,vz:-50,ttl:5,damage:18}];s=act(s,"b",{...input,guard:true});s=advance(s);expect(s.players[1].shield).toBeCloseTo(62.8);expect(s.events.some((e:any)=>e.type==="block")).toBe(true);
  });
  it("resolves fast projectile hits by first surface contact, not nearest centre",()=>{
    let s:any=rules.setup(["a","b","c"]);s=act(s,"a",{type:"configure",mode:"skirmish"});for(const id of ["a","b","c"])s=act(s,id,{type:"ready",ready:true});s=act(s,"a",{type:"start"});s.tick=130;s.npcs=[];
    Object.assign(s.players[0],{zone:"dreadnought",x:0,y:0,z:-5});Object.assign(s.players[1],{zone:"dreadnought",x:1.24,y:0,z:3});Object.assign(s.players[2],{zone:"dreadnought",x:0,y:0,z:4});s.projectiles=[{id:"probe",ownerId:"a",kind:"player",weapon:"pulse",zone:"dreadnought",x:0,y:0,z:1.8,vx:0,vy:0,vz:85,ttl:5,damage:18}];s=advance(s);expect(s.players[1].shield).toBe(70);expect(s.players[2].shield).toBe(52);
  });
  it("restricts releasing seats to the host, lobby and disconnected targets",()=>{
    let s:any=rules.setup(["a","b","c"]);expect(rules.validateAction(s,"a",{type:"dismiss",playerId:"b"}).ok).toBe(false);s=rules.applyAction(s,"@system",{type:"disconnect",id:"b"});expect(rules.validateAction(s,"c",{type:"dismiss",playerId:"b"}).ok).toBe(false);expect(rules.validateAction(s,"a",{type:"dismiss",playerId:"a"}).ok).toBe(false);s=act(s,"a",{type:"dismiss",playerId:"b"});expect(s.players.map((p:any)=>p.id)).toEqual(["a","c"]);
    for(const phase of ["playing","over"]){s.phase=phase;expect(rules.validateAction(s,"a",{type:"dismiss",playerId:"c"}).ok).toBe(false);}
  });

  it("safely defaults the travel shield cooldown in existing schema two rooms",()=>{
    let s=started();s.tick=130;s.npcs=[];delete s.players[0].transitGuardAt;
    expect(s.schemaVersion).toBe(2);expect((rules.viewFor(s,"a") as any).players[0].transitGuardAt).toBeUndefined();
    s=act(s,"a",{type:"interact",targetId:"own-ship:a"});expect(s.players[0].spawnAt).toBe(130);expect(s.players[0].transitGuardAt).toBe(130);
    s=advance(s,8);s=act(s,"a",{type:"interact",targetId:"exit:a"});expect(s.players[0].spawnAt).toBe(130);expect(s.players[0].transitGuardAt).toBe(130);expect(Number.isFinite(s.players[0].hp)).toBe(true);
  });

  it("hits a rival between the shooter and the visible muzzle at point-blank range",()=>{
    let s=started("skirmish");s.tick=130;s.npcs=[];Object.assign(s.players[0],{zone:"ship:a",x:0,y:0,z:0});Object.assign(s.players[1],{zone:"ship:a",x:0,y:0,z:.4});
    s=act(s,"a",{...input,fire:true});s=advance(s);expect(s.players[1].shield).toBe(52);
  });
  it("stops all combat immediately when a blade strike reaches the winning score",()=>{
    let s=started("skirmish");s.tick=130;Object.assign(s.players[0],{zone:"ember",x:0,y:0,z:0,score:11,weapon:"blade"});const [victim,shooter]=s.npcs.filter((n:any)=>n.zone==="ember");
    Object.assign(victim,{x:0,y:0,z:3,hp:34,shield:0});Object.assign(shooter,{x:0,y:0,z:10,shotAt:0,role:"flanker",weapon:"pulse"});s.npcs=[victim,shooter];
    s=act(s,"a",{...input,fire:true});s=advance(s);expect(s.phase).toBe("over");const victory=s.events.findIndex((e:any)=>e.type==="victory");expect(s.events.slice(victory+1)).toEqual([]);expect(s.projectiles).toEqual([]);expect(s.players[0].score).toBe(12);
  });
  it("keeps return-to-fighter positions inside the flight boundaries",()=>{
    let s=started();s.npcs=[];s.tick=130;Object.assign(s.players[0],{x:0,y:0,z:-180,ship:{x:0,y:0,z:-180,yaw:0}});s=act(s,"a",{type:"interact",targetId:"own-ship:a"});s=advance(s,8);s=act(s,"a",{type:"interact",targetId:"exit:a"});expect(s.players[0].z).toBeGreaterThanOrEqual(-180);
  });
  it("uses facing for a dodge when the last movement input has expired",()=>{
    let s=started();s.npcs=[];Object.assign(s.players[0],{zone:"ember",x:0,y:0,z:0});s=act(s,"a",{...input,mx:1});s=advance(s,11);const before={x:s.players[0].x,z:s.players[0].z};s=act(s,"a",{type:"dash"});s=advance(s);expect(s.players[0].z).toBeGreaterThan(before.z);expect(s.players[0].x).toBeCloseTo(before.x);
  });

  it("completes twelve real PvP eliminations using only validated boarding, firing and reconstruction",()=>{
    let s=started("skirmish");s=act(s,"a",{type:"interact",targetId:"own-ship:a"});s=act(s,"a",{type:"equip",weapon:"lance"});s=act(s,"b",{type:"interact",targetId:"board:a"});
    while(s.phase==="playing"&&s.tick<2000){const [a,b]=s.players;s=act(s,"a",{...input,yaw:Math.atan2(b.x-a.x,b.z-a.z),fire:b.alive&&b.zone===a.zone});
      if(!b.alive){if(b.respawn<=0)s=act(s,"b",{type:"respawn"});}else if(b.zone==="space")s=act(s,"b",{type:"interact",targetId:"board:a"});else s=act(s,"b",{...input,mz:b.z<-9?1:0});s=advance(s);
    }
    expect(s.phase).toBe("over");expect(s.result.winner).toBe("a");expect(s.players[0]).toMatchObject({score:12,kills:12,deaths:0});expect(s.players[1].deaths).toBe(12);expect(s.npcs.every((n:any)=>n.alive)).toBe(true);expect(s.events.filter((e:any)=>e.type==="victory")).toHaveLength(1);expect(advance(s,20)).toEqual(s);
  });
  it("selects one winner and freezes the match when both final shots arrive in one tick",()=>{
    let s=started("skirmish");s.tick=130;s.npcs=[];for(const [i,p] of s.players.entries())Object.assign(p,{zone:"ship:a",x:0,y:0,z:i*8,hp:18,shield:0,score:11,hurtAt:130});
    s=act(s,"a",{...input,fire:true});s=act(s,"b",{...input,yaw:Math.PI,fire:true});s=advance(s);expect(s.phase).toBe("over");expect(s.events.filter((e:any)=>e.type==="victory")).toHaveLength(1);expect(s.players.map((p:any)=>p.score).sort()).toEqual([11,12]);expect(s.projectiles).toEqual([]);expect(advance(s,5)).toEqual(s);
  });

  it("applies guard presses and releases before melee regardless of seating order",()=>{
    for(const defender of ["a","b"])for(const held of [true,false]){let s=started("skirmish");s.npcs=[];s.tick=130;for(const [i,p] of s.players.entries())Object.assign(p,{zone:"ship:a",x:0,y:0,z:i*3});const attacker=defender==="a"?"b":"a";const d=s.players.find((p:any)=>p.id===defender);d.guard=!held;s.players.find((p:any)=>p.id===attacker).weapon="blade";
      s=act(s,defender,{...input,yaw:defender==="a"?0:Math.PI,guard:held});s=act(s,attacker,{...input,yaw:attacker==="a"?0:Math.PI,fire:true});s=advance(s);expect(s.players.find((p:any)=>p.id===defender).shield).toBeCloseTo(held?56.4:36);
    }
  });
  it("honours the final paid guard tick before energy depletion drops the brace",()=>{
    let s=started("skirmish");s.npcs=[];s.tick=130;Object.assign(s.players[0],{zone:"ship:a",x:0,y:0,z:0,energy:2});Object.assign(s.players[1],{zone:"ship:a",x:0,y:0,z:8});s=act(s,"a",{...input,guard:true});s=act(s,"b",{...input,yaw:Math.PI,fire:true});s=advance(s);expect(s.players[0]).toMatchObject({guard:true,energy:0});expect(s.players[0].shield).toBeCloseTo(62.8);s=advance(s);expect(s.players[0].guard).toBe(false);
  });

});
