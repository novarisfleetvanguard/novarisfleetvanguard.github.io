import {AstralFrontispiece} from './astral.js?v=9';
import {ARCHIVE} from './archive.js?v=9';
import {WorldRenderer} from './renderer.js?v=9';
import {AudioEngine} from './audio.js?v=9';
import {playIntro} from './intro.js?v=9';
import {CHAPTERS} from './manual.js?v=9';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Preserve the hit text node while a browser is completing a pointer click.
function setText(element,value){const text=String(value);if(element.textContent===text)return;if(element.childNodes.length===1&&element.firstChild.nodeType===Node.TEXT_NODE)element.firstChild.nodeValue=text;else element.textContent=text;}
let lastCrewMarkup='';
function updateCrew(markup){
 const list=$('crew-list'),template=document.createElement('template');template.innerHTML=markup;
 const previous=new Map(Array.from(list.children,row=>[row.dataset.pilotId,row]));
 Array.from(template.content.children).forEach((fresh,index)=>{
  const old=previous.get(fresh.dataset.pilotId),row=old&&old.outerHTML===fresh.outerHTML?old:fresh;
  // Keep unchanged controls in place while another pilot's readiness changes.
  if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
  if(old&&old!==row)old.remove();previous.delete(fresh.dataset.pilotId);
 });
 for(const old of previous.values())old.remove();
}
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const defaults={music:.32,sfx:.65,muted:false,quality:matchMedia('(pointer:coarse)').matches?'low':'high',reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,invert:false,sensitivity:1};
const saved=read('novaris-settings',{}),preferences=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
const numericSetting=(key,min,max)=>typeof preferences[key]==='number'&&Number.isFinite(preferences[key])?clamp(preferences[key],min,max):defaults[key];
let settings={music:numericSetting('music',0,1),sfx:numericSetting('sfx',0,1),sensitivity:numericSetting('sensitivity',.3,2),quality:['high','low'].includes(preferences.quality)?preferences.quality:defaults.quality,...Object.fromEntries(['muted','reduced','invert'].map(key=>[key,typeof preferences[key]==='boolean'?preferences[key]:defaults[key]]))};
const roomIdentities=new Map();
const audio=new AudioEngine();audio.setMusicVolume(settings.music);audio.setSfxVolume(settings.sfx);audio.setMuted(settings.muted);audio.setReducedMotion(settings.reduced);
let astral=null,loadPromise=null,finishingIntro=false,lastCombatAt=0,damageUntil=0,hitUntil=0,mouseGuard=false;
const arrivals=new Set();
let world=null,loaded=false,view=null,you=null,ws=null,room='',intentionalClose=false,reconnectTimer=null,reconnectCount=0;
let yaw=0,pitch=0,lastZone='',lastPhase='',lastSeq=0,lastStateAt=0,modalKind='',manualPage=0;
let introController=null,booted=false,activePanel='boot',deathShown=false,resultShown=false;
const keys=new Set();let mouseFire=false,dragPointer=null,previousPointer={x:0,y:0},lastRender=performance.now(),fpsFrames=0,fpsTime=0,fps=60;
const log=[];const canvas=$('world'),modal=$('modal'),body=$('modal-body');
const zones={space:'THE STARFALL EXPANSE',ember:'EMBER REACH',veil:'VEIL GARDEN',dreadnought:'THE HOLLOW CITADEL'};
const zoneName=z=>zones[z]||(z?.startsWith('ship:')?'VANGUARD SHIP INTERIOR':z||'UNKNOWN');
const self=()=>view?.players?.find(p=>p.id===you);
const canPlay=()=>view?.phase==='playing'&&self()?.alive&&!modal.open&&activePanel==='hud'&&!document.hidden;
try{astral=new AstralFrontispiece($('astral'),{quality:settings.quality,reducedMotion:settings.reduced});astral.load().catch(e=>console.warn('Vessel preview unavailable',e));}catch(e){console.warn('Astral scene unavailable',e);}
canvas.style.visibility='hidden';
function updateBrandMotion(){const source='./'+(settings.reduced?'vanguard-mark-static.svg':'vanguard-mark.svg')+'?v=9';document.querySelectorAll('img.vanguard-mark').forEach(img=>{if(img.getAttribute('src')!==source)img.src=source;});}
updateBrandMotion();
function saveSettings(){updateBrandMotion();try{localStorage.setItem('novaris-settings',JSON.stringify(settings));}catch{}audio.setMusicVolume(settings.music);audio.setSfxVolume(settings.sfx);audio.setMuted(settings.muted);world?.setQuality?.(settings.quality);world?.setReducedMotion?.(settings.reduced);astral?.setReducedMotion(settings.reduced);astral?.setQuality?.(settings.quality);audio.setReducedMotion?.(settings.reduced);}
function notice(text){if(modal.open){const output=modalKind==='interact'?$('interact-result'):$('modal-notice');if(output){output.textContent=text;output.classList.remove('hidden');return;}}$('toast-text').textContent=text;$('toast').classList.remove('hidden');}
function panel(id){['boot','intro','loading','menu','lobby','hud'].forEach(x=>$(x).classList.toggle('hidden',x!==id));activePanel=id;document.body.dataset.surface=id;astral?.setMode(id);canvas.style.visibility=id==='hud'?'visible':'hidden';}
function releaseInput(){keys.clear();mouseFire=false;mouseGuard=false;dragPointer=null;audio.setMotion?.({zone:self()?.zone||'menu',moving:false,boosting:false,alive:false});sendInput(true);}
function openModal(kind,kicker,html){releaseInput();if(document.pointerLockElement)document.exitPointerLock();modalKind=kind;$('modal-kicker').textContent=kicker;$('modal-notice').textContent='';$('modal-notice').classList.add('hidden');body.innerHTML=html;if(!modal.open)modal.showModal();modal.scrollTop=0;body.scrollTop=0;$('modal-kicker').focus({preventScroll:true});}
function closeModal(){modal.close();modalKind='';releaseInput();}
$('close-modal').onclick=closeModal;modal.addEventListener('cancel',()=>{modalKind='';releaseInput();});
function dismissOverlay(id){$(id).classList.add('hidden');if(activePanel==='hud'&&!modal.open)canvas.focus({preventScroll:true});}
$('toast-close').onclick=()=>dismissOverlay('toast');
document.addEventListener('click',e=>{if(e.target.closest('button'))audio.sfx('click');if(e.detail>0&&e.target.closest('#hud button')&&canPlay())canvas.focus({preventScroll:true});});
document.addEventListener('pointerover',e=>{if(e.target.closest('button')&&e.pointerType==='mouse')audio.sfx('hover');});
function settingsModal(){
openModal('settings','SYSTEMS / PERSONAL SETTINGS','<h2>Make it your flight.</h2><p>Sound begins after your first click. Only one music score plays at a time.</p><div class="settings-row"><label for="music-vol">Music volume</label><input id="music-vol" type="range" min="0" max="1" step=".01" value="'+settings.music+'"></div><div class="settings-row"><label for="sfx-vol">Effects volume</label><input id="sfx-vol" type="range" min="0" max="1" step=".01" value="'+settings.sfx+'"></div><div class="settings-row"><label for="mute">Mute all audio</label><input id="mute" type="checkbox" '+(settings.muted?'checked':'')+'></div><div class="settings-row"><label for="reduce">Reduce camera effects & motion</label><input id="reduce" type="checkbox" '+(settings.reduced?'checked':'')+'></div><div class="settings-row"><label for="invert">Invert vertical look</label><input id="invert" type="checkbox" '+(settings.invert?'checked':'')+'></div><div class="settings-row"><label for="sensitivity">Look sensitivity</label><input id="sensitivity" type="range" min=".3" max="2" step=".1" value="'+settings.sensitivity+'"></div><div class="settings-row"><label for="quality">Graphics quality</label><select id="quality"><option value="high">High</option><option value="low">Performance</option></select></div><p>Escape releases mouse capture. Shared missions continue while a personal menu is open.</p><button class="primary" id="settings-done">SAVE & CLOSE</button>');
$('quality').value=settings.quality;
['music-vol','sfx-vol','mute','reduce','invert','sensitivity','quality'].forEach(id=>$(id).oninput=()=>{
settings.music=+$('music-vol').value;settings.sfx=+$('sfx-vol').value;settings.muted=$('mute').checked;settings.reduced=$('reduce').checked;settings.invert=$('invert').checked;settings.sensitivity=+$('sensitivity').value;settings.quality=$('quality').value;saveSettings();});
$('settings-done').onclick=closeModal;
}
function manual(page=0){manualPage=clamp(page,0,CHAPTERS.length-1);const c=CHAPTERS[manualPage];
openModal('manual','FIELD MANUAL / '+String(manualPage+1).padStart(2,'0'),' <div class="manual-tabs">'+CHAPTERS.map((x,i)=>'<button data-chapter="'+i+'" class="'+(i===manualPage?'active':'')+'">'+(i+1)+'</button>').join('')+'</div><h2 style="margin-top:22px">'+esc(c.title)+'</h2>'+c.html+'<div class="manual-footer"><button id="manual-back" class="secondary" '+(manualPage===0?'disabled':'')+'>← BACK</button><small>'+ (manualPage+1)+' / '+CHAPTERS.length+' · STAYS OPEN UNTIL YOU CHOOSE</small><button id="manual-next" class="primary">'+(manualPage===CHAPTERS.length-1?'FINISH TRAINING':'NEXT →')+'</button></div><button id="manual-close" class="text-link">Close manual — I can reopen it anytime</button>');
body.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>manual(+b.dataset.chapter));$('manual-back').onclick=()=>manual(manualPage-1);
$('manual-next').onclick=()=>{if(manualPage===CHAPTERS.length-1){try{localStorage.setItem('novaris-trained','yes');}catch{}closeModal();}else manual(manualPage+1);};$('manual-close').onclick=closeModal;}
['boot-settings','menu-settings'].forEach(id=>$(id).onclick=settingsModal);
['menu-guide','lobby-guide','hud-guide'].forEach(id=>$(id).onclick=()=>manual());
function loadingStage(n){['load-model','load-worlds','load-ready'].forEach((id,i)=>{const el=$(id);el.classList.toggle('done',i<n);el.classList.toggle('active',i===n);el.querySelector('i').textContent=i<n?'COMPLETE':i===n?'ASSEMBLING':'WAITING';});}
async function loadWorld(){if(loaded)return;if(loadPromise)return loadPromise;loadPromise=(async()=>{void astral?.load().catch(e=>console.warn('Vessel preview unavailable',e));world?.dispose();world=null;world=new WorldRenderer(canvas,{quality:settings.quality,reducedMotion:settings.reduced});await world.load(progress=>{const stage=progress.fraction<.55?0:progress.fraction<1?1:2;loadingStage(stage);$('load-status').textContent=['Forging crescent hulls and ivory armor…','Charting Ember Reach and Veil Garden…','The fleet awaits your command.'][stage];});loaded=true;})();try{await loadPromise;}catch(e){world?.dispose();world=null;loaded=false;loadPromise=null;throw e;}}
async function finishIntro(){if(finishingIntro)return;finishingIntro=true;introController?.stop();panel('loading');audio.setScene('menu');loadingStage(0);$('load-retry').classList.add('hidden');try{await loadWorld();loadingStage(3);$('load-status').textContent='The Vanguard is ready. Continue when you choose.';$('load-enter').classList.remove('hidden');}catch(error){console.error(error);$('load-status').textContent=/webgl|graphics context/i.test(String(error?.message))?'This browser could not start 3D graphics. Enable hardware acceleration or try an up-to-date browser, then retry.':'The armory could not load. Check your connection, then retry.';$('load-retry').classList.remove('hidden');}finally{finishingIntro=false;}}
function beginIntro(){introController?.stop();panel('intro');audio.setScene('intro');introController=playIntro($('intro-canvas'),{onComplete:finishIntro,reducedMotion:settings.reduced,audio});}
$('enter').onclick=()=>{if(booted)return;booted=true;void audio.unlock();beginIntro();};
$('skip-intro').onclick=finishIntro;$('replay-intro').onclick=beginIntro;$('load-retry').onclick=finishIntro;
$('load-enter').onclick=()=>{panel('menu');const code=new URLSearchParams(location.search).get('room');if(code){$('room-input').value=code;$('join-form').classList.remove('hidden');notice('Crew invitation loaded. Enter your callsign, then select JOIN.');}};
function archive(section='all'){const entries=section==='all'?ARCHIVE:ARCHIVE.filter(x=>x.section===section);openModal('archive','THE NOVARIS ARCHIVE','<h2>Empires become starlight.</h2><img id="archive-splash" src="./assets/celestial-atlas.webp" alt="The ruined orbital temples of Novaris above a violet planet"><p>When the old worlds fell, their fleets carried more than weapons. They carried the forms of home: a curved eave, a marble arch, a longship’s ribs. Among the ruins of Novaris, those memories became a new civilization.</p><div class="archive-grid">'+entries.map(x=>'<article class="archive-card"><span class="archive-mark">'+x.mark+'</span><small>'+x.kicker+'</small><h3>'+x.name+'</h3><p>'+x.text+'</p></article>').join('')+'</div><p>The archive describes the places and equipment in this sortie. Open the field manual for the complete rules and controls.</p><button class="primary" id="archive-close">RETURN TO COMMAND</button><button class="secondary" id="archive-manual">FIELD MANUAL</button>');$('archive-close').onclick=closeModal;$('archive-manual').onclick=()=>manual();}
$('menu-codex').onclick=()=>archive();$('frontier-space').onclick=()=>archive('space');$('frontier-ground').onclick=()=>archive('ground');$('frontier-ship').onclick=()=>archive('ship');
$('arrival-dismiss').onclick=()=>dismissOverlay('zone-arrival');
$('dash-action').onclick=()=>{if(canPlay())action({type:'dash'});};
$('open-join').onclick=()=>{$('join-form').classList.toggle('hidden');if(!$('join-form').classList.contains('hidden'))$('room-input').focus();};
try{$('callsign').value=localStorage.getItem('novaris-name')||'Drifter';}catch{}
function code(){const a=new Uint8Array(6);crypto.getRandomValues(a);return Array.from(a,x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');}
$('create-room').onclick=()=>connect(code());
$('join-room').onclick=()=>{const value=$('room-input').value.trim().toUpperCase();if(!/^[A-Z0-9_-]{1,12}$/.test(value)){notice('Use the room code from your host (letters and numbers).');return;}connect(value);};
$('room-input').onkeydown=e=>{if(e.key==='Enter')$('join-room').click();};
function send(message){if(ws?.readyState!==WebSocket.OPEN)return false;ws.send(JSON.stringify(message));return true;}
function connectionNotice(){notice('Connection unavailable. Wait for your crew link to return, then choose this action again.');}
function action(a){const sent=send({type:'action',action:a});if(!sent&&a.type!=='input')connectionNotice();return sent;}
function requestReset(){if(send({type:'reset'}))closeModal();else connectionNotice();}
function connect(value,reconnecting=false){
 clearTimeout(reconnectTimer);releaseInput();const previous=ws;ws=null;previous?.close();room=value;intentionalClose=false;const name=$('callsign').value.trim().slice(0,18)||'Drifter';
 try{localStorage.setItem('novaris-name',name);}catch{}
 if(!reconnecting){world?.reset?.();arrivals.clear();$('zone-arrival').classList.add('hidden');view=null;you=null;lastSeq=0;lastZone='';lastPhase='';deathShown=false;resultShown=false;reconnectCount=0;log.length=0;}
 $('join-fresh').classList.add('hidden');$('resume-session').classList.add('hidden');$('room-code').textContent=room;panel('lobby');$('lobby-status').textContent=reconnecting?'Reconnecting to your crew…':'Establishing a secure room…';$('ready').disabled=true;$('start').disabled=true;
 const url=new URL(location.href);url.searchParams.set('room',room);history.replaceState(null,'',url);
 const current=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+(['localhost','127.0.0.1','[::1]'].includes(location.hostname)?location.host:'novaris-fleet-vanguard.novaris-fleet-vanguard.workers.dev')+'/ws/'+room);ws=current;
 current.onopen=()=>{if(ws!==current||intentionalClose)return;let identity=roomIdentities.get(value);if(!identity){try{const stored=JSON.parse(sessionStorage.getItem('novaris-room-'+value)||'null');if(stored&&typeof stored.playerId==='string'&&typeof stored.token==='string')identity={playerId:stored.playerId,token:stored.token};}catch{}}current.send(JSON.stringify({type:'join',name,...identity}));};
 current.onmessage=e=>{
 if(ws!==current||intentionalClose)return;
 if(e.data==='__pong')return;let msg;try{msg=JSON.parse(e.data);}catch{return;}
 if(msg.type==='welcome'){you=msg.playerId;const identity={playerId:msg.playerId,token:msg.token};roomIdentities.set(value,identity);try{sessionStorage.setItem('novaris-room-'+value,JSON.stringify(identity));}catch{}reconnectCount=0;audio.sfx('connect');return;}
 if(msg.type==='error'){audio.sfx('denied');notice(msg.error);$('lobby-status').textContent=msg.error;if(msg.error==='unknown reconnect identity'){$('lobby-status').textContent='Your previous seat was released. Choose to join as a new pilot, or leave this room.';$('join-fresh').classList.remove('hidden');}return;}
 if(msg.type==='state'&&msg.view){you=msg.you;view=msg.view;lastStateAt=performance.now();consumeState();}
 };
 current.onerror=()=>{if(ws!==current||intentionalClose)return;$('network-status').textContent='LINK ERROR';};
 current.onclose=event=>{if(ws!==current||intentionalClose)return;audio.sfx('disconnect');releaseInput();if(event.reason==='reconnected elsewhere'){clearTimeout(reconnectTimer);panel('lobby');$('ready').disabled=true;$('start').disabled=true;$('lobby-status').textContent='Your pilot is active on another screen. Resume here only when you choose to move control back.';$('resume-session').classList.remove('hidden');$('network-status').textContent='ACTIVE ON ANOTHER SCREEN';return;}$('network-status').textContent='RECONNECTING';$('lobby-status').textContent='Connection lost. Reconnecting…';if(reconnectCount<8){reconnectTimer=setTimeout(()=>connect(room,true),Math.min(8000,1000*++reconnectCount));}else notice('Connection lost. Use Leave room, then join your room code again.');};
}
function leave(){intentionalClose=true;clearTimeout(reconnectTimer);ws?.close();ws=null;world?.reset?.();view=null;you=null;lastZone='';lastPhase='';closeModal();panel('menu');audio.setScene('menu');history.replaceState(null,'',location.pathname);}
$('leave-lobby').onclick=leave;
$('resume-session').onclick=()=>connect(room,true);
$('join-fresh').onclick=()=>{roomIdentities.delete(room);try{sessionStorage.removeItem('novaris-room-'+room);}catch{}connect(room);};
$('crew-list').onclick=e=>{const button=e.target.closest('[data-dismiss-pilot]');if(!button)return;const pilot=view?.players.find(p=>p.id===button.dataset.dismissPilot);if(!pilot||pilot.connected)return;openModal('dismiss','COMMANDER / RELEASE OFFLINE SEAT','<h2>Make room for your crew.</h2><p>Release '+esc(pilot.name)+'’s offline seat? Their saved identity will no longer rejoin this seat. They can explicitly join again as a new pilot if a seat is available.</p><button id="dismiss-confirm" class="primary">RELEASE OFFLINE SEAT</button><button id="dismiss-cancel" class="secondary">KEEP RESERVED</button>');$('dismiss-confirm').onclick=()=>{if(action({type:'dismiss',playerId:pilot.id}))closeModal();};$('dismiss-cancel').onclick=closeModal;};
$('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+location.pathname+'?room='+room);notice('Invite copied. Send it to your crew.');}catch{notice('Invite: '+location.origin+location.pathname+'?room='+room);}};
$('ready').onclick=()=>{audio.sfx('ready');action({type:'ready',ready:!self()?.ready});};
$('start').onclick=()=>action({type:'start'});
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>action({type:'configure',mode:b.dataset.mode}));
document.querySelectorAll('[data-weapon]').forEach(b=>b.onclick=()=>action({type:'equip',weapon:b.dataset.weapon}));
function consumeState(){
 const p=self();if(!p)return;world?.update(view);const phaseChanged=view.phase!==lastPhase;
 if(activePanel==='lobby'&&view.phase!=='lobby')panel('hud');
 if(p.zone!==lastZone||(phaseChanged&&view.phase==='playing')){yaw=p.yaw||0;pitch=p.pitch||0;lastZone=p.zone;if(view.phase==='playing'&&!arrivals.has(p.zone)){arrivals.add(p.zone);$('arrival-kicker').textContent=p.zone==='space'?'01 / THE CELESTIAL FRONTIER':p.zone==='ember'?'02 / THE SOLAR RUINS':p.zone==='veil'?'03 / THE SILENT GARDEN':'04 / BEYOND THE HULL';$('arrival-name').textContent=zoneName(p.zone);$('zone-arrival').classList.remove('hidden');}audio.setScene(p.zone==='space'?'space':p.zone==='ember'?'ember':p.zone==='veil'?'veil':'interior');}
 if(phaseChanged){releaseInput();if(view.phase==='lobby'){panel('lobby');audio.setScene('menu');deathShown=false;resultShown=false;}else{panel('hud');if(view.phase==='playing'){audio.sfx('start');audio.setScene(p.zone==='space'?'space':p.zone==='ember'?'ember':p.zone==='veil'?'veil':'interior');if(modalKind==='result')closeModal();}}
 lastPhase=view.phase;
 }
 if(view.phase==='lobby'){
 const crewMarkup=view.players.map(q=>'<div class="crew-row" data-pilot-id="'+esc(q.id)+'"><i style="background:'+(q.connected?'#82e5eb':'#697581')+'"></i><b>'+esc(q.name)+'</b>'+(q.id===view.hostId?'<small>COMMANDER</small>':'')+'<span>'+(q.connected?(q.ready?'READY':'PREPARING'):'OFFLINE')+'</span>'+(!q.connected&&you===view.hostId&&q.id!==you?'<button class="release-seat" data-dismiss-pilot="'+esc(q.id)+'" aria-label="Release offline seat for '+esc(q.name)+'">RELEASE SEAT</button>':'')+'</div>').join('');if(crewMarkup!==lastCrewMarkup){updateCrew(crewMarkup);lastCrewMarkup=crewMarkup;}
 $('ready').disabled=false;setText($('ready'),p.ready?'CANCEL READY':"I'M READY");
 $('start').disabled=you!==view.hostId||!view.players.filter(q=>q.connected).every(q=>q.ready);

 setText($('start'),you===view.hostId?'LAUNCH MISSION':'WAITING FOR COMMANDER');
 $('lobby-status').textContent=view.players.filter(q=>q.connected).length+' / 6 pilots connected. '+(you===view.hostId?'Launch when every connected pilot is ready.':'Your commander chooses the mission and launches.');
 document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('selected',b.dataset.mode===view.mode);b.disabled=you!==view.hostId;});
 }
 $('zone-label').textContent=zoneName(p.zone)+(view.objective.stage?' / '+view.objective.stage:'');$('objective-title').textContent=view.mode==='expedition'?'FLEET EXPEDITION':'VANGUARD SKIRMISH';$('objective-text').textContent=p.launchProtection>0?'Launch shield · '+Math.ceil(p.launchProtection)+'s to orient. '+(view.objective.briefing||view.objective.text):(view.objective.briefing||view.objective.text);
 $('core-progress').innerHTML=view.mode==='expedition'?['ember','veil','dreadnought'].map(z=>'<span class="'+(view.objective.cores.includes(z)?'done':'')+'">'+(z==='dreadnought'?'CITADEL':z.toUpperCase())+'</span>').join(''):'';
 $('pilot-name').textContent=p.name.toUpperCase();$('zone-kind').textContent=p.zone==='space'?'STAR PILOT':'VANGUARD';$('score-line').textContent=(view.mode==='skirmish'?p.score+' / 12 SCORE · ':'')+p.kills+' ELIMINATIONS';
 for(const [key,max] of [['hp',100],['shield',70],['energy',100]]){$(key+'-value').textContent=Math.ceil(p[key]);$(key+'-bar').style.width=clamp(p[key]/max*100,0,100)+'%';}
 document.querySelectorAll('[data-weapon]').forEach(b=>b.classList.toggle('active',b.dataset.weapon===p.weapon));
 const boss=view.npcs.find(n=>n.zone===p.zone&&n.boss&&n.alive);$('boss-hud').classList.toggle('hidden',!boss);$('hud').classList.toggle('boss-present',!!boss);if(boss){$('boss-name').textContent=boss.name||'THE HOLLOW JARL';$('boss-health').style.width=clamp(boss.hp/(boss.hpMax||boss.maxHp||260)*100,0,100)+'%';$('boss-phase').textContent=boss.telegraph?'VOLLEY CHARGING · MOVE FROM ITS LINE':boss.phase===2?'PHASE II / THE BROKEN OATH':'PHASE I / WARDEN OF THE CITADEL';}
 $('dash-action').disabled=p.zone==='space'||!p.alive||p.dashCooldown>0||p.energy<25;setText($('dash-action'),p.zone==='space'?'EVADE / GROUND':p.dashCooldown>0?'EVADE / '+p.dashCooldown.toFixed(1)+'s':'Q / EVADE');$('guard-action').classList.toggle('engaged',!!p.guard);$('combat-state').textContent=p.dashing?'EVASION':p.guard?'FRONTAL SHIELD BRACED':'';document.querySelectorAll('[data-vertical]').forEach(b=>b.classList.toggle('hidden',p.zone!=='space'));
 const nearby=nearInteractions();if(modalKind==='interact'){const current=new Map(nearby.map(t=>[t.id,t]));body.querySelectorAll('[data-target]').forEach(button=>{const target=current.get(button.dataset.target),active=view.phase==='playing'&&p.alive;button.disabled=!active||!target?.available;setText(button.querySelector('span'),!active?'UNAVAILABLE':!target?'OUT OF REACH':target.available?'SELECT →':'LOCKED');});}setText($('interact'),!p.alive?'RECONSTRUCT':nearby.length?'INTERACT [E] · '+nearby.length:'INTERACTIONS [E]');
 $('network-status').textContent='ROOM '+room+' · LINKED';
 const fresh=view.events.filter(e=>e.seq>lastSeq);for(const e of fresh){lastSeq=Math.max(lastSeq,e.seq);if(e.zone===p.zone||e.type==='victory'){world?.triggerEvent?.(e);const actor=view.players.find(q=>q.id===e.actorId)||view.npcs.find(q=>q.id===e.actorId);const dx=(e.x??actor?.x??p.x)-p.x,dy=(e.y??actor?.y??p.y)-p.y,dz=(e.z??actor?.z??p.z)-p.z,dist=Math.hypot(dx,dy,dz);const spatial={actorId:e.actorId||e.targetId,pan:dist?clamp((-dx*Math.cos(yaw)+dz*Math.sin(yaw))/dist,-1,1)*.8:0,distance:dist,volume:e.actorId===you?.7:.45,surface:p.zone==='ember'?'stone':p.zone==='veil'?'grass':'metal'};
 if(['shot','hit','kill','melee','telegraph','bossPhase'].includes(e.type))lastCombatAt=performance.now();
 if(e.type==='shot')audio.sfx(e.weapon||'laser',spatial);else if(e.type==='hit'){audio.sfx(e.targetId===you?(p.shield>0?'shield':'hit'):'hit',spatial);if(e.targetId===you)damageUntil=performance.now()+350;if(e.actorId===you)hitUntil=performance.now()+150;}else if(e.type==='kill')audio.sfx('explosion',spatial);else if(e.type==='core')audio.sfx('pickup',spatial);else if(e.type==='transit')audio.sfx('transit',spatial);else if(e.type==='melee')audio.sfx('melee',spatial);else if(e.type==='boost'&&e.actorId===you)audio.sfx('boost');else if(['spawn','repair','equip'].includes(e.type))audio.sfx(e.type==='spawn'?'respawn':e.type,spatial);else if(['dash','guard','block','shieldBreak','telegraph','bossPhase','impact','reactor','extraction'].includes(e.type))audio.sfx(e.type,{...spatial,kind:e.kind});}
 if(e.text&&['kill','core','transit','victory','start','bossPhase'].includes(e.type)){log.unshift(e.type==='transit'?(e.zone.startsWith('ship:')?'Boarded a Vanguard vessel':'Entered '+zoneName(e.zone)):e.type==='start'?(view.mode==='expedition'?'Fleet expedition underway':'Vanguard skirmish underway'):e.text);log.splice(5);}}
 $('event-log').innerHTML=log.map(t=>'<div>'+esc(t)+'</div>').join('');
 if(view.phase==='over'&&!resultShown&&!modal.open){resultShown=true;resultModal();}
 if(!p.alive&&!deathShown&&view.phase==='playing'&&!modal.open){deathShown=true;deathModal();}
 if(p.alive)deathShown=false;
 if(modalKind==='death')updateRespawn();
}
function nearInteractions(){const p=self();if(!p)return[];return(view.interactables||[]).filter(t=>t.zone===p.zone&&Math.hypot(t.x-p.x,(t.y||0)-p.y,t.z-p.z)<=t.range).sort((a,b)=>Number(b.available)-Number(a.available));}
function interactions(){
 const p=self();if(!p)return;if(!p.alive){deathModal();return;}const near=nearInteractions();
 openModal('interact','VANGUARD / INTERACTION','<h2>Choose your next move.</h2><p>'+ (near.length?'These actions are within reach. Select one explicitly.':'No destination is in reach. Use the navigation map to find a landing gate, core, repair station or rival ship.')+'</p><div id="interact-list">'+near.map(t=>'<button class="interact-option" data-target="'+esc(t.id)+'" '+(!t.available?'disabled':'')+'><b>'+esc(t.label)+'</b><span>'+(t.available?'SELECT →':'LOCKED')+'</span></button>').join('')+'</div><p id="interact-result" class="muted" role="status">This panel stays open until you close it.</p><button id="interact-map" class="secondary">NAVIGATION MAP</button><button id="interact-done" class="primary">RETURN TO ACTION</button>');
 body.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{if(!action({type:'interact',targetId:b.dataset.target}))return;$('interact-result').textContent='Request sent. Close this panel to resume control.';b.disabled=true;});
 $('interact-map').onclick=mapModal;$('interact-done').onclick=closeModal;
}
$('interact').onclick=interactions;
function mapModal(){
 const p=self();if(!p)return;const marks=(view.interactables||[]).filter(t=>t.zone===p.zone);
 openModal('map','NAVIGATION / '+zoneName(p.zone),'<h2>The next frontier.</h2><canvas id="tactical-map" width="1000" height="400" aria-label="Tactical map of your current zone"></canvas><p>Current position: '+[p.x,p.y,p.z].map(Math.round).join(' / ')+'. Marker distances are in metres. Travel is always a choice at the destination.</p><div class="map-grid">'+marks.map(t=>'<div class="map-entry"><b>'+esc(t.label)+'</b><p>'+Math.round(Math.hypot(t.x-p.x,(t.y||0)-p.y,t.z-p.z))+' m · '+(t.available?'Available':'Guarded or locked')+'<br>Coordinates '+[t.x,t.y||0,t.z].map(Math.round).join(' / ')+'</p><button class="secondary" data-track="'+esc(t.id)+'">FACE MARKER</button></div>').join('')+'</div><p>Amber markers are destinations. Coral dots are hostile. Cyan dots are crew. Both alien worlds and the Hollow Citadel hold one expedition core.</p><button id="map-done" class="primary">RETURN TO ACTION</button>');
 body.querySelectorAll('[data-track]').forEach(b=>b.onclick=()=>{const t=marks.find(m=>m.id===b.dataset.track);yaw=Math.atan2(t.x-p.x,t.z-p.z);pitch=p.zone==='space'?Math.atan2((t.y||0)-p.y,Math.hypot(t.x-p.x,t.z-p.z)):0;notice('Facing '+t.label+'. Close the map, fly forward, then interact when close.');});$('map-done').onclick=closeModal;
}
$('hud-map').onclick=mapModal;
function pauseModal(){openModal('pause','VANGUARD / FLIGHT MENU','<h2>Your next command.</h2><p class="warning">This is a shared world. Combat continues while your personal menu is open.</p><button class="primary" id="resume">RESUME</button><button class="secondary" id="pause-manual">FIELD MANUAL</button><button class="secondary" id="pause-map">NAVIGATION</button><button class="secondary" id="pause-settings">SETTINGS</button>'+(view?.phase==='over'?'<button class="secondary" id="show-results">RESULTS</button>':'')+'<h3>Room '+esc(room)+'</h3><p>Share this room code to invite your crew.</p>'+(you===view?.hostId?'<button class="secondary" id="reset-confirm">RETURN CREW TO LOBBY</button>':'')+'<button class="secondary" id="leave-game">LEAVE ROOM</button>');
 $('resume').onclick=closeModal;$('pause-manual').onclick=()=>manual();$('pause-map').onclick=mapModal;$('pause-settings').onclick=settingsModal;$('leave-game').onclick=leave;
 if($('show-results'))$('show-results').onclick=resultModal;
 if($('reset-confirm'))$('reset-confirm').onclick=()=>{openModal('reset','COMMANDER / RETURN TO LOBBY','<h2>End this sortie?</h2><p>This returns everyone to the launch bay and clears the current mission progress. The next mission starts only when you choose.</p><button id="do-reset" class="primary">RETURN TO LOBBY</button><button id="cancel-reset" class="secondary">KEEP PLAYING</button>');$('do-reset').onclick=requestReset;$('cancel-reset').onclick=closeModal;};
}
$('hud-menu').onclick=pauseModal;
function deathModal(){openModal('death','VANGUARD / SIGNAL LOST','<h2>Your oath endures.</h2><p>Your suit reconstruction will become available shortly. Your score stays with you. You choose when to return.</p><button id="respawn" class="primary">RECONSTRUCT</button><button id="death-map" class="secondary">FIELD MANUAL</button>');$('respawn').onclick=()=>{if(action({type:'respawn'}))closeModal();};$('death-map').onclick=()=>manual(8);updateRespawn();}
function updateRespawn(){const p=self();if(!$('respawn')||!p)return;$('respawn').disabled=p.respawn>0;setText($('respawn'),p.respawn>0?'RECONSTRUCT IN '+Math.ceil(p.respawn)+'s':'RECONSTRUCT & REJOIN');}
function resultModal(){const r=view?.result;if(!r)return;audio.setScene('victory');openModal('result','SORTIE / COMPLETE','<h2>'+esc(r.title||'Mission complete')+'</h2><p>'+esc(r.reason||'The stars remember your vanguard.')+'</p>'+[...view.players].sort((a,b)=>b.score-a.score).map(p=>'<div class="score-row"><b>'+esc(p.name)+'</b><span>'+p.kills+' eliminations · '+p.deaths+' losses · '+p.score+' score</span></div>').join('')+(you===view.hostId?'<button id="rematch" class="primary">RETURN TO LOBBY</button>':'<p>Your commander can return the crew to the lobby for another mission.</p>')+'<button id="result-close" class="secondary">STAY HERE</button>');if($('rematch'))$('rematch').onclick=requestReset;$('result-close').onclick=closeModal;}
function sendInput(neutral=false){
 if(!view||view.phase!=='playing')return;const p=self();if(!p||!p.alive)return;const live=!neutral&&canPlay();let forward=0,right=0,vertical=0;
 if(live){forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));vertical=Number(keys.has('KeyR'))-Number(keys.has('KeyF'));}
 const pitchFactor=p.zone==='space'?Math.cos(pitch):1;
 if(p.zone==='space')vertical=clamp(vertical+forward*Math.sin(pitch),-1,1);
 const mx=clamp(forward*Math.sin(yaw)*pitchFactor-right*Math.cos(yaw),-1,1),mz=clamp(forward*Math.cos(yaw)*pitchFactor+right*Math.sin(yaw),-1,1);
 action({type:'input',mx,mz,my:vertical,yaw:((yaw+Math.PI*3)%(Math.PI*2))-Math.PI,pitch:clamp(pitch,-1.35,1.35),guard:live&&(keys.has('KeyC')||mouseGuard),fire:live&&(keys.has('Space')||mouseFire),boost:live&&(keys.has('ShiftLeft')||keys.has('ShiftRight'))});
}
setInterval(()=>sendInput(),100);setInterval(()=>{if(ws?.readyState===WebSocket.OPEN)ws.send('__ping');},20000);
document.addEventListener('keydown',e=>{
 if(e.target.matches('input,textarea,select'))return;
 if(e.code==='Tab'&&e.shiftKey&&activePanel==='hud'&&!modal.open&&(e.target===canvas||e.target===document.body)){e.preventDefault();$('hud-menu').focus();return;}
 if(e.code==='Tab'&&(e.shiftKey||e.target.closest('button,a')))return;
 if(['Space','Enter'].includes(e.code)&&e.target.closest('button,a'))return;
 if(e.code==='Escape'){if(modal.open)return;if(activePanel==='hud')pauseModal();return;}
 if(modal.open)return;if(activePanel!=='hud')return;
 if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 if(!e.repeat){if(e.code==='KeyQ'&&canPlay())action({type:'dash'});if(e.code==='KeyE')interactions();if(e.code==='Tab')mapModal();if(e.code==='KeyH')manual();if(/^Digit[1-4]$/.test(e.code))action({type:'equip',weapon:['pulse','scatter','lance','blade'][+e.code.slice(-1)-1]});}
 keys.add(e.code);
});
document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',releaseInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseInput();audio.setVisibility?.(!document.hidden);});
function syncMouseButtons(e){if(e.pointerType!=='mouse')return;mouseGuard=!!(e.buttons&2);mouseFire=document.pointerLockElement===canvas&&!!(e.buttons&1);}
canvas.addEventListener('pointerdown',e=>{if(!canPlay())return;syncMouseButtons(e);if(e.button===2){mouseGuard=true;if(document.pointerLockElement!==canvas)canvas.setPointerCapture(e.pointerId);return;}if(document.pointerLockElement===canvas)return;dragPointer=e.pointerId;previousPointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!canPlay())return;syncMouseButtons(e);let dx=0,dy=0;if(document.pointerLockElement===canvas){dx=e.movementX;dy=e.movementY;}else if(dragPointer===e.pointerId){dx=e.clientX-previousPointer.x;dy=e.clientY-previousPointer.y;previousPointer={x:e.clientX,y:e.clientY};}else return;look(dx,dy);});
const endPointer=()=>{mouseFire=false;mouseGuard=false;dragPointer=null;};canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('lostpointercapture',endPointer);canvas.addEventListener('contextmenu',e=>e.preventDefault());
function look(dx,dy){yaw-=dx*.003*settings.sensitivity;pitch=clamp(pitch-dy*.0024*settings.sensitivity*(settings.invert?-1:1),-1.25,1.25);}
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)releaseInput();});
$('aim-lock').onclick=async()=>{try{await canvas.requestPointerLock();}catch{notice('Mouse lock is unavailable here. Drag on the world to aim, or use the arrow keys.');}};
document.querySelectorAll('[data-key]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();keys.add(b.dataset.key);b.setPointerCapture(e.pointerId);};b.onpointerup=b.onpointercancel=b.onlostpointercapture=b.onblur=()=>keys.delete(b.dataset.key);b.onkeydown=e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();keys.add(b.dataset.key);}};b.onkeyup=e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();keys.delete(b.dataset.key);}};});
function drawTacticalMap(){const p=self(),c=$('tactical-map');if(!p||!c)return;const ctx=c.getContext('2d'),W=c.width,H=c.height,span=p.zone==='space'?400:p.zone.startsWith('ship:')||p.zone==='dreadnought'?70:150,k=Math.min(W,H)/span*.87,cx=W/2,cy=H/2;ctx.clearRect(0,0,W,H);ctx.strokeStyle='#d9b77c16';ctx.lineWidth=1;for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}const pos=o=>[cx-o.x*k,cy-o.z*k];ctx.fillStyle='#b1b8c033';for(const o of view.obstacles||[]){if(o.zone!==p.zone)continue;const [x,y]=pos(o);ctx.fillRect(x-o.hx*k,y-o.hz*k,o.hx*k*2,o.hz*k*2);}for(const t of view.interactables.filter(x=>x.zone===p.zone)){const [x,y]=pos(t);ctx.strokeStyle=t.available?'#d9b77c':'#646578';ctx.lineWidth=1.5;ctx.strokeRect(x-4,y-4,8,8);ctx.font='10px Manrope,Arial';ctx.fillStyle=t.available?'#d9b77c':'#878492';ctx.textAlign='center';ctx.fillText(t.label.replace('Enter your ship','YOUR SHIP').slice(0,23),x,y-9);}for(const q of [...view.npcs,...view.players]){if(q.zone!==p.zone||!q.alive||q.connected===false)continue;const [x,y]=pos(q);ctx.fillStyle=q.id===you?'#faf0cf':q.id&&view.players.some(a=>a.id===q.id)&&view.mode==='expedition'?'#a3dadc':'#d57564';ctx.beginPath();ctx.arc(x,y,q.id===you?5:3,0,Math.PI*2);ctx.fill();}const [px,py]=pos(p);ctx.strokeStyle='#fff3d4';ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-Math.sin(yaw)*16,py-Math.cos(yaw)*16);ctx.stroke();ctx.fillStyle='#948a76';ctx.textAlign='left';ctx.font='9px Manrope,Arial';ctx.fillText('TOP VIEW / '+zoneName(p.zone)+' / ELEVATION '+Math.round(p.y)+' m',16,H-16);}
function radar(){const p=self();if(!p)return;const ctx=$('radar').getContext('2d'),size=180,c=90,range=p.zone==='space'?180:70;ctx.clearRect(0,0,size,size);ctx.strokeStyle='#8ecbd62a';ctx.lineWidth=1;for(const r of [30,60,88]){ctx.beginPath();ctx.arc(c,c,r,0,Math.PI*2);ctx.stroke();}ctx.beginPath();ctx.moveTo(c,0);ctx.lineTo(c,180);ctx.moveTo(0,c);ctx.lineTo(180,c);ctx.stroke();
 function dot(q,color,r){const dx=q.x-p.x,dz=q.z-p.z;const x=c+(-dx*Math.cos(yaw)+dz*Math.sin(yaw))/range*80,y=c-(dx*Math.sin(yaw)+dz*Math.cos(yaw))/range*80;if(Math.hypot(x-c,y-c)>85)return;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}

 view.interactables.filter(q=>q.zone===p.zone&&!q.id.startsWith('own-ship')).forEach(q=>dot(q,'#ffb86d',3));view.npcs.filter(q=>q.zone===p.zone&&q.alive).forEach(q=>dot(q,'#ff6c64',3));view.players.filter(q=>q.id!==you&&q.zone===p.zone&&q.alive&&q.connected!==false).forEach(q=>dot(q,view.mode==='expedition'?'#82e5eb':'#ff6c64',4));ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(90,83);ctx.lineTo(85,96);ctx.lineTo(95,96);ctx.fill();}
