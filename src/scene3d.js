import * as THREE from 'three';
import { STAGES } from './data.js';

const V = (x,y,z) => new THREE.Vector3(x,y,z);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const seed = n => { const q=Math.sin(n*78.233+41.1)*43758.5453; return q-Math.floor(q); };
const shared = {
 sphere:new THREE.SphereGeometry(1,10,8),
 lowSphere:new THREE.IcosahedronGeometry(1,1),
 box:new THREE.BoxGeometry(1,1,1),
 cone:new THREE.ConeGeometry(1,1,7),
 cylinder:new THREE.CylinderGeometry(1,1,1,7),
 fin:new THREE.BufferGeometry(),
 bill:new THREE.CylinderGeometry(.025,.14,.85,5),
 whisker:new THREE.CylinderGeometry(.012,.015,.55,4),
 antenna:new THREE.CylinderGeometry(.014,.018,.72,4)
};
shared.fin.setAttribute('position',new THREE.Float32BufferAttribute([
  -.5,0,-.45, .5,0,-.45, 0,0,-1.12,
  -.5,.02,-.45, 0,.02,-1.12, .5,.02,-.45
],3));
shared.fin.computeVertexNormals();
const material = (color,extra={}) => new THREE.MeshStandardMaterial({color,roughness:.68,metalness:.06,...extra});

const WATER_VERT = `
 varying vec2 vUv;
 uniform float uTime; uniform float uForce;
 void main(){
   vUv=uv;
   vec3 p=position;
   float chop=sin(position.y*.59+sin(position.x*.92+uTime*.9)*1.4+uTime*3.0);
   float swell=sin(position.y*.21-position.x*.8+uTime*1.8);
   p.z+=(chop*.115+swell*.085)*uForce;
   gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
 }`;
const WATER_FRAG = `
 varying vec2 vUv;
 uniform float uTime; uniform float uForce;
 uniform vec3 uDeep; uniform vec3 uLight; uniform vec3 uFoam;
 uniform sampler2D uNoise;
 void main(){
   vec2 p=vUv;
   float swirl=texture2D(uNoise,vec2(p.x*1.15+uTime*.035,p.y*4.8-uTime*.12)).r;
   vec2 flow=vec2(p.x*3.2+(swirl-.5)*.11,p.y*14.-uTime*.5);
   vec4 ripple=texture2D(uNoise,flow);
   float body=mix(.22,.86,ripple.b*.63+swirl*.37);
   float fracture=sin(p.y*113.+swirl*9.+sin(p.x*7.+uTime*.8)*2.1-uTime*8.5);
   float streak=smoothstep(.54,.93,fracture)*smoothstep(.43,.71,ripple.r);
   float aerated=smoothstep(.64,.82,ripple.g*.72+swirl*.34);
   float bank=smoothstep(.82,.98,abs(p.x*2.-1.))*(.25+.2*swirl);
   float whitewater=clamp((streak*.54+aerated*.22+bank)*uForce,0.,.74);
   vec3 water=mix(uDeep,uLight,body*.73+.13);
   water=mix(water,uFoam,whitewater);
   gl_FragColor=vec4(water,1.);
 }`;

