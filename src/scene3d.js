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
 fin:new THREE.BufferGeometry()
};
shared.fin.setAttribute('position',new THREE.Float32BufferAttribute([
  -.5,0,-.45, .5,0,-.45, 0,0,-1.12,
  -.5,.02,-.45, 0,.02,-1.12, .5,.02,-.45
],3));
shared.fin.computeVertexNormals();
const material = (color,extra={}) => new THREE.MeshStandardMaterial({color,roughness:.68,metalness:.06,...extra});

const WATER_VERT = `
 varying vec2 vUv; varying vec3 vPos;
 uniform float uTime;
 void main(){
   vUv=uv;
   vec3 p=position;
   p.z+=sin(position.y*.43+position.x*1.7+uTime*2.5)*.095;
   p.z+=sin(position.y*.83-position.x*2.1+uTime*4.7)*.042;
   vPos=p;
   gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
 }`;
const WATER_FRAG = `
 varying vec2 vUv; varying vec3 vPos;
 uniform float uTime; uniform vec3 uDeep; uniform vec3 uLight; uniform vec3 uFoam;
 float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){
   vec2 p=vUv; float t=uTime;
   float a=sin(p.x*35.+p.y*97.+t*12.)*.5+.5;
   float b=sin(p.x*22.-p.y*58.-t*7.)*.5+.5;
   float ribbons=pow(max(0.,sin(p.y*162.+sin(p.x*24.+t*2.)*4.+t*15.)),18.);
   float thread=pow(max(0.,sin(p.y*92.+p.x*35.+t*11.)),28.);
   float fine=pow(max(0.,sin(p.y*280.-p.x*57.+t*19.)),40.);
   float bank=pow(1.-abs(p.x*2.-1.),8.);
   float foam=clamp(ribbons*.44+thread*.32+fine*.19+bank*.31,0.,.87);
   vec3 base=mix(uDeep,uLight,clamp(.27+a*.23+b*.2,0.,1.));
   base=mix(base,uFoam,foam);
   base+=vec3(.05,.08,.08)*sin(p.y*50.+t*4.)*.5;
   gl_FragColor=vec4(base,1.);
 }`;

