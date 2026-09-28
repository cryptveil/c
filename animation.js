// public/src/animation.js
// Original tactical-shooter animation system. Uses procedural Three.js geometry,
// so it does not depend on proprietary game assets.
//
// Includes:
// - first-person arms + weapon viewmodel
// - idle breathing / weapon sway
// - walk/run/strafe/crouch bob
// - jump / land camera motion
// - rifle/SMG/shotgun muzzle flash + recoil
// - reload, weapon switch and inspect
// - ability cast VFX, smoke, dash trails and projectile arcs
// - hit marker / damage feedback / kill feed / round banners
// - plant / defuse progress visuals
// - bot locomotion, aim and hit/death animation helpers

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
const lerp = (a,b,t) => a + (b-a)*t;

function easeOut(t){ return 1 - Math.pow(1-t, 3); }
function easeInOut(t){ return t < .5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }

function makeMat(color, metal=0.2, rough=.6, emissive=0){
  return new THREE.MeshStandardMaterial({
    color, metalness: metal, roughness: rough,
    emissive: emissive ? color : 0x000000,
    emissiveIntensity: emissive
  });
}

function makeWeapon(def){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.28,.18,.72), makeMat(0x252b31,.65,.35));
  body.position.set(0,0,-.36); g.add(body);
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(.19,.15,.42), makeMat(0x11161b,.7,.3));
  receiver.position.set(0,.06,-.05); g.add(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.34,8), makeMat(0x0b0e11,.8,.25));
  barrel.rotation.x=Math.PI/2; barrel.position.set(0,.01,-.88); g.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(.11,.28,.16), makeMat(0x30363b,.3,.55));
  mag.position.set(0,-.18,-.18); mag.rotation.x=-.16; g.add(mag);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(.055,.07,.14), makeMat(0x59656d,.2,.4));
  sight.position.set(0,.16,-.28); g.add(sight);
  // silhouette changes by weapon family
  if(def?.id === 'vx9'){
    body.scale.set(1.15,.8,.9); mag.scale.set(1.1,1.25,1.1);
  } else if(def?.id === 'kite'){
    barrel.scale.z=.7; body.scale.set(1.2,.9,.8);
  }
  g.userData.weaponId = def?.id || 'weapon';
  return g;
}

function makeArm(){
  const arm = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(.075,.32,4,8), makeMat(0x28333a,.1,.75));
  sleeve.rotation.z=-.3; sleeve.position.set(0,-.12,0); arm.add(sleeve);
  const glove = new THREE.Mesh(new THREE.SphereGeometry(.095,8,8), makeMat(0x151a1e,.2,.55));
  glove.position.set(0,-.29,-.01); arm.add(glove);
  return arm;
}

