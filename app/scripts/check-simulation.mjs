/** Deterministic whole-route play check using only normal validated actions.
 * No player, enemy, health, position or objective state is injected.
 * The trusted server clock is accelerated; this is not a network/latency test.
 * Run: node app/scripts/check-simulation.mjs
 */
import assert from "node:assert/strict";
import * as rules from "../src/logic.js";
const neutral={type:"input",mx:0,my:0,mz:0,yaw:0,pitch:0,fire:false,boost:false};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
let state;
function action(c,a){const result=rules.validateAction(state,c.id,a);assert(result.ok,JSON.stringify({id:c.id,action:a,result}));state=rules.applyAction(state,c.id,a);}
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
const reports=[];
for(const [mode,count] of [["expedition",1],["expedition",2],["expedition",6],["skirmish",1]]){
  const bots=Array.from({length:count},(_,i)=>({id:`pilot${i}`,lastInteract:-99,view:null}));
  state=rules.setup(bots.map(b=>b.id));action(bots[0],{type:"configure",mode});
  for(const bot of bots)action(bot,{type:"ready",ready:true});action(bots[0],{type:"start"});
  while(state.phase==="playing"&&state.tick<8000){
    for(const bot of bots){if(state.phase!=="playing")break;bot.view=rules.viewFor(state,bot.id);pilot(bot);}
    state=rules.applyAction(state,"@system",{type:"tick"});
  }
  assert.equal(state.phase,"over",`${mode}/${count} did not finish: ${JSON.stringify({tick:state.tick,cores:state.objective.cores,players:state.players.map(p=>({zone:p.zone,hp:p.hp,score:p.score}))})}`);
  if(mode==="expedition"){assert.equal(state.result.winner,"team");assert.deepEqual(state.objective.cores,["ember","veil","dreadnought"]);}
  else assert(state.players.some(p=>p.score>=12));
  reports.push({mode,players:count,ticks:state.tick,simulatedSeconds:state.tick/10,cores:state.objective.cores,winner:state.result.winner,kills:state.players.reduce((n,p)=>n+p.kills,0),deaths:state.players.reduce((n,p)=>n+p.deaths,0)});
}
console.log(JSON.stringify({passed:true,method:"validated inputs with accelerated authoritative clock",runs:reports},null,2));