function frame(now){const elapsed=Math.max(0,(now-lastRender)/1000),dt=Math.min(.05,elapsed);lastRender=now;
 if(canPlay()){const turn=(Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*dt*1.65;const tilt=(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*dt; yaw+=turn;pitch=clamp(pitch+tilt,-1.25,1.25);

 }
 const me=self(),live=canPlay();const moving=live&&['KeyW','KeyS','KeyA','KeyD','KeyR','KeyF'].some(k=>keys.has(k));audio.setMotion?.({zone:me?.zone||'menu',moving,boosting:live&&(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&!me?.guard,speed:me?Math.hypot(me.vx||0,me.vy||0,me.vz||0):0,grounded:me?.zone!=='space',alive:live,surface:me?.zone==='ember'?'stone':me?.zone==='veil'?'grass':'metal'});audio.setIntensity?.(activePanel==='hud'&&me?.alive?Math.max(0,1-(now-lastCombatAt)/8000):0);astral?.render(dt);$('damage-vignette').style.opacity=!settings.reduced&&now<damageUntil?'.48':'0';$('crosshair').classList.toggle('hit',now<hitUntil);
 if(modalKind==='map'&&$('tactical-map'))drawTacticalMap();
 if(loaded&&view&&activePanel==='hud'){world.render(dt,{yaw,pitch});radar();const target=world.getTarget?.();$('target-label').textContent=target?(target.name||'Hostile contact')+' · '+Math.round(Math.hypot(target.x-self().x,target.y-self().y,target.z-self().z))+' m':'';if(now-lastStateAt>3000)$('network-status').textContent='WAITING FOR LINK…';}
 fpsFrames++;fpsTime+=elapsed;if(fpsTime>=1){fps=Math.round(fpsFrames/fpsTime);fpsFrames=0;fpsTime=0;if(new URLSearchParams(location.search).has('debug')){$('debug').classList.remove('hidden');$('debug').textContent=fps+' FPS · '+JSON.stringify(world?.info||{});}}
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize',()=>{world?.resize();astral?.resize();});
// A history-cache restore keeps this module alive; retain audio and rejoin the same seat.
window.addEventListener('pagehide',event=>{
 releaseInput();intentionalClose=true;clearTimeout(reconnectTimer);ws?.close();
 if(event.persisted)audio.setVisibility?.(false);else{audio.destroy();world?.dispose();astral?.dispose();}
});
window.addEventListener('pageshow',event=>{
 if(!event.persisted)return;
 audio.setVisibility?.(!document.hidden);
 if(room&&view)connect(room,true);
});
document.addEventListener('pointerdown',()=>{
 if(audio.context&&audio.context.state!=='running')audio.unlock();
},{capture:true});