export function createAnimationController(camera, renderer, root){
  const vm = new THREE.Group();
  vm.position.set(.28,-.34,-.68);
  camera.add(vm);

  const leftArm = makeArm();
  leftArm.position.set(-.18,.02,.04);
  leftArm.rotation.set(.25,-.18,.18);
  vm.add(leftArm);

  const rightArm = makeArm();
  rightArm.position.set(.2,-.02,.02);
  rightArm.rotation.set(.18,.16,-.18);
  vm.add(rightArm);

  const weapon = new THREE.Group();
  weapon.position.set(0,.02,0);
  vm.add(weapon);

  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(.075,8,8),
    new THREE.MeshBasicMaterial({color:0xffc45b, transparent:true, opacity:0})
  );
  muzzle.scale.set(.8,.8,1.6);
  muzzle.position.set(0,.02,-1.03);
  weapon.add(muzzle);

  const muzzleLight = new THREE.PointLight(0xffb347,0,3,2);
  muzzle.add(muzzleLight);

  const trailGroup = new THREE.Group();
  root.add(trailGroup);

  const state = {
    t:0, bob:0, fireKick:0, reload:0, switchT:1, inspect:0,
    landing:0, jump:0, lastGround:true, lastY:0, flash:0,
    weaponId:null, weaponDef:null, action:null, actionT:0,
    particles:[], trails:[], progress:null
  };

  function setWeapon(def){
    if(!def) return;
    state.weaponDef=def;
    state.weaponId=def.id;
    while(weapon.children.length) weapon.remove(weapon.children[0]);
    const model=makeWeapon(def);
    weapon.add(model);
    weapon.add(muzzle);
    weapon.position.set(0,.02,0);
    state.switchT=0;
    state.action='switch';
    state.actionT=0;
  }

  function burstParticle(pos, color, count=12, spread=.35){
    for(let i=0;i<count;i++){
      const p=new THREE.Mesh(new THREE.SphereGeometry(.018+Math.random()*.025,5,5),
        new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}));
      p.position.copy(pos);
      p.userData.v=new THREE.Vector3(
        (Math.random()-.5)*spread,
        Math.random()*spread,
        (Math.random()-.5)*spread
      );
      p.userData.life=.25+Math.random()*.35;
      trailGroup.add(p); state.particles.push(p);
    }
  }

  function event(name,data={}){
    if(name==='fire'){
      state.fireKick=1; state.flash=.06;
      const world=new THREE.Vector3();
      muzzle.getWorldPosition(world);
      burstParticle(world,0xffb347,5,.18);
      showHitMarker(false);
    }
    if(name==='reload'){ state.reload=0.001; state.action='reload'; state.actionT=0; }
    if(name==='switch'){ state.switchT=0; state.action='switch'; state.actionT=0; }
    if(name==='inspect'){ state.inspect=0.001; state.action='inspect'; state.actionT=0; }
    if(name==='jump'){ state.jump=0.001; }
    if(name==='land'){ state.landing=1; burstParticle(new THREE.Vector3(data.x||0,(data.y||0)+.03,data.z||0),0xdce8ee,8,.2); }
    if(name==='ability'){ castVFX(data.id,data.color||0x63e6d2); }
    if(name==='hit'){ showHitMarker(true); }
    if(name==='kill'){ showKillFeed(data.text||'ELIMINATION',!!data.headshot); }
    if(name==='plant' || name==='defuse'){
      showProgress(name, data.duration||2.2);
    }
    if(name==='roundWin'){ showRoundFlash(data.text||'ROUND WON'); }
  }

  function castVFX(id,color){
    const c=color;
    const center=new THREE.Vector3(0,-.05,-1.15);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.18,.035,8,32),
      new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9}));
    ring.position.copy(center); ring.rotation.x=Math.PI/2; vm.add(ring);
    const start=performance.now();
    const timer=()=>{
      const p=clamp((performance.now()-start)/600,0,1);
      ring.scale.setScalar(1+p*5); ring.material.opacity=1-p;
      if(p<1) requestAnimationFrame(timer); else vm.remove(ring);
    };
    timer();
    if(id && /dash|boost|overdrive/i.test(id)){
      for(let i=0;i<18;i++){
        const line=new THREE.Mesh(new THREE.BoxGeometry(.018,.018,.7+Math.random()*.8),
          new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.7}));
        line.position.set((Math.random()-.5)*.5,(Math.random()-.5)*.5,-.8-Math.random()*1.2);
        line.rotation.y=(Math.random()-.5)*.6; vm.add(line);
        const st=performance.now()+i*5;
        const fn=()=>{ const q=clamp((performance.now()-st)/450,0,1); line.position.z-=.015; line.material.opacity=.7*(1-q); if(q<1)requestAnimationFrame(fn); else vm.remove(line); };
        fn();
      }
    }
  }

  function update(dt, ctx={}){
    state.t += dt;
    const moving=!!ctx.moving;
    const speed=ctx.speed||0;
    const crouch=!!ctx.crouch;
    const sprint=!!ctx.sprint;
    const grounded=ctx.grounded!==false;

    if(!state.weaponDef && ctx.weaponDef) setWeapon(ctx.weaponDef);
    if(ctx.weaponDef && ctx.weaponDef.id!==state.weaponId) setWeapon(ctx.weaponDef);

    const intensity=moving ? (sprint?1.25:.75) : .18;
    state.bob += dt*(moving ? speed*1.6 : 1.2);
    const bobX=Math.sin(state.bob*1.1)*.012*intensity;
    const bobY=Math.abs(Math.cos(state.bob))* .018*intensity;

    const targetCrouch=crouch?.05:0;
    vm.position.x=lerp(vm.position.x,.28+bobX,Math.min(1,dt*10));
    vm.position.y=lerp(vm.position.y,-.34+bobY+targetCrouch,Math.min(1,dt*10));

    const swayX=Math.sin(state.t*1.7)*.008;
    const swayY=Math.cos(state.t*1.35)*.006;
    weapon.rotation.z=lerp(weapon.rotation.z,swayX,dt*8);
    weapon.rotation.x=lerp(weapon.rotation.x,swayY,dt*8);

    if(state.fireKick>0){
      state.fireKick=Math.max(0,state.fireKick-dt*8);
      weapon.rotation.x -= state.fireKick*.13;
      weapon.position.z -= state.fireKick*.045;
      leftArm.rotation.x=.25+state.fireKick*.08;
      rightArm.rotation.x=.18+state.fireKick*.08;
    }
    if(state.reload>0){
      state.reload+=dt/1.25;
      const p=clamp(state.reload,0,1);
      const swing=Math.sin(p*Math.PI);
      weapon.rotation.z=-.7*swing;
      weapon.rotation.x=.35*swing;
      weapon.position.y=-.12*swing;
      leftArm.rotation.z=.18+.25*swing;
      if(p>=1) state.reload=0;
    }
    if(state.switchT<1){
      state.switchT+=dt*5;
      const p=easeOut(clamp(state.switchT,0,1));
      weapon.position.y=-.7*(1-p);
      weapon.rotation.z=-.8*(1-p);
    }
    if(state.inspect>0){
      state.inspect+=dt/1.0;
      const p=clamp(state.inspect,0,1);
      weapon.rotation.y=Math.sin(p*Math.PI)*.75;
      weapon.rotation.x=-.2+Math.sin(p*Math.PI)*.15;
      if(p>=1) state.inspect=0;
    }
    state.landing=Math.max(0,state.landing-dt*5);
    state.jump=Math.max(0,state.jump-dt*2);
    vm.position.y -= state.landing*.07;
    vm.rotation.x = state.landing*.08;

    muzzle.material.opacity=state.flash>0?1:0;
    muzzleLight.intensity=state.flash>0?4:0;
    state.flash=Math.max(0,state.flash-dt);

    for(let i=state.particles.length-1;i>=0;i--){
      const p=state.particles[i];
      p.userData.life-=dt; p.position.addScaledVector(p.userData.v,dt);
      p.userData.v.y-=1.5*dt; p.material.opacity=clamp(p.userData.life*2,0,1);
      if(p.userData.life<=0){ trailGroup.remove(p); state.particles.splice(i,1); }
    }

    if(state.progress){
      state.progress.remaining-=dt;
      if(state.progress.remaining<=0){ state.progress.el.remove(); state.progress=null; }
      else state.progress.fill.style.width=((1-state.progress.remaining/state.progress.duration)*100)+'%';
    }
    if(!grounded) vm.position.y += Math.sin(state.t*10)*.003;
  }

  // Add controller-level DOM feedback without needing extra dependencies.
  function ensureFx(){
    let el=document.getElementById('animFx');
    if(el) return el;
    el=document.createElement('div'); el.id='animFx'; el.innerHTML=`
      <div class="hitMarker"><i></i><i></i><i></i><i></i></div>
      <div class="killFeed"></div>
      <div class="actionProgress"><div class="label"></div><div class="track"><div class="fill"></div></div></div>
      <div class="roundFlash"></div>`;
    document.getElementById('screenHUD')?.appendChild(el);
    return el;
  }
  function showHitMarker(enemy=false){
    const fx=ensureFx(); const h=fx.querySelector('.hitMarker');
    h.classList.toggle('enemy',enemy); h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop');
  }
  function showKillFeed(text,headshot){
    const fx=ensureFx(); const row=document.createElement('div');
    row.className='killRow'; row.textContent=(headshot?'◆ ':'')+text;
    fx.querySelector('.killFeed').prepend(row); setTimeout(()=>row.remove(),2400);
  }
  function showRoundFlash(text){
    const fx=ensureFx(); const el=fx.querySelector('.roundFlash');
    el.textContent=text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'),1800);
  }
  function showProgress(kind,duration){
    const fx=ensureFx(), p=fx.querySelector('.actionProgress');
    p.classList.add('show'); p.querySelector('.label').textContent=kind.toUpperCase()+'ING';
    p.querySelector('.fill').style.width='0%'; state.progress={el:p,fill:p.querySelector('.fill'),remaining:duration,duration};
  }

  return { vm, state, setWeapon, update, event };
}

