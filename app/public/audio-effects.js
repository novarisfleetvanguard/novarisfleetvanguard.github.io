/** Hand-authored layered action cues. Procedural, original, and free of external media. */
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(v))?Number(v):lo));
export function playEffect(e,name,opts={}){
 const c=e.context,t=c.currentTime,level=clamp(opts.volume??opts.gain??1)/(1+Math.max(0,Number(opts.distance)||0)/48),pitch=clamp(opts.pitch??1,.35,3),pan=clamp(opts.pan??0,-1,1);
 const tone=(f,d,v,type='sine',delay=0,x={})=>e._tone(f*pitch,d,v*level,type,t+delay,'effect',{pan,...x,...(x.to?{to:x.to*pitch}:{})});
 const noise=(d,v,delay=0,x={})=>e._noise(d,v*level,t+delay,'effect',{pan,...x});
 const chime=(notes,gap=.065,d=.28,v=.10)=>notes.forEach((f,i)=>{tone(f,d,v,'sine',i*gap,{wet:.34});tone(f*2.003,d*.55,v*.16,'sine',i*gap,{pan:-pan});});
 switch(name){
 case 'hover':tone(980,.036,.045,'sine',0,{to:1120,wet:0});break;
 case 'ui':noise(.017,.042,0,{highpass:2500,wet:0});tone(540,.055,.092,'sine',0,{to:710,wet:0});tone(1060,.055,.028,'sine',.024,{wet:0});break;
 case 'denied':tone(168,.11,.115,'triangle',0,{to:139,cutoff:620});tone(168,.10,.085,'triangle',.13,{to:122,cutoff:620});break;
 case 'connect':chime([392,587,784],.065,.22,.075);break;
 case 'disconnect':chime([587,392,262],.07,.18,.07);break;
 case 'laser':
  tone(1760,.22,.17,'pulse',0,{to:220,cutoff:2800,wet:.1});tone(730,.14,.10,'sine',0,{to:88});noise(.048,.12,0,{highpass:3100,wet:0});break;
 case 'pulse':
  tone(620,.19,.21,'wood',0,{to:92,cutoff:2100,wet:.06});tone(1240,.105,.10,'sine',0,{to:340,pan:pan*.8});tone(80,.25,.12,'sine',.008,{to:34,wet:0});noise(.04,.10,0,{bandpass:3700,q:1,wet:0});break;
 case 'scatter':
  noise(.23,.32,0,{cutoff:4300,wet:.1});noise(.04,.19,0,{highpass:2300,wet:0});tone(132,.25,.22,'triangle',0,{to:37,cutoff:1200});
  for(let i=0;i<4;i++)tone(1500-i*130,.09,.035,'pulse',i*.014,{to:180,cutoff:1800,pan:clamp(pan+(i-1.5)*.1,-1,1)});break;
 case 'lance':
  tone(220,.115,.12,'sine',0,{to:1900,attack:.025});tone(2480,.44,.17,'pulse',.055,{to:76,cutoff:3500,wet:.24});tone(86,.5,.20,'sine',.065,{to:28});noise(.34,.18,.06,{bandpass:2200,q:.7});tone(730,.32,.07,'sine',.11,{to:240,pan:-pan,wet:.5});break;
 case 'melee':
  noise(.19,.21,0,{bandpass:900,q:.65,attack:.025,wet:.13});tone(410,.14,.1,'sine',.035,{to:78});tone(170,.13,.13,'triangle',.09,{to:44,cutoff:1400});noise(.038,.08,.09,{highpass:2400});break;
 case 'hit':
  noise(.092,.22,0,{bandpass:1800,q:.9,wet:.04});tone(174,.19,.17,'wood',0,{to:42,cutoff:1700});tone(62,.15,.11,'sine',.02,{to:31});break;
 case 'shield':
  tone(840,.3,.16,'sine',0,{to:350,wet:.3});tone(1347,.2,.085,'sine',0,{to:650,pan:-pan});tone(2110,.12,.035,'sine',.016,{to:950});noise(.11,.065,0,{bandpass:2800,q:3,wet:.26});break;
 case 'shieldBreak':
  [1500,2100,2780,3400].forEach((f,i)=>tone(f,.22+i*.055,.06,'sine',i*.023,{to:f*.36,pan:clamp(pan+(i-1.5)*.16,-1,1),wet:.3}));noise(.3,.19,.025,{highpass:1900});tone(118,.34,.18,'triangle',.03,{to:29});break;
 case 'block':
  tone(512,.23,.13,'sine',0,{to:320,wet:.23});tone(790,.17,.09,'sine',0,{to:610});tone(1233,.12,.047,'sine');noise(.055,.17,0,{highpass:2400});tone(115,.14,.11,'triangle',0,{to:52});break;
 case 'guard':
  noise(.18,.07,0,{bandpass:1400,q:1.8,attack:.025});tone(165,.28,.105,'sine',0,{to:330,attack:.025,wet:.2});tone(660,.19,.05,'sine',.04,{to:495});break;
 case 'dash':
  noise(.28,.18,0,{cutoff:1500,attack:.015,rate:.65,wet:.1});tone(90,.19,.15,'wood',0,{to:310,cutoff:650});tone(620,.2,.055,'sine',.02,{to:170,pan:-pan});break;
 case 'boost':
  noise(.65,.17,0,{cutoff:1600,rate:.6,attack:.06,wet:.12});tone(48,.58,.17,'horn',0,{to:165,cutoff:800,attack:.055});tone(212,.4,.07,'sine',.08,{to:430});break;
 case 'engine':tone(48,.38,.07,'wood',0,{to:76,cutoff:390,attack:.045});noise(.33,.04,0,{cutoff:580,attack:.035});break;
 case 'footstep':{
  const surface=opts.surface||'metal';
  if(surface==='metal'){noise(.045,.14,0,{bandpass:1900,q:1.2,wet:.07});tone(174,.11,.09,'sine',0,{to:110,wet:.07});tone(376,.12,.032,'sine',.01,{wet:.11});}
  else if(surface==='moss'||surface==='grass'){noise(.10,.1,0,{cutoff:1450,wet:0});noise(.07,.055,.026,{highpass:3000,rate:.6,wet:0});tone(75,.09,.067,'sine',0,{to:43,wet:0});}
  else{noise(.065,.13,0,{bandpass:1400,q:.4,wet:.02});noise(.10,.065,.02,{highpass:1800,wet:0});tone(88,.085,.065,'sine',0,{to:42});}break;}
 case 'impact':noise(.08,.13,0,{bandpass:2200,q:1.2});tone(235,.15,.095,'wood',0,{to:61,cutoff:2600});tone(1240,.07,.028,'sine',0,{to:980});break;
 case 'explosion':
  noise(1.18,.32,0,{cutoff:2400,rate:.6,wet:.26});noise(.16,.26,0,{highpass:1650,wet:.07});tone(110,.8,.27,'sine',0,{to:23,attack:.007});tone(78,.42,.12,'triangle',.09,{to:28,cutoff:580});noise(.46,.12,.16,{bandpass:640,q:.8,rate:.5});break;
 case 'telegraph':
  if(opts.kind==='volley'){for(let i=0;i<3;i++){tone(330,.13,.085,'sine',i*.14,{to:470,wet:.12});noise(.04,.035,i*.14,{bandpass:2700,q:2});}}
  else{tone(190,.72,.075,'sine',0,{to:980,attack:.19,wet:.18});tone(380,.62,.035,'triangle',.04,{to:1400,attack:.13,cutoff:2100});}break;
 case 'bossPhase':
  tone(51,1.35,.19,'horn',0,{to:38,attack:.07,cutoff:750,wet:.42});tone(77,1.25,.12,'horn',.08,{to:57,cutoff:1300,wet:.5});noise(.8,.13,0,{cutoff:1400,attack:.09});chime([311,392,466],.18,.6,.06);break;
 case 'equip':
  noise(.034,.105,0,{bandpass:3100,q:.8,wet:0});tone(310,.06,.085,'triangle',0,{to:240,cutoff:1900});tone(780,.11,.046,'sine',.05,{to:980,wet:.08});break;
 case 'repair':
  chime([330,440,587,880],.09,.29,.085);noise(.46,.045,0,{bandpass:1800,q:1.2,attack:.1});tone(110,.45,.04,'sine',0,{to:220,attack:.08});break;
 case 'pickup':chime([523,784,1047,1568],.08,.36,.086);tone(131,.55,.07,'sine',0,{to:262,attack:.07,wet:.2});break;
 case 'reactor':
  tone(55,1.15,.18,'horn',0,{to:23,cutoff:650});noise(.85,.24,0,{cutoff:1800,wet:.32});for(let i=0;i<3;i++)tone(960,.12,.1,'pulse',.1+i*.18,{to:780,cutoff:1500,wet:.08});break;
 case 'transit':
  noise(1.25,.17,0,{bandpass:1400,q:.4,attack:.24,wet:.37});tone(56,.9,.15,'strings',0,{to:660,attack:.14,cutoff:1100,wet:.3});tone(1120,.68,.08,'sine',.5,{to:120,wet:.5});tone(55,.38,.13,'sine',.7,{to:28});break;
 case 'landing':
  noise(.48,.18,0,{cutoff:1300,rate:.7});tone(92,.39,.17,'sine',0,{to:27});noise(.18,.07,.15,{bandpass:2100,q:.7});chime([392,587],.12,.19,.055);break;
 case 'ready':chime([392,587,784],.08,.22,.09);break;
 case 'start':chime([196,294,392,587,784],.095,.43,.12);tone(65,.85,.14,'horn',0,{to:98,cutoff:820,attack:.035});noise(.36,.05,.05,{cutoff:1100,attack:.055});break;
 case 'death':
  tone(262,.92,.15,'strings',0,{to:28,cutoff:780,wet:.28});noise(.66,.12,0,{cutoff:950,rate:.7});tone(523,.31,.06,'sine',0,{to:220});tone(47,.7,.12,'sine',.08,{to:23});break;
 case 'respawn':chime([220,330,440,660,880,1320],.07,.34,.085);noise(.58,.06,0,{bandpass:2300,q:.7,attack:.12,wet:.4});break;
 case 'extraction':chime([294,440,587,880,1175],.12,.5,.10);tone(73,.95,.10,'horn',0,{to:146,attack:.12,cutoff:900});noise(.8,.08,0,{cutoff:1900,attack:.16});break;
 case 'victory':chime([294,370,440,587,740,880],.11,.63,.10);tone(73,1.2,.12,'horn',0,{attack:.06,cutoff:1200,wet:.4});break;
 case 'introWhoosh':
  noise(.86,.16,0,{bandpass:1050,q:.4,attack:.18,wet:.35});tone(45,.85,.12,'strings',0,{to:520,cutoff:850,attack:.13});tone(980,.4,.055,'sine',.3,{to:240,pan:-pan,wet:.5});break;
 case 'introImpact':
  noise(.85,.23,0,{cutoff:2100,rate:.7,wet:.32});tone(87,.95,.25,'sine',0,{to:23});tone(294,1.05,.07,'horn',0,{to:73,cutoff:1200,wet:.45});tone(588,.8,.04,'sine',.06,{wet:.5});break;
 default:break;
 }
}
