/** Original Novaris score. One eight-bar arrangement per location; no recorded loops. */
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
const hz=n=>440*2**((n-69)/12);
export function scheduleScore(e,scene,step,t,threat=0){
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