// Procedural third-person bot animation. It receives a bot object with
// object/body/head references and animates stride, aim, hit reaction and death.
export function updateBotAnimation(bot,dt,now){
  if(!bot.object) return;
  bot.animTime=(bot.animTime||0)+dt;
  bot.animPhase=(bot.animPhase||0)+dt*(bot.state==='engage'?8:4);
  const moving=bot.state==='engage'||bot.state==='patrol';
  const amp=moving?.22:0.03;
  const stride=Math.sin(bot.animPhase)*amp;
  if(bot.body){
    bot.body.rotation.x=lerp(bot.body.rotation.x, moving?Math.sin(bot.animPhase)*.05:0,dt*8);
    bot.body.position.y=1+Math.abs(Math.sin(bot.animPhase))*.025;
  }
  if(bot.headMesh) bot.headMesh.position.y=1.75+Math.sin(bot.animPhase+.7)*.012;
  bot.object.position.y=bot.y||0;
  if(bot.hitT>0){
    bot.hitT=Math.max(0,bot.hitT-dt);
    bot.body.rotation.z=Math.sin(bot.hitT*30)*.18;
  }
  if(!bot.alive){
    bot.deathT=(bot.deathT||0)+dt;
    const p=clamp(bot.deathT/.45,0,1);
    bot.object.rotation.z=easeInOut(p)*Math.PI/2;
    bot.object.position.y=Math.max(0,(1-p)*.03);
    if(p>=1) bot.object.visible=false;
  }
}

export function markBotHit(bot){
  bot.hitT=.18;
}