export class World3D {
  constructor(canvas){
    this.canvas=canvas;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.43;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<700?1.25:1.6));
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color(STAGES[0].sky);
    this.scene.fog=new THREE.FogExp2(STAGES[0].fog,.012);
    this.camera=new THREE.OrthographicCamera(-20,20,12,-12,.1,320);
    this.raycaster=new THREE.Raycaster();
    this.waterPlane=new THREE.Plane(V(0,1,0),-.06);
    this.dummy=new THREE.Object3D();
    this.camTarget=V(3.5,0,-5);
    this.camOffset=V(19,27,23);
    this.camera.position.copy(this.camTarget).add(this.camOffset);
    this.camera.lookAt(this.camTarget);
    this.clock=0;
    this.makeLights();
    this.makeTerrain();
    this.makeCliffs();
    this.makeWater();
    this.makeRapids();
    this.makeBiomes();
    this.makeCharacters();
    this.makeCastVisuals();
    this.fishMats=new Map();
    this.fishPools=new Map(); // One set of GPU instances per species; every fish stays hookable.
    this.fishMatrix=new THREE.Matrix4();this.fishRoot=new THREE.Object3D();this.fishPart=new THREE.Object3D();
    this.fishEyeMat=new THREE.MeshBasicMaterial({color:0x173945});
    this.fishBulbMat=new THREE.MeshBasicMaterial({color:0xffe8ab});
    this.applyStage(0);
    this.resize();
  }
  makeLights(){
    this.ambient=new THREE.HemisphereLight(0xdffeff,0x354d4c,1.7);this.scene.add(this.ambient);
    this.sun=new THREE.DirectionalLight(0xffdbb4,2.9);this.sun.position.set(-24,45,-36);
    this.sun.castShadow=true;this.sun.shadow.mapSize.set(512,512);
    this.sun.shadow.camera.left=-45;this.sun.shadow.camera.right=45;
    this.sun.shadow.camera.top=45;this.sun.shadow.camera.bottom=-45;
    this.sun.shadow.normalBias=.07;this.scene.add(this.sun);
    this.fill=new THREE.DirectionalLight(0x81d8da,.9);this.fill.position.set(22,12,25);this.scene.add(this.fill);
  }
  makeTerrain(){
    const stageMat=material(STAGES[0].bank,{roughness:1});this.bankMat=stageMat;
    const bankGeom=new THREE.BoxGeometry(19,1.25,220);
    for(const sign of [-1,1]){
      const floor=new THREE.Mesh(bankGeom,stageMat);floor.position.set(sign*17,.0,0);floor.receiveShadow=true;this.scene.add(floor);
      const edge=new THREE.Mesh(new THREE.BoxGeometry(.52,.41,220),material(0x9ba890,{roughness:1}));
      edge.position.set(sign*7.7,.18,0);edge.receiveShadow=true;this.scene.add(edge);
      const bed=new THREE.Mesh(new THREE.BoxGeometry(2.3,.42,220),material(0x34545a,{roughness:1}));
      bed.position.set(sign*8.35,-.39,0);this.scene.add(bed);
    }
    const sand=material(0x668478,{roughness:1}),wood=material(0x91765b,{roughness:1});
    for(let i=0;i<145;i++){
      const sign=i%2?1:-1,z=(seed(i*11)-.5)*208,x=sign*(8.1+seed(i+17)*13);
      const pebble=new THREE.Mesh(shared.lowSphere,i%4===0?wood:sand);
      const r=.14+seed(i*9+7)*.35;pebble.scale.set(r*1.5,r*.38,r);
      pebble.position.set(x,.67,z);pebble.rotation.y=seed(i+23)*Math.PI;this.scene.add(pebble);
    }
    const leaves=material(0x3d866c,{roughness:1}),trunk=material(0x715646);
    this.leafMat=leaves;this.trunkMat=trunk;
    for(let i=0;i<82;i++){
      const sign=i%2?1:-1,z=(seed(i*17+5)-.5)*200,x=sign*(10.9+seed(i+4)*12);
      const tree=new THREE.Group();
      const stem=new THREE.Mesh(shared.cylinder,trunk);stem.scale.set(.17,.8,.17);stem.position.y=.95;tree.add(stem);
      for(let k=0;k<3;k++){
        const crown=new THREE.Mesh(shared.cone,leaves);
        crown.scale.set(.73-k*.11,1.43-k*.13,.73-k*.11);crown.position.y=1.8+k*.54;tree.add(crown);
      }
      tree.position.set(x,.55,z);tree.scale.setScalar(.6+seed(i*8+2)*.8);this.scene.add(tree);
    }
    // Crossing points make both populated shores traversable by WASD.
    for(const bridgeZ of [-22,24]){
      const rail=material(0x4e3933),planks=material(0xc39767);
      const bridge=new THREE.Mesh(new THREE.BoxGeometry(17.7,.3,2.9),rail);bridge.position.set(0,.57,bridgeZ);bridge.receiveShadow=true;this.scene.add(bridge);
      for(let p=0;p<18;p++){
        const plank=new THREE.Mesh(new THREE.BoxGeometry(.92,.17,2.7),planks);
        plank.position.set(-8.1+p*.95,.78,bridgeZ);plank.receiveShadow=true;this.scene.add(plank);
      }
      for(const side of [-1,1]){
        const beam=new THREE.Mesh(new THREE.BoxGeometry(18,.18,.14),rail);
        beam.position.set(0,1.03,bridgeZ+side*1.49);this.scene.add(beam);
      }
    }
    // A small starting pier makes the protagonist's fishing position legible.
    const deck=new THREE.Mesh(new THREE.BoxGeometry(4.4,.3,9),wood);deck.position.set(9.2,.55,0);deck.receiveShadow=true;this.scene.add(deck);
    for(let i=0;i<10;i++){
      const seam=new THREE.Mesh(new THREE.BoxGeometry(4.44,.03,.035),material(0x483d36));
      seam.position.set(9.2,.73,-4.3+i*.92);this.scene.add(seam);
    }
  }
  makeCliffs(){
    // Tall, jagged river walls give the arena real depth and pressure at the horizon.
    this.cliffMat=material(0x526a69,{roughness:1,flatShading:true});
    this.cliffs=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),this.cliffMat,128);
    this.cliffs.frustumCulled=false;
    for(let i=0;i<128;i++){
      const sign=i%2?1:-1;
      const x=sign*(24.7+seed(i*31+8)*4.3);
      const z=(seed(i*17+5)-.5)*214;
      const h=2.1+seed(i*37+3)*3.7;
      this.dummy.position.set(x,.4+h*.58,z);
      this.dummy.rotation.set(seed(i*19)*.15,seed(i*7)*Math.PI,.18*seed(i*3));
      this.dummy.scale.set(1.5+seed(i*29)*1.5,h,1.7+seed(i*11)*1.6);
      this.dummy.updateMatrix();this.cliffs.setMatrixAt(i,this.dummy.matrix);
      this.cliffs.setColorAt(i,new THREE.Color([0xa0aeb0,0x727d83,0x899696][i%4]));
    }
    this.scene.add(this.cliffs);
  }
  makeWater(){
    // A tiny procedural texture is generated in memory: no image download, no CDN.
    const data=new Uint8Array(128*128*4);
    const sample=(x,y,step,channel)=>{
      const grid=128/step,fx=x/step,fy=y/step;
      const ix=Math.floor(fx),iy=Math.floor(fy),u=(fx-ix)**2*(3-2*(fx-ix)),v=(fy-iy)**2*(3-2*(fy-iy));
      const h=(a,b)=>seed(((a+grid)%grid)*47+((b+grid)%grid)*151+channel*359);
      return (h(ix,iy)*(1-u)+h(ix+1,iy)*u)*(1-v)+(h(ix,iy+1)*(1-u)+h(ix+1,iy+1)*u)*v;
    };
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const i=(y*128+x)*4;
      for(let c=0;c<3;c++)data[i+c]=Math.floor(255*(sample(x,y,32,c)*.58+sample(x,y,16,c+3)*.3+sample(x,y,8,c+6)*.12));
      data[i+3]=255;
    }
    const noise=new THREE.DataTexture(data,128,128,THREE.RGBAFormat);
    noise.wrapS=noise.wrapT=THREE.RepeatWrapping;
    noise.minFilter=noise.magFilter=THREE.LinearFilter;noise.needsUpdate=true;
    const uniforms={uTime:{value:0},uForce:{value:1.08},uNoise:{value:noise},
      uDeep:{value:new THREE.Color(0x10576a)},uLight:{value:new THREE.Color(STAGES[0].water)},
      uFoam:{value:new THREE.Color(STAGES[0].foam)}};
    const water=new THREE.Mesh(new THREE.PlaneGeometry(15.0,220,34,200),new THREE.ShaderMaterial({uniforms,vertexShader:WATER_VERT,fragmentShader:WATER_FRAG,side:THREE.DoubleSide}));
    water.rotation.x=-Math.PI/2;water.position.y=-.12;water.receiveShadow=true;this.scene.add(water);
    this.water=water;this.waterUniforms=uniforms;
    // Hundreds of independently flowing whitewater streaks, packed into ONE draw call.
    const streakGeom=new THREE.PlaneGeometry(.11,1);streakGeom.rotateX(-Math.PI/2);
    this.streakMat=new THREE.MeshBasicMaterial({color:0xdafff4,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide});
    this.streaks=new THREE.InstancedMesh(streakGeom,this.streakMat,330);
    this.streakData=Array.from({length:330},(_,i)=>({x:(seed(i*19+1)-.5)*13.6,z:(seed(i*13+3)-.5)*185,speed:10+seed(i*7+8)*14,length:.45+seed(i*17+12)*1.9}));
    this.streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.streaks.frustumCulled=false;this.scene.add(this.streaks);
    // Smaller bright splashes are also instanced instead of separate draw calls.
    this.splashMat=new THREE.MeshBasicMaterial({color:0xe6fff0,transparent:true,opacity:.68,depthWrite:false});
    this.splashes=new THREE.InstancedMesh(shared.lowSphere,this.splashMat,120);
    this.splashData=Array.from({length:120},(_,i)=>({x:(seed(i*34+2)-.5)*13,z:(seed(i*9+8)-.5)*130,speed:7+seed(i*39+11)*11,phase:seed(i+7)*6.28,size:.04+seed(i*3+5)*.1}));
    this.splashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.splashes.frustumCulled=false;this.scene.add(this.splashes);
  }
  makeRapids(){
    this.rockMat=material(0x526868,{roughness:1});
    this.rockGroups=[];const foam=[];
    for(let i=0;i<34;i++){
      const r=.39+seed(i*5+8)*.95;
      const x=(seed(i*7+11)-.5)*12,z=-92+i*5.53+(seed(i+27)-.5)*3.4;
      const rock=new THREE.Mesh(shared.lowSphere,this.rockMat);
      rock.scale.set(r*1.16,r*.87,r*.95);rock.position.set(x,.13,z);
      rock.castShadow=i%3===0;this.scene.add(rock);
      this.rockGroups.push({x,z,r,mesh:rock});
      for(let j=0;j<8;j++){
        const angle=seed(i*19+j*31)*Math.PI*2;
        foam.push({x:x+Math.cos(angle)*(r*.9+seed(i*13+j)*.46),
          z:z+Math.sin(angle)*r*.7+.35+seed(i+j*3)*.43,
          sx:.11+seed(i*9+j*7)*.27,sz:.18+seed(i*5+j*11)*.37});
      }
    }
    // Broken sheets of foam cut across rapids, rather than repeated torus / wifi icons.
    const vertices=[],colors=[],crests=[-72,-42,-13,4,17,49,72];
    for(let n=0;n<crests.length;n++)for(let j=0;j<18;j++){
      if(seed(n*71+j*13)<.19)continue;
      const x=-7+j*.83,z=crests[n]+Math.sin(j*.83+n*.9)*.62+Math.sin(j*.31+n)*.37;
      const width=.68+seed(n*17+j*3)*.45,depth=.16+seed(n*23+j*8)*.26;
      const p=[x,.13,z,x+width,.13,z+.13,x+width*.82,.14,z+depth+.17,
        x,.13,z,x+width*.82,.14,z+depth+.17,x+width*.15,.13,z+depth];
      vertices.push(...p);
      const shade=.71+seed(n*8+j)*.25;
      for(let v=0;v<6;v++)colors.push(shade,shade*1.08,shade*1.04);
      foam.push({x:x+width*.3,z:z+depth*.5,sx:.18,sz:.34});
    }
    const crestGeo=new THREE.BufferGeometry();
    crestGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    crestGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));crestGeo.computeVertexNormals();
    this.crestMat=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.68,depthWrite:false,toneMapped:false});
    this.crestMesh=new THREE.Mesh(crestGeo,this.crestMat);this.crestMesh.frustumCulled=false;this.scene.add(this.crestMesh);
    this.whiteMat=new THREE.MeshBasicMaterial({color:0xd5f8ee,transparent:true,opacity:.81,depthWrite:false,toneMapped:false});
    this.whitePatches=new THREE.InstancedMesh(shared.lowSphere,this.whiteMat,foam.length);
    this.whitePatches.frustumCulled=false;
    for(let i=0;i<foam.length;i++){
      const s=foam[i];this.dummy.position.set(s.x,.105,s.z);
      this.dummy.rotation.set(0,seed(i*17)*Math.PI,0);
      this.dummy.scale.set(s.sx,.015,s.sz);this.dummy.updateMatrix();
      this.whitePatches.setMatrixAt(i,this.dummy.matrix);
    }
    this.scene.add(this.whitePatches);
    this.sprayMat=new THREE.MeshBasicMaterial({color:0xe5fff1,transparent:true,opacity:.82,depthWrite:false,toneMapped:false});
    this.spray=new THREE.InstancedMesh(shared.lowSphere,this.sprayMat,170);
    this.spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.spray.frustumCulled=false;
    this.sprayData=Array.from({length:170},(_,i)=>{
      const r=this.rockGroups[i%this.rockGroups.length];
      return {x:r.x+(seed(i*31)-.5)*r.r*1.2,z:r.z+(seed(i*13)-.5)*r.r,
        phase:seed(i*47),speed:1.6+seed(i*11)*2.5,size:.035+seed(i*19)*.095};
    });
    this.scene.add(this.spray);
  }
  makeBiomes(){
    // Each round changes its actual 3D shoreline, not merely the water tint.
    // A biome is a few instanced meshes and therefore cheap even in the offline build.
    const schemes=[
      {geometry:new THREE.ConeGeometry(.085,.85,4),colors:[0x83c49d,0x69a591,0xb1c8a5],height:.91,count:125},
      {geometry:new THREE.IcosahedronGeometry(.25,0),colors:[0xc7a6eb,0x9ccbe6,0xf3d3b4],height:1.55,count:88,emissive:0x4d3378},
      {geometry:new THREE.ConeGeometry(.43,2.2,5),colors:[0xa6ecf5,0x8bbdda,0xd4faff],height:1.53,count:66,emissive:0x164e6a},
      {geometry:new THREE.ConeGeometry(.35,2.0,5),colors:[0xed9872,0x9b5960,0xf0c38b],height:1.53,count:81,emissive:0x5c222a},
      {geometry:new THREE.OctahedronGeometry(.43,0),colors:[0xf3d795,0xadd6ec,0xe4b1ef],height:1.8,count:84,emissive:0x5c4a9c}
    ];
    this.biomes=schemes.map((style,index)=>{
      const m=new THREE.MeshStandardMaterial({color:0xffffff,emissive:style.emissive||0x0a1916,emissiveIntensity:index?0.6:.15,roughness:.36,metalness:index===4?.37:.07});
      const mesh=new THREE.InstancedMesh(style.geometry,m,style.count);
      mesh.frustumCulled=false;
      for(let i=0;i<style.count;i++){
        const side=i%2?1:-1,z=(seed(i*31+index*173)-.5)*204;
        const offset=index===0?8.3+seed(i*19+9)*1.0:9.4+seed(i*19+9)*10.1;
        const x=side*offset,scale=(.62+seed(i*27+5)*.96)*(index===3?.83:1);
        this.dummy.position.set(x,style.height+(index===1?seed(i*8+3)*1.05:0),z);
        this.dummy.scale.setScalar(scale);this.dummy.rotation.set(0,seed(i*17)*Math.PI*2,0);
        this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);
        mesh.setColorAt(i,new THREE.Color(style.colors[i%style.colors.length]));
      }
      mesh.visible=false;this.scene.add(mesh);return mesh;
    });
    // Extra luminous rune hoops become visible only in the final arena.
    const rings=new THREE.InstancedMesh(new THREE.TorusGeometry(.7,.026,4,24),new THREE.MeshBasicMaterial({color:0xffd99a,transparent:true,opacity:.67,side:THREE.DoubleSide}),35);
    rings.frustumCulled=false;
    for(let i=0;i<35;i++){
      this.dummy.position.set((i%2?1:-1)*(9.4+seed(i*6+19)*7),.8,(seed(i*21+7)-.5)*184);
      this.dummy.scale.setScalar(.7+seed(i*13)*.6);
      this.dummy.rotation.set(-Math.PI/2,0,seed(i)*Math.PI*2);
      this.dummy.updateMatrix();rings.setMatrixAt(i,this.dummy.matrix);
    }
    rings.visible=false;this.scene.add(rings);this.runeRings=rings;
  }
  makeHuman(isPlayer=false){
    const g=new THREE.Group();
    const skin=material(0xf3bb92),jacket=material(isPlayer?0x45bda4:0x62778d),dark=material(0x203745),hatMat=material(isPlayer?0xe8b869:0x526679);
    const torso=new THREE.Mesh(new THREE.CylinderGeometry(.45,.54,1.29,8),jacket);torso.position.y=1.73;torso.castShadow=true;g.add(torso);
    const collar=new THREE.Mesh(new THREE.CylinderGeometry(.39,.42,.17,9),material(0xe1e9d5));collar.position.y=2.42;g.add(collar);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.42,12,9),skin);head.position.y=2.91;head.castShadow=true;g.add(head);
    const hair=new THREE.Mesh(new THREE.SphereGeometry(.435,10,7,0,Math.PI*2,0,Math.PI*.43),dark);hair.position.y=2.94;g.add(hair);
    const hat=new THREE.Mesh(new THREE.CylinderGeometry(.39,.46,.3,10),hatMat);hat.position.y=3.36;hat.castShadow=true;g.add(hat);
    const brim=new THREE.Mesh(new THREE.CylinderGeometry(.67,.67,.06,12),hatMat);brim.position.y=3.24;g.add(brim);
    const eyes=material(0x253e43);for(const zz of [-.21,.21]){
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.045,6,4),eyes);eye.position.set(-.37,2.95,zz);g.add(eye);
    }
    const legs=[];for(const zz of [-.22,.22]){
      const pivot=new THREE.Group();pivot.position.set(0,1.07,zz);
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(.18,.2,.86,7),dark);leg.position.y=-.41;pivot.add(leg);
      const boot=new THREE.Mesh(shared.box,material(0x24343b));boot.scale.set(.42,.28,.57);boot.position.set(-.07,-.9,.11);pivot.add(boot);
      g.add(pivot);legs.push(pivot);
    }
    for(const zz of [-.48,.48]){
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(.14,.17,.9,7),jacket);
      arm.position.set(-.28,2.08,zz);arm.rotation.z=-.55;g.add(arm);
      const hand=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),skin);hand.position.set(-.53,1.82,zz);g.add(hand);
    }
    const bag=new THREE.Mesh(new THREE.BoxGeometry(.42,.7,.67),material(0x735b4f));bag.position.set(.51,1.54,0);g.add(bag);
    const rodPivot=new THREE.Group();rodPivot.position.set(-.53,1.98,.27);g.add(rodPivot);
    const end=V(-2.95,1.2,-3.65), rodDir=end.clone().normalize();
    const rod=new THREE.Mesh(new THREE.CylinderGeometry(.018,.065,end.length(),7),material(isPlayer?0x94dcbe:0xc5c0a6,{metalness:.35}));
    rod.position.copy(end).multiplyScalar(.5);rod.quaternion.setFromUnitVectors(V(0,1,0),rodDir);rod.castShadow=isPlayer;rodPivot.add(rod);
    const grip=new THREE.Mesh(new THREE.CylinderGeometry(.092,.1,.9,7),material(0xd4a873));
    grip.position.copy(rodDir).multiplyScalar(.40);grip.quaternion.copy(rod.quaternion);rodPivot.add(grip);
    const reel=new THREE.Mesh(new THREE.TorusGeometry(.23,.06,6,12),material(0xe7c279,{metalness:.57}));
    reel.position.set(-.4,-.13,-.28);reel.rotation.y=.6;rodPivot.add(reel);
    for(let n=1;n<5;n++){
      const guide=new THREE.Mesh(new THREE.TorusGeometry(.085-n*.012,.018,4,9),material(0xeee1b3,{metalness:.8}));
      guide.position.copy(end).multiplyScalar(n/5);guide.rotation.y=.7;rodPivot.add(guide);
    }
    const tip=new THREE.Object3D();tip.position.copy(end);rodPivot.add(tip);
    const aura=new THREE.Mesh(new THREE.RingGeometry(.73,.81,32),new THREE.MeshBasicMaterial({color:0x8ff6db,transparent:true,opacity:.67,side:THREE.DoubleSide,depthWrite:false}));
    aura.rotation.x=-Math.PI/2;aura.position.y=.28;g.add(aura);
    g.userData={legs,rodPivot,tip,jacket,rod,aura};
    return g;
  }
  makeCharacters(){
    this.player=this.makeHuman(true);this.player.position.set(10,.75,0);this.scene.add(this.player);
    const n=99;
    const skinMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8});
    const coatMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.7});
    const hatMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.55});
    const pants=material(0x223947),boots=material(0x29343c),reels=material(0xf7cf86,{metalness:.42}),rods=material(0xc9d5bd,{metalness:.35});
    const make=(geometry,mat)=>{const mesh=new THREE.InstancedMesh(geometry,mat,n);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;this.scene.add(mesh);return mesh;};
    this.people={torso:make(new THREE.CylinderGeometry(.44,.56,1.35,7),coatMat),head:make(new THREE.SphereGeometry(.39,9,7),skinMat),hat:make(new THREE.CylinderGeometry(.42,.5,.32,8),hatMat),brim:make(new THREE.CylinderGeometry(.67,.67,.05,9),hatMat),leftLeg:make(new THREE.CylinderGeometry(.18,.2,.87,6),pants),rightLeg:make(new THREE.CylinderGeometry(.18,.2,.87,6),pants),leftBoot:make(shared.box,boots),rightBoot:make(shared.box,boots),arm:make(new THREE.CylinderGeometry(.14,.16,.9,6),coatMat),rod:make(new THREE.CylinderGeometry(.02,.05,4.1,5),rods),reel:make(new THREE.TorusGeometry(.2,.07,5,10),reels)};
    const lines=new Float32Array(n*6);this.botLineGeom=new THREE.BufferGeometry();this.botLineGeom.setAttribute('position',new THREE.BufferAttribute(lines,3).setUsage(THREE.DynamicDrawUsage));
    this.botLines=new THREE.LineSegments(this.botLineGeom,new THREE.LineBasicMaterial({color:0xd9f9ed,transparent:true,opacity:.36,depthWrite:false}));
    this.botLines.frustumCulled=false;this.scene.add(this.botLines);
    this.botFloats=make(new THREE.SphereGeometry(.11,5,4),material(0xf4b27e,{emissive:0x412518}));
  }
  setBots(bots){
    this.bots=bots;
    const palette=[0x69c2af,0xf1a577,0x8dabdf,0xddadcf,0xf4cf81,0x81d9db,0xbbaadd,0xbfd898];
    for(let i=0;i<bots.length;i++){
      const b=bots[i],side=i%2? -1:1,row=Math.floor(i/2)-24;
      b.x=side*(9.15+(i%4)*.79);b.z=row*3.12+(seed(i+25)-.5)*1.25;
      // Keep the starting pier for the player: nearby rivals remain on both banks.
      if(side===1&&Math.abs(b.z)<8)b.z+=b.z<0?-9:9;
      b.side=side;b.seed=seed(i*3+12)*6.28;b.color=palette[i%palette.length];
      this.people.torso.setColorAt(i,new THREE.Color(b.color));
      this.people.arm.setColorAt(i,new THREE.Color(b.color));
      this.people.hat.setColorAt(i,new THREE.Color(palette[(i+3)%palette.length]));
      this.people.brim.setColorAt(i,new THREE.Color(palette[(i+3)%palette.length]));
      this.people.head.setColorAt(i,new THREE.Color([0xf5c89d,0xe2ad86,0xc78966,0xecc2a3][i%4]));
    }
    for(const m of [this.people.torso,this.people.arm,this.people.head,this.people.hat,this.people.brim])m.instanceColor.needsUpdate=true;
  }
  makeCastVisuals(){
    const thin=new THREE.LineBasicMaterial({color:0xeafcf1,transparent:true,opacity:.9});
    this.lineGeometry=new THREE.BufferGeometry().setFromPoints([V(0,0,0),V(0,0,0)]);
    this.line=new THREE.Line(this.lineGeometry,thin);this.line.visible=false;this.scene.add(this.line);
    this.bobber=new THREE.Group();
    const ball=new THREE.Mesh(new THREE.SphereGeometry(.17,10,8),material(0xf4aa78,{emissive:0x702b19}));this.bobber.add(ball);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.17,10,8,0,Math.PI*2,0,Math.PI*.48),material(0xfff2d2));this.bobber.add(cap);
    const halo=new THREE.Mesh(new THREE.RingGeometry(.25,.29,16),new THREE.MeshBasicMaterial({color:0xfff9d5,transparent:true,opacity:.54,side:THREE.DoubleSide}));halo.rotation.x=-Math.PI/2;halo.position.y=-.12;this.bobber.add(halo);
    this.scene.add(this.bobber);this.bobber.visible=false;
    this.aim=new THREE.Mesh(new THREE.RingGeometry(.63,.73,28),new THREE.MeshBasicMaterial({color:0xffe2a0,transparent:true,opacity:.83,side:THREE.DoubleSide,depthWrite:false}));
    this.aim.rotation.x=-Math.PI/2;this.aim.position.y=.16;this.aim.visible=false;this.scene.add(this.aim);
    this.pullRing=new THREE.Mesh(new THREE.RingGeometry(.7,.8,24),new THREE.MeshBasicMaterial({color:0xfbe09a,transparent:true,opacity:.72,side:THREE.DoubleSide,depthWrite:false}));
    this.pullRing.rotation.x=-Math.PI/2;this.pullRing.visible=false;this.scene.add(this.pullRing);
  }
  applyStage(index){
    const s=STAGES[index];this.scene.background.set(s.sky);this.scene.fog.color.set(s.fog);
    this.waterUniforms.uLight.value.set(s.water);
    this.waterUniforms.uDeep.value.set(s.water).multiplyScalar(index===0?.37:.31);
    this.waterUniforms.uFoam.value.set(s.foam);
    this.waterUniforms.uForce.value=[1.08,1.14,1.24,1.33,1.44][index];
    this.scene.fog.density=[.014,.017,.019,.021,.022][index];
    this.bankMat.color.set(s.bank);this.rockMat.color.set(index>=3?0x755060:0x526868);
    this.cliffMat.color.set([0x506368,0x555577,0x59728a,0x75515a,0x61527b][index]);
    this.streakMat.color.set(s.foam);this.splashMat.color.set(s.foam);
    this.sprayMat.color.set(s.foam);this.whiteMat.color.set(s.foam);this.crestMat.color.set(s.foam);
    this.sun.color.set(s.light);
    this.leafMat.color.set([0x3d866c,0x745c91,0x75a6b5,0x733e57,0x546094][index]);
    this.trunkMat.color.set([0x715646,0x59405c,0x556c85,0x4a313d,0x383e68][index]);
    this.biomes.forEach((mesh,i)=>{mesh.visible=i===index;});this.runeRings.visible=index===4;
    this.sun.intensity=index>=3?2.1:2.9;this.ambient.intensity=index===4?1.35:1.7;
  }
  resize(){
    const w=Math.max(320,this.canvas.clientWidth),h=Math.max(430,this.canvas.clientHeight),aspect=w/h;
    const height=w<700?37:25;this.camera.left=-height*aspect/2;this.camera.right=height*aspect/2;
    this.camera.top=height/2;this.camera.bottom=-height/2;this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h,false);this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,w<700?1.25:1.6));
  }
  onWater(clientX,clientY){
    const r=this.canvas.getBoundingClientRect();
    const ndc=new THREE.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);
    this.raycaster.setFromCamera(ndc,this.camera);
    const point=new THREE.Vector3();
    if(!this.raycaster.ray.intersectPlane(this.waterPlane,point))return null;
    if(Math.abs(point.x)>7.1)return null;
    return point;
  }
  project(point){
    const p=point.clone().project(this.camera),r=this.canvas.getBoundingClientRect();
    return {x:(p.x+1)*r.width/2,y:(1-p.y)*r.height/2,visible:p.z<1&&p.z>-1&&p.x>-1.08&&p.x<1.08&&p.y>-1.08&&p.y<1.08};
  }
  playerTip(){
    this.player.updateMatrixWorld(true);
    return this.player.userData.tip.getWorldPosition(new THREE.Vector3());
  }
  setRodAppearance(level){
    const colors=[0x9acfaf,0xa8cad3,0x8ee3e9,0xa88fe3,0xf1d39a];
    this.player.userData.rod.material.color.set(colors[clamp(level,0,4)]);
    this.player.userData.aura.material.color.set(level>=3?0xf8d99e:0x8ff6db);
  }
  setPlayerPosition(x,z,walking,t,dt){
    this.player.position.set(x,(Math.abs(z+22)<1.55||Math.abs(z-24)<1.55)?1.03:.74,z);
    this.player.scale.x=x<0?-1:1;
    const legs=this.player.userData.legs;
    const step=walking?Math.sin(t*11)*.48:Math.sin(t*2)*.035;
    legs[0].rotation.x=step;legs[1].rotation.x=-step;
    this.player.position.y+=walking?Math.abs(Math.sin(t*11))*.04:Math.sin(t*2)*.025;
    this.player.userData.rodPivot.rotation.z=walking?Math.sin(t*11)*.028:Math.sin(t*1.9)*.025;
  }
  place(mesh,i,x,y,z,sx=1,sy=1,sz=1,rotZ=0,quat=null){
    const d=this.dummy;d.position.set(x,y,z);d.scale.set(sx,sy,sz);d.rotation.set(0,0,rotZ);
    if(quat)d.quaternion.copy(quat);
    d.updateMatrix();mesh.setMatrixAt(i,d.matrix);
  }
  updatePeople(t,playerZ){
    if(!this.bots)return;
    const P=this.people,lines=this.botLineGeom.attributes.position.array,up=V(0,1,0);
    for(let i=0;i<this.bots.length;i++){
      const b=this.bots[i],visible=b.alive!==false&&Math.abs(b.z-playerZ)<44;
      if(!visible){for(const m of Object.values(P))this.place(m,i,0,-200-i,0,0,0,0);
        this.place(this.botFloats,i,0,-200-i,0,0,0,0);
        for(let q=0;q<6;q++)lines[i*6+q]=0;
        continue;
      }
      const cycle=((t/(7.2+i%5))+b.seed/(Math.PI*2))%1;
      const walking=cycle<.23,step=walking?Math.sin(t*11+b.seed)*.36:Math.sin(t*2+b.seed)*.05;
      const x=b.x+Math.sin(t*.42+b.seed)*.24,z=b.z+Math.sin(t*.39+b.seed)*1.14;
      b.liveX=x;b.liveZ=z;
      const sway=walking?Math.abs(Math.sin(t*11+b.seed))*.08:Math.sin(t*1.4+b.seed)*.045,turn=b.side;
      this.place(P.torso,i,x,1.76+sway,z);
      this.place(P.head,i,x,2.87+sway,z);
      this.place(P.hat,i,x,3.31+sway,z);
      this.place(P.brim,i,x,3.17+sway,z);
      this.place(P.leftLeg,i,x+step*.13,1.02,z-.23,.17,.83,.17,step);
      this.place(P.rightLeg,i,x-step*.13,1.02,z+.23,.17,.83,.17,-step);
      this.place(P.leftBoot,i,x-turn*.09,.71,z-.24,.37,.22,.48);
      this.place(P.rightBoot,i,x-turn*.09,.71,z+.24,.37,.22,.48);
      this.place(P.arm,i,x-turn*.31,2.09,z+.37,.14,.9,.14,turn*.57);
      const sweep=cycle>.64&&cycle<.79?Math.sin((cycle-.64)/.15*Math.PI):0;
      const h=V(x-turn*.63,2.1,z+.3);
      const tip=V(x-turn*(3.2-sweep*.5),2.95+sweep*1.12+Math.sin(t*1.7+b.seed)*.13,z+1.1-sweep*2.35);
      const dir=tip.clone().sub(h),mid=h.clone().add(tip).multiplyScalar(.5);
      const q=new THREE.Quaternion().setFromUnitVectors(up,dir.clone().normalize());
      this.place(P.rod,i,mid.x,mid.y,mid.z,1,dir.length()/4.1,1,0,q);
      this.place(P.reel,i,h.x,h.y-.07,h.z,.8,.8,.8);
      const float=V(x-turn*(5.5-sweep*.9),.11,z+2.8+Math.sin(t+b.seed)*.7);
      const start=i*6;lines[start]=tip.x;lines[start+1]=tip.y;lines[start+2]=tip.z;
      lines[start+3]=float.x;lines[start+4]=float.y;lines[start+5]=float.z;
      this.place(this.botFloats,i,float.x,float.y,float.z,.7,.7,.7);
    }
    for(const m of Object.values(P))m.instanceMatrix.needsUpdate=true;
    this.botFloats.instanceMatrix.needsUpdate=true;
    this.botLineGeom.attributes.position.needsUpdate=true;
  }
  updateFlow(t,dt,playerZ){
    this.waterUniforms.uTime.value=t;
    for(let i=0;i<this.streakData.length;i++){
      const s=this.streakData[i];s.z+=dt*s.speed;
      if(s.z>playerZ+105)s.z=playerZ-105;
      if(s.z<playerZ-105)s.z=playerZ+105;
      this.place(this.streaks,i,s.x,-.02,s.z,1,s.length,1);
    }
    this.streaks.instanceMatrix.needsUpdate=true;
    for(let i=0;i<this.splashData.length;i++){
      const s=this.splashData[i];s.z+=dt*s.speed;
      if(s.z>playerZ+80)s.z=playerZ-80;
      if(s.z<playerZ-80)s.z=playerZ+80;
      this.place(this.splashes,i,s.x,.15+Math.abs(Math.sin(t*5+s.phase))*.23,s.z,s.size,s.size*.5,s.size);
    }
    this.splashes.instanceMatrix.needsUpdate=true;
    for(let i=0;i<this.sprayData.length;i++){
      const s=this.sprayData[i],p=(t*s.speed+s.phase)%1;
      const x=s.x+Math.sin(p*4+s.phase*8)*.21;
      const z=s.z+p*(.6+s.size*6);
      const y=.13+Math.sin(Math.PI*p)*(.48+s.size*7);
      const scale=s.size*(1-p*.5);
      this.place(this.spray,i,x,y,z,scale,scale*.78,scale);
    }
    this.spray.instanceMatrix.needsUpdate=true;
    this.crestMat.opacity=.66+Math.sin(t*4)*.065;
  }
  updateCamera(playerX,playerZ,dt){
    const target=V(playerX*.36,0,playerZ-5);
    this.camTarget.lerp(target,1-Math.exp(-dt*4.2));
    this.camera.position.lerp(this.camTarget.clone().add(this.camOffset),1-Math.exp(-dt*4.2));
    this.camera.lookAt(this.camTarget);
    this.sun.position.set(playerX-24,44,playerZ-36);
    this.sun.target.position.set(playerX,0,playerZ);this.sun.target.updateMatrixWorld();
  }
  showAim(point,power,t){
    this.aim.visible=!!point;
    if(point){this.aim.position.set(point.x,.16,point.z);
      this.aim.scale.setScalar(1+power*.45+Math.sin(t*7)*.055);
      this.aim.material.color.set(power>.94?0xffa78b:0xffe2a0);
    }
  }
  showLine(destination,t){
    this.line.visible=!!destination;this.bobber.visible=!!destination;
    if(!destination)return;
    const tip=this.playerTip();const array=this.lineGeometry.attributes.position.array;
    array[0]=tip.x;array[1]=tip.y;array[2]=tip.z;
    array[3]=destination.x;array[4]=destination.y;array[5]=destination.z;
    this.lineGeometry.attributes.position.needsUpdate=true;
    this.bobber.position.copy(destination);
    this.bobber.rotation.z=Math.sin(t*10)*.13;
  }
  showPull(fish,t){
    this.pullRing.visible=!!fish;
    if(fish){this.pullRing.position.set(fish.x,.11,fish.z);
      this.pullRing.scale.setScalar(1+Math.sin(t*7)*.13);}
  }
  fishDimensions(kind){
    const r=kind.radius;let sx=.42*r,sy=.31*r,sz=1.11*r;
    if(kind.shape==='eel'){sx=.24*r;sy=.20*r;sz=1.48*r;}
    if(kind.shape==='giant'){sx=.57*r;sy=.37*r;sz=1.18*r;}
    if(kind.shape==='ray'){sx=.86*r;sy=.12*r;sz=.68*r;}
    if(kind.shape==='disc'||kind.shape==='puffer'){sx=.65*r;sy=.27*r;sz=.70*r;}
    if(kind.shape==='needle'){sx=.18*r;sy=.19*r;sz=1.44*r;}
    return {r,sx,sy,sz};
  }
  fishMaterial(kind){
    if(!this.fishMats.has(kind.id))this.fishMats.set(kind.id,{
      body:material(new THREE.Color(kind.color).multiplyScalar(.87),{metalness:kind.tier>=3?.27:.09,roughness:.41}),
      under:material(new THREE.Color(kind.color).multiplyScalar(.49),{roughness:.76}),
      fin:new THREE.MeshStandardMaterial({color:new THREE.Color(kind.color).multiplyScalar(.78),roughness:.48,side:THREE.DoubleSide})
    });
    return this.fishMats.get(kind.id);
  }
  fishPool(kind,mats){
    if(this.fishPools.has(kind.id))return this.fishPools.get(kind.id);
    const max=240;
    const make=(geometry,mat,n=max)=>{
      const mesh=new THREE.InstancedMesh(geometry,mat,n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;this.scene.add(mesh);
      return mesh;
    };
    const pool={used:0,dimensions:this.fishDimensions(kind),
      body:make(shared.sphere,mats.body),tail:make(shared.fin,mats.fin),
      dorsal:make(shared.cone,mats.under),eyes:make(shared.sphere,this.fishEyeMat,max*2),
      wings:kind.shape==='ray'?make(shared.fin,mats.fin,max*2):null};
    this.fishPools.set(kind.id,pool);return pool;
  }
  fishInstance(mesh,index,root,x,y,z,sx,sy,sz,ry=0,rz=0){
    const part=this.fishPart;
    part.position.set(x,y,z);part.rotation.set(0,ry,rz);part.scale.set(sx,sy,sz);part.updateMatrix();
    this.fishMatrix.multiplyMatrices(root,part.matrix);mesh.setMatrixAt(index,this.fishMatrix);
  }
  flushFish(fishes){
    for(const pool of this.fishPools.values())pool.used=0;
    for(const fish of fishes){
      const proxy=fish.mesh;if(!proxy?.isInstancedFish)continue;
      const pool=this.fishPools.get(fish.kind.id);
      if(pool.used>=240)continue;
      const i=pool.used++,{sx,sy,sz,r}=pool.dimensions;
      const root=this.fishRoot;
      root.position.copy(proxy.position);root.rotation.copy(proxy.rotation);root.scale.copy(proxy.scale);root.updateMatrix();
      const matrix=root.matrix;
      this.fishInstance(pool.body,i,matrix,0,0,0,sx,proxy.userData.body.scale.y||sy,sz);
      this.fishInstance(pool.tail,i,matrix,0,.07,-sz*.85,r*.99,1,r*.75,proxy.userData.tail.rotation.y);
      this.fishInstance(pool.dorsal,i,matrix,0,sy*.92,-.13*r,.27*r,.61*r,.27*r,0,.16);
      const eyeSize=Math.max(.038,.08*r);
      for(let side=0;side<2;side++)this.fishInstance(pool.eyes,i*2+side,matrix,(side?1:-1)*sx*.88,sy*.42,sz*.73,eyeSize,eyeSize,eyeSize);
      if(pool.wings)for(let side=0;side<2;side++)this.fishInstance(pool.wings,i*2+side,matrix,(side?1:-1)*.43*r,0,-.08*r,r*1.24,1,r*.65,(side?1:-1)*1.2);
    }
    for(const pool of this.fishPools.values()){
      const active=pool.used>0;
      for(const mesh of [pool.body,pool.tail,pool.dorsal,pool.eyes,pool.wings]){
        if(!mesh)continue;
        mesh.count=pool.used*(mesh===pool.eyes||mesh===pool.wings?2:1);
        mesh.visible=active;
        if(active)mesh.instanceMatrix.needsUpdate=true;
      }
    }
  }
  makeFish(kind){
    const {r,sx,sy,sz}=this.fishDimensions(kind);
    const {body:bodyMat,under:underMat,fin:finMat}=this.fishMaterial(kind);
    if(kind.id!=='leviathan'){
      this.fishPool(kind,{body:bodyMat,under:underMat,fin:finMat});
      return {isInstancedFish:true,position:V(0,0,0),rotation:new THREE.Euler(),
        scale:V(1,1,1),userData:{tail:{rotation:{y:0}},body:{scale:{y:sy}},bodyBaseY:sy}};
    }
    const g=new THREE.Group();
    const body=new THREE.Mesh(shared.sphere,bodyMat);body.scale.set(sx,sy,sz);body.castShadow=false;g.add(body);
    const belly=new THREE.Mesh(shared.sphere,underMat);belly.scale.set(sx*.93,sy*.60,sz*.9);belly.position.y=-sy*.5;g.add(belly);
    const tail=new THREE.Group();tail.position.z=-sz*.85;g.add(tail);
    const tailFin=new THREE.Mesh(shared.fin,finMat);
    tailFin.scale.set(r*.99,1,r*.75);tailFin.position.y=.07;tail.add(tailFin);
    const dorsal=new THREE.Mesh(shared.cone,underMat);
    dorsal.scale.set(.27*r,.61*r,.27*r);
    dorsal.position.set(0,sy*.92,-.13*r);dorsal.rotation.z=.16;g.add(dorsal);
    if(kind.shape==='ray'){
      for(const sign of [-1,1]){
        const wing=new THREE.Mesh(shared.fin,bodyMat);wing.scale.set(r*1.24,1,r*.65);
        wing.rotation.y=sign*1.2;wing.position.set(sign*.43*r,0,-.08*r);g.add(wing);
      }
    }
    if(kind.shape==='shark'||kind.shape==='sword'){
      dorsal.scale.multiply(V(1.5,1.4,1.3));
      const bill=new THREE.Mesh(shared.bill,bodyMat);
      bill.scale.setScalar(r);bill.position.z=sz*1.12;bill.rotation.x=Math.PI/2;g.add(bill);
    }
    if(kind.shape==='puffer'||kind.shape==='spined')for(let i=0;i<12;i++){
      const a=i*Math.PI/6;const spike=new THREE.Mesh(shared.cone,underMat);
      spike.scale.set(.075*r,.31*r,.075*r);
      spike.position.set(Math.cos(a)*sx*.98,sy*.35,Math.sin(a)*sz*.67);
      spike.rotation.z=-Math.cos(a)*.85;spike.rotation.x=Math.sin(a)*.8;g.add(spike);
    }
    if(kind.shape==='whisker')for(const sign of [-1,1]){
      const whisker=new THREE.Mesh(shared.whisker,bodyMat);
      whisker.scale.setScalar(r);whisker.position.set(sign*sx*.7,.08,sz*.91);whisker.rotation.z=sign*.7;g.add(whisker);
    }
    if(kind.shape==='angler'){
      const stem=new THREE.Mesh(shared.antenna,underMat);
      stem.scale.setScalar(r);stem.position.set(0,.46*r,.6*r);stem.rotation.x=.5;g.add(stem);
      const bulb=new THREE.Mesh(shared.sphere,this.fishBulbMat);
      bulb.scale.setScalar(.11*r);bulb.position.set(0,.82*r,.73*r);g.add(bulb);
    }
    for(const sign of [-1,1]){
      const eye=new THREE.Mesh(shared.sphere,this.fishEyeMat);
      eye.scale.setScalar(Math.max(.038,.08*r));
      eye.position.set(sign*sx*.88,sy*.42,sz*.73);g.add(eye);
    }
    if(kind.id==='leviathan'){
      const shine=new THREE.PointLight(kind.color,.65,4,2);shine.position.set(0,.46,0);g.add(shine);
    }
    g.userData={tail,body,kind,bodyBaseY:sy};this.scene.add(g);return g;
  }
  removeFish(mesh){if(mesh&&!mesh.isInstancedFish)this.scene.remove(mesh);}
  render(){this.renderer.render(this.scene,this.camera);}
}
