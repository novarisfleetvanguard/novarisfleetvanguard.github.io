/** Original Novaris score. An unbroken mythic overture and phrase-aligned frontier arrangements. */
export const SCORES={
 title:{bpm:54,root:33,chords:[0,0,-2,-2,5,5,3,3,0,0,-2,0],color:'minor',motif:[0,3,5,10,7,3],air:1,pluck:1,drum:.4},
 intro:{bpm:72,root:33,chords:[0,0,5,0],color:'minor',motif:[0,7,10,14,7,3,12,10],air:.28,pluck:.28,drum:.1},
 menu:{bpm:78,root:38,chords:[0,5,3,-2,0,3,5,7],color:'minor',motif:[0,7,10,14,12,7,3,10],air:1,pluck:.9,drum:.12},
 space:{bpm:102,root:38,chords:[0,-2,3,5,0,7,5,-2],color:'minor',motif:[0,7,12,14,10,7,3,12],air:.85,pluck:.82,drum:.55},
 ember:{bpm:96,root:37,chords:[0,0,3,-2,0,5,3,7],color:'minor',motif:[0,3,7,10,12,7,3,0],air:.55,pluck:.86,drum:1},
 veil:{bpm:82,root:42,chords:[0,3,-2,5,0,7,3,5],color:'minor',motif:[0,7,10,14,19,14,10,7],air:1.12,pluck:.72,drum:.25},
 interior:{bpm:88,root:36,chords:[0,0,1,-2,0,3,1,7],color:'minor',motif:[0,7,12,13,7,0,10,7],air:.62,pluck:.64,drum:.85},
 combat:{bpm:104,root:38,chords:[0,3,-2,5,0,7,3,-2],color:'minor',motif:[0,7,12,10,15,12,7,3],air:.6,pluck:1,drum:1.2},
 victory:{bpm:84,root:38,chords:[0,5,7,0,3,5,7,0],color:'major',motif:[0,4,7,12,14,12,7,4],air:1.2,pluck:1.05,drum:.42}
};
// A newly composed D-minor-pentatonic overture; no sampled or quoted soundtrack.
SCORES.mythic={bpm:72,root:38,chords:[0,0,-2,0,5,0,3,0],color:'minor',motif:[0,3,7,10,7,5,3,0],air:1,pluck:1,drum:.55};
for(const name of ['intro','loading','menu','lobby','space'])SCORES[name]=SCORES.mythic;
export const scoreKey=name=>['intro','loading','menu','lobby','space','mythic'].includes(name)?'mythic':Object.hasOwn(SCORES,name)?name:(name==='dreadnought'||name?.startsWith('ship:')?'interior':'mythic');
// A separate slow threshold ritual in A: a twelve-bar arch, long rests, low
// unanswered bowed calls and a descending plucked response. Entirely original.
function scheduleTitle(e,step,t){
 const b=60/54,bar=Math.floor(step/16),q=step%16,phrase=bar%12,cycle=Math.floor(bar/12)%2,root=33,n=root+SCORES.title.chords[phrase];
 const voice=(name,note,len,vol,opts={})=>e._instrument(name,note,t,len,vol,opts);
 if(q===0){
  for(const [offset,amp,pan]of[[0,.033,-.32],[12,.025,.25],[19,.013,-.08]])e._tone(hz(n+offset),b*3.98,amp,'bow',t,'music',{attack:.72,release:1.3,cutoff:610,wet:.68,pan,vibrato:3.7,vibratoDepth:2});
  e._tone(hz(root-12),b*3.95,.041,'sine',t,'music',{attack:.45,release:1.1,cutoff:95,wet:.06});
  if(phrase===0||phrase===6)voice('gong',root+7,b*6.5,.024,{pan:.12,wet:.8});
  if(phrase===0||phrase===3||phrase===8)voice('ceremonial',root-5,1.7,.125,{pan:-.22,wet:.55});
 }
 const plucks={0:[[9,0]],1:[[2,3],[11,5]],2:[[5,10]],3:[[3,7],[12,3]],4:[[7,5]],5:[[1,3],[10,0]],6:[[11,7]],7:[[3,10],[12,7]],8:[[5,3]],9:[[2,0],[11,-2]],10:[[7,-5]],11:[[1,0]]};
 for(const[slot,interval]of plucks[phrase])if(q===slot)voice(cycle?'pipa':'guqin',root+24+interval,b*2.4,cycle?.056:.082,{pan:phrase%2?.3:-.24,wet:.62});
 if((phrase===2||phrase===6||phrase===10)&&q===0)voice('erhu',root+12+({2:7,6:10,10:3}[phrase]),b*3.35,.043,{pan:-.34,wet:.75});
 if(phrase===5&&q===4)voice('dizi',root+24+7,b*2.4,.027,{pan:.32,wet:.78});
 if(phrase===11&&q===4)voice('dizi',root+24,b*2.6,.03,{pan:.32,wet:.78});
 if((phrase===3||phrase===8)&&q===10)voice('ceremonial',root-2,.85,.055,{pan:.27,wet:.48});
 if(phrase===7&&q===14)voice('bell',root+36+10,b*3,.017,{pan:.42,wet:.82});
 if(q===0&&(phrase===0||phrase===6))e._noise(b*3.7,.009,t,'music',{attack:1.1,release:1.1,bandpass:420,q:.65,wet:.86,rate:.35,pan:-.4});
}
// Each later cue has a deliberate eight-bar cadence. Closely spaced chord
// changes retain common tones; melody and bass move together instead of
// combining a fixed pedal with independently transposed minor chords.
const HARMONY={
 d:{bass:38,pad:[53,57,62],arp:[62,65,69]},
 b:{bass:34,pad:[53,58,62],arp:[62,65,70]},
 f:{bass:41,pad:[53,57,60],arp:[60,65,69]},
 c:{bass:36,pad:[52,55,60],arp:[60,64,67]},
 g:{bass:43,pad:[50,55,58],arp:[62,67,70]}
};
const ARRANGEMENTS={
 mythic:{chords:['d','b','f','c','g','b','c','d'],lead:'flute',volume:.047,melody:[[[0,62,1.8],[8,69,1.7]],[[0,65,1.8],[8,62,1.7]],[[0,72,2.7],[12,69,.8]],[[0,67,1.8],[8,64,1.7]],[[0,67,1.4],[6,69,.8],[10,70,1.3]],[[0,65,1.8],[8,62,1.7]],[[0,65,1.6],[8,64,1.7]],[[0,62,3.6]]]},
 ember:{chords:['d','d','b','b','g','g','c','d'],lead:'strings',volume:.038,melody:[[[0,62,2.7],[12,65,.8]],[[0,69,1.8],[8,65,1.7]],[[0,70,2.7],[12,69,.8]],[[0,65,3.6]],[[0,67,1.8],[8,70,1.7]],[[0,69,1.4],[8,67,1.7]],[[0,67,1.8],[8,64,1.7]],[[0,62,3.6]]]},
 veil:{chords:['f','c','d','b','f','g','c','f'],lead:'flute',volume:.035,melody:[[[0,69,2.7]],[[4,67,2.6]],[[0,65,1.8],[8,62,1.7]],[[0,65,3.4]],[[0,72,1.8],[8,69,1.7]],[[0,70,2.7]],[[0,67,1.8],[8,64,1.7]],[[0,65,3.6]]]},
 interior:{chords:['d','b','g','c','d','b','c','d'],lead:'strings',volume:.028,melody:[[[0,57,3.4]],[[0,58,2.7]],[[4,55,2.6]],[[0,55,1.8],[8,52,1.7]],[[0,57,3.4]],[[0,53,2.7]],[[0,55,1.8],[8,52,1.7]],[[0,50,3.6]]]},
 combat:{chords:['d','b','g','c','d','b','c','d'],lead:'strings',volume:.039,melody:[[[0,62,1.8],[8,65,1.7]],[[0,70,1.8],[8,65,1.7]],[[0,67,1.8],[8,70,1.7]],[[0,67,1.8],[8,64,1.7]],[[0,69,2.7]],[[0,70,1.8],[8,65,1.7]],[[0,67,1.8],[8,64,1.7]],[[0,62,3.6]]]},
 victory:{chords:['f','b','c','f','d','b','c','f'],lead:'flute',volume:.046,melody:[[[0,65,1.8],[8,69,1.7]],[[0,70,1.8],[8,74,1.7]],[[0,72,1.8],[8,67,1.7]],[[0,69,3.5]],[[0,69,1.8],[8,74,1.7]],[[0,70,2.7]],[[0,67,1.8],[8,64,1.7]],[[0,65,3.6]]]}
};
function scheduleSmooth(e,scene,step,t,threat){
 const score=SCORES[scene],theme=ARRANGEMENTS[scene]||ARRANGEMENTS.mythic,b=60/score.bpm,bar=Math.floor(step/16),q=step%16,phrase=bar%8,chapter=Math.floor(bar/8)%4,chord=HARMONY[theme.chords[phrase]],intensity=Math.max(0,Math.min(1,threat)),dynamic=.88+intensity*.12;
 const note=(kind,pitch,length,volume,options={})=>e._smoothNote(kind,pitch,t,length,volume*dynamic,options);
 if(q===0){chord.pad.forEach((pitch,i)=>note('strings',pitch,b*4.35,.023,{pan:(i-1)*.27,wet:.25}));note('bass',chord.bass,b*3.9,.043,{pan:0});}
 // Slow, connected phrases have an audible destination and space to breathe.
 for(const[slot,pitch,beats]of theme.melody[phrase])if(q===slot){const kind=scene==='mythic'&&chapter%2===1?'strings':theme.lead;note(kind,pitch,b*beats,theme.volume*(kind==='strings'?.9:1),{pan:-.12,wet:.3});}
 const driving=scene==='ember'||scene==='combat',inside=scene==='interior',slots=driving?[0,4,8,12]:inside?[0,6,8,14]:scene==='veil'?[2,10]:[4,12],index=slots.indexOf(q);
 if(index>=0){const kind=scene==='veil'?'bell':'harp',pitch=chord.arp[(index+phrase)%3]-(driving||inside?12:0);note(kind,pitch,b*(driving?1.1:1.8),driving?.023:inside?.019:.026,{pan:index%2?.22:-.22,wet:.22});}
 // Rounded low percussion supplies momentum without buzzy pulse oscillators,
 // rapid high-frequency shakers, pitch plunges, or metallic melodic partials.
 if(driving&&(q===0||q===8))note('drum',38,q===0?.78:.55,q===0?.083:.053,{pan:q===0?-.16:.16});
 else if(inside&&q===0&&phrase%2===0)note('drum',38,.75,.038,{pan:-.1});
 else if(scene==='mythic'&&q===0&&(phrase===0||phrase===4))note('drum',38,1.1,.056,{pan:-.12});
 else if(scene==='victory'&&q===0)note('drum',41,.95,.046,{pan:-.1});
 if((scene==='veil'||scene==='victory')&&phrase===7&&q===8)note('bell',scene==='veil'?77:72,b*2,.017,{pan:.25,wet:.35});
}
const hz=n=>440*2**((n-69)/12);
export function scheduleScore(e,scene,step,t,threat=0){
 const key=scoreKey(scene);if(key==='title')return scheduleTitle(e,step,t);
 return scheduleSmooth(e,key,step,t,threat);
}
