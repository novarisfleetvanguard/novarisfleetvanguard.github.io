import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js?v=4';

// The fleet's astronomical instrument: a live, spatial frontispiece, never a video loop.
export class AstralFrontispiece {
 constructor(canvas,{reducedMotion=false,quality='high'}={}){
  this.canvas=canvas;this.disposed=false;this.contextLost=false;this.reduced=!!reducedMotion;this.quality=quality==='low'?'low':'high';this.mode='boot';this.clock=0;this.pointer=new T.Vector2();this.target=new T.Vector3();this.rings=[];
  this.renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:quality==='high',powerPreference:'low-power'});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,quality==='high'?1.5:1));this.renderer.setClearColor(0x03050b,0);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3;
  this.onContextLost=e=>{e.preventDefault();this.contextLost=true;};this.onContextRestored=()=>{this.contextLost=false;this.resize();};canvas.addEventListener('webglcontextlost',this.onContextLost);canvas.addEventListener('webglcontextrestored',this.onContextRestored);
  this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(42,1,.1,180);this.camera.position.set(0,1,19);
  this.instrument=new T.Group();this.scene.add(this.instrument);this.instrument.rotation.set(.2,-.15,-.26);
  const brass=new T.MeshStandardMaterial({color:0xa88751,metalness:.78,roughness:.34});const dark=new T.MeshStandardMaterial({color:0x101824,metalness:.6,roughness:.48});
  for(let k=0;k<5;k++){
   const g=new T.Group(),r=3.3+k*.34;g.rotation.set(k*.43,k*.16,k*.6);this.instrument.add(g);this.rings.push(g);
   const ring=new T.Mesh(new T.TorusGeometry(r,k===2?.048:.025,6,128,Math.PI*(k===2?1.62:1.94)),brass);g.add(ring);
   const ticks=new T.InstancedMesh(new T.BoxGeometry(.018,.075,.05),brass,64);const dummy=new T.Object3D();
   for(let i=0;i<64;i++){const a=i/64*Math.PI*2;dummy.position.set(Math.cos(a)*r,Math.sin(a)*r,0);dummy.rotation.z=a-Math.PI/2;dummy.scale.y=i%8===0?2:1;dummy.updateMatrix();ticks.setMatrixAt(i,dummy.matrix);}g.add(ticks);
  }
  const orb=new T.Mesh(new T.SphereGeometry(2.44,64,40),new T.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:'varying vec3 v;void main(){v=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 v;uniform float time;void main(){float edge=pow(1.-abs(v.z),3.);float lava=sin(v.x*18.+v.y*12.+sin(v.z*13.))*sin(v.y*28.-v.x*7.);vec3 c=mix(vec3(.006,.009,.027),vec3(.045,.03,.095),smoothstep(-.2,.9,lava));c+=edge*vec3(.35,.12,.6);gl_FragColor=vec4(c,1.);}'}));this.orb=orb;this.instrument.add(orb);
  const halo=new T.Mesh(new T.RingGeometry(2.4,3.12,128),new T.ShaderMaterial({side:T.DoubleSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending,vertexShader:'varying vec2 uvv;void main(){uvv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 uvv;void main(){float r=length(uvv-.5)*2.;float a=exp(-abs(r-.79)*26.)*.8;gl_FragColor=vec4(.78,.47,.95,a);}'}));this.instrument.add(halo);
  const starPositions=new Float32Array(1800*3);for(let i=0;i<1800;i++){const f=(n)=>{const x=Math.sin(n*128.321)*743.124;return x-Math.floor(x);};starPositions[i*3]=(f(i*3)-.5)*95;starPositions[i*3+1]=(f(i*3+1)-.5)*60;starPositions[i*3+2]=-10-f(i*3+2)*70;}
  const geom=new T.BufferGeometry();geom.setAttribute('position',new T.BufferAttribute(starPositions,3));this.stars=new T.Points(geom,new T.PointsMaterial({color:0xc8c4df,size:.042,transparent:true,opacity:.8,depthWrite:false}));this.scene.add(this.stars);
  const orbit=new T.Group();this.scene.add(orbit);this.shipOrbit=orbit;
  this.scene.add(new T.HemisphereLight(0xc8cdff,0x171026,2.8));const key=new T.DirectionalLight(0xffdcad,5);key.position.set(-8,9,10);this.scene.add(key);const rim=new T.DirectionalLight(0x7f9bff,4);rim.position.set(8,-2,-5);this.scene.add(rim);
  this.dust=new T.Mesh(new T.TorusGeometry(7,.006,3,150),new T.MeshBasicMaterial({color:0x6c5980,transparent:true,opacity:.38}));this.dust.rotation.set(1.12,0,.17);this.scene.add(this.dust);
  this.onPointer=e=>{this.pointer.set(e.clientX/innerWidth*2-1,e.clientY/innerHeight*2-1);};window.addEventListener('pointermove',this.onPointer,{passive:true});this.setQuality(this.quality);
 }
 async load(){if(this.disposed)throw new Error('Frontispiece has been disposed');if(this.ship)return this;if(!this.loadingPromise)this.loadingPromise=(async()=>{const gltf=await new GLTFLoader().loadAsync('./assets/novaris-vanguard.glb?v=4');if(this.disposed){release(gltf.scene);throw new Error('Frontispiece disposed during asset loading');}const original=gltf.scene.getObjectByName('PlayerFighter');if(!original){release(gltf.scene);throw new Error('Missing model PlayerFighter');}this.ship=original.clone(true);this.ship.position.set(0,0,0);this.ship.rotation.set(.12,-.72,-.06);this.ship.scale.setScalar(.56);this.shipOrbit.add(this.ship);return this;})().catch(error=>{this.loadingPromise=null;throw error;});return this.loadingPromise;}
 setMode(mode){if(this.disposed)return;this.mode=mode;this.canvas.style.visibility=['boot','loading','menu','lobby'].includes(mode)?'visible':'hidden';}
 setReducedMotion(v){this.reduced=!!v;}
 setQuality(q){if(this.disposed)return;this.quality=q==='low'?'low':'high';this.stars.geometry.setDrawRange(0,this.quality==='low'?900:1800);this.resize();}
 resize(){if(this.disposed)return;const w=Math.max(1,this.canvas.clientWidth||innerWidth),h=Math.max(1,this.canvas.clientHeight||innerHeight);this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,this.quality==='low'?1:1.5));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 render(dt){if(this.disposed||this.contextLost)return;dt=Math.min(.1,Math.max(0,Number.isFinite(dt)?dt:0));if(!['boot','loading','menu','lobby'].includes(this.mode)||document.hidden)return;this.clock+=this.reduced?0:dt;const t=this.clock,portrait=innerWidth<760,menu=this.mode==='menu';const x=menu&&!portrait?4:0;this.target.set(x,portrait?2.3:.5,0);if(this.reduced)this.instrument.position.copy(this.target);else this.instrument.position.lerp(this.target,1-Math.exp(-dt*3));const scale=portrait?.75:1;this.instrument.scale.setScalar(scale);this.instrument.rotation.y=-.2+Math.sin(t*.07)*.14+(this.reduced?0:this.pointer.x*.025);this.orb.rotation.y=t*.014;
  this.rings.forEach((g,i)=>{g.rotation.z=t*(i%2?-.018:.012)+i*.6;});this.stars.rotation.z=t*.0015;
  this.shipOrbit.position.set(x+(portrait?.1:1.3),portrait?(menu?-3.9:-.7):-.9,4.3);this.shipOrbit.rotation.y=this.reduced?0:Math.sin(t*.15)*.1;this.shipOrbit.position.y+=this.reduced?0:Math.sin(t*.7)*.08;
  if(this.mode==='boot'){this.shipOrbit.visible=false;}else this.shipOrbit.visible=true;
  this.camera.position.x=this.reduced?0:this.pointer.x*.08;this.camera.position.y=1+(this.reduced?0:-this.pointer.y*.06);this.renderer.render(this.scene,this.camera);
 }
 dispose(){if(this.disposed)return;this.disposed=true;window.removeEventListener('pointermove',this.onPointer);this.canvas.removeEventListener('webglcontextlost',this.onContextLost);this.canvas.removeEventListener('webglcontextrestored',this.onContextRestored);release(this.scene);this.renderer.dispose();this.scene.clear();this.ship=null;this.rings.length=0;}
}
function release(root){const gs=new Set(),ms=new Set(),ts=new Set();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)gs.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m)ms.add(m);});for(const m of ms){for(const value of Object.values(m))if(value?.isTexture)ts.add(value);m.dispose();}gs.forEach(g=>g.dispose());ts.forEach(t=>t.dispose());}
