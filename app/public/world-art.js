import * as THREE from 'three';
import {mergeGeometries} from './vendor/utils/BufferGeometryUtils.js?v=5';
const TAU=Math.PI*2;
const mat=(color,metal=.5,rough=.45)=>new THREE.MeshStandardMaterial({color,metalness:metal,roughness:rough});
const emit=color=>new THREE.MeshBasicMaterial({color});
const add=(parent,geometry,material,p=[0,0,0],s=[1,1,1])=>{const m=new THREE.Mesh(geometry,material);m.position.set(...p);m.scale.set(...s);parent.add(m);return m;};
function batch(parent,geometry,material,items){const m=new THREE.InstancedMesh(geometry,material,items.length),o=new THREE.Object3D();items.forEach((a,i)=>{o.position.set(...a.p);o.rotation.set(...(a.r||[0,0,0]));o.scale.set(...(a.s||[1,1,1]));o.updateMatrix();m.setMatrixAt(i,o.matrix);});parent.add(m);return m;}
function ring(parent,r,t,material,p=[0,0,0],rotation=[0,0,0],arc=TAU){const m=add(parent,new THREE.TorusGeometry(r,t,7,100,arc),material,p);m.rotation.set(...rotation);return m;}
function aura(parent,r,color,p,time){
 const m=new THREE.ShaderMaterial({uniforms:{color:{value:new THREE.Color(color)},clock:time},vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 v;uniform vec3 color;uniform float clock;void main(){vec2 p=v-.5;float d=length(p)*2.;float a=atan(p.y,p.x);float filament=sin(a*37.+sin(a*13.+clock*.15)*2.);float band=exp(-pow((d-.59)*10.,2.))*.35+exp(-pow((d-.51)*50.,2.))*.7;band*=.75+filament*.25;gl_FragColor=vec4(color,band);}',transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
 return add(parent,new THREE.PlaneGeometry(r*4,r*4),m,p);
}
export function astralSpace(world,env){
 const group=new THREE.Group();group.position.set(-25,120,470);env.add(group);
 const bronze=mat(0x806246,.85,.3),gold=emit(0xf3bd70),black=emit(0x02040b);
 add(group,new THREE.SphereGeometry(58,48,32),black);
 aura(group,64,0xdba35c,[0,0,-2],world.windUniform);
 ring(group,60,.65,gold);
 ring(group,76,.8,bronze,[0,0,0],[.2,.6,.15],TAU*.84);
 ring(group,94,1.2,bronze,[0,0,0],[.95,.2,-.5],TAU*.74);
 ring(group,115,1.5,bronze,[0,0,0],[-.4,.6,.23],TAU*.84);
 ring(group,95,.18,emit(0x75e7de),[0,0,0],[.95,.2,-.5],TAU*.74);
 const pylons=[],glyphs=[];for(let i=0;i<24;i++){const a=i/24*TAU;pylons.push({p:[Math.sin(a)*117,Math.cos(a)*117,0],s:[i%3===0?3:1.1,i%3===0?12:5,1.5],r:[0,0,-a]});glyphs.push({p:[Math.sin(a)*112,Math.cos(a)*112,2],s:[.65,1.9,.5],r:[0,0,-a]});}
 batch(group,new THREE.BoxGeometry(1,1,1),bronze,pylons);batch(group,new THREE.OctahedronGeometry(1),gold,glyphs);
 const fleet=world.clone('Flagship',8);fleet.position.set(-260,24,340);fleet.rotation.set(.08,.7,-.18);env.add(fleet);
 {const distant=world.clone('Flagship',4.5);distant.position.set(270,-40,460);distant.rotation.y=-.9;distant.visible=world.quality==='high';(env.userData.highQualityOnly??=[]).push(distant);env.add(distant);}
 const arch=new THREE.Group();arch.position.set(190,4,260);arch.rotation.set(.4,-.5,-.2);env.add(arch);
 ring(arch,77,4,mat(0x172c39,.7,.5),[0,0,0],[0,0,0],TAU*.67);ring(arch,80,.42,emit(0x588f95),[0,0,0],[0,0,0],TAU*.67);
 const rocks=[];for(let i=0;i<60;i++){const a=i*2.399,r=240+Math.sin(i*7)*65;rocks.push({p:[Math.cos(a)*r,Math.sin(i*1.8)*95,Math.sin(a)*r+120],s:[2+i%5,1+i%3,2+i%4],r:[i,.3*i,.7*i]});}batch(env,new THREE.DodecahedronGeometry(1,0),mat(0x26333c,.25,.9),rocks);
}
function aurora(world,env,palette=0x52d5c4){
 const verts=[],uv=[],idx=[],n=100;for(let i=0;i<=n;i++){const x=-310+i*620/n,z=160+Math.sin(i/n*6.5)*80,y=48+Math.sin(i/n*9)*14;verts.push(x,y,z,x,y+58,z);uv.push(i/n,0,i/n,1);if(i<n){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);
 const m=new THREE.ShaderMaterial({uniforms:{clock:world.windUniform,tint:{value:new THREE.Color(palette)}},side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexShader:'varying vec2 v;uniform float clock;void main(){v=uv;vec3 p=position;p.z+=sin(p.x*.02+clock*.08)*10.;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',fragmentShader:'varying vec2 v;uniform vec3 tint;uniform float clock;void main(){float strands=sin(v.x*380.+sin(v.x*75.+clock*.07)*4.)*.5+.5;float wave=sin(v.x*21.+clock*.06)*.1;float a=pow(max(0.,1.-v.y),2.)*smoothstep(0.,.08,v.y)*(.08+.17*strands);vec3 c=mix(tint,vec3(.25,.12,.8),v.y);gl_FragColor=vec4(c,a);}'});
 add(env,g,m);
}
function constellationTree(env){
 const base=new THREE.Vector3(-85,0,74),geometries=[],leaves=[],nodes=[];
 for(let trunk=0;trunk<3;trunk++){const points=[base.clone().add(new THREE.Vector3(trunk*2,0,0)),base.clone().add(new THREE.Vector3(-3+trunk*3,20,-2)),base.clone().add(new THREE.Vector3(-12+trunk*10,43,8)),base.clone().add(new THREE.Vector3(-22+trunk*17,63,18-trunk*12))];geometries.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),18,1.5-trunk*.25,6,false));}
 for(let i=0;i<16;i++){const a=i*2.399,h=28+i%5*6,start=base.clone().add(new THREE.Vector3(0,h,0)),end=base.clone().add(new THREE.Vector3(Math.cos(a)*(18+i%4*3),h+14,Math.sin(a)*22));const mid=start.clone().lerp(end,.48).add(new THREE.Vector3(0,9,0));geometries.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start,mid,end]),10,.4+i%3*.12,5,false));nodes.push({p:end.toArray(),s:[.6,.6,.6]});for(let j=0;j<12;j++)leaves.push({p:[end.x+Math.sin(j*2.4+i)*7,end.y+Math.sin(j*1.8)*4,end.z+Math.cos(j*2.4+i)*7],s:[1.3+(j%3),.7,1.7+j%2],r:[.3*j,j,.2]});}
 const g=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());add(env,g,mat(0x6c817a,.5,.55));batch(env,new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0x23615f,emissive:0x153f55,emissiveIntensity:.6,metalness:.3,roughness:.5}),leaves);batch(env,new THREE.IcosahedronGeometry(1,1),emit(0x8adccb),nodes);
}
export function astralPlanet(world,env,zone){
 const veil=zone==='veil';outskirts(world,env,veil);const bronze=mat(0x776147,.72,.4),gold=emit(veil?0x9addbf:0xf2c17c);
 const floorMark=new THREE.Group();env.add(floorMark);
 for(let i=0;i<4;i++){const r=7+i*6.5;const m=ring(floorMark,r,.025,mat(veil?0x56847a:0x8b6845),[0,-.105,28],[Math.PI/2,0,0],TAU*(i%2?.72:1));m.rotation.z=i*.8;}
 const glyphs=[];for(let i=0;i<32;i++){const a=i/32*TAU;glyphs.push({p:[Math.sin(a)*28,-.095,28+Math.cos(a)*28],s:[.10,.018,i%4===0?1.8:.8],r:[0,a,0]});}batch(env,new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:veil?0x769d88:0xb58a50,transparent:true,opacity:.5}),glyphs);
 if(veil){aurora(world,env);constellationTree(env);
  const orbs=[];for(let i=0;i<5;i++){const a=i*1.7;orbs.push({p:[Math.sin(a)*135,68+i*12,100+Math.cos(a)*90],s:[6+i*1.3,6+i*1.3,6+i*1.3]});}batch(env,new THREE.SphereGeometry(1,18,12),mat(0x7c92a0,.75,.2),orbs);
  for(const side of[-1,1]){const pool=add(env,new THREE.CircleGeometry(21,50),new THREE.MeshStandardMaterial({color:0x042a31,metalness:.85,roughness:.08,emissive:0x073040,emissiveIntensity:.4}),[side*89,.3,-20]);pool.rotation.x=-Math.PI/2;ring(env,22,.10,gold,[side*89,.5,-20],[Math.PI/2,0,0]);}
 }else{
  const altar=new THREE.Group();altar.position.set(0,31,105);env.add(altar);ring(altar,18,1.0,bronze);ring(altar,23,.3,gold);ring(altar,29,.7,bronze,[0,0,0],[.4,.5,0],TAU*.73);aura(altar,22,0xe09350,[0,0,-.5],world.windUniform);
  const spokes=[];for(let i=0;i<16;i++){const a=i/16*TAU;spokes.push({p:[Math.sin(a)*25,Math.cos(a)*25,0],s:[.6,7,1.7],r:[0,0,-a]});}batch(altar,new THREE.ConeGeometry(1,1,4),bronze,spokes);
  const obelisks=[];for(const side of[-1,1]){obelisks.push({p:[side*79,17,24],s:[4,34,5],r:[0,side*.35,side*.08]});const lens=ring(env,7,.3,gold,[side*79,32,24],[.08,side*.45,0]);}
  batch(env,new THREE.ConeGeometry(.5,1,1,4),mat(0x15202a,.6,.5),obelisks);
  const moon=add(env,new THREE.SphereGeometry(29,32,20),mat(0x392e38,.3,.95),[70,100,200]);ring(env,34,.4,gold,[70,100,200],[.3,.1,.5],TAU*.85);
 }
}
export function astralInterior(world,env,zone){
 const hostile=zone==='dreadnought',bronze=mat(0x745943,.75,.4),rib=mat(0x1b2b3b,.8,.42),warm=emit(hostile?0xeaa677:0x72bbcb);
 const details=[],caps=[],lights=[];for(let z=-27;z<=27;z+=9){for(const s of[-1,1]){details.push({p:[s*16.6,3,z],s:[.42,6,.8]},{p:[s*16.6,6.1,z],s:[2,.45,1.3]});caps.push({p:[s*16.6,.4,z],s:[1.2,.8,1.3]});lights.push({p:[s*16.3,3.5,z],s:[.06,3,.12]});const arc=ring(env,9,.23,rib,[s*4.4,7,z],[0,Math.PI/2,0],Math.PI*.5);arc.rotation.z=s>0?Math.PI/2:0;}}
 batch(env,new THREE.BoxGeometry(1,1,1),rib,details);batch(env,new THREE.BoxGeometry(1,1,1),bronze,caps);batch(env,new THREE.BoxGeometry(1,1,1),warm,lights);
 const keels=[];for(const x of[-7,0,7])keels.push({p:[x,9,0],s:[.4,.55,61]});batch(env,new THREE.BoxGeometry(1,1,1),bronze,keels);
 const reactor=new THREE.Group();reactor.position.set(0,4.8,31.3);env.add(reactor);ring(reactor,3.7,.2,bronze);ring(reactor,4.4,.08,warm);ring(reactor,3.4,.08,warm,[0,0,0],[.7,.4,.1]);aura(reactor,4.5,hostile?0xe07747:0x4cbbc7,[0,0,-.2],world.windUniform);
 const ceiling=new THREE.Group();env.add(ceiling);const constellations=[];for(let i=0;i<42;i++){const x=Math.sin(i*2.399)*10,z=-28+(i*7.7)%56;constellations.push({p:[x,9.5,z],s:[.035,.035,.035]});}batch(ceiling,new THREE.SphereGeometry(1,8,6),emit(0xaccbdd),constellations);
}
function surfaceMap(world,kind){
 const maps=world.coverTextures??=new Map();if(maps.has(kind))return maps.get(kind);
 const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d'),im=x.createImageData(512,512);let seed=kind==='stone'?431:kind==='crystal'?978:521;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let y=0;y<512;y++)for(let i=0;i<512;i++){const q=(y*512+i)*4,n=(rand()-.5)*20,strata=(Math.sin(y*.13)*2+Math.sin(i*.31+y*.08)*1.5),v=178+n+strata;im.data[q]=v;im.data[q+1]=v-2;im.data[q+2]=v-5;im.data[q+3]=255;}x.putImageData(im,0,0);
 for(let i=0;i<80;i++){let px=rand()*512,py=rand()*512;x.beginPath();x.moveTo(px,py);for(let j=0;j<5;j++){px+=(rand()-.5)*25;py+=rand()*12;x.lineTo(px,py);}x.strokeStyle=kind==='stone'?'rgba(20,22,26,.45)':'rgba(215,229,214,.17)';x.lineWidth=.5+rand()*1.5;x.stroke();}
 for(let i=0;i<900;i++){const px=rand()*512,py=rand()*512;x.fillStyle=rand()>.5?'rgba(250,240,215,.17)':'rgba(12,20,25,.18)';x.fillRect(px,py,1+rand()*7,1);}
 x.strokeStyle='rgba(245,231,204,.27)';x.lineWidth=3;x.strokeRect(3,3,506,506);x.strokeStyle='rgba(7,12,20,.35)';x.lineWidth=2;x.strokeRect(7,7,498,498);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(4,world.renderer.capabilities.getMaxAnisotropy());maps.set(kind,t);(world.generatedTextures??=[]).push(t);return t;
}
export function createCover(o,world){
 const g=new THREE.Group();g.position.set(o.x,o.y,o.z);const veil=o.zone==='veil',interior=!['ember','veil'].includes(o.zone),kind=veil?'crystal':interior?'alloy':'stone',texture=surfaceMap(world,kind);
 const main=new THREE.MeshStandardMaterial({color:veil?0x72928b:interior?0x68747c:0x8e8072,map:texture,bumpMap:texture,bumpScale:interior?.012:.025,roughness:interior?.55:.84,metalness:interior?.28:.12});
 const edge=new THREE.MeshStandardMaterial({color:veil?0xb0b09a:0xb49462,map:texture,bumpMap:texture,bumpScale:.015,metalness:.46,roughness:.45}),inset=new THREE.MeshStandardMaterial({color:veil?0x386468:interior?0x344452:0x5c5755,map:texture,roughness:.7,metalness:.16}),light=emit(veil?0x7ac9bb:0xd5b17b);
 add(g,new THREE.BoxGeometry(o.hx*2,o.hy*2,o.hz*2),main);
 const parts=[],lines=[];
 for(const side of[-1,1]){
  const z=side*(o.hz+.045);add(g,new THREE.BoxGeometry(o.hx*1.7,o.hy*1.43,.08),inset,[0,-.10,z]);
  for(const k of[-1,1]){add(g,new THREE.BoxGeometry(.14,o.hy*1.56,.2),edge,[k*o.hx*.89,0,z]);add(g,new THREE.BoxGeometry(o.hx*1.83,.12,.19),edge,[0,k*o.hy*.79,z]);}
  for(let j=-2;j<=2;j++){const xx=j*o.hx*.31;add(g,new THREE.BoxGeometry(.08,o.hy*1.33,.2),main,[xx,-.10,z+side*.06]);for(const yy of[-.62,.62])add(g,new THREE.SphereGeometry(.065,6,4),edge,[xx,yy*o.hy,z+side*.14]);}
  // Recessed ventilation, mechanical locks, and circular clan seals.
  for(let j=0;j<5;j++)add(g,new THREE.BoxGeometry(o.hx*.36,.075,.09),main,[o.hx*.47,-o.hy*.5+j*.14,z+side*.13]);
  const seal=ring(g,.47,.065,edge,[-o.hx*.44,.28,z+side*.13]);add(g,new THREE.OctahedronGeometry(.19),edge,[-o.hx*.44,.28,z+side*.13],[1,1.5,.18]);
  add(g,new THREE.BoxGeometry(o.hx*.9,.035,.075),light,[0,o.hy*.67,z+side*.11]);
 }
 for(const side of[-1,1]){
  const x=side*(o.hx+.035);for(let j=0;j<3;j++){const rib=add(g,new THREE.BoxGeometry(.16,o.hy*1.78,.18),edge,[x,0,(j-1)*o.hz*.63]);rib.rotation.x=j===1?0:side*.06;}
  for(const z of[-o.hz*.72,o.hz*.72]){const brace=add(g,new THREE.BoxGeometry(.22,.28,o.hz*.55),main,[x,-o.hy*.68,z]);brace.rotation.y=side*.1;}
 }
 if(veil){
  for(let i=0;i<7;i++){const a=i*2.399,r=o.hx*.6;const stone=add(g,new THREE.OctahedronGeometry(1,0),i%2?main:inset,[Math.sin(a)*r,o.hy+.14,Math.cos(a)*o.hz*.52],[.3+i%3*.2,.3+i%2*.18,.35]);stone.rotation.set(.1*i,i*.8,.2);}
 }else if(!interior){
  for(let i=0;i<9;i++){const stone=add(g,new THREE.DodecahedronGeometry(1,0),main,[-o.hx*.85+i*o.hx*.21,o.hy+.07,Math.sin(i*1.7)*o.hz*.5],[.5+i%3*.12,.18+i%2*.14,.5]);stone.rotation.y=i*.7;}
 }else{add(g,new THREE.BoxGeometry(o.hx*1.85,.16,o.hz*1.88),edge,[0,o.hy+.08,0]);for(let i=-2;i<=2;i++)add(g,new THREE.BoxGeometry(.09,.06,o.hz*1.7),inset,[i*o.hx*.3,o.hy+.2,0]);}
 return g;
}

