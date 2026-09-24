import {SCORES,scheduleScore,scoreKey} from './audio-score.js?v=13';
import {playEffect} from './audio-effects.js?v=10';
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(v))?Number(v):lo));
const hz=n=>440*2**((n-69)/12);
/** Original adaptive score and effects. No sound or context exists before unlock(). */
export class AudioEngine {
 constructor(){this.context=null;this.scene='menu';this.musicVolume=.32;this.sfxVolume=.65;this.muted=false;this.destroyed=false;this.visible=true;this.reducedMotion=false;this.intensity=0;this.musicVoices=new Set();this.effectVoices=new Set();this.cooldowns=new Map();this.timer=null;this.epoch=0;this.stage=null;this.score=scoreKey(this.scene);this.transport=null;this.pendingScore=null;this.pendingStep=0;this.titleTransition=null;this.motion=null;this.motionTimer=null;this.nextStep=0;this.stepSide=0;}
 async unlock(){if(this.destroyed||!this.visible)return false;try{if(!this.context){const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)return false;this._initialize(new Context());}if(this.context.state!=='running')await this.context.resume();if(!this.timer&&this.context.state==='running')this._startScore();return this.context.state==='running';}catch{return false;}}
 _initialize(c){
  this.context=c;c.addEventListener('statechange',()=>{if(this.destroyed||this.context!==c)return;if(c.state==='running'){if(!this.visible)c.suspend().catch(()=>{});else if(!this.timer)this._startScore();}else if(c.state==='suspended'||c.state==='interrupted'){this._silence();}});this.musicBus=c.createGain();this.effectsBus=c.createGain();this.master=c.createGain();this.limiter=c.createDynamicsCompressor();
  this.musicBus.gain.value=this.musicVolume*2.8;this.effectsBus.gain.value=this.sfxVolume;this.master.gain.value=this.muted?0:.64;
  this.limiter.threshold.value=-10;this.limiter.knee.value=10;this.limiter.ratio.value=12;this.limiter.attack.value=.003;this.limiter.release.value=.18;
  const ceiling=c.createWaveShaper(),curve=new Float32Array(4096);for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=.74*Math.tanh(x/.74);}ceiling.curve=curve;ceiling.oversample='2x';this.ceiling=ceiling;
  this.musicBus.connect(this.limiter);this.effectsBus.connect(this.limiter);this.limiter.connect(ceiling);ceiling.connect(this.master);this.master.connect(c.destination);
  let seed=17071984;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);let brown=0;const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++){const white=random()*2-1;brown=(brown+white*.04)/1.018;data[i]=white*.55+brown*1.2;}
  this.impulse=c.createBuffer(2,Math.floor(c.sampleRate*1.8),c.sampleRate);for(let ch=0;ch<2;ch++){const d=this.impulse.getChannelData(ch);let previous=0;for(let i=0;i<d.length;i++){previous=previous*.52+(random()*2-1)*.48;d[i]=previous*(1-i/d.length)**2.8*.46;}}
  this.musicImpulse=c.createBuffer(2,Math.floor(c.sampleRate*3.2),c.sampleRate);for(let ch=0;ch<2;ch++){const d=this.musicImpulse.getChannelData(ch);let soft=0;for(let i=0;i<d.length;i++){soft=soft*.76+(random()*2-1)*.24;const at=i/c.sampleRate;d[i]=at<.035?0:soft*Math.exp(-at*2.1)*.72;}}
  this.fxReverb=c.createConvolver();this.fxReverb.buffer=this.impulse;this.fxReturn=c.createGain();this.fxReturn.gain.value=.2;this.fxReverb.connect(this.fxReturn);this.fxReturn.connect(this.effectsBus);
  this.waves={};for(const [name,partials]of Object.entries({strings:[0,1,.32,.23,.11,.07,.04,.025],horn:[0,1,.43,.26,.14,.06,.015],pulse:[0,1,.12,.34,.07,.16,.025,.05],wood:[0,1,.18,.055,.012],bow:[0,1,.43,.27,.19,.1,.055,.033,.016],reed:[0,1,.23,.075,.022,.008]})){const re=new Float32Array(partials.length),im=Float32Array.from(partials);this.waves[name]=c.createPeriodicWave(re,im);}
 }
 setMusicVolume(v){this.musicVolume=clamp(v);if(this.context)this.musicBus.gain.setTargetAtTime(this.musicVolume*2.8,this.context.currentTime,.04);}
 setSfxVolume(v){this.sfxVolume=clamp(v);if(this.context)this.effectsBus.gain.setTargetAtTime(this.sfxVolume,this.context.currentTime,.04);}
 setMuted(v){this.muted=!!v;if(this.context)this.master.gain.setTargetAtTime(this.muted?0:.64,this.context.currentTime,.03);}
 async setVisibility(visible){this.visible=!!visible;const c=this.context;if(!c||this.destroyed)return false;if(!this.visible){this._silence();try{await c.suspend();}catch{}return false;}try{await c.resume();if(c.state==='running'&&!this.timer)this._startScore();return c.state==='running';}catch{return false;}}
 _silence(){this._stopScore();this._stopMotion();for(const voice of [...this.effectVoices])voice.stop();if(this.fxReverb){try{this.fxReverb.disconnect();}catch{}if(this.context&&!this.destroyed){this.fxReverb=this.context.createConvolver();this.fxReverb.buffer=this.impulse;this.fxReverb.connect(this.fxReturn);}}}
 setReducedMotion(v){this.reducedMotion=!!v;}
 setIntensity(v){this.intensity=clamp(v);}
 setScene(name){
  const next=Object.hasOwn(SCORES,name)?name:(name==='dreadnought'||name?.startsWith('ship:')?'interior':'menu'),key=scoreKey(next);this.scene=next;
  if(!this.context||this.context.state!=='running'||!this.timer){this.score=key;this.pendingScore=null;if(this.context?.state==='running'&&!this.destroyed&&this.visible)this._startScore();return;}
  if(key===this.score){if(this.pendingScore){if(this.titleTransition){clearTimeout(this.titleTransition.timer);this.titleTransition=null;}this.pendingScore=null;const g=this.stage.dry.gain,t=this.context.currentTime;if(g.cancelAndHoldAtTime)g.cancelAndHoldAtTime(t);else{g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);}g.linearRampToValueAtTime(1,t+.35);}return;}
  if(key===this.pendingScore)return;if(this.score==='title'){this.pendingScore=key;if(!this.titleTransition)this._fadeTitle();return;}this.pendingScore=key;this.pendingStep=Math.ceil((this.transport.step+1)/128)*128;this._scheduleHandoff();
 }
 // The title is a separate arrangement. Its outgoing stage is fully silent and retired
 // before the introductory stage starts; repeated BEGIN requests cannot stack decks.
 _fadeTitle(){
  const c=this.context,g=this.stage.dry.gain,now=c.currentTime,transition={epoch:this.epoch,at:now+.55,timer:null};this.titleTransition=transition;
  if(g.cancelAndHoldAtTime)g.cancelAndHoldAtTime(now);else{g.cancelScheduledValues(now);g.setValueAtTime(g.value,now);}g.linearRampToValueAtTime(0,transition.at);
  const finish=()=>{if(this.titleTransition!==transition||this.destroyed||this.epoch!==transition.epoch)return;if(!this.visible||c.state!=='running'){this._stopScore();return;}const remaining=transition.at-c.currentTime;if(remaining>0){transition.timer=setTimeout(finish,Math.max(10,Math.min(50,remaining*1000)));return;}const next=this.pendingScore||scoreKey(this.scene);this._stopScore();this.score=next;this._newStage();this.stage.dry.gain.setValueAtTime(0,c.currentTime);this.stage.dry.gain.linearRampToValueAtTime(1,c.currentTime+1.15);this._startScore();};
  transition.timer=setTimeout(finish,550);
 }
 _scheduleHandoff(){
  if(!this.pendingScore||this.titleTransition||!this.transport||!this.stage)return;const c=this.context,tr=this.transport,b=60/SCORES[this.score].bpm,t=tr.nextTime+(this.pendingStep-tr.step)*b/4,g=this.stage.dry.gain,now=c.currentTime;
  if(g.cancelAndHoldAtTime)g.cancelAndHoldAtTime(now);else{g.cancelScheduledValues(now);g.setValueAtTime(g.value,now);}g.setValueAtTime(1,Math.max(now,t-.85));g.linearRampToValueAtTime(.00001,t);g.linearRampToValueAtTime(1,t+1.05);
 }
 _stopScore(){if(this.titleTransition){clearTimeout(this.titleTransition.timer);this.titleTransition=null;}this.epoch++;if(this.timer)clearTimeout(this.timer);this.timer=null;this.transport=null;this.pendingScore=null;this.score=scoreKey(this.scene);for(const voice of [...this.musicVoices])voice.stop();if(this.stage){for(const node of this.stage.nodes)try{node.disconnect();}catch{}this.stage=null;}}
 _newStage(){const c=this.context,dry=c.createGain(),verb=c.createConvolver(),wet=c.createGain(),echo=c.createDelay(1),echoGain=c.createGain(),feedback=c.createGain(),filter=c.createBiquadFilter();const mythic=this.score==='mythic'||this.score==='title';verb.buffer=mythic?this.musicImpulse:this.impulse;wet.gain.value=mythic?.3:.27;echo.delayTime.value=60/SCORES[this.score].bpm*.75;echoGain.gain.value=mythic?.075:.11;feedback.gain.value=mythic?.14:.18;filter.type='lowpass';filter.frequency.value=mythic?1800:2200;dry.connect(this.musicBus);verb.connect(wet);wet.connect(dry);echo.connect(filter);filter.connect(echoGain);echoGain.connect(dry);filter.connect(feedback);feedback.connect(echo);this.stage={dry,verb,echo,wet,echoGain,feedback,filter,mythic,nodes:[dry,verb,wet,echo,echoGain,feedback,filter]};}
 _stageColor(score,at){const stage=this.stage,mythic=score==='mythic'||score==='title';if(stage.mythic===mythic)return;stage.mythic=mythic;stage.verb.buffer=mythic?this.musicImpulse:this.impulse;stage.wet.gain.setValueAtTime(mythic?.3:.27,at);stage.echoGain.gain.setValueAtTime(mythic?.075:.11,at);stage.feedback.gain.setValueAtTime(mythic?.14:.18,at);stage.filter.frequency.setValueAtTime(mythic?1800:2200,at);}
 _startScore(){
  if(!this.context||this.destroyed||!this.visible)return;if(!this.stage)this._newStage();const c=this.context,epoch=++this.epoch;this.transport={step:0,scoreStart:0,nextTime:c.currentTime+.045};
  const tick=()=>{if(this.destroyed||epoch!==this.epoch)return;const tr=this.transport;if(c.state==='running'){
   if(tr.nextTime<c.currentTime-.25){tr.nextTime=c.currentTime+.025;this._scheduleHandoff();}
   while(tr.nextTime<c.currentTime+.17){
    if(this.pendingScore&&!this.titleTransition&&tr.step>=this.pendingStep){for(const v of [...this.musicVoices])v.endAt(tr.nextTime);this.score=this.pendingScore;this.pendingScore=null;tr.scoreStart=tr.step;this.stage.echo.delayTime.setValueAtTime(60/SCORES[this.score].bpm*.75,tr.nextTime);this._stageColor(this.score,tr.nextTime);}
    scheduleScore(this,this.score,tr.step-tr.scoreStart,tr.nextTime,this.intensity*(this.reducedMotion?.7:1));tr.step++;tr.nextTime+=60/SCORES[this.score].bpm/4;
   }
  }this.timer=setTimeout(tick,c.state==='running'?55:160);};tick();
 }
 _voice(source,length,volume,time,channel,options={}){
  const c=this.context;if(!c||this.destroyed)return null;const pool=channel==='music'?this.musicVoices:this.effectVoices;if(pool.size>=(channel==='music'?112:80))pool.values().next().value.stop();
  const gain=c.createGain(),filter=c.createBiquadFilter(),pan=c.createStereoPanner(),wet=c.createGain();filter.type=options.bandpass?'bandpass':options.highpass?'highpass':'lowpass';filter.frequency.value=options.bandpass||options.highpass||options.cutoff||14000;filter.Q.value=options.q??.65;pan.pan.value=clamp(options.pan??0,-1,1)*(this.reducedMotion?.6:1);
  source.connect(filter);filter.connect(gain);gain.connect(pan);const stage=channel==='music'?this.stage:null,bus=stage?.dry||(channel==='music'?this.musicBus:this.effectsBus);pan.connect(bus);wet.gain.value=clamp(options.wet??(channel==='music'?.25:.12));pan.connect(wet);wet.connect(stage?.verb||this.fxReverb);if(stage?.echo&&options.echo)pan.connect(stage.echo);
  const a=Math.min(options.attack??.005,length*.4),hold=Math.min(.8,options.hold??.18),release=Math.min(options.release??length*.5,length-a),peak=Math.max(.00001,volume);gain.gain.setValueAtTime(.00001,time);gain.gain.exponentialRampToValueAtTime(peak,time+a);gain.gain.exponentialRampToValueAtTime(Math.max(.00001,peak*(options.sustain??.55)),time+Math.max(a,length-release));gain.gain.exponentialRampToValueAtTime(.00001,time+length);
  if(hold>.3)gain.gain.setValueAtTime(peak*.7,time+a+(length-a-release)*hold);
  let ended=false;const voice={endAt:at=>{if(ended)return;try{source.stop(at);}catch{}},stop:()=>{if(ended)return;ended=true;try{source.stop();}catch{}for(const node of [source,filter,gain,pan,wet,...(options.nodes||[])])try{node.disconnect();}catch{}for(const node of options.stoppables||[])try{node.stop();}catch{}pool.delete(voice);}};
  source.onended=voice.stop;pool.add(voice);source.start(time);source.stop(time+length+.02);return voice;
 }
 _tone(frequency,length,volume,type='sine',time=0,channel='effect',options={}){
  if(!this.context)return;const c=this.context,s=c.createOscillator(),nodes=[...(options.nodes||[])],stoppables=[...(options.stoppables||[])];if(this.waves[type])s.setPeriodicWave(this.waves[type]);else s.type=type;const f=Math.max(16,frequency);s.frequency.setValueAtTime(f*(options.bendFrom||1),time);if(options.bendFrom)s.frequency.exponentialRampToValueAtTime(f,time+Math.min(.28,length*.22));if(options.to)s.frequency.exponentialRampToValueAtTime(Math.max(16,options.to),time+length*.9);s.detune.value=options.detune||0;
  if(options.vibrato){const lfo=c.createOscillator(),depth=c.createGain();lfo.frequency.value=options.vibrato;depth.gain.setValueAtTime(0,time);depth.gain.linearRampToValueAtTime(options.vibratoDepth??8,time+Math.min(.5,length*.35));lfo.connect(depth);depth.connect(s.detune);lfo.start(time);nodes.push(lfo,depth);stoppables.push(lfo);}
  return this._voice(s,length,volume,time,channel,{...options,nodes,stoppables});
 }
 _noise(length,volume,time,channel='effect',options={}){if(!this.context)return;const s=this.context.createBufferSource();s.buffer=this.noise;s.loop=true;s.playbackRate.value=options.rate||1;return this._voice(s,length,volume,time,channel,options);}
 _instrument(name,note,time,length,volume,opts={}){
  const f=hz(note),ch=opts.channel||'music',tone=(ratio,d,v,type='sine',extra={})=>this._tone(f*ratio,d,volume*v,type,time,ch,{...opts,...extra}),noise=(d,v,extra={})=>this._noise(d,volume*v,time,ch,{...opts,...extra});
  if(name==='guqin'||name==='pipa'){const bright=name==='pipa';tone(1,length,1,'wood',{attack:.003,cutoff:bright?3400:1800,release:length*.78,echo:true});tone(2.003,length*.58,.22,'sine');tone(3.01,length*.34,.085,'sine');tone(5.17,length*.16,.027,'sine');noise(.025,.10,{highpass:1600,wet:.04});}
  else if(name==='erhu'){tone(1,length,1,'bow',{attack:.18,release:.38,cutoff:1350,vibrato:5.4,vibratoDepth:13,bendFrom:.985});tone(1.003,length,.12,'sine',{attack:.23,release:.4});noise(length*.9,.035,{bandpass:1750,q:.8,attack:.2,release:.3});}
  else if(name==='dizi'){tone(1,length,1,'reed',{attack:.12,release:.3,cutoff:3600,vibrato:5.8,vibratoDepth:7,bendFrom:.994});tone(2,length*.92,.075,'sine',{attack:.16,release:.3});noise(length*.9,.13,{bandpass:Math.min(4200,f*2.6),q:.72,attack:.18,release:.35});}
  else if(name==='ceremonial'){tone(1,length,.9,'sine',{to:f*.82,attack:.007,cutoff:450,release:length*.85});tone(1.57,length*.65,.28,'sine',{to:f*1.49});tone(2.19,length*.28,.09,'sine');noise(.14,.28,{cutoff:950,wet:.16});}
  else if(name==='gong'){for(const [ratio,amp,decay]of[[1,1,1],[1.414,.31,.86],[1.932,.18,.65],[2.54,.10,.5],[3.33,.06,.36],[5.1,.025,.2]])tone(ratio,length*decay,amp,'sine',{attack:.025,release:length*decay*.84,cutoff:4000});noise(.12,.08,{bandpass:1600,q:.7});}
  else if(name==='pluck'){tone(1,length,1,'wood',{attack:.002,cutoff:3800,echo:true});tone(2.005,length*.42,.2,'sine');tone(3,length*.25,.07,'sine');noise(.035,.14,{highpass:1800,wet:.05});}
  else if(name==='glass'||name==='bell'){tone(1,length,1,'sine',{attack:.008});tone(2.756,length*.65,.15,'sine');tone(4.08,length*.38,.055,'sine');}
  else if(name==='taiko'){tone(1,.42,.9,'sine',{to:f*.53,attack:.003,cutoff:500,wet:.22});tone(1.59,.25,.32,'sine',{to:f*.82});noise(.075,.35,{cutoff:1300,wet:.07});}
  else if(name==='rim'){tone(1,.1,.32,'triangle',{cutoff:2500});tone(2.31,.08,.21,'sine');noise(.11,.5,{bandpass:2000,q:1.4});}
  else if(name==='shaker')noise(.07,1,{highpass:5100,rate:1.5,attack:.002});
  else if(name==='cello'||name==='horn'){tone(1,length,1,name==='horn'?'horn':'strings',{attack:.13,hold:.65,release:.28,cutoff:name==='horn'?1200:760});tone(1.004,length,.25,'sine',{attack:.18});}
 }
 setMotion(state={}){
  const c=this.context;if(!c||this.destroyed||!this.visible)return;const active=state.alive!==false&&!!state.moving,space=state.zone==='space',speed=clamp(state.speed??(state.boosting?1:.45),0,60),boost=!!state.boosting;
  if(active&&space&&c.state==='running'){
   if(this.motionTimer){clearTimeout(this.motionTimer);this.motionTimer=null;}if(!this.motion)this._createMotion();const m=this.motion,t=c.currentTime,power=boost?1:Math.max(.25,speed>1?speed/48:speed);m.gain.gain.setTargetAtTime((.026+power*.055)*(this.reducedMotion?.8:1),t,.16);m.filter.frequency.setTargetAtTime(380+power*1100,t,.23);m.low.frequency.setTargetAtTime(38+power*27,t,.2);m.high.frequency.setTargetAtTime(76+power*59,t,.22);
  }else if(this.motion){this.motion.gain.gain.setTargetAtTime(0,c.currentTime,.14);if(!this.motionTimer)this.motionTimer=setTimeout(()=>{this._stopMotion();},850);}
  if(active&&!space&&(state.speed==null||speed>.4)&&state.grounded!==false&&c.state==='running'&&c.currentTime>=this.nextStep){const pace=speed>1?clamp(3.5/speed,.22,.85):(boost?.24:.39);this.nextStep=c.currentTime+pace;this.stepSide^=1;this.sfx('footstep',{surface:state.surface||(state.zone==='veil'?'moss':state.zone==='ember'?'gravel':'metal'),volume:boost?.65:.48,pan:this.stepSide?.13:-.13,pitch:this.stepSide?1.025:.975});}
 }
 _createMotion(){const c=this.context,gain=c.createGain(),filter=c.createBiquadFilter(),low=c.createOscillator(),high=c.createOscillator(),noise=c.createBufferSource(),noiseGain=c.createGain();gain.gain.value=0;filter.type='lowpass';filter.frequency.value=450;low.type='triangle';high.type='sine';low.frequency.value=45;high.frequency.value=89;noise.buffer=this.noise;noise.loop=true;noise.playbackRate.value=.55;noiseGain.gain.value=.28;low.connect(filter);high.connect(filter);noise.connect(noiseGain);noiseGain.connect(filter);filter.connect(gain);gain.connect(this.effectsBus);low.start();high.start();noise.start();this.motion={gain,filter,low,high,noise,noiseGain};}
 _stopMotion(){if(this.motionTimer)clearTimeout(this.motionTimer);this.motionTimer=null;if(!this.motion)return;for(const k of ['low','high','noise'])try{this.motion[k].stop();}catch{}for(const node of Object.values(this.motion))try{node.disconnect();}catch{}this.motion=null;}
 sfx(name,opts={}){const c=this.context;if(!c||c.state!=='running'||this.destroyed||!this.visible||this.muted||!this.sfxVolume)return;const aliases={click:'ui',uiClick:'ui',uiHover:'hover',fire:'laser',shoot:'laser',damage:'hit',shieldHit:'shield',warp:'transit',land:'landing',jump:'boost',reload:'ready',win:'victory',whoosh:'introWhoosh',impact:'impact','intro-whoosh':'introWhoosh','intro-impact':'introImpact','ui-click':'ui','ui-hover':'hover',blade:'melee',core:'pickup',spawn:'respawn'};name=aliases[name]||name;const now=c.currentTime,cd=name==='hover'?.065:name==='footstep'?.12:name==='engine'?.15:.022,key=name+(opts.actorId||'');if(this.cooldowns.size>256){for(const [oldKey,at] of this.cooldowns)if(now-at>.2)this.cooldowns.delete(oldKey);}if(now-(this.cooldowns.get(key)??-10)<cd)return;this.cooldowns.set(key,now);playEffect(this,name,opts);}
 get diagnostics(){return{scene:this.scene,score:this.score,pendingScore:this.pendingScore,titleFading:!!this.titleTransition,scoreStep:this.transport?this.transport.step-this.transport.scoreStart:0,visible:this.visible,activeScores:this.stage?1:0,musicVoices:this.musicVoices.size,effectVoices:this.effectVoices.size,motionActive:!!this.motion,state:this.context?.state||'locked',destroyed:this.destroyed};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.cooldowns.clear();this._stopScore();this._stopMotion();for(const v of [...this.effectVoices])v.stop();if(this.context){this.context.close().catch(()=>{});this.context=null;}}
}
