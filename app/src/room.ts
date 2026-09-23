/** Persisted room identities, hibernating sockets and a trusted 10Hz simulation. */
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import * as logic from "./logic.js";
import { parseClientMessage } from "./protocol";
interface StateShape {phase:"lobby"|"playing"|"over";hostId:string|null;players:{id:string;name:string;connected:boolean}[];}
interface Game {status:"lobby"|"playing"|"over";seats:string[];state:unknown;result:unknown;tokens:Record<string,string>;}
type Conns=Record<string,string>;
interface Out {to:string|string[];data:unknown;}
type Dispatchable=Out[]|{out?:Out[];wakeIn?:number|null}|void;
export function freshGame():Game{return {status:"lobby",seats:[],state:logic.setup([]),result:null,tokens:{}};}
export function resolveMeta(raw:unknown):{game:string;minPlayers:number;maxPlayers:number}{
  const m=(raw??{}) as Record<string,unknown>;const p=Array.isArray(m.players)?m.players:[];
  const valid=(v:unknown,f:number)=>Number.isInteger(v)&&(v as number)>=1?v as number:f;
  const minPlayers=valid(m.minPlayers,valid(p[0],1));const maxPlayers=Math.max(minPlayers,valid(m.maxPlayers,valid(p[1],minPlayers)));
  const name=[m.game,m.name,m.title].find((v):v is string=>typeof v==="string"&&!!v.trim());return {game:name??"Game",minPlayers,maxPlayers};
}
const META=resolveMeta(logic.meta);
export class Room extends DurableObject<Env>{
  constructor(ctx:DurableObjectState,env:Env){super(ctx,env);ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("__ping","__pong"));}
  private async load():Promise<{game:Game;conns:Conns;reconciled:boolean}>{
    const [storedGame,storedConns]=await Promise.all([this.ctx.storage.get<Game>("game"),this.ctx.storage.get<Conns>("conns")]);const game=storedGame??freshGame(),conns=storedConns??{};
    // An object failure can close sockets without delivering their close handlers.
    // Hibernating live sockets remain in this inventory, so their seats stay intact.
    const live=new Set(this.ctx.getWebSockets().filter(ws=>ws.readyState===WebSocket.OPEN).map(ws=>this.connIdOf(ws)));const stale=new Set<string>();
    for(const [connId,id] of Object.entries(conns))if(!live.has(connId)){stale.add(id);delete conns[connId];}
    for(const id of stale)if(!Object.values(conns).includes(id))game.state=logic.applyAction(game.state,"@system",{type:"disconnect",id});
    const reconciled=stale.size>0;if(reconciled)await this.save(game,conns);return {game,conns,reconciled};
  }
  private async save(game:Game,conns:Conns):Promise<void>{await this.ctx.storage.put({game,conns});}
  private shape(game:Game):StateShape{return game.state as StateShape;}
  private sync(game:Game):void{game.status=this.shape(game).phase;const end=logic.isGameOver(game.state);game.result=end.over?end:null;}
  private broadcast(game:Game,conns:Conns):Out[]{return Object.entries(conns).map(([connId,id])=>({to:connId,data:{type:"state",status:game.status,seats:game.seats,you:id,connected:new Set(Object.values(conns)).size,view:logic.viewFor(game.state,id),result:game.result,meta:META}}));}
  private error(id:string,error:string):Out[]{return [{to:id,data:{type:"error",error}}];}
  override async fetch(request:Request):Promise<Response>{
    if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return new Response("expected a websocket upgrade",{status:426});
    if(this.ctx.getWebSockets().length>=24)return new Response("room connection limit reached",{status:429});
    const pair=new WebSocketPair();const server=pair[1]!;this.ctx.acceptWebSocket(server);server.serializeAttachment({connId:crypto.randomUUID(),windowAt:0,count:0});return new Response(null,{status:101,webSocket:pair[0]});
  }
  private connIdOf(ws:WebSocket):string|undefined{return (ws.deserializeAttachment() as {connId?:string}|null)?.connId;}
  override async webSocketMessage(ws:WebSocket,raw:string|ArrayBuffer):Promise<void>{
    const att=ws.deserializeAttachment() as {connId?:string;windowAt:number;count:number}|null;if(!att?.connId)return;
    const now=Date.now();if(now-att.windowAt>1000){att.windowAt=now;att.count=0;}att.count++;ws.serializeAttachment(att);if(att.count>45){if(att.count===46)ws.send(JSON.stringify({type:"error",error:"too many messages"}));return;}
    try{await this.ctx.blockConcurrencyWhile(async()=>{await this.dispatch(await this.onMessage(att.connId!,raw));});}catch(error){console.error("room message failed",error);try{ws.send(JSON.stringify({type:"error",error:"server error"}));}catch{/* closed */}}
  }
  override async webSocketClose(ws:WebSocket):Promise<void>{
    // Required with the deployed 2025 compatibility date; complete the close handshake.
    try{ws.close(1000,"Room connection closed");}catch{/* Already closed or errored. */}
    const connId=this.connIdOf(ws);if(!connId)return;
    await this.ctx.blockConcurrencyWhile(async()=>{const {game,conns,reconciled}=await this.load();const playerId=conns[connId];if(!playerId&&!reconciled)return;if(playerId){delete conns[connId];if(!Object.values(conns).includes(playerId))game.state=logic.applyAction(game.state,"@system",{type:"disconnect",id:playerId});}await this.save(game,conns);await this.dispatch({out:this.broadcast(game,conns),...(!Object.keys(conns).length?{wakeIn:null}:{})});});
  }
  override async webSocketError(ws:WebSocket):Promise<void>{await this.webSocketClose(ws);}
  override async alarm():Promise<void>{
    try{await this.ctx.blockConcurrencyWhile(async()=>{const {game,conns}=await this.load();if(game.status!=="playing"||!Object.keys(conns).length){await this.ctx.storage.deleteAlarm();return;}game.state=logic.applyAction(game.state,"@system",{type:"tick"});this.sync(game);await this.save(game,conns);await this.dispatch({out:this.broadcast(game,conns),wakeIn:game.status==="playing"?100:null});});}catch(error){console.error("room alarm failed",error);}
  }
  private async onMessage(connId:string,raw:string|ArrayBuffer):Promise<Dispatchable>{
    const parsed=parseClientMessage(raw);if(!parsed.ok)return this.error(connId,parsed.error);const msg=parsed.msg;const {game,conns}=await this.load();
    if(msg.type==="join"){
      if(conns[connId])return this.error(connId,"already joined");
      let id=msg.playerId;
      if(id&&Object.prototype.hasOwnProperty.call(game.tokens,id)){
        if(!msg.token||game.tokens[id]!==msg.token)return this.error(connId,"reconnect token required for that pilot");
        for(const [old,owner] of Object.entries(conns))if(owner===id){delete conns[old];for(const sock of this.ctx.getWebSockets())if(this.connIdOf(sock)===old)sock.close(1000,"reconnected elsewhere");}
        game.state=logic.applyAction(game.state,"@system",{type:"reconnect",id});
      }else{
        if(msg.token)return this.error(connId,"unknown reconnect identity");
        if(game.seats.length>=META.maxPlayers)return this.error(connId,"room is full (6 pilots)");
        id=`p-${crypto.randomUUID().slice(0,12)}`;game.tokens[id]=crypto.randomUUID();game.seats.push(id);game.state=logic.applyAction(game.state,"@system",{type:"add",id,name:msg.name});
      }
      conns[connId]=id;this.sync(game);await this.save(game,conns);
      const out:Out[]=[{to:connId,data:{type:"welcome",playerId:id,token:game.tokens[id]}},...this.broadcast(game,conns)];
      if(game.status==="playing"&&(await this.ctx.storage.getAlarm())===null)return {out,wakeIn:100};return out;
    }
    const id=conns[connId];if(!id)return this.error(connId,"join first");
    if(msg.type==="reset"){
      if(id!==this.shape(game).hostId)return this.error(connId,"only the host can return everyone to the lobby");
      game.state=logic.applyAction(game.state,"@system",{type:"reset"});this.sync(game);await this.save(game,conns);return {out:this.broadcast(game,conns),wakeIn:null};
    }
    const verdict=logic.validateAction(game.state,id,msg.action);if(!verdict.ok)return this.error(connId,verdict.error??"invalid action");
    const action=msg.action as {type?:string;playerId?:string};
    if(action.type==="dismiss"&&Object.values(conns).includes(action.playerId??""))return this.error(connId,"pilot is still connected");
    game.state=logic.applyAction(game.state,id,msg.action);
    if(action.type==="dismiss"&&action.playerId){game.seats=game.seats.filter(seat=>seat!==action.playerId);delete game.tokens[action.playerId];}
    this.sync(game);await this.save(game,conns);
    const input=(msg.action as {type?:string}).type==="input";const out=input?[]:this.broadcast(game,conns);
    if(game.status==="playing"&&(await this.ctx.storage.getAlarm())===null)return {out,wakeIn:100};
    return game.status==="over"?{out,wakeIn:null}:out;
  }
  private async dispatch(res:Dispatchable):Promise<void>{
    if(!res)return;const msgs=Array.isArray(res)?res:res.out??[];const wakeIn=Array.isArray(res)?undefined:res.wakeIn;
    const sockets=this.ctx.getWebSockets();const byId=new Map<string,WebSocket>();for(const ws of sockets){const id=this.connIdOf(ws);if(id)byId.set(id,ws);}
    for(const msg of msgs){const data=JSON.stringify(msg.data);const targets=msg.to==="*"?sockets:(Array.isArray(msg.to)?msg.to:[msg.to]).map(id=>byId.get(id)).filter((s):s is WebSocket=>!!s);for(const target of targets)try{target.send(data);}catch{/* close handler cleans up */}}
    if(wakeIn===null)await this.ctx.storage.deleteAlarm();else if(typeof wakeIn==="number")await this.ctx.storage.setAlarm(Date.now()+wakeIn);
  }
}
