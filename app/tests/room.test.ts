import {SELF,runInDurableObject,evictDurableObject} from "cloudflare:test";
import {env} from "cloudflare:workers";
import type {Env} from "../src/env";
import type {Room} from "../src/room";
import {parseClientMessage} from "../src/protocol";
import {describe,it,expect,vi} from "vitest";
async function open(room:string){
  const res=await SELF.fetch(`https://game.test/ws/${room}`,{headers:{Upgrade:"websocket"}});expect(res.status).toBe(101);const ws=res.webSocket!;ws.accept();const frames:any[]=[];
  ws.addEventListener("message",(event:MessageEvent)=>{if(typeof event.data==="string"&&event.data!=="__pong")frames.push(JSON.parse(event.data));});
  const next=async(pred:(f:any)=>boolean)=>{for(let i=0;i<150;i++){const index=frames.findIndex(pred);if(index!==-1)return frames.splice(index,1)[0];await scheduler.wait(10);}throw new Error(`timed out; ${JSON.stringify(frames).slice(0,1000)}`);};
  return {ws,frames,next,send:(m:unknown)=>ws.send(JSON.stringify(m)),state:()=>next(f=>f.type==="state"),error:()=>next(f=>f.type==="error"),action:(action:unknown)=>ws.send(JSON.stringify({type:"action",action}))};
}
const uniq=()=>`test-${crypto.randomUUID().slice(0,12)}`;
async function join(room:string,name="Pilot"){const c=await open(room);c.send({type:"join",name});const welcome=await c.next(f=>f.type==="welcome");const state=await c.state();return {...c,id:welcome.playerId,token:welcome.token,initial:state};}
async function ready(c:Awaited<ReturnType<typeof join>>){c.action({type:"ready",ready:true});await c.next(f=>f.type==="state"&&f.view.players.find((p:any)=>p.id===c.id)?.ready);}
describe("real Workers WebSockets",()=>{
  it("keeps lobby persistent and starts only after ready + host start",async()=>{const room=uniq();const a=await join(room,"Alpha"),b=await join(room,"Beta");expect(a.initial.status).toBe("lobby");expect(b.initial.view.players).toHaveLength(2);expect(b.initial.meta.game).toBe("Novaris: Fleet Vanguard");b.action({type:"start"});expect((await b.error()).error).toMatch(/host/);a.action({type:"start"});expect((await a.error()).error).toMatch(/ready/);await ready(a);await ready(b);a.action({type:"start"});const active=await a.next(f=>f.type==="state"&&f.status==="playing");expect(active.view.npcs).toHaveLength(15);await b.next(f=>f.type==="state"&&f.status==="playing");const tick=await a.next(f=>f.type==="state"&&f.view.tick>0);expect(tick.view.tick).toBeGreaterThan(0);a.ws.close();b.ws.close();});
  it("rejects impersonation and restores only the token holder's seat",async()=>{const room=uniq(),a=await join(room,"Alpha"),b=await join(room,"Beta");const thief=await open(room);thief.send({type:"join",playerId:a.id});expect((await thief.error()).error).toMatch(/token/);expect(JSON.stringify(b.initial)).not.toContain(a.token);a.ws.close();const again=await open(room);again.send({type:"join",playerId:a.id,token:a.token});expect((await again.next(f=>f.type==="welcome")).playerId).toBe(a.id);const restored=await again.state();expect(restored.seats).toEqual([a.id,b.id]);expect(restored.view.players.find((p:any)=>p.id===a.id).name).toBe("Alpha");again.ws.close();b.ws.close();thief.ws.close();});
  it("blocks server tick injection, malformed movement and nonhost resets",async()=>{const room=uniq(),a=await join(room),b=await join(room);await ready(a);await ready(b);a.action({type:"start"});await a.next(f=>f.type==="state"&&f.status==="playing");a.action({type:"tick"});expect((await a.error()).error).toMatch(/unknown action/);a.action({type:"input",mx:999,my:0,mz:0,yaw:0,pitch:0,fire:true,boost:false});expect((await a.error()).error).toMatch(/range/);b.send({type:"reset"});expect((await b.error()).error).toMatch(/host/);a.send({type:"reset"});const lobby=await a.next(f=>f.type==="state"&&f.status==="lobby"&&f.view.players.every((p:any)=>!p.ready));expect(lobby.view.tick).toBe(0);a.ws.close();b.ws.close();});
  it("broadcasts authoritative movement to two players and supports late joins",async()=>{const room=uniq(),a=await join(room);await ready(a);a.action({type:"start"});await a.next(f=>f.type==="state"&&f.status==="playing");const b=await join(room);expect(b.initial.status).toBe("playing");const old=b.initial.view.players.find((p:any)=>p.id===a.id).x;a.action({type:"input",mx:1,my:0,mz:0,yaw:0,pitch:0,fire:false,boost:false});const moved=await b.next(f=>f.type==="state"&&f.view.players.find((p:any)=>p.id===a.id).x>old);expect(moved.view.players).toHaveLength(2);a.ws.close();const left=await b.next(f=>f.type==="state"&&f.connected===1);expect(left.view.hostId).toBe(b.id);expect(left.view.players.find((p:any)=>p.id===a.id).connected).toBe(false);b.ws.close();});
  it("isolates rooms and rejects malformed frames before persistence",async()=>{const a=await join(uniq()),b=await join(uniq());expect(a.initial.seats).toEqual([a.id]);expect(b.initial.seats).toEqual([b.id]);a.ws.send("bad JSON");expect((await a.error()).error).toBe("invalid json");a.send({type:"action",action:{blob:"x".repeat(20000)}});expect((await a.error()).error).toBe("message too large");a.ws.close();b.ws.close();});
  it("caps rooms at six players",async()=>{const room=uniq(),all=[];for(let i=0;i<6;i++)all.push(await join(room));const extra=await open(room);extra.send({type:"join"});expect((await extra.error()).error).toMatch(/full/);for(const c of all)c.ws.close();extra.ws.close();});
  it("requires joining before actions and rejects nonupgrade websocket paths",async()=>{const c=await open(uniq());c.action({type:"ready",ready:true});expect((await c.error()).error).toBe("join first");c.ws.close();const res=await SELF.fetch("https://game.test/ws");expect(res.status).toBe(426);});
  it("migrates host after everyone leaves and does not let a stale token connection steal it",async()=>{
    const room=uniq(),a=await join(room,"Former host");a.ws.close();await scheduler.wait(30);const b=await join(room,"New host");expect(b.initial.view.hostId).toBe(b.id);await ready(b);b.action({type:"start"});await b.next(f=>f.type==="state"&&f.status==="playing");const old=await open(room);old.send({type:"join",playerId:a.id,token:a.token});await old.next(f=>f.type==="welcome");expect((await old.state()).view.hostId).toBe(b.id);old.ws.close();b.ws.close();
  });
  it("releases an offline seat in a full lobby and invalidates only its old token",async()=>{
    const room=uniq(),all=[];for(let i=0;i<6;i++)all.push(await join(room,"Pilot "+i));const host=all[0]!,gone=all[1]!,peer=all[2]!;
    host.action({type:"dismiss",playerId:peer.id});expect((await host.error()).error).toMatch(/offline/);
    gone.ws.close();await host.next(f=>f.type==="state"&&f.view.players.find((p:any)=>p.id===gone.id)?.connected===false);
    peer.action({type:"dismiss",playerId:gone.id});expect((await peer.error()).error).toMatch(/host/);
    host.action({type:"dismiss",playerId:gone.id});const state=await host.next(f=>f.type==="state"&&f.seats.length===5&&!f.seats.includes(gone.id));expect(state.seats).not.toContain(gone.id);
    const stale=await open(room);stale.send({type:"join",playerId:gone.id,token:gone.token});expect((await stale.error()).error).toBe("unknown reconnect identity");const replacement=await join(room,"Replacement");expect(replacement.initial.seats).toHaveLength(6);expect(replacement.id).not.toBe(gone.id);
    for(const c of all)c.ws.close();replacement.ws.close();stale.ws.close();
  });
  it("supersedes a socket on token reconnect without disconnecting the replacement",async()=>{
    const room=uniq(),a=await join(room),replacement=await open(room);replacement.send({type:"join",playerId:a.id,token:a.token});await replacement.next(f=>f.type==="welcome");const restored=await replacement.state();expect(restored.connected).toBe(1);await scheduler.wait(30);replacement.action({type:"ready",ready:true});expect((await replacement.next(f=>f.type==="state"&&f.view.players[0].ready)).view.players[0].connected).toBe(true);replacement.ws.close();
  });
  it("rate limits action floods without preventing later ordinary input",async()=>{
    const a=await join(uniq());for(let i=0;i<48;i++)a.action({type:"ready",ready:true});expect((await a.next(f=>f.type==="error"&&f.error==="too many messages")).error).toBe("too many messages");await scheduler.wait(1020);a.action({type:"ready",ready:false});expect((await a.next(f=>f.type==="state"&&f.view.players[0].ready===false)).status).toBe("lobby");a.ws.close();
  });

  it("completes the close handshake for both joined and unjoined sockets",async()=>{
    for(const joined of [false,true]){const c=joined?await join(uniq()):await open(uniq());let closed=false;c.ws.addEventListener("close",()=>{closed=true;});c.ws.close(1000,"Done");for(let attempt=0;attempt<20&&!closed;attempt++)await scheduler.wait(10);expect(closed).toBe(true);}
  });

  it("exposes a transient alarm failure and preserves the reconnectable room after reset",async()=>{
    const name=uniq(),a=await join(name,"Preserved pilot");const binding=(env as unknown as Env).ROOMS;const stub=binding.get(binding.idFromName(name));
    await expect(runInDurableObject(stub,async(instance)=>{
      const room=instance as Room;const load=vi.spyOn(room as any,"load").mockRejectedValueOnce(new Error("temporary storage failure"));const log=vi.spyOn(console,"error").mockImplementation(()=>{});
      try{await room.alarm();}finally{load.mockRestore();log.mockRestore();}
    })).rejects.toThrow("temporary storage failure");
    const newcomer=await join(name,"After reset");expect(newcomer.initial.view.hostId).toBe(newcomer.id);
    const replacement=await open(name);replacement.send({type:"join",playerId:a.id,token:a.token});expect((await replacement.next(f=>f.type==="welcome")).playerId).toBe(a.id);expect((await replacement.state()).view.players[0].name).toBe("Preserved pilot");a.ws.close();replacement.ws.close();newcomer.ws.close();
  });

  it("rejects deeply nested action frames without throwing inside the room gate",()=>{
    const raw='{"type":"action","action":{"x":'+"[".repeat(7900)+"0"+"]".repeat(7900)+'}}';expect(new TextEncoder().encode(raw).length).toBeLessThan(16384);expect(()=>parseClientMessage(raw)).not.toThrow();expect(parseClientMessage(raw).ok).toBe(false);
  });

  // Trusted fixture isolates an interaction race; no fixture is used by the complete live PvP checker.
  it("serializes simultaneous core claims so only one pilot receives the point",async()=>{
    const name=uniq(),a=await join(name),b=await join(name);await ready(a);await ready(b);a.action({type:"start"});await a.next(f=>f.type==="state"&&f.status==="playing");
    const binding=(env as unknown as Env).ROOMS;await runInDurableObject(binding.get(binding.idFromName(name)),async(_instance,ctx)=>{const game:any=await ctx.storage.get("game");game.state.npcs=[];for(const p of game.state.players)Object.assign(p,{zone:"ember",x:0,y:0,z:28});await ctx.storage.put("game",game);});
    a.action({type:"interact",targetId:"core:ember"});b.action({type:"interact",targetId:"core:ember"});const result=await a.next(f=>f.type==="state"&&f.view.objective.cores.includes("ember"));expect(result.view.objective.cores).toEqual(["ember"]);expect(result.view.players.reduce((n:number,p:any)=>n+p.score,0)).toBe(1);for(let i=0;i<30&&!a.frames.concat(b.frames).some(f=>f.type==="error");i++)await scheduler.wait(10);expect(a.frames.concat(b.frames).some(f=>f.type==="error"&&f.error.includes("not available"))).toBe(true);a.ws.close();b.ws.close();
  });
  // Trusted death fixture tests reconnect invariants without waiting for an unrelated combat sequence.
  it("keeps a defeated pilot dead and preserves the new host when reconnecting during combat",async()=>{
    const name=uniq(),a=await join(name),b=await join(name);await ready(a);await ready(b);a.action({type:"start"});await a.next(f=>f.type==="state"&&f.status==="playing");
    const binding=(env as unknown as Env).ROOMS;await runInDurableObject(binding.get(binding.idFromName(name)),async(_instance,ctx)=>{const game:any=await ctx.storage.get("game");const p=game.state.players.find((p:any)=>p.id===a.id);Object.assign(p,{alive:false,hp:0,shield:0,energy:17,deaths:1,score:3,deadAt:game.state.tick});await ctx.storage.put("game",game);});
    a.ws.close();await b.next(f=>f.type==="state"&&f.view.hostId===b.id);const restored=await open(name);restored.send({type:"join",playerId:a.id,token:a.token});await restored.next(f=>f.type==="welcome");const state=await restored.state();expect(state.status).toBe("playing");expect(state.view.hostId).toBe(b.id);expect(state.view.players.find((p:any)=>p.id===a.id)).toMatchObject({alive:false,hp:0,energy:17,deaths:1,score:3});restored.action({type:"respawn"});expect((await restored.error()).error).toMatch(/not ready/);b.ws.close();restored.ws.close();
  });
  it("caps simultaneous joins at six without issuing extra identities",async()=>{
    const name=uniq(),clients=await Promise.all(Array.from({length:10},()=>open(name)));for(const c of clients)c.send({type:"join"});const results=await Promise.all(clients.map(c=>c.next(f=>f.type==="welcome"||f.type==="error")));expect(results.filter(f=>f.type==="welcome")).toHaveLength(6);expect(results.filter(f=>f.type==="error"&&f.error.includes("full"))).toHaveLength(4);for(const c of clients)c.ws.close();
  });
  it("bounds unjoined sockets and frees capacity without interrupting the joined host",async()=>{
    const name=uniq(),a=await join(name),idle=[];for(let i=0;i<23;i++)idle.push(await open(name));const blocked=await SELF.fetch(`https://game.test/ws/${name}`,{headers:{Upgrade:"websocket"}});expect(blocked.status).toBe(429);idle[0]!.ws.close();await scheduler.wait(30);const admitted=await open(name);await ready(a);for(const c of idle)c.ws.close();admitted.ws.close();a.ws.close();
  });
  it("rejects binary, oversized actions and nested payloads while a room remains usable",async()=>{
    const a=await join(uniq());a.ws.send(new Uint8Array([1,2,3]));expect((await a.error()).error).toBe("expected a text frame");a.action({type:"ready",ready:true,extra:"x".repeat(5000)});expect((await a.error()).error).toBe("action too large");a.ws.send('{"type":"action","action":{"x":'+"[".repeat(7900)+"0"+"]".repeat(7900)+'}}');expect((await a.error()).error).toBe("action too large");await ready(a);a.ws.close();
  });

  it("preserves live socket identities and host ownership across hibernation",async()=>{
    const name=uniq(),a=await join(name),b=await join(name);await ready(a);const binding=(env as unknown as Env).ROOMS;await evictDurableObject(binding.get(binding.idFromName(name)));await ready(b);a.action({type:"start"});const state=await b.next(f=>f.type==="state"&&f.status==="playing");expect(state.connected).toBe(2);expect(state.view.hostId).toBe(a.id);expect(state.view.players.every((p:any)=>p.connected)).toBe(true);a.ws.close();b.ws.close();
  });

});