function outskirts(world,env,veil){
 const texture=surfaceMap(world,veil?'crystal':'stone'),stone=new THREE.MeshStandardMaterial({color:veil?0x607975:0xa49073,map:texture,bumpMap:texture,bumpScale:.025,metalness:.12,roughness:.85}),bronze=mat(0xa48b63,.48,.5),dark=mat(veil?0x213f45:0x675143,.12,.9);
 if(!veil){
  const shafts=[],caps=[],voussoirs=[],fallen=[],metal=[];
  for(const [x,z,r,h,tilt] of [[-81,39,7,5,.06],[80,57,8,6,-.08],[-61,90,6,4,.03]]){
   for(const sign of[-1,1]){shafts.push({p:[x+sign*r,h*.5,z],s:[.8,h,.8],r:[0,0,sign*tilt]});caps.push({p:[x+sign*r,.35,z],s:[2,.7,2]},{p:[x+sign*r,h,z],s:[2.1,.48,1.7]});}
   for(let i=0;i<15;i++){if(x<0&&i>9&&i<12)continue;const a=i/14*Math.PI;voussoirs.push({p:[x+Math.cos(a)*r,h+Math.sin(a)*r,z],s:[1.38,1.35,1.6],r:[0,0,a]});metal.push({p:[x+Math.cos(a)*(r-.7),h+Math.sin(a)*(r-.7),z-.9],s:[.75,.065,.065],r:[0,0,a+Math.PI/2]});}
   for(let i=0;i<7;i++)fallen.push({p:[x-7+i*2,.7+(i%3)*.2,z-7+Math.sin(i*2)*3],s:[1.2+i%2,.7,1.3],r:[.1*i,i*.75,.2]});
  }
  batch(env,new THREE.CylinderGeometry(.9,1,1,12),stone,shafts);batch(env,new THREE.BoxGeometry(1,1,1),stone,[...caps,...voussoirs]);batch(env,new THREE.DodecahedronGeometry(1,0),stone,fallen);batch(env,new THREE.BoxGeometry(1,1,1),bronze,metal);
  const gravestones=[];for(let i=0;i<7;i++)gravestones.push({p:[75+Math.sin(i)*3,2+i%3, -45+i*5],s:[.9,4+i%3*2,.7],r:[0,.1*i,.05*Math.sin(i)]});batch(env,new THREE.ConeGeometry(.7,1,4),dark,gravestones);
 }else{
  const roots=[],rootPoints=[],stones=[],caps=[];
  for(let i=0;i<8;i++){const side=i<4?-1:1,z=-40+(i%4)*30,x=side*(75+i%3*4),h=4+i%3*3;const points=[new THREE.Vector3(x+side*8,.2,z-9),new THREE.Vector3(x+side*3,h*.6,z-3),new THREE.Vector3(x,h,z+3),new THREE.Vector3(x-side*4,h*.4,z+11),new THREE.Vector3(x-side*2,.2,z+17)];roots.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.6+i%3*.25,7,false));rootPoints.push({p:[x,h+.3,z+3],s:[.18,.5,.18]});for(let k=0;k<3;k++)stones.push({p:[x+side*(3+k*2),.5+k*.8,z+k*3],s:[1.5+k*.6,1+k*.4,1.4],r:[.3*k,i,.2]});}
  const g=mergeGeometries(roots,false);roots.forEach(g=>g.dispose());add(env,g,stone);batch(env,new THREE.OctahedronGeometry(1),emit(0x95cbbc),rootPoints);batch(env,new THREE.DodecahedronGeometry(1,0),dark,stones);
  const relics=[];for(let i=0;i<6;i++){const z=78+i*6,x=39+Math.sin(i*1.6)*13;relics.push({p:[x,6+i*2,z],s:[1.5,3.2,1.3],r:[0,i*.4,.1]});caps.push({p:[x,6+i*2,z+.2],s:[.12,1.4,.12]});}batch(env,new THREE.OctahedronGeometry(1,0),stone,relics);batch(env,new THREE.BoxGeometry(1,1,1),emit(0x79beb8),caps);
 }
}
