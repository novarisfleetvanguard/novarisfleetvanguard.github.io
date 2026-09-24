/** Original Novaris score. An unbroken mythic overture and phrase-aligned frontier arrangements. */
export const SCORES={
 intro:{bpm:72,root:33,chords:[0,0,5,0],color:'minor',motif:[0,7,10,14,7,3,12,10],air:.28,pluck:.28,drum:.1},
 menu:{bpm:78,root:38,chords:[0,5,3,-2,0,3,5,7],color:'minor',motif:[0,7,10,14,12,7,3,10],air:1,pluck:.9,drum:.12},
 space:{bpm:102,root:38,chords:[0,-2,3,5,0,7,5,-2],color:'minor',motif:[0,7,12,14,10,7,3,12],air:.85,pluck:.82,drum:.55},
 ember:{bpm:116,root:37,chords:[0,0,3,-2,0,5,3,7],color:'minor',motif:[0,3,7,10,12,7,3,0],air:.55,pluck:.86,drum:1},
 veil:{bpm:82,root:42,chords:[0,3,-2,5,0,7,3,5],color:'minor',motif:[0,7,10,14,19,14,10,7],air:1.12,pluck:.72,drum:.25},
 interior:{bpm:108,root:36,chords:[0,0,1,-2,0,3,1,7],color:'minor',motif:[0,7,12,13,7,0,10,7],air:.62,pluck:.64,drum:.85},
 combat:{bpm:132,root:38,chords:[0,3,-2,5,0,7,3,-2],color:'minor',motif:[0,7,12,10,15,12,7,3],air:.6,pluck:1,drum:1.2},
 victory:{bpm:88,root:38,chords:[0,5,7,0,3,5,7,0],color:'major',motif:[0,4,7,12,14,12,7,4],air:1.2,pluck:1.05,drum:.42}
};
// A newly composed D-minor-pentatonic overture; no sampled or quoted soundtrack.
SCORES.mythic={bpm:72,root:38,chords:[0,0,-2,0,5,0,3,0],color:'minor',motif:[0,3,7,10,7,5,3,0],air:1,pluck:1,drum:.55};
for(const name of ['intro','loading','menu','lobby','space'])SCORES[name]=SCORES.mythic;
export const scoreKey=name=>['intro','loading','menu','lobby','space','mythic'].includes(name)?'mythic':Object.hasOwn(SCORES,name)?name:(name==='dreadnought'||name?.startsWith('ship:')?'interior':'mythic');
function scheduleMythic(e,step,t,threat){
 const b=60/72,bar=Math.floor(step/16),q=step%16,phrase=bar%8,chapter=Math.floor(bar/8)%4,root=38,pedal=[0,0,-2,0,5,0,3,0][phrase],n=root+pedal;
 const energy=.8+Math.min(1,threat)*.16,voice=(name,note,len,vol,opts={})=>e._instrument(name,note,t,len,vol*energy,opts);
 // Spacious, breath-shaped strings carry a continuous low ceremonial foundation.
 if(q===0){
  for(const [offset,pan,amp] of [[12,-.48,.026],[19,.42,.019],[27,-.12,.015]])e._tone(hz(n+offset),b*3.94,amp*energy,'bow',t,'music',{attack:.48,release:1.25,cutoff:920,detune:pan*8,pan,wet:.68,vibrato:4.8,vibratoDepth:3});
  e._tone(hz(root-12),b*3.95,.058,'sine',t,'music',{attack:.12,release:.7,cutoff:125,wet:.12});
  if(phrase===0||phrase===4)voice('ceremonial',root-8,1.15,.15,{pan:-.16,wet:.45});
  if(phrase===0&&chapter%2===0)voice('gong',root+7,b*6,.032,{pan:.12,wet:.72});
 }
 // Hand-plucked responses leave silence between phrases instead of a perpetual arpeggio.
 const plucks={0:[[0,0],[10,7]],1:[[3,10],[11,7]],2:[[0,5],[6,3],[12,0]],3:[[2,7],[10,10]],4:[[0,12],[9,7]],5:[[2,5],[11,3]],6:[[0,7],[7,3],[13,0]],7:[[0,-2],[8,0]]}[phrase];
 for(const [slot,interval]of plucks)if(q===slot)voice(chapter===2?'pipa':'guqin',root+(chapter===2?24:12)+interval,b*(slot>=12?.9:1.65),.105,{pan:Math.sin(bar*.7+slot)*.3,wet:.48});
 // Original call-and-response melody: bowed lament followed by an airy bamboo-like voice.
 const lament={2:[[0,7,2.6],[12,5,.9]],3:[[2,3,2.2]],6:[[0,10,1.7],[8,7,1.8]],7:[[0,5,1.7],[8,3,1.7]]};
 const flute={4:[[0,12,1.75],[8,10,1.7]],5:[[0,7,2.5],[12,5,.85]],6:[[12,3,.85]],7:[[8,0,1.75]]};
 for(const [slot,interval,beats]of lament[phrase]||[])if(q===slot)voice('erhu',root+24+interval,b*beats,chapter===1?.088:.068,{pan:-.22,wet:.58});
 for(const [slot,interval,beats]of flute[phrase]||[])if(q===slot&&(chapter!==2||phrase>=6))voice('dizi',root+24+interval,b*beats,.052,{pan:.24,wet:.65});
 if((phrase%2===1&&q===8)||(chapter>=1&&q===0&&phrase%4!==0))voice('ceremonial',root-5,.8,.082,{pan:.23,wet:.36});
 if(chapter>=1&&(q===6||q===14)&&phrase!==7)voice('rim',root+17,.18,.031,{pan:-.3,wet:.22});
 if(phrase===3&&q===12)voice('bell',root+43,b*2.3,.025,{pan:.42,wet:.72});
 if(phrase===7&&q===12)voice('gong',root+7,b*2.4,.018,{pan:-.22,wet:.68});
 if(q===0&&phrase%4===0)e._noise(b*3.7,.012,t,'music',{attack:.7,release:1,bandpass:670,q:.6,wet:.85,rate:.42,pan:-.35});
}
const hz=n=>440*2**((n-69)/12);
export function scheduleScore(e,scene,step,t,threat=0){
 if(scoreKey(scene)==='mythic')return scheduleMythic(e,step,t,threat);
 const s=SCORES[scene]||SCORES.menu,b=60/s.bpm,bar=Math.floor(step/16),q=step%16,phrase=bar%8,chord=s.chords[phrase%s.chords.length];
 const root=s.root+chord,third=s.color==='major'?4:3,intensity=Math.max(0,Math.min(1,threat));
 const swell=[.72,.82,.9,1,.84,.94,1.05,.76][phrase],dynamic=swell*(.82+intensity*.3),music='music';
 const tone=(note,len,vol,wave='sine',opts={})=>e._tone(hz(note),len,vol*dynamic,wave,t,music,opts);
 // Suspended string voicings remain soft beneath the percussive motif.
 if(q===0){
  const notes=[root+12,root+19,root+24+third,root+38];
  notes.forEach((n,i)=>tone(n,b*3.9,.035*s.air,'strings',{attack:b*.65,hold:.42,release:b*1.2,cutoff:900+intensity*700,pan:(i-1.5)*.34,detune:(i%2?1:-1)*4,wet:.75}));
  tone(root-12,b*3.7,.065,'sine',{attack:.11,hold:.62,release:.65,cutoff:180,wet:.1});
 }
 // The same pentatonic identity is re-voiced for each frontier.
 const slots=[0,3,6,8,10,14],index=slots.indexOf(q),sparse=scene==='intro'||(scene==='menu'&&phrase<2);
 if(index>=0&&(!sparse||index%2===0)){
  const m=s.motif[(index+phrase*2)%s.motif.length],octave=scene==='veil'?36:24,n=root+octave+m;
  const v=.10*s.pluck*(index===0?1:.72)*(phrase===7?.8:1);
  if(scene==='veil')e._instrument('glass',n,t,b*1.6,v,{pan:Math.sin(step*.77)*.55,wet:.8});
  else e._instrument('pluck',n,t,b*1.1,v,{pan:Math.sin(step*.43)*.38,wet:scene==='interior'?.18:.44});
  if((phrase===3||phrase===6)&&q===8)e._instrument('bell',n+12,t+b*.17,b*2.1,.047,{pan:-.45,wet:.8});
 }
 // Low drums are tuned membrane instruments, not a repeated electronic kick.
 const density=s.drum*(.48+intensity*.65),accent=(q===0?1:q===8?.77:.5);
 if((q===0||q===8||(intensity>.3&&q===6)||(phrase%4===3&&q===14))&&density>.07)e._instrument('taiko',root-5,t,.48,.17*density*accent,{pan:q===8?.28:-.2});
 if(density>.25&&(q===4||q===12))e._instrument('rim',root+19,t,.19,.073*density,{pan:.38,wet:.18});
 if(density>.35&&q%2===1&&(phrase>0||scene!=='space'))e._instrument('shaker',0,t,.075,.031*density*(q%4===3?.64:1),{pan:q%4===1?-.48:.48,wet:.1});
 if(phrase===7&&q>=12&&density>.25)e._instrument('taiko',root+q-12,t,.27,.07*density*(1+(q-12)*.15),{pan:(q-13.5)*.2});
 // Driving ostinato grows with danger without starting another music track.
 if((scene==='interior'||scene==='combat'||intensity>.5)&&q%2===0){
  const n=root+(q%8===6?7:0);tone(n,b*.4,.067*(.6+intensity*.5),'pulse',{attack:.008,cutoff:430+intensity*850,pan:q%4===0?-.12:.12,wet:.08});
 }
 if((phrase===2||phrase===6||scene==='victory')&&(q===0||q===8)){
  const melody=root+12+(q===0?7:third+12);
  e._instrument(scene==='victory'?'horn':'cello',melody,t,b*1.8,.08*s.air,{pan:-.22,wet:.55});
 }
 if(scene==='intro'&&q===0)e._noise(b*3.5,.035,t,music,{attack:.9,hold:.25,cutoff:950,wet:.8,rate:.45});
 if(scene==='veil'&&q===11)e._instrument('glass',root+43,t,b*2,.035,{pan:.62,wet:.9});
 if(scene==='space'&&phrase%4===2&&q===12)e._instrument('horn',root+19,t,b*2.7,.048,{pan:.35,wet:.7});
}
