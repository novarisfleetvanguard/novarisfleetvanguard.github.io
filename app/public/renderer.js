import * as THREE from 'three';
import { loadVanguardModel } from './model-loader.js?v=10';
import { mergeGeometries } from './vendor/utils/BufferGeometryUtils.js?v=10';
import { astralSpace, astralPlanet, astralInterior, createCover } from './world-art.js?v=10';
import { decorateCombatant, animateCombatant, combatEvent } from './combat-art.js?v=10';

const V=THREE.Vector3, C=THREE.Color, TAU=Math.PI*2;
const list=x=>Array.isArray(x)?x:Object.values(x||{});
const clamp=THREE.MathUtils.clamp;
const rnd=(seed=441)=>()=>((seed=Math.imul(1664525,seed)+1013904223>>>0)/4294967296);
const finite=(n,f=0)=>Number.isFinite(n)?n:f;
const temp=new THREE.Object3D();
const COVER_AXES=[['x','hx'],['y','hy'],['z','hz']], BULLET_FORWARD=new V(0,0,1);
const BULLET_COLORS={enemy:new C(0xff704e),lance:new C(0xe6c6ff),friendly:new C(0x77f5ff)};
function material(color,emissive=0,roughness=.7,metalness=.2){return new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:emissive?1.2:0,roughness,metalness});}
function mesh(geo,mat,parent,position=[0,0,0],scale=[1,1,1]){const o=new THREE.Mesh(geo,mat);o.position.set(...position);o.scale.set(...scale);if(parent)parent.add(o);return o;}
function box(parent,mat,pos,size){return mesh(new THREE.BoxGeometry(1,1,1),mat,parent,pos,size);}
function glowRing(parent,color,r=3,t=.06){const o=mesh(new THREE.TorusGeometry(r,t,5,56),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8}),parent);o.rotation.x=Math.PI/2;return o;}
function instances(parent,geo,mat,transforms){const m=new THREE.InstancedMesh(geo,mat,transforms.length);transforms.forEach((a,i)=>{temp.position.set(...a.p);temp.rotation.set(...(a.r||[0,0,0]));temp.scale.set(...(a.s||[1,1,1]));temp.updateMatrix();m.setMatrixAt(i,temp.matrix);if(a.color)m.setColorAt(i,new C(a.color));});m.instanceMatrix.needsUpdate=true;parent.add(m);return m;}
function compact(root,keepUV=false){
  root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),groups=new Map();
  root.traverse(o=>{if(!o.isMesh)return;let g=o.geometry.clone();if(g.index)g=g.toNonIndexed();g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));Object.keys(g.attributes).filter(k=>!(keepUV?['position','normal','uv']:['position','normal']).includes(k)).forEach(k=>g.deleteAttribute(k));if(!g.attributes.normal)g.computeVertexNormals();const m=Array.isArray(o.material)?o.material[0]:o.material;const leg=/^SM (boot|shin|knee|thigh)/.test(o.name)?(o.name.endsWith(' -1')?'legL':'legR'):/^SM rifle/.test(o.name)?'weapon':/^SM .*cloak/.test(o.name)?'cloak':'';const key=m.uuid+leg;if(!groups.has(key))groups.set(key,{m,gs:[],leg});groups.get(key).gs.push(g);});
  const out=new THREE.Group();out.name=root.name;
  const legs={};groups.forEach(({m,gs,leg})=>{const geometry=mergeGeometries(gs,false);if(!geometry)throw new Error('Model geometry could not be merged');if(leg){const pivot=leg==='weapon'?new V(.25,1.4,.6):leg==='cloak'?new V(0,1.9,-.2):new V(leg==='legL'?-.23:.23,1.23,0);if(!legs[leg]){legs[leg]=new THREE.Group();legs[leg].name=leg;legs[leg].position.copy(pivot);out.add(legs[leg]);}geometry.translate(-pivot.x,-pivot.y,-pivot.z);legs[leg].add(new THREE.Mesh(geometry,m));}else out.add(new THREE.Mesh(geometry,m));gs.forEach(g=>g.dispose());});
  return out;
}
function lowDetail(root){
  const out=new THREE.Group();out.name=root.name+'Low';const shared=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.64,metalness:.35});
  function part(src,dst){const gs=[];for(const o of src.children){if(o.isMesh){let g=o.geometry.clone();const c=o.material.color.clone();if(o.material.emissive)c.add(o.material.emissive.clone().multiplyScalar(.4));const col=new Float32Array(g.attributes.position.count*3);for(let i=0;i<col.length;i+=3){col[i]=Math.min(c.r,1);col[i+1]=Math.min(c.g,1);col[i+2]=Math.min(c.b,1);}g.setAttribute('color',new THREE.BufferAttribute(col,3));o.updateMatrix();g.applyMatrix4(o.matrix);gs.push(g);}else if(o.isGroup){const child=new THREE.Group();child.name=o.name;child.position.copy(o.position);child.rotation.copy(o.rotation);child.scale.copy(o.scale);dst.add(child);part(o,child);}}if(gs.length){dst.add(new THREE.Mesh(mergeGeometries(gs,false),shared));gs.forEach(g=>g.dispose());}}
  part(root,out);return out;
}
function disposeGraph(...roots){const gs=new Set(),ms=new Set(),ts=new Set();for(const root of roots)root?.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)gs.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m)ms.add(m);});for(const m of ms){for(const value of Object.values(m))if(value?.isTexture)ts.add(value);m.dispose();}gs.forEach(g=>g.dispose());ts.forEach(t=>t.dispose());}
// Earliest entry along a segment into the authoritative cover boxes.
function coverEntry(start,end,obstacles,zone,padding=0){
  let nearest=1;
  for(const o of list(obstacles)){if(o.zone!==zone)continue;let lo=0,hi=1,valid=true;for(const [axis,half] of COVER_AXES){const min=o[axis]-o[half]-padding,max=o[axis]+o[half]+padding,d=end[axis]-start[axis],v=start[axis];if(Math.abs(d)<1e-8){if(v<min||v>max){valid=false;break;}}else{let a=(min-v)/d,b=(max-v)/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi){valid=false;break;}}}if(valid&&lo>=0&&lo<nearest)nearest=lo;
  }return nearest;
}
function planetMaterial(a,b,noiseMap=null){const m=new THREE.ShaderMaterial({uniforms:{a:{value:new C(a)},b:{value:new C(b)}},vertexShader:'varying vec3 p; varying vec3 n; void main(){p=position;n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 p;varying vec3 n;uniform vec3 a;uniform vec3 b;
float hash(vec3 q){return fract(sin(dot(q,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 q){vec3 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 q){float v=0.,am=.5;for(int i=0;i<5;i++){v+=noise(q)*am;q=q*2.07+vec3(1.5,4.3,7.2);am*=.5;}return v;}
void main(){vec3 uv=normalize(p);float continents=fbm(uv*5.);float detail=fbm(uv*23.);vec3 color=mix(a,b,smoothstep(.36,.62,continents));color*=.75+detail*.5;float clouds=smoothstep(.6,.78,fbm(uv*9.+vec3(3.)));color=mix(color,vec3(.78,.83,.83),clouds*.55);float sun=max(.08,dot(normalize(n),normalize(vec3(-.5,.5,1.))));gl_FragColor=vec4(color*sun,1.);}`});if(noiseMap){m.uniforms.noiseMap={value:noiseMap};m.fragmentShader='uniform samplerCube noiseMap;'+m.fragmentShader.replace('float continents=fbm(uv*5.);float detail=fbm(uv*23.);','vec3 fields=textureCube(noiseMap,uv).rgb;float continents=fields.x;float detail=fields.y;').replace('float clouds=smoothstep(.6,.78,fbm(uv*9.+vec3(3.)));','float clouds=fields.z;');}return m;}
function atmosphere(color){return new THREE.ShaderMaterial({uniforms:{color:{value:new C(color)}},vertexShader:'varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);v=normalize(-p.xyz);n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*p;}',fragmentShader:'uniform vec3 color;varying vec3 n;varying vec3 v;void main(){float f=pow(1.-abs(dot(normalize(n),normalize(v))),3.5);gl_FragColor=vec4(color,f*.6);}',transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending});}

export class WorldRenderer {
  constructor(canvas,{quality='high',reducedMotion=false}={}){
    this.canvas=canvas;this.proceduralCaches=[];this.proceduralCachesDirty=false;this.disposed=false;this.contextLost=false;this.quality=quality==='low'?'low':'high';this.reducedMotion=reducedMotion;this.scene=new THREE.Scene();this.scene.background=new C('#020611');this.camera=new THREE.PerspectiveCamera(66,1,.15,3000);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:quality==='high',alpha:false,powerPreference:'high-performance'});this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
    this.onContextLost=e=>{e.preventDefault();this.contextLost=true;this.fpsWindowStart=null;this.fpsFrames=0;if(this.info)this.info.contextLost=true;};this.onContextRestored=()=>{this.contextLost=false;this.proceduralCachesDirty=true;this.cameraReady=false;if(this.info)this.info.contextLost=false;this.resize();};canvas.addEventListener('webglcontextlost',this.onContextLost);canvas.addEventListener('webglcontextrestored',this.onContextRestored);
    this.scene.add(new THREE.HemisphereLight(0xb0d7ff,0x15202d,2.2));const key=new THREE.DirectionalLight(0xffedd6,2.8);key.position.set(-50,80,35);this.scene.add(key);this.key=key;
    this.fill=new THREE.DirectionalLight(0x38a5ff,1.1);this.fill.position.set(40,10,-30);this.scene.add(this.fill);
    this.entities=new Map();this.markers=new Map();this.covers=new Map();this.environments=new Map();this.models={};this.state=null;this.zone='space';this.time=0;this.windUniform={value:0};this.cameraReady=false;this.info={fps:0,drawcalls:0,triangles:0};this.fpsWindowStart=null;this.fpsFrames=0;this.loaded=false;
    this.zoneObstacles=[];this.bulletStart=new V();this.bulletHead=new V();this.bulletTail=new V();this.bulletVelocity=new V();
    this.dynamic=new THREE.Group();this.scene.add(this.dynamic);
    this.bullets=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.12,1),new THREE.MeshBasicMaterial({color:0xffffff}),320);this.bullets.count=0;this.bullets.frustumCulled=false;this.scene.add(this.bullets);
    const contactGeo=new THREE.PlaneGeometry(1,1);contactGeo.rotateX(-Math.PI/2);this.contactShadows=new THREE.InstancedMesh(contactGeo,new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 v;void main(){float d=length((v-.5)*2.);float a=(1.-smoothstep(.08,1.,d))*.28;gl_FragColor=vec4(.01,.018,.027,a);}'}),64);this.contactShadows.count=0;this.contactShadows.frustumCulled=false;this.contactShadows.renderOrder=3;this.scene.add(this.contactShadows);
    this.particles=[];this.particleGeo=new THREE.BufferGeometry();this.particlePos=new Float32Array(768*3);this.particleCol=new Float32Array(768*3);this.particleGeo.setAttribute('position',new THREE.BufferAttribute(this.particlePos,3));this.particleGeo.setAttribute('color',new THREE.BufferAttribute(this.particleCol,3));this.particleGeo.setDrawRange(0,0);
    this.particleMesh=new THREE.Points(this.particleGeo,new THREE.PointsMaterial({size:.18,vertexColors:true,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending}));this.particleMesh.frustumCulled=false;this.scene.add(this.particleMesh);this.resize();
  }
  async load(onProgress){
    if(this.disposed)throw new Error('Renderer has been disposed');if(this.loaded){onProgress?.({fraction:1,stage:'World ready'});return this;}if(!this.loadingPromise)this.loadingPromise=this.loadAssets(onProgress).catch(error=>{this.loadingPromise=null;throw error;});return this.loadingPromise;
  }
  async loadAssets(onProgress){
    const progress=(fraction,stage)=>{if(typeof onProgress==='function')onProgress({fraction,stage});};progress(0,'Loading authored spacecraft and armor');
    const gltf=await loadVanguardModel();
    if(this.disposed){disposeGraph(gltf.scene);throw new Error('Renderer disposed during asset loading');}
    progress(.55,'Blender assets received');
    for(const name of ['PlayerFighter','EnemyFighter','SpaceMarine','AlienDrone','RiftCrystal','Flagship','ShipCorridor']){const root=gltf.scene.getObjectByName(name);if(!root)throw new Error('Missing model '+name);this.models[name]=compact(root);}
    this.models.HostileMarine=this.models.SpaceMarine.clone();this.models.HostileMarine.traverse(o=>{if(o.isMesh){o.material=o.material.clone();const name=o.material.name;if(/Ivory/.test(name))o.material.color.set('#344454');if(/Cyan/.test(name)){o.material.color.set('#ff6850');o.material.emissive.set('#ff5235');}}});

    this.models.HostileMarineLow=lowDetail(this.models.HostileMarine);
    this.sharedGeometries=new Set();this.sharedMaterials=new Set();Object.values(this.models).forEach(root=>root.traverse(o=>{if(o.isMesh){this.sharedGeometries.add(o.geometry);this.sharedMaterials.add(o.material);}}));progress(.7,'Preparing materials and animated armor');this.loaded=true;this.setZone('space',true);this.showcase=this.models.PlayerFighter.clone();this.showcase.scale.setScalar(.75);this.showcase.rotation.y=-.32;this.scene.add(this.showcase);this.resize();progress(1,'World ready');return this;
  }
  clone(name,scale=1){const m=this.models[name].clone();m.scale.setScalar(scale);return m;}
  resize(){if(this.disposed)return;const w=this.canvas.clientWidth||window.innerWidth,h=this.canvas.clientHeight||window.innerHeight;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,this.quality==='low'?1:1.65));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  setQuality(q){
    if(this.disposed)return;this.quality=q==='low'?'low':'high';this.resize();
    this.entities.forEach(r=>{if(r.type!=='HostileMarine')return;const want=this.quality==='low';if((r.model.userData.lowDetail===true)===want)return;const old=r.model;this.disposeUnique(old);r.model=this.clone(want?'HostileMarineLow':'HostileMarine',r.baseScale);r.model.userData.lowDetail=want;r.model.position.copy(old.position);r.model.rotation.copy(old.rotation);r.group.remove(old);r.group.add(r.model);});
    if(this.starField)this.starField.geometry.setDrawRange(0,this.quality==='low'?2200:4200);this.environments.forEach(e=>{if(e.userData.grass)e.userData.grass.count=this.quality==='low'?Math.min(1800,e.userData.grassCount):e.userData.grassCount;for(const o of e.userData.highQualityOnly||[])o.visible=this.quality==='high';});
  }
  setReducedMotion(b){this.reducedMotion=!!b;if(this.reducedMotion){this.shake=0;this.camera.fov=66;this.camera.updateProjectionMatrix();}}
  reset(){
    if(this.disposed)return;for(const map of[this.entities,this.markers,this.covers]){map.forEach(value=>{const root=value.group||value;this.dynamic.remove(root);this.disposeUnique(root);});map.clear();}this.state=null;this.self=null;this.zoneObstacles=[];this.cameraReady=false;this.fpsWindowStart=null;this.fpsFrames=0;this.aimYaw=undefined;this.aimPitch=undefined;this.particles.length=0;this.particleGeo.setDrawRange(0,0);this.bullets.count=0;this.contactShadows.count=0;this.shake=0;if(this.loaded){this.setZone('space');if(this.showcase)this.showcase.visible=true;}
  }
  setZone(zone,force=false){
    if(!force&&this.zone===zone)return;this.zone=zone;this.cameraReady=false;this.particles.length=0;
    this.environments.forEach(e=>e.visible=false);
    const key=zone.startsWith('ship:')?'ship':zone;let env=this.environments.get(key);if(!env){env=new THREE.Group();this.environments.set(key,env);this.scene.add(env);if(zone==='space')this.buildSpace(env);else if(zone==='ember'||zone==='veil')this.buildPlanet(env,zone);else this.buildInterior(env,zone);}
    env.visible=true;
    this.scene.fog=zone==='space'?new THREE.FogExp2(0x030817,.00018):zone==='ember'?new THREE.FogExp2(0x3c2530,.0035):zone==='veil'?new THREE.FogExp2(0x092f3e,.004):new THREE.FogExp2(0x070e1d,.008);
    this.scene.background=new C(zone==='space'?'#020611':zone==='ember'?'#31232f':zone==='veil'?'#062b38':'#030812');this.key.color.set(zone==='ember'?0xffbc84:zone==='veil'?0x9bffe4:0xffead5);
    this.markers.forEach(m=>{this.dynamic.remove(m.group);this.disposeUnique(m.group);});this.markers.clear();this.covers.forEach(g=>{this.dynamic.remove(g);this.disposeUnique(g);});this.covers.clear();
  }
  buildStars(parent,count=4200,radius=1000){const random=rnd(1907),positions=new Float32Array(count*3),colors=new Float32Array(count*3);for(let i=0;i<count;i++){const a=random()*TAU,z=random()*2-1,r=Math.sqrt(1-z*z);positions.set([Math.cos(a)*r*radius,z*radius,Math.sin(a)*r*radius],i*3);const c=new C().setHSL(.53+random()*.18,.1+random()*.25,.65+random()*.3);colors.set([c.r,c.g,c.b],i*3);}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));const points=new THREE.Points(geo,new THREE.PointsMaterial({size:2.4,vertexColors:true,sizeAttenuation:true,depthWrite:false,transparent:true,opacity:.9,fog:false}));points.renderOrder=2;parent.add(points);return points;}
  // These direction-only fields never change with time. Keep their raw linear values
  // in shared half-float maps; palette, light, geometry, and animation remain live.
  bakeProcedural(material,geometry,near,far){
    const target=new THREE.WebGLCubeRenderTarget(256,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false,depthBuffer:false,stencilBuffer:false});
    target.texture.colorSpace=THREE.NoColorSpace;
    const scene=new THREE.Scene(),camera=new THREE.CubeCamera(near,far,target);scene.add(new THREE.Mesh(geometry,material));
    this.proceduralCaches.push({target,scene,camera});camera.update(this.renderer,scene);return target.texture;
  }
  restoreProceduralCaches(){
    for(const cache of this.proceduralCaches)cache.camera.update(this.renderer,cache.scene);
    this.proceduralCachesDirty=false;
  }
  buildSpace(env){
    this.starField=this.buildStars(env);this.starField.geometry.setDrawRange(0,this.quality==='low'?2200:4200);
    const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,vertexShader:'varying vec3 dir;void main(){dir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 dir;float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}float n(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}float f(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=n(p)*a;p=p*2.03+vec3(5.2,1.7,8.1);a*=.5;}return v;}void main(){vec3 d=normalize(dir);float clouds=f(d*4.8+vec3(2,7,1));float band=pow(max(0.,1.-abs(d.y*.85+d.x*.27+d.z*.12)),5.);float wisps=smoothstep(.3,.73,clouds)*band;vec3 col=vec3(.002,.004,.013)+vec3(.10,.045,.145)*wisps+vec3(.009,.032,.046)*f(d*3.-vec3(5.))*band;gl_FragColor=vec4(col,1.);}'});
    const skyGeometry=new THREE.SphereGeometry(1450,36,24);let visibleSkyMaterial=skyMat;
    // Unsupported devices retain the original shaders instead of an incomplete target.
    if(this.renderer.extensions.has('EXT_color_buffer_float')){
      const skyMap=this.bakeProcedural(skyMat,skyGeometry,1,2000);
      visibleSkyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,uniforms:{skyMap:{value:skyMap}},vertexShader:skyMat.vertexShader,fragmentShader:'varying vec3 dir;uniform samplerCube skyMap;void main(){gl_FragColor=textureCube(skyMap,normalize(dir));}'});
      const noiseMaterial=planetMaterial(0,0);noiseMaterial.side=THREE.BackSide;
      noiseMaterial.fragmentShader=noiseMaterial.fragmentShader.slice(0,noiseMaterial.fragmentShader.indexOf('void main(){vec3 uv='))+'void main(){vec3 uv=normalize(p);gl_FragColor=vec4(fbm(uv*5.),fbm(uv*23.),smoothstep(.6,.78,fbm(uv*9.+vec3(3.))),1.);}';
      this.planetNoiseTexture=this.bakeProcedural(noiseMaterial,new THREE.SphereGeometry(1,24,16),.1,2);
    }
    const sky=mesh(skyGeometry,visibleSkyMaterial,env);sky.renderOrder=-1000;

    astralSpace(this,env);
    this.planetGroup=new THREE.Group();env.add(this.planetGroup);this.spacePlanets=new Map();
    const random=rnd(725),rocks=[];for(let i=0;i<100;i++){const a=random()*TAU,r=215+random()*180;rocks.push({p:[Math.sin(a)*r,(random()-.5)*190,Math.cos(a)*r],s:[2+random()*9,1+random()*5,2+random()*7],r:[random()*3,random()*3,random()*3]});}
    instances(env,new THREE.IcosahedronGeometry(1,0),material(0x26343f,0,.95,.3),rocks);

    const distant=mesh(new THREE.SphereGeometry(95,40,24),planetMaterial(0x141143,0x413572,this.planetNoiseTexture),env,[-460,175,420]);distant.add(mesh(new THREE.SphereGeometry(99,32,20),atmosphere(0x7661ce)));
  }
  makePlanet(p){
    const group=new THREE.Group(),radius=finite(p.radius,26),ember=String(p.id).includes('ember');
    mesh(new THREE.SphereGeometry(radius,48,32),planetMaterial(ember?0x553124:0x064752,ember?0xcb7547:0x48ab9c,this.planetNoiseTexture),group);
    mesh(new THREE.SphereGeometry(radius*1.035,40,28),atmosphere(ember?0xf9985d:0x3fe8e5),group);
    const rings=mesh(new THREE.RingGeometry(radius*1.25,radius*1.8,80,1),new THREE.MeshBasicMaterial({color:ember?0xc88763:0x62c0b8,side:THREE.DoubleSide,transparent:true,opacity:.22,depthWrite:false}),group);rings.rotation.x=Math.PI/2.45;rings.rotation.y=.35;
    group.position.set(finite(p.x),finite(p.y),finite(p.z));this.planetGroup.add(group);return group;
  }
  torii(parent,pos,scale=1,color=0xc14332){
    const group=new THREE.Group();group.position.set(...pos);group.scale.setScalar(scale);parent.add(group);const alloy=material(color,0,.42,.65),dark=material(0x15202b,0,.36,.8),light=new THREE.MeshBasicMaterial({color:0xffc772});
    const pieces=[];for(const s of [-1,1]){pieces.push({p:[s*4,4.5,0],s:[.75,9,.85]},{p:[s*4,0,0],s:[1.5,.5,1.6]});}pieces.push({p:[0,8,0],s:[10,.6,1]},{p:[0,9.35,0],s:[11.5,.65,1.3]});instances(group,new THREE.BoxGeometry(1,1,1),alloy,pieces);
    box(group,dark,[0,9.78,0],[12,.18,1.6]);box(group,light,[0,8.5,.53],[1.3,1.3,.05]);return group;
  }



  groundTexture(veil){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const ctx=canvas.getContext('2d'),random=rnd(veil?6242:3394),data=ctx.createImageData(1024,1024);
    for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const i=(y*1024+x)*4,grain=(random()-.5)*24,strata=Math.sin(y*.11+Math.sin(x*.017)*7)*4+Math.sin(x*.043+y*.023)*3,b=188+grain+strata;data.data[i]=b;data.data[i+1]=b-3;data.data[i+2]=b-7;data.data[i+3]=255;}
    ctx.putImageData(data,0,0);
    for(let j=0;j<360;j++){let x=random()*1024,y=random()*1024,a=random()*TAU;ctx.beginPath();ctx.moveTo(x,y);for(let k=0;k<5+random()*10;k++){a+=(random()-.5)*.8;x+=Math.cos(a)*(3+random()*13);y+=Math.sin(a)*(3+random()*13);ctx.lineTo(x,y);}ctx.lineWidth=.5+random()*1.4;ctx.strokeStyle=veil?'rgba(29,60,52,.22)':'rgba(48,31,25,.3)';ctx.stroke();}
    for(let i=0;i<12000;i++){const x=random()*1024,y=random()*1024,r=.3+random()*1.4;ctx.fillStyle=random()>.45?'rgba(250,246,226,.24)':'rgba(22,28,25,.17)';ctx.fillRect(x,y,r,r*.5);}
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(17,17);t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());(this.generatedTextures??=[]).push(t);return t;
  }
  trailTexture(veil){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const c=canvas.getContext('2d'),random=rnd(5237),px=x=>(x/132+.5)*1024,pz=z=>(.5-z/132)*1024;
    c.clearRect(0,0,1024,1024);
    for(let layer=15;layer>0;layer--){c.beginPath();c.moveTo(px(0),pz(-34));c.bezierCurveTo(px(-3),pz(-17),px(4),pz(7),px(0),pz(38));c.strokeStyle=veil?'rgba(157,183,160,.018)':'rgba(222,171,121,.028)';c.lineWidth=layer*7;c.stroke();c.beginPath();c.moveTo(px(-17),pz(-23));c.lineTo(px(5),pz(-23));c.stroke();}
    for(let i=0;i<2100;i++){const x=(random()-.5)*12,z=-32+random()*72;c.fillStyle=veil?'rgba(194,211,177,.1)':'rgba(239,185,139,.12)';c.fillRect(px(x),pz(z),.8+random()*2,.8+random()*1);}
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;(this.generatedTextures??=[]).push(t);return t;
  }
  buildRidges(env,veil,random){
    const segments=192,texture=this.groundTexture(veil);texture.repeat.set(6,2);
    for(let layer=0;layer<3;layer++){
      const verts=[],colors=[],uv=[],indices=[],rows=8,near=[87,160,275][layer],width=[73,122,160][layer];
      for(let j=0;j<=rows;j++)for(let i=0;i<=segments;i++){
        const a=i/segments*TAU,t=j/rows,r=near+t*width+Math.sin(a*9+layer)*3;
        const shape=.58+Math.sin(a*3.1+layer)*.15+Math.sin(a*7.4+layer*2)*.13+Math.sin(a*19.7)*.05;
        const crest=Math.pow(Math.sin(t*Math.PI),.62),jag=(Math.sin(a*43+j*.8)+Math.sin(a*79-j*.5))*.48;
        const y=(layer===0?2:4)+crest*([15,27,46][layer]*shape+jag*2.4)+Math.sin(t*13+a*7)*1.4*crest;
        verts.push(Math.cos(a)*r,y,Math.sin(a)*r);uv.push(i/segments*8,t*1.8);
        const c=new C(veil?[0x274a4d,0x2a424c,0x374850][layer]:[0x665348,0x675156,0x695761][layer]);c.multiplyScalar(.83+Math.sin(y*.8+a*3)*.12+Math.sin(a*64)*.035);colors.push(c.r,c.g,c.b);
      }
      for(let j=0;j<rows;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();mesh(g,new THREE.MeshStandardMaterial({map:texture,bumpMap:texture,bumpScale:.3,vertexColors:true,roughness:1,side:THREE.DoubleSide}),env);
    }
    const strata=[],caps=[];for(let i=0;i<33;i++){const a=i/33*TAU+.04,r=85+random()*28,h=3+random()*6,x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.abs(x)<25&&z>0)continue;for(let j=0;j<3;j++)strata.push({p:[x,h*(.2+j*.24),z],s:[4.2+random()*5,h*.22,2.7+random()*3],r:[random()*.1,a*.6,random()*.12]});caps.push({p:[x,h*.81,z],s:[4.4,1.0,3.8],r:[.06,a*.6,.02]});}
    instances(env,new THREE.DodecahedronGeometry(1,0),material(veil?0x3a514e:0x706459),strata);instances(env,new THREE.IcosahedronGeometry(1,0),material(veil?0x60736a:0x978572),caps);
  }
  planetSky(env,veil){
    const m=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,uniforms:{zenith:{value:new C(veil?0x071a34:0x201932)},horizon:{value:new C(veil?0x486c72:0xb17560)}},vertexShader:'varying vec3 d;void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 d;uniform vec3 zenith;uniform vec3 horizon;void main(){vec3 n=normalize(d);float h=pow(max(0.,1.-max(n.y,0.)),3.);float w=sin(n.x*15.+sin(n.z*9.))*sin(n.z*16.+n.y*22.)*.025;vec3 col=mix(zenith,horizon,h*.65);col+=vec3(.09,.045,.08)*max(0.,w)*(1.-h);gl_FragColor=vec4(col,1.);}'});const sky=mesh(new THREE.SphereGeometry(1300,32,24),m,env);sky.renderOrder=-900;
    const rim=new THREE.DirectionalLight(veil?0x83eed5:0xffb667,1.4);rim.position.set(0,30,85);env.add(rim);
  }
  shrineEaves(parent){
    const verts=[],faces=[],columns=30;
    for(let i=0;i<=columns;i++){const x=-6.7+i/columns*13.4,curve=Math.pow(Math.abs(x)/6.7,5)*.9;verts.push(x,9.75+curve,-1.8,x,10.48+curve,0,x,9.75+curve,1.8);}
    for(let i=0;i<columns;i++)for(let j=0;j<2;j++){const a=i*3+j;faces.push(a,a+3,a+1,a+1,a+3,a+4);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(faces);g.computeVertexNormals();mesh(g,material(0x23323b,0,.56,.5),parent);
    const tiles=[];for(let i=0;i<=columns;i++){const x=-6.7+i/columns*13.4,curve=Math.pow(Math.abs(x)/6.7,5)*.9;for(const s of[-1,1])tiles.push({p:[x,10.13+curve,s*.85],s:[.035,1.95,.035],r:[Math.PI/2+s*.38,0,0]});}
    instances(parent,new THREE.CylinderGeometry(1,1,1,5),material(0x6b6a59,0,.5,.5),tiles);
    const gold=material(0xb98d49,0,.4,.7);for(const s of[-1,1]){box(parent,gold,[s*4,6.6,0],[.94,.2,1]);box(parent,gold,[s*4,1.3,0],[.94,.22,1]);}
    box(parent,gold,[0,8.5,.63],[1.6,1.8,.1]);const crest=mesh(new THREE.TorusGeometry(.43,.06,5,24),material(0x192832),parent,[0,8.5,.72]);return parent;
  }
  grassGeometry(){
    const pos=[],norm=[],uv=[],col=[],random=rnd(442);
    for(let b=0;b<5;b++){const angle=b*2.399,h=.55+random()*.8,bend=.15+random()*.3,ox=Math.cos(angle)*.14,oz=Math.sin(angle)*.14,width=.04+random()*.04;for(let j=0;j<3;j++){const levels=[j/3,(j+1)/3],v=[];for(const t of levels){const x=ox+Math.cos(angle)*bend*t*t,z=oz+Math.sin(angle)*bend*t*t,w=width*(1-t*.94);v.push([x-Math.sin(angle)*w,h*t,z+Math.cos(angle)*w],[x+Math.sin(angle)*w,h*t,z-Math.cos(angle)*w]);}for(const id of[0,1,2,1,3,2]){pos.push(...v[id]);const t=id<2?levels[0]:levels[1];uv.push(id%2,t);const color=new C().setHSL(.43+.06*t,.46,.12+.25*t);col.push(color.r,color.g,color.b);}}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();return g;
  }


  buildPlanet(env,zone){
    const veil=zone==='veil',random=rnd(veil?939:511),geo=new THREE.PlaneGeometry(340,340,100,100);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position,colors=[];
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),edge=Math.max(0,Math.max(Math.abs(x),Math.abs(z))-67),n=Math.sin(x*.09+Math.sin(z*.045))*Math.cos(z*.07);pos.setY(i,-.16+Math.min(edge,60)*.18*(1+n*.7));const c=new C(veil?0x163f3e:0x514449);c.offsetHSL(0,0,n*.045);colors.push(c.r,c.g,c.b);}
    geo.computeVertexNormals();geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));const groundMap=this.groundTexture(veil),terrain=mesh(geo,new THREE.MeshStandardMaterial({map:groundMap,bumpMap:groundMap,bumpScale:.16,vertexColors:true,roughness:.99,metalness:.015}),env);terrain.receiveShadow=true;
    const path=mesh(new THREE.PlaneGeometry(132,132),new THREE.MeshBasicMaterial({map:this.trailTexture(veil),transparent:true,depthWrite:false,opacity:veil?.5:.7}),env,[0,-.125,0]);path.rotation.x=-Math.PI/2;
    for(const r of [28,65]){const ring=glowRing(env,veil?0x527968:0x977650,r,.025);ring.material.opacity=.18;ring.position.y=-.12;}
    this.planetSky(env,veil);this.buildRidges(env,veil,random);
    const rubble=[],chips=[];for(let i=0;i<180;i++){const a=random()*TAU,r=70+random()*55;rubble.push({p:[Math.sin(a)*r,random()*1.5-.8,Math.cos(a)*r],s:[.8+random()*3, .5+random()*2,1+random()*3],r:[random()*3,random()*3,random()*3]});}
    instances(env,new THREE.DodecahedronGeometry(1,0),material(veil?0x264d45:0x795344),rubble);
    for(let i=0;i<400;i++){const x=(random()-.5)*127,z=(random()-.5)*127;if(Math.max(Math.abs(x),Math.abs(z))<44||Math.abs(x)<12)continue;chips.push({p:[x,-.12,z],s:[.12+random()*.6,.03+random()*.09,.12+random()*.6],r:[0,random()*TAU,0]});}
    instances(env,new THREE.IcosahedronGeometry(1,0),material(veil?0x3f6e60:0xaf8969),chips);
    if(veil){
      const grass=[];for(let i=0;i<9000&&grass.length<5200;i++){const x=(random()-.5)*132,z=(random()-.5)*132,edge=Math.max(Math.abs(x),Math.abs(z));if(Math.abs(x)<10&&z>-37&&z<43)continue;if(edge<43&&random()>.27)continue;if(Math.sin(x*.34)*Math.cos(z*.27)<-.5)continue;const h=.4+random()*.8+(edge>54?.25:0);grass.push({p:[x,-.14,z],s:[.65+random()*.65,h,.65+random()*.65],r:[0,random()*TAU,0]});}
      const grassMat=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.8,emissive:0x173a32,emissiveIntensity:.3});
      grassMat.onBeforeCompile=shader=>{shader.uniforms.worldWind=this.windUniform;shader.vertexShader='uniform float worldWind;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvec3 root=vec3(instanceMatrix[3]);float sway=sin(worldWind*1.4+root.x*.27+root.z*.15)*.1+sin(worldWind*.8+root.z*.3)*.055;transformed.x+=sway*position.y*position.y;transformed.z+=sway*.4*position.y;');};
      const tufts=instances(env,this.grassGeometry(),grassMat,grass);tufts.count=this.quality==='low'?Math.min(1800,grass.length):grass.length;env.userData.grass=tufts;env.userData.grassCount=grass.length;
      const islands=[],islandTops=[];for(let i=0;i<9;i++){const a=i*TAU/9,r=122+random()*70,x=Math.cos(a)*r,z=Math.sin(a)*r,y=33+random()*32,s=7+random()*10;islands.push({p:[x,y,z],s:[s,s*1.2,s*.8],r:[.1,random()*3,0]});islandTops.push({p:[x,y+s*.55,z],s:[s*.75,s*.18,s*.65],r:[0,random()*3,0]});}
      const islandGeo=new THREE.DodecahedronGeometry(1,0);islandGeo.scale(1,1.2,1);instances(env,islandGeo,material(0x284b53),islands);instances(env,new THREE.IcosahedronGeometry(1,1),material(0x438775,0x10382d),islandTops);
      const motePos=[];for(let i=0;i<180;i++)motePos.push((random()-.5)*130,.6+random()*5,(random()-.5)*130);const mg=new THREE.BufferGeometry();mg.setAttribute('position',new THREE.Float32BufferAttribute(motePos,3));this.veilMotes=new THREE.Points(mg,new THREE.PointsMaterial({color:0x8aeccc,size:.1,transparent:true,opacity:.65,depthWrite:false}));env.add(this.veilMotes);
    }
    if(!veil){
    const columnShafts=[],columnBases=[],capitals=[],flutes=[],trims=[],columnColor=veil?0x577d71:0xb99775;
    for(let i=0;i<11;i++){const x=-43+i*8,z=88,h=i===1?11.8:15.5;columnShafts.push({p:[x,h*.5+.8,z],s:[1.35,h,1.35]});columnBases.push({p:[x,.35,z],s:[4,.7,4]},{p:[x,.9,z],s:[3.2,.4,3.2]});capitals.push({p:[x,h+1.05,z],s:[3.6,.65,3.6]},{p:[x,h+1.55,z],s:[4.5,.45,4.5]});for(let j=0;j<12;j++){const a=j/12*TAU;flutes.push({p:[x+Math.sin(a)*1.34,h*.5+.8,z+Math.cos(a)*1.34],s:[.13,h*.88,.13]});}for(const y of[1.5,h+.6])trims.push({p:[x,y,z],s:[1.5,.22,1.5]});}
    instances(env,new THREE.CylinderGeometry(.92,1,1,20),material(columnColor),columnShafts);instances(env,new THREE.BoxGeometry(1,1,1),material(columnColor),columnBases);instances(env,new THREE.BoxGeometry(1,1,1),material(veil?0x84978a:0xc8ab88),capitals);instances(env,new THREE.CylinderGeometry(1,1,1,5),material(veil?0x43685e:0x967351),flutes);instances(env,new THREE.CylinderGeometry(1,1,1,20),material(veil?0x92a496:0xdbb98b),trims);
    box(env,material(veil?0x516b65:0x987c63),[-3,18,88],[88,1.8,4.8]);box(env,material(veil?0x899789:0xc3a47c),[-3,19,88],[91,.35,5.6]);
    const frieze=[];for(let x=-45;x<=40;x+=2.2)frieze.push({p:[x,17.4,85.45],s:[.75,.7,.12]});instances(env,new THREE.BoxGeometry(1,1,1),material(veil?0xb3b59c:0xd6b380),frieze);
    }
    const shrine=this.torii(env,[0,0,76],2.3,veil?0x335d61:0x8b382c);this.shrineEaves(shrine);
    const posts=[],lanterns=[],roofs=[],lanternBases=[];for(const x of[-67,67])for(const z of[-52,-26,0,26,52]){posts.push({p:[x,1.5,z],s:[.38,3,.38]});lanterns.push({p:[x,3.1,z],s:[.8,.9,.8]});roofs.push({p:[x,3.85,z],s:[1.05,.5,1.05],r:[0,Math.PI/4,0]});lanternBases.push({p:[x,.2,z],s:[1.7,.4,1.7]},{p:[x,2.7,z],s:[1.2,.18,1.2]});}
    instances(env,new THREE.CylinderGeometry(1,1.3,1,8),material(0x45504b),posts);instances(env,new THREE.BoxGeometry(1,1,1),material(veil?0x91c6a5:0xedb368,veil?0x32684c:0x68451e),lanterns);instances(env,new THREE.ConeGeometry(1,1,4),material(0x233d3d),roofs);instances(env,new THREE.BoxGeometry(1,1,1),material(veil?0x5d7870:0x997858),lanternBases);
    const bannerPosts=[],bannerCloths=[],bannerCrests=[],bannerBars=[];
    for(const x of[-69,69])for(const z of[-55,5,55]){bannerPosts.push({p:[x,6,z],s:[.16,12,.16]});bannerCloths.push({p:[x+1.2,8,z],s:[1,1,1],r:[0,(x+z)*.001,0]});bannerCrests.push({p:[x+1.2,8.25,z+.12],s:[1,1,1]});bannerBars.push({p:[x+1.2,10.45,z],s:[2.7,.1,.13]});}
    const cloth=new THREE.PlaneGeometry(2.4,4.7,5,12),cp=cloth.attributes.position;for(let i=0;i<cp.count;i++){const xx=cp.getX(i),yy=cp.getY(i);cp.setZ(i,Math.sin(yy*2+xx*1.7)*.14*(1-(yy+2.35)/4.7));if(yy<-.2)cp.setY(i,yy+Math.abs(xx)*.2);}cloth.computeVertexNormals();
    const bannerMat=new THREE.MeshStandardMaterial({color:veil?0x285952:0x873d31,roughness:.92,side:THREE.DoubleSide});bannerMat.onBeforeCompile=shader=>{shader.uniforms.worldWind=this.windUniform;shader.vertexShader='uniform float worldWind;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z+=sin(worldWind*.8+instanceMatrix[3][0]*.04+position.y)*max(0.,2.35-position.y)*.025;');};
    instances(env,new THREE.BoxGeometry(1,1,1),material(0x56625b),bannerPosts);instances(env,cloth,bannerMat,bannerCloths);instances(env,new THREE.TorusGeometry(.48,.06,5,24),material(0xcbaf71),bannerCrests);instances(env,new THREE.BoxGeometry(1,1,1),material(0xb39662),bannerBars);
    const moon=mesh(new THREE.SphereGeometry(36,32,20),planetMaterial(0x283650,veil?0x7a638a:0xc59784,this.planetNoiseTexture),env,[-110,100,230]);mesh(new THREE.SphereGeometry(37.3,24,20),atmosphere(veil?0x8672c4:0xfba779),moon);
    if(veil){const arch=mesh(new THREE.TorusGeometry(25,.45,6,80),material(0x256d75,0x082c32),env,[16,29,122]);arch.rotation.z=.15;const inner=mesh(new THREE.TorusGeometry(24.3,.08,4,80),new THREE.MeshBasicMaterial({color:0x80efcf}),env,[16,29,122]);inner.rotation.z=.15;}
    else{const sun=mesh(new THREE.SphereGeometry(9,24,16),new THREE.MeshBasicMaterial({color:0xffbd79}),env,[-150,74,220]);mesh(new THREE.SphereGeometry(10,24,16),atmosphere(0xffbf71),sun);}
    this.buildStars(env,850,950);astralPlanet(this,env,zone);
  }

  buildInterior(env,zone){
    const hostile=zone==='dreadnought',col=hostile?0xff7152:0x59e9f6;
    const corridor=this.clone('ShipCorridor');corridor.scale.set(6.8,1.5,8.9);env.add(corridor);
    const grid=new THREE.GridHelper(64,32,col,0x243d50);grid.scale.x=.5;grid.position.y=.135;grid.material.transparent=true;grid.material.opacity=.18;env.add(grid);
    const ribs=[],strips=[];for(const z of [-27,-18,-9,9,18,27]){for(const s of [-1,1]){ribs.push({p:[s*16.7,3.5,z],s:[.28,7,.5]});strips.push({p:[s*16.45,3.3,z],s:[.08,5.2,.16]});}ribs.push({p:[0,7.1,z],s:[33.6,.4,.5]});}
    instances(env,new THREE.BoxGeometry(1,1,1),material(0x142638,0,.38,.8),ribs);instances(env,new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:col}),strips);
    for(const z of [-31.5,31.5]){box(env,material(0x152234),[0,.65,z],[35,1.3,.5]);const ring=mesh(new THREE.TorusGeometry(4,.16,6,48),new THREE.MeshBasicMaterial({color:col}),env,[0,4,z]);ring.scale.y=.65;box(env,material(0x21425a),[0,6.6,z],[9,.4,.5]);}
    for(const s of [-1,1])for(const z of [-22,0,22]){box(env,material(hostile?0x762f2c:0x224d65),[s*16.3,4,z],[.05,3.6,1.6]);const crest=mesh(new THREE.TorusGeometry(.52,.08,4,3),new THREE.MeshBasicMaterial({color:0xffc981}),env,[s*16.15,4,z]);crest.rotation.y=Math.PI/2;}
    const path=[];for(let z=-26;z<=26;z+=4)for(const x of[-3.8,3.8])path.push({p:[x,.15,z],s:[.12,.018,1.5]});instances(env,new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xdba95b,transparent:true,opacity:.48}),path);const light=new THREE.PointLight(col,28,38,1);light.position.set(0,6,0);env.add(light);this.buildStars(env,500,600);astralInterior(this,env,zone);
  }
  makeLabel(parent,color=0x8be8f0,height=3.5){
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=80;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.userData.novarisLabel=true;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,sizeAttenuation:false,toneMapped:false}));sprite.position.y=height;sprite.center.set(.5,0);sprite.visible=false;sprite.renderOrder=20;parent.add(sprite);return{sprite,canvas,texture,color:new C(color).getStyle(),text:''};
  }
  drawLabel(label,title,distance,locked=false,health=null,charging=false){
    const text=String(title||'Signal').slice(0,25),sub=Math.round(distance)+' m'+(locked?'  ·  SEALED':charging?'  ·  CHARGING':''),hp=health===null?null:Math.round(health*20)/20,key=text+'|'+sub+'|'+hp;if(key===label.text)return;label.text=key;
    const c=label.canvas.getContext('2d');c.clearRect(0,0,384,80);c.lineJoin='round';c.shadowColor='rgba(0,0,0,.95)';c.shadowBlur=9;c.strokeStyle='rgba(0,5,12,.95)';c.lineWidth=5;
    c.font='600 28px sans-serif';c.textAlign='left';c.strokeText(text,36,29,338);c.fillStyle='#edf0e9';c.fillText(text,36,29,338);
    c.font='500 23px sans-serif';c.strokeText(sub,36,55,338);c.fillStyle=label.color;c.fillText(sub,36,55,338);
    c.beginPath();c.moveTo(13,18);c.lineTo(23,28);c.lineTo(13,38);c.lineTo(3,28);c.closePath();c.strokeStyle=label.color;c.lineWidth=2;c.stroke();c.shadowBlur=0;
    if(hp!==null){c.fillStyle='rgba(3,8,17,.65)';c.fillRect(36,66,190,3);c.fillStyle=charging?'#ffd58b':label.color;c.fillRect(36,66,190*clamp(hp,0,1),3);}label.texture.needsUpdate=true;
  }
  renderLabels(){
    const candidates=[],self=this.self;if(!self)return;const mobile=this.canvas.clientWidth<720,max=mobile?5:8,limit=this.zone==='space'?200:75,target=this.getTarget(),roles={captain:'Oni Captain',bulwark:'Iron Bulwark',marksman:'Ash Marksman',flanker:'Rift Ronin',warden:'Relic Warden',interceptor:'Oni Interceptor'},names={core:'Astral Relic',reactor:'Reactor Heart',launch:'Ascent Pad',repair:'Restoration Shrine',extract:'Rift Passage',land:'Descent Beacon',board:'Dreadnought'};
    this.markers.forEach(m=>{if(!m.label)return;m.label.sprite.visible=false;if(!m.group.visible)return;const d=m.group.position.distanceTo(new V(self.x,self.y,self.z));if(d>limit)return;const title=m.item.label||names[m.item.kind]||'Wayfinder';candidates.push({label:m.label,parent:m.group,title,d,rank:d*.7-25,locked:m.item.available===false});});
    this.entities.forEach(r=>{if(!r.label)return;r.label.sprite.visible=false;if(!r.group.visible)return;const e=r.entity,d=r.group.position.distanceTo(new V(self.x,self.y,self.z)),selected=target?.id===e.id;if(d>Math.min(limit,90)||e.kind&&!selected&&!e.telegraph&&d>38)return;const title=e.name||roles[e.role]||(e.kind?'Oni Sentinel':'Vanguard');candidates.push({label:r.label,parent:r.group,title,d,rank:selected?-100:d+18,locked:false,health:selected?finite(e.hp,100)/finite(e.maxHp||e.hpMax,100):null,charging:!!e.telegraph});});
    candidates.sort((a,b)=>a.rank-b.rank);const boxes=[],height=this.canvas.clientHeight,width=this.canvas.clientWidth,pxWidth=mobile?142:166,pxHeight=mobile?30:35,unit=height/(2*Math.tan(this.camera.fov*Math.PI/360));let shown=0;
    for(const c of candidates){if(shown>=max)break;const at=c.parent.position.clone().add(new V(0,c.label.sprite.position.y,0)).project(this.camera);if(at.z<0||at.z>1||Math.abs(at.x)>.92||Math.abs(at.y)>.78)continue;const x=(at.x*.5+.5)*width,y=(-at.y*.5+.5)*height,b={x:x-pxWidth/2,y:y-pxHeight,w:pxWidth,h:pxHeight};if(boxes.some(a=>b.x<a.x+a.w+8&&b.x+b.w+8>a.x&&b.y<a.y+a.h+5&&b.y+b.h+5>a.y))continue;boxes.push(b);c.label.sprite.scale.set(pxWidth/unit,pxHeight/unit,1);c.label.sprite.visible=true;this.drawLabel(c.label,c.title,c.d,c.locked,c.health??null,c.charging);shown++;}
  }
  entityAppearance(e,parked=false){
    const space=e.zone==='space'||parked,npc=!!e.kind,hostile=npc||(this.state?.mode==='skirmish'&&e.id!==this.state?.you),type=space?(npc?'EnemyFighter':'PlayerFighter'):(npc&&/drone/i.test(e.kind||'')?'AlienDrone':hostile?'HostileMarine':'SpaceMarine');return {space,npc,hostile,type,key:[type,hostile?'hostile':'friendly',e.role||'',e.id===this.state?.you?'self':'other'].join(':')};
  }
  createEntity(e,parked=false){
    const {space,npc,hostile,type,key}=this.entityAppearance(e,parked);
    const group=new THREE.Group(),model=this.clone(this.quality==='low'&&type==='HostileMarine'?'HostileMarineLow':type,space?.55:type==='AlienDrone'?1:.84);group.add(model);model.userData.lowDetail=this.quality==='low'&&type==='HostileMarine';
    let exhaust;if(space){exhaust=new THREE.Group();const mat=new THREE.MeshBasicMaterial({color:hostile?0xff6b45:0x46e4ff,transparent:true,opacity:.72,depthWrite:false,blending:THREE.AdditiveBlending});for(const x of [-.66,.66])mesh(new THREE.SphereGeometry(1,8,6),mat,exhaust,[x,0,-1.7],[.14,.14,.55]);group.add(exhaust);}
    if(e.id!==this.state?.you&&!parked){const indicator=glowRing(group,hostile?0xff705c:0x71e8ed,space?2.1:1.05,.035);indicator.position.y=space?-.55:.13;}
    group.position.set(finite(e.x),finite(e.y),finite(e.z));group.rotation.y=finite(e.yaw);this.dynamic.add(group);const label=e.id!==this.state?.you&&!parked?this.makeLabel(group,hostile?0xffa287:0x83e7e8,space?2.8:3.2):null;const rec={group,model,type,label,target:new V(finite(e.x),finite(e.y),finite(e.z)),yaw:finite(e.yaw),pitch:finite(e.pitch),entity:e,exhaust,zone:e.zone,parked,appearanceKey:key};decorateCombatant(rec,hostile,space);this.entities.set(parked?'parked:'+e.id:e.id,rec);return rec;
  }
  createMarker(i){
    const g=new THREE.Group(),kind=String(i.kind||i.id),space=i.zone==='space',core=/core|reactor/.test(kind),repair=/repair/.test(kind),gate=/extract/.test(kind),land=/land/.test(kind),board=/board-dreadnought/.test(i.id),col=core?0xffc36b:repair?0x71efb3:gate?0xb6a1ff:0x66deed;
    const ring=glowRing(g,col,space?6:core?2.7:3.6,space?.13:.07);ring.position.y=space?0:.22;
    let icon,structure;
    if(core){icon=this.clone('RiftCrystal',1.2);icon.position.y=.16;g.add(icon);const beam=mesh(new THREE.CylinderGeometry(.055,.055,7,8),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.55,depthWrite:false}),g,[0,3.8,0]);}
    else if(gate){structure=this.torii(g,[-0,-10,0],2.6,0x934839);const halo=mesh(new THREE.TorusGeometry(7,.18,8,80),new THREE.MeshBasicMaterial({color:0xae91ff}),g,[0,1,0]);halo.rotation.z=.2;const disc=mesh(new THREE.CircleGeometry(7,64),new THREE.MeshBasicMaterial({color:0x4d2998,side:THREE.DoubleSide,transparent:true,opacity:.17,depthWrite:false}),g,[0,1,0]);}
    else if(board){structure=this.clone('Flagship',3.7);structure.position.set(0,-6,-14);g.add(structure);}
    else if(!space){box(g,material(0x213c48),[0,.05,0],[7,.12,7]);for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const mark=box(g,new THREE.MeshBasicMaterial({color:col}),[Math.cos(a)*3,.14,Math.sin(a)*3],[1.1,.04,.16]);mark.rotation.y=-a;}icon=mesh(new THREE.OctahedronGeometry(.35),new THREE.MeshBasicMaterial({color:col}),g,[0,2,0]);}
    else if(land){icon=mesh(new THREE.OctahedronGeometry(.8),new THREE.MeshBasicMaterial({color:col}),g,[0,2,0]);}
    const label=this.makeLabel(g,col,space?5:3.7);const rec={group:g,ring,icon,label,item:i,core};this.dynamic.add(g);this.markers.set(i.id,rec);return rec;
  }
  update(input){
    if(this.disposed||!input||!this.loaded)return;const state=input.view||input;if(!state.players)return;this.state=state;this.snapshotTime=this.time;const players=list(state.players),self=players.find(p=>p.id===state.you)||players[0];if(!self)return;
    const zone=self.zone||'space';this.setZone(zone);this.zoneObstacles=list(state.obstacles).filter(o=>o.zone===zone);if(this.showcase)this.showcase.visible=false;
    if(zone==='space')for(const p of list(state.planets)){if(!this.spacePlanets.has(p.id))this.spacePlanets.set(p.id,this.makePlanet(p));}
    const covered=new Set();for(const o of this.zoneObstacles){covered.add(o.id);if(!this.covers.has(o.id)){const original=createCover(o,this),g=compact(original,true);g.position.copy(original.position);g.userData.cover=o;original.traverse(o=>{if(o.geometry)o.geometry.dispose();});this.covers.set(o.id,g);this.dynamic.add(g);}}this.covers.forEach((g,id)=>{if(!covered.has(id)){this.dynamic.remove(g);this.disposeUnique(g);this.covers.delete(id);}});
    const seen=new Set();for(const e of [...players,...list(state.npcs)]){
      if(e.zone!==zone||!e.alive||e.connected===false)continue;seen.add(e.id);let rec=this.entities.get(e.id);const wantSpace=zone==='space';if(rec&&(rec.zone!==zone||rec.appearanceKey!==this.entityAppearance(e).key)){this.dynamic.remove(rec.group);this.disposeUnique(rec.group);this.entities.delete(e.id);rec=null;}if(!rec){rec=this.createEntity(e);if(e.id===state.you)this.cameraReady=false;}
      rec.entity=e;const next=new V(finite(e.x),finite(e.y),finite(e.z));if(rec.target.distanceTo(next)>(zone==='space'?80:20)){rec.group.position.copy(next);if(e.id===state.you)this.cameraReady=false;}rec.target.copy(next);rec.yaw=finite(e.yaw);rec.pitch=finite(e.pitch);rec.group.visible=true;
    }
    if(zone==='space')for(const p of players){if(p.zone==='space'||!p.ship)continue;const id='parked:'+p.id;seen.add(id);const e={...p,...p.ship,zone:'space',alive:true};let rec=this.entities.get(id);if(!rec)rec=this.createEntity(e,true);rec.target.set(e.x,e.y,e.z);rec.yaw=finite(e.yaw);rec.group.visible=true;}
    this.entities.forEach((r,id)=>{if(!seen.has(id)){this.dynamic.remove(r.group);this.disposeUnique(r.group);this.entities.delete(id);}});
    const marked=new Set();for(const i of list(state.interactables)){if(i.zone!==zone||String(i.id).startsWith('own-ship:'))continue;marked.add(i.id);let m=this.markers.get(i.id);if(!m)m=this.createMarker(i);m.item=i;m.group.position.set(finite(i.x),finite(i.y),finite(i.z));m.group.visible=true;m.ring.material.opacity=i.available===false?.25:.9;if(m.icon&&m.core)m.icon.visible=i.available!==false||!state.objective?.cores?.includes(i.zone);}
    this.markers.forEach((m,id)=>{if(!marked.has(id)){this.dynamic.remove(m.group);this.disposeUnique(m.group);this.markers.delete(id);}});this.self=self;
  }


  triggerEvent(e){
    if(this.disposed||!e||e.zone&&e.zone!==this.zone)return;
    combatEvent(this,e);
    if(e.type==='shot')return;
    const burst=e.type==='kill'?38:e.type==='hit'?9:['core','transit','spawn','repair','victory'].includes(e.type)?26:e.type==='melee'?18:['dash','block','shieldBreak','impact','bossPhase'].includes(e.type)?16:0;if(!burst)return;
    const color=new C(e.type==='hit'||e.type==='kill'?0xff8853:e.type==='core'||e.type==='victory'?0xffda88:0x73f5ec),ground=this.zone!=='space';
    for(let i=0;i<burst;i++){const theta=Math.random()*TAU,z=Math.random()*2-1,r=Math.sqrt(1-z*z),speed=e.type==='kill'?8:3.5;this.particles.push({p:new V(finite(e.x),finite(e.y)+(ground?1.2:0),finite(e.z)),v:new V(Math.cos(theta)*r,z,Math.sin(theta)*r).multiplyScalar(speed*(.3+Math.random())),life:.4+Math.random()*.5,max:1,color});}
    if(this.particles.length>768)this.particles.splice(0,this.particles.length-768);
    if(e.type==='hit'&&e.targetId===this.state?.you&&!this.reducedMotion)this.shake=.14;
  }
  render(dt=.016,{yaw,pitch}={}){
    if(this.disposed||this.contextLost||!this.loaded)return;if(this.proceduralCachesDirty)this.restoreProceduralCaches();dt=clamp(finite(dt,.016),.001,.1);this.time+=dt;this.windUniform.value=this.reducedMotion?0:this.time;for(const b of(this.banners||[]))if(b.zone===this.zone)b.mesh.rotation.y=this.reducedMotion?0:Math.sin(this.time*.9+b.phase)*.018;const space=this.zone==='space';
    const me=this.self;this.aimYaw=finite(yaw,finite(me?.yaw));this.aimPitch=space?finite(pitch,finite(me?.pitch)):0;const own=this.entities.get(this.state?.you);
    for(const rec of this.entities.values()){
      if(!rec.group.visible)continue;const previous=rec.group.position.clone();if(!space&&coverEntry(previous,rec.target,this.zoneObstacles,this.zone,.85)<1)rec.group.position.copy(rec.target);else rec.group.position.lerp(rec.target,1-Math.exp(-dt*(rec.entity.id===this.state?.you?16:12)));const moving=rec.group.position.distanceTo(previous)/dt;
      const local=rec.entity.id===this.state?.you&&!rec.parked,desiredYaw=local?finite(yaw,rec.yaw):rec.yaw,desiredPitch=space?(local?finite(pitch,rec.pitch):rec.pitch):0;
      const delta=Math.atan2(Math.sin(desiredYaw-rec.group.rotation.y),Math.cos(desiredYaw-rec.group.rotation.y));rec.group.rotation.y+=delta*(1-Math.exp(-dt*(local?24:12)));
      rec.model.rotation.x=space?-desiredPitch:0;rec.model.rotation.z=space&&!this.reducedMotion?clamp(-delta*.16,-.2,.2):0;
      if(!space){rec.model.position.y=(['ember','veil'].includes(this.zone)?-.12:.14)+(rec.type==='AlienDrone'?1.15+(this.reducedMotion?0:Math.sin(this.time*2+rec.target.x)*.1):!this.reducedMotion&&moving>.2?Math.abs(Math.sin(this.time*12))*.055:0);
        for(const [name,sign] of [['legL',1],['legR',-1]]){const leg=rec.model.getObjectByName(name);if(leg)leg.rotation.x=!this.reducedMotion&&moving>.3?Math.sin(this.time*(rec.entity.boosting?17:11))*sign*.5:0;}
      }
      animateCombatant(this,rec,dt,moving,space);
      if(rec.exhaust){const boost=rec.entity.boosting?2.5:1;rec.exhaust.scale.z=boost*(this.reducedMotion?1:1+Math.sin(this.time*25)*.07);}
    }
    this.contactShadows.visible=this.quality==='high'&&!space;let shadows=0;if(this.contactShadows.visible){for(const r of this.entities.values()){if(!r.group.visible||r.parked||shadows>=64)continue;temp.position.set(r.group.position.x,['ember','veil'].includes(this.zone)?-.108:.148,r.group.position.z);temp.rotation.set(0,r.group.rotation.y,0);temp.scale.set(r.type==='AlienDrone'?2.2:1.7,1,r.type==='AlienDrone'?1.7:1.25);temp.updateMatrix();this.contactShadows.setMatrixAt(shadows++,temp.matrix);}for(const g of this.covers.values()){if(!g.visible||shadows>=64)continue;const o=g.userData.cover;temp.position.set(o.x,['ember','veil'].includes(this.zone)?-.108:.148,o.z);temp.rotation.set(0,0,0);temp.scale.set(o.hx*2.7,1,o.hz*2.7);temp.updateMatrix();this.contactShadows.setMatrixAt(shadows++,temp.matrix);}this.contactShadows.instanceMatrix.needsUpdate=true;}this.contactShadows.count=shadows;
    this.markers.forEach(m=>{if(!m.group.visible)return;if(m.icon&&!this.reducedMotion)m.icon.rotation.y=this.time*.45;const pulse=this.reducedMotion?1:1+Math.sin(this.time*2.2)*.025;m.ring.scale.setScalar(pulse);});
    if(this.veilMotes&&!this.reducedMotion)this.veilMotes.rotation.y=Math.sin(this.time*.04)*.02;
    let count=0;const age=Math.min(.14,Math.max(0,this.time-(this.snapshotTime||0)));
    for(const p of list(this.state?.projectiles)){
      if(p.zone!==this.zone||count>=320)continue;const v=this.bulletVelocity.set(finite(p.vx),finite(p.vy),finite(p.vz)),speed=v.length();
      const start=this.bulletStart.set(finite(p.x),finite(p.y),finite(p.z)),head=this.bulletHead.copy(start).addScaledVector(v,age);
      // Prediction stops at the same authoritative cover face as the server. The trail ends at the projectile head.
      if(!space){const hit=coverEntry(start,head,this.zoneObstacles,this.zone);if(hit<1)head.lerpVectors(start,head,Math.max(0,hit-.001));}
      if(speed)v.multiplyScalar(1/speed);else v.copy(BULLET_FORWARD);let length=p.weapon==='lance'?5:p.weapon==='scatter'?.8:2.2;
      if(!space){const tail=this.bulletTail.copy(head).addScaledVector(v,-length),hit=coverEntry(head,tail,this.zoneObstacles,this.zone);if(hit<1)length=Math.max(.02,length*Math.max(0,hit-.001));}
      temp.position.copy(head).addScaledVector(v,-length*.5);temp.position.y+=space?0:1.25;temp.quaternion.setFromUnitVectors(BULLET_FORWARD,v);temp.scale.set(p.weapon==='lance'?.7:1,p.weapon==='lance'?.7:1,length);temp.updateMatrix();this.bullets.setMatrixAt(count,temp.matrix);this.bullets.setColorAt(count,p.kind==='npc'?BULLET_COLORS.enemy:p.weapon==='lance'?BULLET_COLORS.lance:BULLET_COLORS.friendly);count++;
    }this.bullets.count=count;this.bullets.instanceMatrix.needsUpdate=true;if(this.bullets.instanceColor)this.bullets.instanceColor.needsUpdate=true;
    this.particles=this.particles.filter(p=>p.life>0).slice(-this.particlePos.length/3);for(let i=0;i<this.particles.length;i++){const p=this.particles[i];p.life-=dt;p.p.addScaledVector(p.v,dt);p.v.multiplyScalar(1-dt*.7);this.particlePos.set([p.p.x,p.p.y,p.p.z],i*3);const fade=clamp(p.life*1.5,0,1);this.particleCol.set([p.color.r*fade,p.color.g*fade,p.color.b*fade],i*3);}this.particleGeo.setDrawRange(0,this.particles.length);this.particleGeo.attributes.position.needsUpdate=true;this.particleGeo.attributes.color.needsUpdate=true;
    if(me){
      const center=own&&own.group.visible?own.group.position:new V(finite(me.x),finite(me.y),finite(me.z)),y=finite(yaw,finite(me.yaw)),p=space?finite(pitch,finite(me.pitch)):0,direction=new V(Math.sin(y)*Math.cos(p),Math.sin(p),Math.cos(y)*Math.cos(p));
      const distance=space?(me.boosting&&!this.reducedMotion?15:12):5.9,desired=center.clone().addScaledVector(direction,-distance).add(new V(0,space?4:3.6,0)),eye=center.clone().add(new V(0,space?0:1.25,0)),look=eye.clone().addScaledVector(direction,30);
      if(!space&&!['ember','veil'].includes(this.zone)){desired.x=clamp(desired.x,-14.5,14.5);desired.z=clamp(desired.z,-28,28);desired.y=Math.max(desired.y,3.6);}
      if(!space){const t=coverEntry(eye,desired,this.zoneObstacles,this.zone,.25);if(t<1)desired.copy(eye.clone().lerp(desired,Math.max(0,t-.02)));}
      if(!this.cameraReady){this.camera.position.copy(desired);this.cameraReady=true;}else this.camera.position.lerp(desired,1-Math.exp(-dt*(this.reducedMotion?22:10)));
      if(this.shake&&!this.reducedMotion){this.camera.position.x+=(Math.random()-.5)*this.shake;this.camera.position.y+=(Math.random()-.5)*this.shake;this.shake=Math.max(0,this.shake-dt);}
      if(!space){const t=coverEntry(eye,this.camera.position,this.zoneObstacles,this.zone,.25);if(t<1)this.camera.position.copy(eye.clone().lerp(this.camera.position,Math.max(0,t-.02)));}
      if(own)own.model.visible=space||this.camera.position.distanceTo(eye)>1.7;
      this.camera.fov=this.reducedMotion?66:THREE.MathUtils.lerp(this.camera.fov,space&&me.boosting?74:66,1-Math.exp(-dt*4));this.camera.updateProjectionMatrix();this.camera.lookAt(look);this.camera.rotateX(-Math.atan(.08*Math.tan(this.camera.fov*Math.PI/360)));
    }else{
      if(this.showcase){this.showcase.position.y=this.reducedMotion?0:Math.sin(this.time*.6)*.22;this.showcase.rotation.y=-.32+(this.reducedMotion?0:Math.sin(this.time*.12)*.08);}this.camera.position.set(10,6,-15);this.camera.lookAt(0,0,0);
    }
    this.renderLabels();this.renderer.render(this.scene,this.camera);const frameNow=performance.now();if(this.fpsWindowStart===null){this.fpsWindowStart=frameNow;this.fpsFrames=0;}else{this.fpsFrames++;const elapsed=frameNow-this.fpsWindowStart;if(elapsed>=500){this.info.fps=this.fpsFrames*1000/elapsed;this.fpsFrames=0;this.fpsWindowStart=frameNow;}}this.info.drawcalls=this.renderer.info.render.calls;this.info.triangles=this.renderer.info.render.triangles;
  }
  project(entity){
    if(!entity)return null;const point=new V(finite(entity.x),finite(entity.y)+(entity.zone==='space'?1:3.2),finite(entity.z)),distance=this.camera.position.distanceTo(point);point.project(this.camera);return{x:(point.x*.5+.5)*this.canvas.clientWidth,y:(-point.y*.5+.5)*this.canvas.clientHeight,visible:point.z>-1&&point.z<1&&Math.abs(point.x)<1&&Math.abs(point.y)<1,distance,normalizedX:point.x*.5+.5,normalizedY:-point.y*.5+.5};
  }
  getTarget(state=this.state){
    if(!state||!this.self)return null;const me=this.self,yaw=finite(this.aimYaw,finite(me.yaw)),pitch=this.zone==='space'?finite(this.aimPitch,finite(me.pitch)):0,forward=new V(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));let best=null,bestScore=Infinity;
    for(const e of [...list(state.npcs),...(state.mode==='skirmish'?list(state.players):[])]){if(!e.alive||e.connected===false||e.id===state.you||e.zone!==this.zone)continue;const v=new V(e.x-me.x,this.zone==='space'?e.y-me.y:0,e.z-me.z),distance=v.length();if(distance<.01||distance>170)continue;const dot=v.normalize().dot(forward);if(dot<.96)continue;const origin=new V(me.x,me.y+(this.zone==='space'?0:1.25),me.z),end=new V(e.x,e.y+(this.zone==='space'?0:1.25),e.z);if(coverEntry(origin,end,state===this.state?this.zoneObstacles:state.obstacles,this.zone)<.999)continue;const score=(1-dot)*100+distance*.003;if(score<bestScore){best=e;bestScore=score;}}
    return best;
  }
  disposeUnique(root){const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry&&!this.sharedGeometries?.has(o.geometry))gs.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m&&!this.sharedMaterials?.has(m))ms.add(m);});gs.forEach(g=>g.dispose());ms.forEach(m=>{if(m.map?.userData.novarisLabel)m.map.dispose();m.dispose();});}
  dispose(){
    if(this.disposed)return;this.disposed=true;this.loaded=false;this.canvas.removeEventListener('webglcontextlost',this.onContextLost);this.canvas.removeEventListener('webglcontextrestored',this.onContextRestored);disposeGraph(this.scene,...Object.values(this.models),...this.proceduralCaches.map(c=>c.scene));for(const cache of this.proceduralCaches)cache.target.dispose();this.proceduralCaches=[];this.planetNoiseTexture=null;for(const t of(this.generatedTextures||[]))t.dispose();this.renderer.dispose();this.scene.clear();this.environments.clear();this.entities.clear();this.markers.clear();this.covers.clear();this.coverTextures?.clear();this.generatedTextures=[];this.models={};this.state=null;this.self=null;this.particles.length=0;this.sharedGeometries?.clear();this.sharedMaterials?.clear();
  }
}
