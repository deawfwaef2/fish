import * as THREE from 'three';
import { World3D } from './scene3d.js';
import { ROUND_SECONDS, STAGES, FISH, GEAR, NAMES, TITLES } from './data.js';

const $=id=>document.getElementById(id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const rand=(a,b)=>a+Math.random()*(b-a);
const choice=a=>a[Math.floor(Math.random()*a.length)];
const fmt=n=>Math.floor(n).toLocaleString('zh-CN');
const safe=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SAVE_KEY='deep-current-save-v1'; // Compatible with the earlier standalone game.
const FISH_BY_ID=new Map(FISH.map(f=>[f.id,f]));
const GEAR_BY_ID=new Map(GEAR.map(g=>[g.id,g]));

class Game {
  constructor(){
    this.mode='menu';this.stage=0;this.timeLeft=ROUND_SECONDS;
    this.elapsed=0;this.clock=0;this.gold=0;this.rank=100;
    this.bots=[];this.alive=[];this.fish=[];this.haul={};
    this.cast=null;this.charge=null;this.hooked=null;this.aimPoint=null;
    this.player={x:10,z:0,walking:false};this.keys=new Set();
    this.joystick={x:0,y:0};this.boardOpen=false;
    this.botChatTimer=10;this.hudTimer=0;this.labelTimer=0;
    this.save=this.loadSave();this.active=this.loadout();
    this.result=null;this.chestOpened=false;this.lastFrame=0;this.toastTimer=0;
    try{this.world=new World3D($('scene'));}
    catch(error){
      $('fatal').classList.remove('hidden');
      $('fatal').innerHTML='<div><h2>需要启用 WebGL 才能进入 3D 河道</h2><p>请在支持 WebGL 的 Chrome、Edge、Firefox 或 Safari 中打开此 HTML，并确认浏览器已启用硬件加速。</p><small>游戏不需要联网。错误：'+safe(error?.message||error)+'</small></div>';
      console.error(error);return;
    }
    this.installEvents();this.renderMenu();
    this.world.setRodAppearance(this.active.rod.ui);
    for(let i=0;i<this.fishCapacity();i++)this.fish.push(this.newFish(true));
    this.frame=requestAnimationFrame(t=>this.update(t));
  }
  loadSave(){
    const fresh={owned:['reed'],equipped:null,inventory:{},wins:0,runs:0,name:'岸边旅人',pid:`R${Math.floor(rand(1000,9999))}`};
    try{
      const raw=JSON.parse(localStorage.getItem(SAVE_KEY));
      if(raw&&Array.isArray(raw.owned)&&raw.inventory&&typeof raw.inventory==='object'){
        const inventory={};for(const k of FISH)inventory[k.id]=clamp(Math.floor(Number(raw.inventory[k.id])||0),0,99999);
        const owned=[...new Set(['reed',...raw.owned.filter(id=>GEAR_BY_ID.has(id))])];
        return {owned,equipped:owned.includes(raw.equipped)&&GEAR_BY_ID.get(raw.equipped)?.slot==='charm'?raw.equipped:null,
          inventory,wins:clamp(Math.floor(Number(raw.wins)||0),0,99999),runs:clamp(Math.floor(Number(raw.runs)||0),0,99999),
          name:String(raw.name||fresh.name).trim().slice(0,12)||fresh.name,pid:/^R\d{4}$/.test(raw.pid)?raw.pid:fresh.pid};
      }
    }catch(_){/* Private mode / file origin may reject storage; keep playing. */}
    return fresh;
  }
  persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(this.save));}catch(_){/* Session stays playable. */}}
  loadout(){
    const rod=[...GEAR].reverse().find(g=>g.slot==='rod'&&this.save.owned.includes(g.id))||GEAR[0];
    const charm=this.save.owned.includes(this.save.equipped)?GEAR_BY_ID.get(this.save.equipped):null;
    const bonus=!!(charm&&charm.school===rod.school);
    return {rod,charm,bonus,power:rod.power+(charm?.power||0)+(bonus?.4:0),tap:(charm?.tap||0)+(bonus?.16:0),
      steady:charm?.steady||0,range:charm?.range||0,gold:charm?.gold||1,ui:Math.max(rod.ui,charm?.ui||0),
      name:rod.name+(charm?` · ${charm.name}`:'')};
  }
  title(){return this.save.wins?'潮汐冠军':['见习钓手','逆流猎人','逐潮观测员','深渊领主','星海王者'][this.loadout().rod.ui];}
  notify(message){
    const el=$('toast');el.textContent=message;el.classList.add('show');
    clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>el.classList.remove('show'),2400);
  }
  hint(html){$('hint').innerHTML=html;}
  stageBanner(sub){
    const el=$('event-banner');$('event-eyebrow').textContent=this.stage===4?'F I N A L  R O U N D':`S T A G E  ${String(this.stage+1).padStart(2,'0')}`;
    $('event-title').textContent=STAGES[this.stage].name;$('event-sub').textContent=sub;
    el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
  }
  setMode(mode){
    this.mode=mode;$('menu').classList.toggle('hidden',mode==='playing');$('hud').classList.toggle('hidden',mode!=='playing');
    $('touch-ui').classList.toggle('hidden',mode!=='playing');$('labels').classList.toggle('hidden',mode!=='playing');
    if(mode!=='playing'){
      $('fight').classList.add('hidden');$('charge').classList.add('hidden');$('chat-entry').classList.add('hidden');
      $('full-board').classList.add('hidden');this.boardOpen=false;this.keys.clear();
      this.world.showLine(null);this.world.showAim(null,0,0);this.world.showPull(null,0);
    }
  }
  renderMenu(){
    this.setMode('menu');this.active=this.loadout();
    $('menu-content').innerHTML=`<div class="menu-kicker">RIVER ROYALE · 离线单机 3D 淘汰赛</div>
      <h1 class="menu-title">深<em>流</em><small>DEEP CURRENT / BREAK THE CURRENT</small></h1>
      <div class="menu-line"></div>
      <p class="menu-intro">在白浪间穿行。与河岸上的 99 名本地模拟钓手争夺鱼群。<br>每轮 60 秒、每轮淘汰一半；坚持到星渊决战，争取第一名与神秘宝箱。</p>
      <div class="profile"><label for="player-name">参赛昵称</label><input id="player-name" maxlength="12" value="${safe(this.save.name)}"><span>${safe(this.title())} · ID ${safe(this.save.pid)}</span></div>
      <div class="menu-actions"><button class="btn primary" data-action="start">进入 3D 河道 ↗</button><button class="btn" data-action="shop">鱼仓与装备</button></div>
      <div class="menu-controls"><span>W A S D / 手机摇杆移动</span><span>河面长按蓄力 / 松开抛竿</span><span>空格 / 手机按钮收线 · R 放生</span><span>Tab 排行 · Enter 聊天</span></div>
      <p class="menu-small">固定斜俯视镜头 · 真正的 WebGL 三维人物与场景 · 双击 HTML 离线游玩<br>岸上的对手、战绩与聊天全部由本机模拟，并非联网真人。档案只保存在当前浏览器。<br>下一局装备：${safe(this.active.name)}${this.active.bonus?' · 双件共鸣':''} · 已比赛 ${this.save.runs} 局 · 冠军 ${this.save.wins} 次</p>`;
  }
  renderShop(){
    this.setMode('shop');const next=this.loadout();
    const inventory=FISH.filter(k=>(this.save.inventory[k.id]||0)>0).map(k=>`${safe(k.name)} × ${this.save.inventory[k.id]}`).join(' · ')||'鱼仓还是空的，先来一局吧。';
    const cards=GEAR.map(g=>{
      const owned=this.save.owned.includes(g.id),worn=g.slot==='charm'&&this.save.equipped===g.id;
      const affordable=Object.entries(g.cost).every(([id,n])=>(this.save.inventory[id]||0)>=n);
      const cost=Object.entries(g.cost).map(([id,n])=>`${safe(FISH_BY_ID.get(id)?.name||id)} ${n} / ${this.save.inventory[id]||0}`).join(' · ')||'初始装备';
      const label=g.slot==='rod'?(owned?'已拥有':affordable?'兑换鱼竿':'鱼获不足'):(worn?'取消配装':owned?'下一局配装':affordable?'兑换并配装':'鱼获不足');
      const action=g.slot==='charm'&&owned?'equip':'buy';
      return `<article class="gear-card ${owned?'owned':''} ${worn?'worn':''}"><small>${safe(g.rarity)} · ${g.slot==='rod'?'鱼竿':'配件'}</small><h3>${safe(g.name)}</h3><p>${safe(g.desc)}</p><div class="cost">${cost}</div><button type="button" class="btn ${worn?'primary':''}" data-action="${action}" data-id="${safe(g.id)}" ${g.slot==='rod'&&owned||!owned&&!affordable?'disabled':''}>${label}</button></article>`;
    }).join('');
    $('menu-content').innerHTML=`<div class="menu-kicker">RIVER EXCHANGE · 鱼获商店</div><h1 class="menu-title" style="font-size:clamp(45px,7vw,70px)">鱼仓<em>与装备</em></h1>
      <p class="menu-intro">鱼种是兑换材料，不消耗排行榜金币。鱼获在本局结算时入库。<br>拥有的最高阶鱼竿自动启用，配件可手动选择一件；<strong>所有配装变动仅在下一局生效。</strong></p>
      <p class="menu-small">当前鱼仓：${inventory}</p><p class="menu-small">下一局：${safe(next.name)} · 拉力 ${next.power.toFixed(2)}${next.bonus?' · ✦ 同流派共鸣：额外拉力与收线':''}</p>
      <div class="shop-grid">${cards}</div><div class="menu-actions"><button class="btn primary" data-action="start">以新配装开始</button><button class="btn" data-action="menu">返回</button></div>`;
  }
  buy(id){
    const g=GEAR_BY_ID.get(id);if(!g||this.save.owned.includes(id))return;
    if(!Object.entries(g.cost).every(([fish,n])=>(this.save.inventory[fish]||0)>=n))return;
    for(const [fish,n] of Object.entries(g.cost))this.save.inventory[fish]-=n;
    this.save.owned.push(id);if(g.slot==='charm')this.save.equipped=id;
    this.persist();this.renderShop();this.notify(`已兑换 ${g.name} · 下一局生效`);
  }
  equip(id){
    const g=GEAR_BY_ID.get(id);if(!g||g.slot!=='charm'||!this.save.owned.includes(id))return;
    this.save.equipped=this.save.equipped===id?null:id;this.persist();this.renderShop();
    this.notify(this.save.equipped?`${g.name} 已配装 · 下一局生效`:'已卸下配件 · 下一局生效');
  }
  makeBots(){
    const used=new Set([this.save.name]),suffixes=['·柒','_Q','07','泡泡','·北','77','_Pro','·岚','08','小号'];
    return Array.from({length:99},(_,i)=>{
      let name='';for(let n=0;n<70;n++){
        const root=choice(NAMES),candidate=root+(used.has(root)||Math.random()<.2?choice(suffixes):'');
        if(!used.has(candidate)){name=candidate;break;}
      }
      if(!name)name=`河岸钓手${i+1}`;used.add(name);
      return {id:i+1,name,title:choice(TITLES),score:0,alive:true,skill:rand(.65,1.45),risk:Math.random(),
        pace:rand(5.8,12.5),timer:rand(2.5,13),catches:0,lastCatch:-100,dialogue:'',dialogueUntil:0};
    });
  }
  start(){
    const input=$('player-name');if(input){this.save.name=input.value.trim().slice(0,12)||'岸边旅人';this.persist();}
    this.active=this.loadout();this.world.setRodAppearance(this.active.rod.ui);
    this.stage=0;this.timeLeft=ROUND_SECONDS;this.elapsed=0;this.gold=0;this.rank=100;
    this.player.x=10;this.player.z=0;this.haul={};this.cast=null;this.hooked=null;this.charge=null;
    this.bots=this.makeBots();this.world.setBots(this.bots);
    this.me={id:0,name:this.save.name,title:this.title(),score:0,me:true,alive:true};
    this.alive=[this.me,...this.bots];this.botChatTimer=rand(5,9);this.hudTimer=0;this.labelTimer=0;
    this.clearFish();for(let i=0;i<this.fishCapacity();i++)this.fish.push(this.newFish(true));
    this.world.applyStage(0);document.body.dataset.ui=String(this.active.ui);
    $('identity').textContent=`${this.save.name} · ${this.title()} · ID ${this.save.pid} · 本地模拟赛`;
    $('chat-lines').replaceChildren();this.postChat('系统','本轮 100 人，60 秒后淘汰后 50 人。这里全部是本地模拟对手。');
    this.setMode('playing');this.hint(matchMedia('(pointer:coarse)').matches?
      '左下摇杆移动 · 在水面<strong>长按</strong>蓄力抛竿 · 右下按钮收线':
      'WASD 在岸边走动 · 对准水面 <strong>按住左键</strong> 蓄力抛竿 · 空格收线');
    this.updateHUD();this.stageBanner('100 人入场 · 每 60 秒淘汰后半区');
  }
  clearFish(){for(const f of this.fish)this.world.removeFish(f.mesh);this.fish=[];}
  fishCapacity(){return this.world.canvas.clientWidth<700?58:76;}
  fishWeight(k){
    if(k.tier>Math.min(4,this.stage+1))return 0;
    if(k.tier>this.stage)return k.weight*.025;
    let w=k.weight*(k.tier===this.stage?1+this.stage*.66:Math.max(.16,1-(this.stage-k.tier)*.31));
    if(this.stage===4&&k.id==='leviathan')w*=.16;
    if(this.stage===4&&k.id==='dragon')w*=.24;
    return w;
  }
  pickFish(){
    const pool=FISH.filter(k=>this.fishWeight(k)>0&&!(k.id==='leviathan'&&this.fish.filter(f=>f.kind.id==='leviathan').length>=2));
    let total=pool.reduce((n,k)=>n+this.fishWeight(k),0),roll=Math.random()*total;
    for(const k of pool){roll-=this.fishWeight(k);if(roll<=0)return k;}return pool[0];
  }
  newFish(initial=false){
    const kind=this.pickFish();const scale=rand(.82,1.18),x=rand(-6.5,6.5);
    const z=initial?clamp(this.player.z+rand(-47,47),-102,102):clamp(this.player.z-rand(32,47),-102,102);
    const mesh=this.world.makeFish(kind);
    const f={id:Math.random(),kind,mesh,x,z,baseX:x,phase:rand(0,7),size:scale,speed:kind.speed*rand(.72,1.3)*(1+this.stage*.07),hooked:false};
    mesh.scale.setScalar(scale);mesh.position.set(x,.15,z);return f;
  }
  sortPlayers(){return [...this.alive].sort((a,b)=>b.score-a.score||(a.me?-1:b.me?1:a.id-b.id));}
  updateHUD(){
    if(this.mode!=='playing')return;
    const sorted=this.sortPlayers(),rank=sorted.indexOf(this.me)+1;this.rank=rank;
    const clock=$('clock');clock.querySelector('strong').textContent=Math.ceil(this.timeLeft);
    clock.classList.toggle('alarm',this.timeLeft<10);
    $('gold').textContent=fmt(this.gold);$('rank').textContent=`${rank}/${this.alive.length}`;
    $('stage-badge').textContent=`${this.stage===4?'最终决战':`第 ${this.stage+1} 阶段`} · ${STAGES[this.stage].name} · ${this.alive.length} 人`;
    const top=sorted.slice(0,5);if(!top.includes(this.me))top.push(this.me);
    $('mini-list').innerHTML=top.map(p=>`<div class="rank-row ${p.me?'me':''}"><b>${sorted.indexOf(p)+1}</b><span title="${safe(p.title)}">${safe(p.name)}</span><strong>${fmt(p.score)}</strong></div>`).join('');
    if(this.boardOpen)this.renderBoard(sorted);
    $('sonar').classList.toggle('hidden',this.active.ui<2);
    if(this.active.ui>=2){
      const near=this.fish.filter(f=>!f.hooked&&f.kind.power<=this.active.power)
        .sort((a,b)=>Math.hypot(a.x-this.player.x,a.z-this.player.z)-Math.hypot(b.x-this.player.x,b.z-this.player.z))[0];
      $('sonar').textContent=near?`◉ 探鱼仪\n${near.kind.name} · 向下游约 ${Math.ceil(near.speed*.6)} 米提前抛`: '◉ 探鱼仪 · 正在扫描鱼群';
    }
  }
  renderBoard(sorted=this.sortPlayers()){
    const keep=Math.ceil(sorted.length/2);
    $('full-note').textContent=this.stage===4?'最终局只有排行榜第一名夺冠。场景内标签与排名使用同一份本地模拟数据。':`本轮剩余 ${Math.ceil(this.timeLeft)} 秒；第 ${keep} 名及之后淘汰。场景内标签与排名使用同一份本地模拟数据。`;
    $('full-list').innerHTML=sorted.map((p,i)=>`<div class="full-row ${p.me?'me':''} ${i===keep-1&&this.stage<4?'cut':''}"><span class="full-num">${i+1}</span><span class="full-who"><strong>${safe(p.name)}</strong><small>${safe(p.title)}${p.me?' · 你':''}</small></span><b>${fmt(p.score)}</b></div>`).join('');
  }
  toggleBoard(){
    if(this.mode!=='playing')return;
    this.boardOpen=!this.boardOpen;$('full-board').classList.toggle('hidden',!this.boardOpen);
    if(this.boardOpen)this.renderBoard();
  }
  postChat(name,text){
    const lines=$('chat-lines'),row=document.createElement('div'),who=document.createElement('b');
    row.className='chat-line';who.textContent=`${name}：`;row.append(who,document.createTextNode(text));
    lines.prepend(row);while(lines.children.length>4)lines.lastElementChild.remove();
  }
  sendChat(){
    const input=$('chat-text'),text=input.value.trim();if(!text)return;
    this.postChat(this.save.name,text.slice(0,60));input.value='';$('chat-entry').classList.add('hidden');input.blur();
    const bot=choice(this.alive.filter(p=>!p.me));if(bot){
      bot.dialogue=choice(['这水流真的太快了！','试试往鱼群下游抛。','看到你了，我就在桥旁。','这轮一定要晋级！']);
      bot.dialogueUntil=this.clock+4;
    }
  }
  updateBots(dt){
    for(const bot of this.alive){
      if(bot.me)continue;
      bot.timer-=dt;
      if(bot.timer>0)continue;
      const speedUp=this.timeLeft<12&&bot.score<(this.sortPlayers()[Math.ceil(this.alive.length/2)-1]?.score||0);
      bot.timer=bot.pace*(speedUp?.68:1)*rand(.75,1.35)/Math.pow(bot.skill,.45);
      if(Math.random()<.15+bot.risk*.11)continue;
      const pool=FISH.filter(k=>k.tier<=this.stage&&k.power<=2.3+bot.skill*.65+this.stage*1.77);
      if(!pool.length)continue;
      const sum=pool.reduce((n,k)=>n+this.fishWeight(k),0);let roll=Math.random()*sum,kind=pool[0];
      for(const k of pool){roll-=this.fishWeight(k);if(roll<=0){kind=k;break;}}
      const score=Math.max(3,Math.round(kind.value*(1+this.stage*.14)*rand(.72,1.16)*(.78+bot.skill*.22)));
      bot.score+=score;bot.catches++;bot.lastCatch=this.clock;
      if(Math.random()<.19){bot.dialogue=`钓到${kind.name}！`;bot.dialogueUntil=this.clock+3.5;}
      if(kind.value>=70&&Math.random()<.12)this.postChat(bot.name,`刚收了条${kind.name}，惊险！`);
    }
    this.botChatTimer-=dt;
    if(this.botChatTimer<=0){
      this.botChatTimer=rand(6,12);
      const bot=choice(this.alive.filter(p=>!p.me));if(bot){
        const line=this.timeLeft<12?choice(['最后十秒！','我这分数有点悬','还能再抛一竿！']):
          choice(['这白浪里有大鱼吗？','我再往下游走两步','这一片急流太刺激了','往鱼前面抛，试试提前量','刚才空了一竿！']);
        bot.dialogue=line;bot.dialogueUntil=this.clock+3;this.postChat(bot.name,line);
      }
    }
  }
  moveSurvivorsCloser(){
    // After a cut, the remaining physical anglers gather near the next arena.
    // Their identity, title, score and individual cast/walk animation stay intact.
    const rivals=this.alive.filter(p=>!p.me).sort((a,b)=>a.id-b.id);
    const span=[75,58,42,27,16][this.stage];
    rivals.forEach((b,i)=>{
      b.side=i%2?-1:1;b.x=b.side*(9.18+(i%3)*.81);
      b.z=clamp(this.player.z+(i-(rivals.length-1)/2)*span*2/Math.max(1,rivals.length-1),-87,87);
      if(b.side===1&&Math.abs(b.z-this.player.z)<7)b.z+=b.z<this.player.z?-8:8;
    });
  }
  nextRound(){
    if(this.mode!=='playing')return;
    const sorted=this.sortPlayers();
    if(this.stage===4){this.finish(sorted[0]===this.me);return;}
    const keep=Math.ceil(sorted.length/2);
    if(sorted.indexOf(this.me)>=keep){this.finish(false);return;}
    this.alive=sorted.slice(0,keep);
    const survivors=new Set(this.alive);
    for(const b of this.bots)b.alive=survivors.has(b);
    this.stage++;this.timeLeft=ROUND_SECONDS;this.cast=null;this.charge=null;
    this.moveSurvivorsCloser();
    if(this.hooked){this.hooked.fish.hooked=false;this.hooked=null;}
    $('fight').classList.add('hidden');$('charge').classList.add('hidden');
    this.clearFish();for(let i=0;i<this.fishCapacity();i++)this.fish.push(this.newFish(true));
    this.world.applyStage(this.stage);this.updateHUD();
    this.stageBanner(this.stage===4?`剩余 ${this.alive.length} 人 · 夺得第一名即可开宝箱`:`晋级 ${this.alive.length} 人 · 全新鱼群抵达`);
    this.notify(`晋级！进入 ${STAGES[this.stage].name} · 剩余 ${this.alive.length} 人`);
    this.postChat('系统',`晋级 ${STAGES[this.stage].name}！剩余 ${this.alive.length} 位钓手。`);
    this.hint('新鱼群登场 · <strong>WASD</strong> 寻找钓位，长按鼠标抛竿');
  }
  finish(won){
    if(this.mode!=='playing')return;
    const placement=this.sortPlayers().indexOf(this.me)+1;
    const total=Object.values(this.haul).reduce((n,k)=>n+k,0);
    for(const [id,n] of Object.entries(this.haul))this.save.inventory[id]=(this.save.inventory[id]||0)+n;
    this.save.runs++;if(won)this.save.wins++;this.persist();
    this.result={won,placement,gold:this.gold,stage:this.stage,total,haul:{...this.haul}};this.chestOpened=false;
    this.setMode('results');this.renderResult();
  }
  renderResult(){
    const r=this.result;if(!r)return this.renderMenu();
    const caught=FISH.filter(k=>r.haul[k.id]).map(k=>`${safe(k.name)} × ${r.haul[k.id]}`).join(' · ')||'暂无鱼获；再来一局试试。';
    $('menu-content').innerHTML=`<div class="menu-kicker">${r.won?'THE RIVER IS YOURS':'THE CURRENT MOVES ON'} · 赛后结算</div>
      <h1 class="menu-title" style="font-size:clamp(48px,7vw,74px)">${r.won?'钓到了<em>胜利</em>':'本局<em>结束</em>'}</h1>
      <p class="menu-intro">${r.won?'最终决战获得第一名，神秘宝箱已解锁！':`你在第 ${r.stage+1} 阶段${r.stage===4?'的决战中':'被淘汰'}。本局鱼获已经存入鱼仓，可兑换下一局装备。`}</p>
      <div class="result-stats"><div><small>最终名次</small><strong>#${r.placement}</strong></div><div><small>金币得分</small><strong>${fmt(r.gold)}</strong></div><div><small>入库鱼获</small><strong>${r.total}</strong></div></div>
      <p class="menu-small">本局入库：${caught}</p>
      <div class="menu-actions">${r.won?`<button class="btn primary" data-action="chest" ${this.chestOpened?'disabled':''}>${this.chestOpened?'宝箱已开启':'开启神秘宝箱 ✦'}</button>`:''}<button class="btn primary" data-action="start">再来一局</button><button class="btn" data-action="shop">鱼仓与装备</button><button class="btn" data-action="menu">返回首页</button></div>
      <p class="menu-small">金币仅作为单局排名；鱼种用于商店兑换。配装仅在下一局开始时锁定。</p>`;
  }
  openChest(){
    if(!this.result?.won||this.chestOpened)return;
    this.chestOpened=true;const kind=choice(['ray','shark','angler','leviathan']);
    this.save.inventory[kind]=(this.save.inventory[kind]||0)+1;this.persist();this.renderResult();
    this.notify(`宝箱奖励：${FISH_BY_ID.get(kind).name} × 1，已入鱼仓！`);
  }
  targetFor(aim,power){
    const from=new THREE.Vector3(this.player.x,0,this.player.z);
    const delta=aim.clone().sub(from);delta.y=0;
    if(delta.length()<.01)delta.set(this.player.x>0?-1:1,0,0);
    const distance=Math.min(delta.length(),3+power*(18+8*this.active.range));
    const out=from.add(delta.normalize().multiplyScalar(distance));
    out.x=clamp(out.x,-6.8,6.8);out.z=clamp(out.z,-101,101);out.y=.16;
    return out;
  }
  beginCharge(event){
    if(this.mode!=='playing'||this.boardOpen||this.charge||this.cast||this.hooked)return;
    const point=this.world.onWater(event.clientX,event.clientY);if(!point)return;
    this.charge={since:performance.now(),power:0,point};$('charge').classList.remove('hidden');
    try{$('scene').setPointerCapture(event.pointerId);}catch(_){/* browser may lack capture */}
    this.hint('蓄力中……对准游动鱼群的<strong>下游</strong>松开，圆环显示预计落点');
  }
  releaseCharge(){
    const charge=this.charge;this.charge=null;$('charge').classList.add('hidden');
    if(!charge||this.mode!=='playing')return;
    const power=clamp((performance.now()-charge.since)/1450,.09,1);
    const target=this.targetFor(charge.point,power);
    this.cast={phase:'flying',time:0,duration:.35+power*.27,target,pos:this.world.playerTip(),age:0};
    this.hint('浮标飞行中 · 鱼群仍在顺流游动；<strong>R</strong> 可立即重新抛竿');
  }
  cancelCast(message){
    if(this.hooked)this.hooked.fish.hooked=false;
    this.cast=null;this.hooked=null;this.charge=null;
    $('fight').classList.add('hidden');$('charge').classList.add('hidden');
    if(message)this.hint(message);
  }
  hook(f){
    f.hooked=true;this.hooked={fish:f,progress:0,tension:.08,age:0,originX:f.x,originZ:f.z};
    this.cast=null;$('fight').classList.remove('hidden');$('fight-name').textContent=`${f.kind.name} 咬钩了！`;
    $('fight-help').textContent=this.active.power<f.kind.power?
      `鱼竿拉力不足（需要 ${f.kind.power}，当前 ${this.active.power.toFixed(1)}）· 按 R 放生`:
      '连续按空格收线 · 张力满格会挣脱 · R 放生';
    this.hint(this.active.power<f.kind.power?'这条鱼太大了！按 <strong>R 放生</strong>，升级鱼竿再挑战':'鱼上钩了！快速按 <strong>空格</strong> 收线 · R 放生');
  }
  reel(){
    if(this.mode!=='playing'||!this.hooked)return;
    const h=this.hooked,f=h.fish;
    if(this.active.power<f.kind.power){this.notify('当前鱼竿拉力不足，按 R 放生并升级装备');return;}
    const effectiveness=this.active.power/(f.kind.power+.85)*(1+this.active.tap);
    h.progress+=clamp(17*effectiveness,5.0,26);
    h.tension=clamp(h.tension-.053-this.active.steady*.09,0,1);
    if(h.progress>=100)this.catchFish();
  }
  catchFish(){
    const h=this.hooked;if(!h)return;
    const f=h.fish,k=f.kind;
    const earned=Math.max(3,Math.round(k.value*(1+this.stage*.14)*rand(.84,1.18)*this.active.gold*(this.active.bonus?1.06:1)));
    this.gold+=earned;this.me.score=this.gold;this.haul[k.id]=(this.haul[k.id]||0)+1;
    this.world.removeFish(f.mesh);this.fish.splice(this.fish.indexOf(f),1);
    this.hooked=null;this.cast=null;$('fight').classList.add('hidden');
    this.fish.push(this.newFish(false));this.updateHUD();
    this.notify(`钓获 ${k.name} · +${earned} 金币`);
    this.hint(`收获 <strong>${k.name}</strong>！WASD 移动钓点，再次对准河面长按抛竿`);
  }
  updateFishing(dt){
    if(this.charge){
      this.charge.power=clamp((performance.now()-this.charge.since)/1450,0,1);
      $('charge-fill').style.width=`${Math.round(this.charge.power*100)}%`;
    }
    if(this.cast){
      const c=this.cast;c.time+=dt;
      if(c.phase==='flying'){
        const ratio=clamp(c.time/c.duration,0,1),smooth=ratio*ratio*(3-2*ratio);
        const tip=this.world.playerTip();c.pos=tip.lerp(c.target.clone(),smooth);
        c.pos.y+=Math.sin(ratio*Math.PI)*(3.5+ratio*3);
        if(ratio>=1){c.phase='waiting';c.time=0;c.pos=c.target.clone();}
      }else{
        c.age+=dt;c.pos.z+=dt*1.7;c.pos.x=clamp(c.pos.x+dt*Math.sin(this.clock*2)*.045,-6.8,6.8);
        if(c.age>.15){
          let closest=null,d=Infinity;
          for(const f of this.fish){if(f.hooked)continue;
            const distance=Math.hypot(f.x-c.pos.x,f.z-c.pos.z);
            if(distance<2.1+f.kind.radius*f.size*.79&&distance<d){closest=f;d=distance;}
          }
          if(closest){this.hook(closest);return;}
        }
        if(c.age>6||Math.abs(c.pos.z)>101){this.cast=null;this.hint('这竿没咬钩；瞄准鱼的<strong>前方</strong>，长按左键再试');}
      }
    }
    if(this.hooked){
      const h=this.hooked,f=h.fish;h.age+=dt;
      h.tension+=dt*(.046+f.kind.power*.012)*(1-this.active.steady);
      h.progress=Math.max(0,h.progress-dt*(.7+f.kind.power*.22));
      const pull=Math.pow(clamp(h.progress/100,0,1),.85);
      const shore=this.player.x<0?-6.5:6.5;
      const targetX=h.originX+(shore-h.originX)*pull;
      const targetZ=h.originZ+(clamp(this.player.z,-95,95)-h.originZ)*pull+h.age*.18*(1-pull);
      f.x+=(targetX-f.x)*Math.min(1,dt*12);
      f.z+=(targetZ-f.z)*Math.min(1,dt*12);
      $('reel-fill').style.width=`${clamp(h.progress,0,100)}%`;
      $('tension-fill').style.width=`${clamp(h.tension*100,0,100)}%`;
      if(h.tension>=1||h.age>32){this.cancelCast('鱼挣脱了！更快连按 <strong>空格</strong>，或者按 R 主动放生');this.notify('脱钩！鱼又游回了河里');}
    }
  }
  updateFish(dt){
    for(let i=0;i<this.fish.length;i++){
      const f=this.fish[i];
      if(!f.hooked){
        f.z+=dt*f.speed;
        f.x=clamp(f.baseX+Math.sin(this.clock*1.7+f.phase)*.25,-6.75,6.75);
        if(f.z>Math.min(104,this.player.z+47)){
          this.world.removeFish(f.mesh);this.fish[i]=this.newFish(false);continue;
        }
      }
      f.mesh.position.set(f.x,.19+Math.sin(this.clock*4+f.phase)*.07,f.z);
      f.mesh.rotation.y=Math.sin(this.clock*2+f.phase)*.12;
      f.mesh.userData.tail.rotation.y=Math.sin(this.clock*10+f.phase)*.32;
      f.mesh.userData.body.scale.y=(f.kind.shape==='ray'?.13:.31)*f.kind.radius*(1+Math.sin(this.clock*7+f.phase)*.04);
    }
  }
  movePlayer(dt){
    let x=(this.keys.has('KeyD')?1:0)-(this.keys.has('KeyA')?1:0)+this.joystick.x;
    let z=(this.keys.has('KeyS')?1:0)-(this.keys.has('KeyW')?1:0)+this.joystick.y;
    const length=Math.hypot(x,z);if(length>1){x/=length;z/=length;}
    this.player.walking=length>.12;
    if(!this.player.walking)return;
    const oldX=this.player.x;
    const nextZ=clamp(this.player.z+z*dt*7.4,-96,96);
    let nextX=clamp(this.player.x+x*dt*7.4,-22,22);
    const bridge=Math.abs(nextZ+22)<1.22||Math.abs(nextZ-24)<1.22;
    if(!bridge&&Math.abs(nextX)<8.35)nextX=(oldX<0?-1:1)*8.35;
    this.player.x=nextX;this.player.z=nextZ;
  }
  updateLabels(){
    const root=$('labels');if(this.mode!=='playing'||this.boardOpen){root.replaceChildren();return;}
    const tags=[];const display=[];
    for(const b of this.bots){
      if(!b.alive||Math.abs(b.z-this.player.z)>22)continue;
      const pos=this.world.project(new THREE.Vector3(b.liveX??b.x,4.12,b.liveZ??b.z));
      if(pos.visible)display.push({p:b,pos,d:Math.abs(b.z-this.player.z)});
    }
    display.sort((a,b)=>a.d-b.d);
    for(const {p,pos} of display.slice(0,12)){
      const node=document.createElement('div');node.className='tag';
      node.style.left=`${pos.x}px`;node.style.top=`${pos.y}px`;
      if(p.dialogueUntil>this.clock){const talk=document.createElement('span');talk.className='speech';talk.textContent=p.dialogue;node.append(talk);}
      const name=document.createElement('span');name.textContent=`${p.name} · ${fmt(p.score)}`;
      const subtitle=document.createElement('small');subtitle.textContent=p.title;
      node.append(name,subtitle);tags.push(node);
    }
    const mePos=this.world.project(new THREE.Vector3(this.player.x,4.18,this.player.z));
    if(mePos.visible){const node=document.createElement('div');node.className='tag me';
      node.style.left=`${mePos.x}px`;node.style.top=`${mePos.y}px`;
      const name=document.createElement('span');name.textContent=`✦ ${this.save.name} · ${fmt(this.gold)}`;
      const subtitle=document.createElement('small');subtitle.textContent=`${this.title()} · 你`;node.append(name,subtitle);tags.push(node);
    }
    root.replaceChildren(...tags);
  }
  installEvents(){
    window.addEventListener('resize',()=>this.world.resize());
    $('menu-content').addEventListener('click',e=>{
      const btn=e.target.closest('button[data-action]');if(!btn||btn.disabled)return;
      const {action,id}=btn.dataset;
      if(action==='start')this.start();else if(action==='shop')this.renderShop();
      else if(action==='menu')this.renderMenu();else if(action==='chest')this.openChest();
      else if(action==='buy')this.buy(id);else if(action==='equip')this.equip(id);
    });
    $('board-button').addEventListener('click',()=>this.toggleBoard());
    $('board-close').addEventListener('click',()=>this.toggleBoard());
    $('chat-send').addEventListener('click',()=>this.sendChat());
    $('touch-reel').addEventListener('click',()=>this.reel());
    $('touch-release').addEventListener('click',()=>this.cancelCast('已放生 / 收回浮标 · 再找一条鱼吧'));
    $('touch-chat').addEventListener('click',()=>this.toggleChat());
    const canvas=$('scene');
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.beginCharge(e);});
    canvas.addEventListener('pointermove',e=>{
      if(this.charge){const point=this.world.onWater(e.clientX,e.clientY);if(point)this.charge.point=point;}
      else this.aimPoint=this.world.onWater(e.clientX,e.clientY);
    });
    canvas.addEventListener('pointerup',()=>this.releaseCharge());
    canvas.addEventListener('pointercancel',()=>{this.charge=null;$('charge').classList.add('hidden');});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    window.addEventListener('keydown',e=>{
      if(this.mode!=='playing')return;
      if(document.activeElement===$('chat-text')){
        if(e.key==='Enter'){e.preventDefault();this.sendChat();}
        if(e.key==='Escape'){$('chat-entry').classList.add('hidden');$('chat-text').blur();}
        return;
      }
      if(e.key==='Escape'&&this.boardOpen){this.toggleBoard();return;}
      if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();this.keys.add(e.code);}
      if(e.code==='Space'){e.preventDefault();if(!e.repeat)this.reel();}
      if(e.code==='KeyR'){e.preventDefault();if(this.cast||this.hooked||this.charge)this.cancelCast('浮标已收回 · 重新选择钓点抛竿');}
      if(e.key==='Tab'||e.code==='KeyL'){e.preventDefault();if(!e.repeat)this.toggleBoard();}
      if(e.key==='Enter'){e.preventDefault();this.toggleChat();}
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>{this.keys.clear();this.joystick.x=0;this.joystick.y=0;this.releaseCharge();});
    const stick=$('stick'),pad=$('joystick');let activePointer=null;
    const joystickMove=e=>{
      const r=pad.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
      const x=clamp((e.clientX-cx)/36,-1,1),y=clamp((e.clientY-cy)/36,-1,1);
      this.joystick.x=x;this.joystick.y=y;stick.style.transform=`translate(${x*31}px,${y*31}px)`;
    };
    pad.addEventListener('pointerdown',e=>{activePointer=e.pointerId;pad.setPointerCapture(e.pointerId);joystickMove(e);});
    pad.addEventListener('pointermove',e=>{if(e.pointerId===activePointer)joystickMove(e);});
    const stop=e=>{if(e.pointerId!==activePointer)return;activePointer=null;this.joystick.x=this.joystick.y=0;stick.style.transform='';};
    pad.addEventListener('pointerup',stop);pad.addEventListener('pointercancel',stop);
  }
  toggleChat(){
    if(this.mode!=='playing')return;
    const open=$('chat-entry').classList.toggle('hidden');
    if(!open)$('chat-text').focus();else $('chat-text').blur();
  }
  update(timestamp){
    // Real elapsed time governs 60-second rounds even on slow software WebGL;
    // large render gaps are capped separately for motion/collision stability.
    const wall=this.lastFrame?Math.min(1,Math.max(0,(timestamp-this.lastFrame)/1000)):.016;
    const dt=Math.min(.18,wall);this.lastFrame=timestamp;this.clock+=wall;
    if(this.mode==='playing'){
      this.timeLeft=Math.max(0,this.timeLeft-wall);this.elapsed+=wall;
      this.movePlayer(dt);this.updateBots(wall);this.updateFish(dt);this.updateFishing(wall);
      this.hudTimer-=dt;this.labelTimer-=dt;
      if(this.hudTimer<=0){this.hudTimer=.4;this.updateHUD();}
      if(this.timeLeft<=0)this.nextRound();
    }else if(this.mode==='menu'||this.mode==='shop')this.updateFish(dt);
    this.world.setPlayerPosition(this.player.x,this.player.z,this.player.walking&&this.mode==='playing',this.clock,dt);
    this.world.updateCamera(this.player.x,this.player.z,dt);
    this.world.updateFlow(this.clock,dt,this.player.z);
    this.world.updatePeople(this.clock,this.player.z);
    const target=this.charge?this.targetFor(this.charge.point,this.charge.power):this.mode==='playing'&&!this.cast&&!this.hooked&&this.active.ui>0&&this.aimPoint?this.aimPoint:null;
    this.world.showAim(this.mode==='playing'?target:null,this.charge?.power||0,this.clock);
    const hook=this.hooked?.fish||null;
    this.world.showLine(this.mode==='playing'?(hook?new THREE.Vector3(hook.x,.2,hook.z):this.cast?.pos):null,this.clock);
    this.world.showPull(hook,this.clock);
    if(this.mode==='playing'&&this.labelTimer<=0){this.labelTimer=.16;this.updateLabels();}
    this.world.render();
    this.frame=requestAnimationFrame(t=>this.update(t));
  }
}

window.addEventListener('DOMContentLoaded',()=>{
  const game=new Game();
  // Manual QA helpers exist only when the URL explicitly opts into testing.
  if(location.search.includes('qa=1'))window.__deepCurrentQA={game,advance(seconds){
    if(game.mode!=='playing')return;
    game.timeLeft=Math.max(0,game.timeLeft-seconds);
    if(game.timeLeft===0)game.nextRound();game.updateHUD();
  }};
});