export class World3D {
  constructor(canvas){
    this.canvas=canvas;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.66;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
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
    this.makeWater();
    this.makeRapids();
    this.makeCharacters();
    this.makeCastVisuals();
    this.applyStage(0);
    this.resize();
  }
  makeLights(){
    this.ambient=new THREE.HemisphereLight(0xdffeff,0x426351,2.0);this.scene.add(this.ambient);
    this.sun=new THREE.DirectionalLight(0xffdbb4,3.2);this.sun.position.set(-24,45,-36);
    this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);
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
  makeWater(){
    const uniforms={uTime:{value:0},uDeep:{value:new THREE.Color(0x10576a)},uLight:{value:new THREE.Color(STAGES[0].water)},uFoam:{value:new THREE.Color(STAGES[0].foam)}};
    const water=new THREE.Mesh(new THREE.PlaneGeometry(15.0,220,34,200),new THREE.ShaderMaterial({uniforms,vertexShader:WATER_VERT,fragmentShader:WATER_FRAG,side:THREE.DoubleSide}));
    water.rotation.x=-Math.PI/2;water.position.y=-.12;this.scene.add(water);
    this.water=water;this.waterUniforms=uniforms;
    // Hundreds of independently flowing whitewater streaks, packed into ONE draw call.
    const streakGeom=new THREE.PlaneGeometry(.11,1);streakGeom.rotateX(-Math.PI/2);
    this.streakMat=new THREE.MeshBasicMaterial({color:0xdafff4,transparent:true,opacity:.43,depthWrite:false,side:THREE.DoubleSide});
    this.streaks=new THREE.InstancedMesh(streakGeom,this.streakMat,260);
    this.streakData=Array.from({length:260},(_,i)=>({x:(seed(i*19+1)-.5)*13.6,z:(seed(i*13+3)-.5)*185,speed:6+seed(i*7+8)*10,length:.6+seed(i*17+12)*3.2}));
    this.streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.streaks.frustumCulled=false;this.scene.add(this.streaks);
    // Smaller bright splashes are also instanced instead of separate draw calls.
    this.splashMat=new THREE.MeshBasicMaterial({color:0xe6fff0,transparent:true,opacity:.68,depthWrite:false});
    this.splashes=new THREE.InstancedMesh(shared.lowSphere,this.splashMat,120);
    this.splashData=Array.from({length:120},(_,i)=>({x:(seed(i*34+2)-.5)*13,z:(seed(i*9+8)-.5)*130,speed:7+seed(i*39+11)*11,phase:seed(i+7)*6.28,size:.04+seed(i*3+5)*.1}));
    this.splashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.splashes.frustumCulled=false;this.scene.add(this.splashes);
  }
  makeRapids(){
    this.rockMat=material(0x4c6b69,{roughness:1});
    this.rockGroups=[];
    const foamMat=new THREE.MeshBasicMaterial({color:0xcffff0,transparent:true,opacity:.56,depthWrite:false,side:THREE.DoubleSide});
    for(let i=0;i<33;i++){
      const r=.35+seed(i*5+8)*.83;
      const x=(seed(i*7+11)-.5)*11.9,z=-90+i*5.55+(seed(i+27)-.5)*3.8;
      const group=new THREE.Group();group.position.set(x,-.1,z);
      const rock=new THREE.Mesh(shared.lowSphere,this.rockMat);rock.scale.set(r*1.18,r*.96,r*.91);
      rock.position.y=.26;rock.castShadow=i%3===0;group.add(rock);
      for(let j=0;j<3;j++){
        const ring=new THREE.Mesh(new THREE.TorusGeometry(r*(.8+j*.34),.04,4,22),foamMat);
        ring.rotation.x=-Math.PI/2;ring.position.set(.05,.06+j*.015,.4+j*.4);
        ring.scale.set(1,.66,1);group.add(ring);
      }
      this.scene.add(group);this.rockGroups.push(group);
    }
    // Three irregular, much louder rapids across the river on the initial screen.
    const rapids=[-13,4,17,-40,49];
    const crestMaterial=new THREE.MeshBasicMaterial({color:0xd8fff6,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide});
    for(let n=0;n<rapids.length;n++)for(let j=0;j<18;j++){
      const x=-7+j*.82,z=rapids[n]+Math.sin(j*.9+n)*1.22;
      const crest=new THREE.Mesh(new THREE.TorusGeometry(.38, .055,4,11,Math.PI),crestMaterial);
      crest.rotation.set(-Math.PI/2,0,Math.sin(j*.9)*.7);crest.position.set(x,.07,z);
      this.scene.add(crest);
    }
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
    this.waterUniforms.uLight.value.set(s.water);this.waterUniforms.uDeep.value.set(s.sky);this.waterUniforms.uFoam.value.set(s.foam);
    this.bankMat.color.set(s.bank);this.rockMat.color.set(index>=3?0x755060:0x4c6b69);
    this.streakMat.color.set(s.foam);this.splashMat.color.set(s.foam);this.sun.color.set(s.light);
    this.sun.intensity=index>=3?2.2:3.2;this.ambient.intensity=index===4?1.35:2.0;
  }
  resize(){
    const w=Math.max(320,this.canvas.clientWidth),h=Math.max(430,this.canvas.clientHeight),aspect=w/h;
    const height=w<700?37:25;this.camera.left=-height*aspect/2;this.camera.right=height*aspect/2;
    this.camera.top=height/2;this.camera.bottom=-height/2;this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h,false);this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
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
  makeFish(kind){
    const g=new THREE.Group(),r=kind.radius;
    const bodyMat=material(kind.color,{metalness:kind.tier>=3?.28:.11,roughness:.48});
    const underMat=material(new THREE.Color(kind.color).multiplyScalar(.63),{roughness:.69});
    let sx=.42*r,sy=.31*r,sz=1.11*r;
    if(kind.shape==='eel'){sx=.24*r;sy=.20*r;sz=1.48*r;}
    if(kind.shape==='giant'){sx=.57*r;sy=.37*r;sz=1.18*r;}
    if(kind.shape==='ray'){sx=.86*r;sy=.12*r;sz=.68*r;}
    if(kind.shape==='disc'||kind.shape==='puffer'){sx=.65*r;sy=.27*r;sz=.70*r;}
    if(kind.shape==='needle'){sx=.18*r;sy=.19*r;sz=1.44*r;}
    const body=new THREE.Mesh(shared.sphere,bodyMat);body.scale.set(sx,sy,sz);body.castShadow=false;g.add(body);
    const belly=new THREE.Mesh(shared.sphere,underMat);belly.scale.set(sx*.93,sy*.60,sz*.9);belly.position.y=-sy*.5;g.add(belly);
    const tail=new THREE.Group();tail.position.z=-sz*.85;g.add(tail);
    const tailFin=new THREE.Mesh(shared.fin,new THREE.MeshStandardMaterial({color:kind.color,roughness:.59,side:THREE.DoubleSide}));
    tailFin.scale.set(r*.99,1,r*.75);tailFin.position.y=.07;tail.add(tailFin);
    const dorsal=new THREE.Mesh(new THREE.ConeGeometry(.27*r,.61*r,3),underMat);
    dorsal.position.set(0,sy*.92,-.13*r);dorsal.rotation.z=.16;g.add(dorsal);
    if(kind.shape==='ray'){
      for(const sign of [-1,1]){
        const wing=new THREE.Mesh(shared.fin,bodyMat);wing.scale.set(r*1.24,1,r*.65);
        wing.rotation.y=sign*1.2;wing.position.set(sign*.43*r,0,-.08*r);g.add(wing);
      }
    }
    if(kind.shape==='shark'||kind.shape==='sword'){
      dorsal.scale.set(1.5,1.4,1.3);
      const bill=new THREE.Mesh(new THREE.CylinderGeometry(.025*r,.14*r,.85*r,5),bodyMat);
      bill.position.z=sz*1.12;bill.rotation.x=Math.PI/2;g.add(bill);
    }
    if(kind.shape==='puffer'||kind.shape==='spined')for(let i=0;i<12;i++){
      const a=i*Math.PI/6;const spike=new THREE.Mesh(new THREE.ConeGeometry(.075*r,.31*r,4),underMat);
      spike.position.set(Math.cos(a)*sx*.98,sy*.35,Math.sin(a)*sz*.67);
      spike.rotation.z=-Math.cos(a)*.85;spike.rotation.x=Math.sin(a)*.8;g.add(spike);
    }
    if(kind.shape==='whisker')for(const sign of [-1,1]){
      const whisker=new THREE.Mesh(new THREE.CylinderGeometry(.012,.015,.55*r,4),bodyMat);
      whisker.position.set(sign*sx*.7,.08,sz*.91);whisker.rotation.z=sign*.7;g.add(whisker);
    }
    if(kind.shape==='angler'){
      const stem=new THREE.Mesh(new THREE.CylinderGeometry(.014,.018,.72*r,4),underMat);
      stem.position.set(0,.46*r,.6*r);stem.rotation.x=.5;g.add(stem);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.11*r,8,5),new THREE.MeshBasicMaterial({color:0xffe8ab}));
      bulb.position.set(0,.82*r,.73*r);g.add(bulb);
    }
    const eyeMat=new THREE.MeshBasicMaterial({color:0x173945});
    for(const sign of [-1,1]){
      const eye=new THREE.Mesh(new THREE.SphereGeometry(Math.max(.038,.08*r),6,5),eyeMat);
      eye.position.set(sign*sx*.88,sy*.42,sz*.73);g.add(eye);
    }
    if(kind.tier>=3){
      const shine=new THREE.PointLight(kind.color,.65,4,2);shine.position.set(0,.46,0);if(kind.id==='leviathan')g.add(shine);
    }
    g.userData={tail,body,kind};this.scene.add(g);return g;
  }
  removeFish(mesh){this.scene.remove(mesh);}
  render(){this.renderer.render(this.scene,this.camera);}
}
