export const parameters = {
  speed:['Скорость',.25,2], amplitude:['Амплитуда',0,1.8], weight:['Вес',0,2],
  inertia:['Инерция',0,2], aggression:['Агрессивность',0,2], force:['Сила',0,2],
  windup:['Замах',.4,2], recovery:['Завершение',.4,2], lean:['Наклон',0,2],
  crouch:['Приседание',0,2], step:['Длина шага',0,2], smooth:['Плавность',0,2],
};
export const styles = {
  light:['Лёгкий мечник',{speed:1.22,weight:.65,inertia:.7,step:1.1,crouch:.7,lean:.8}],
  warrior:['Обычный воин',{}],
  knight:['Тяжёлый рыцарь',{speed:.82,weight:1.35,inertia:1.45,windup:1.3,recovery:1.35}],
  lord:['Тёмный владыка',{speed:.91,weight:1.17,inertia:1.25,lean:.75,aggression:1.3,force:1.25}],
  demon:['Массивный демон',{speed:.73,weight:1.65,inertia:1.6,lean:1.5,crouch:1.4,force:1.35,step:.85}],
};
const library = {};
function add(group,id,name,seconds,details) {
  library[id]={id,group,name,seconds,...details};
}
function stance(id,name,guard,lean,crouch,shift,two=false) {
  add('Стойки',id,name,2.8,{type:'stance',guard,lean,crouch,shift,two,loop:true});
}
stance('neutral','Нейтральная',0,0,.01,0);
stance('guard','Боевая',.6,6,.055,.04);
stance('pressure','Агрессивная',.8,12,.07,.065);
stance('defensive','Защитная',1,3,.085,-.06);
stance('one-hand','Одноручное оружие',.38,4,.04,.045);
stance('two-hands','Двуручное оружие',.93,5,.06,.02,true);

function gait(id,name,seconds,x,z,yaw,lift,run=false) {
  add('Передвижение',id,name,seconds,{type:'gait',x,z,yaw,lift,run,loop:!yaw});
}
gait('walk','Ходьба вперёд',1.13,0,1.25,0,.095);
gait('backwalk','Ходьба назад',1.32,0,-.85,0,.075);
gait('run','Бег',.69,0,2,0,.25,true);
gait('strafe-l','Боковой шаг влево',1.06,-.9,0,0,.10);
gait('strafe-r','Боковой шаг вправо',1.06,.9,0,0,.10);
gait('turn-l','Разворот влево',.86,0,0,-90,.10);
gait('turn-r','Разворот вправо',.86,0,0,90,.10);
gait('turn-180','Разворот через плечо',1.19,0,0,180,.13);
add('Передвижение','dash','Рывок вперёд',.72,{type:'legacy',source:'dash',reach:1.3});
add('Передвижение','dash-back','Рывок назад',.86,{type:'legacy',source:'dodge',reach:1.05,reverseTravel:true});
add('Передвижение','jump','Прыжок с приземлением',1.05,{type:'jump',travel:.65,height:.51});
add('Передвижение','landing','Приземление с подшагом',.56,{type:'jump',travel:.28,height:.22,landing:true});

// Wind-up, contact and follow-through describe chest rotation, pitch and weapon-arm reach.
function strike(id,name,seconds,kind,side,reach,angle,drive,two=false) {
  add('Атаки',id,name,seconds,{type:'strike',kind,side,reach,angle,drive,two});
}
strike('horizontal-l','Горизонтальный слева',.86,'sweep',1,.60,78,.44);
strike('horizontal-r','Обратный горизонтальный',.97,'sweep',-1,.56,73,.38);
strike('overhead','Вертикальный сверху',1.11,'over',1,.62,38,.48);
strike('rising','Вертикальный снизу',.90,'rise',1,.56,44,.27);
strike('diagonal-l','Диагональный сверху слева',.98,'diagonal',1,.62,59,.45);
strike('diagonal-r','Диагональный сверху справа',1.05,'diagonal',-1,.59,66,.42);
strike('thrust','Укол с выпадом',.82,'thrust',1,.76,27,.64);
strike('low-thrust','Низкий укол',1.04,'low',1,.71,34,.48);
strike('heavy-two','Тяжёлый двуручный',1.58,'over',1,.69,53,.57,true);
strike('quick','Быстрая подсечка клинком',.57,'low',-1,.48,39,.20);
strike('spin','Круговая атака',1.43,'spin',1,.61,85,.61);
add('Атаки','legacy-slash','Авторский удар Duo',1,{type:'legacy',source:'slash'});
add('Атаки','legacy-heavy','Авторский тяжёлый удар Duo',1,{type:'legacy',source:'heavy',two:true});
add('Атаки','chain','Связка из трёх ударов',1,{type:'chain',clips:['horizontal-l','diagonal-r','thrust']});

add('Защита','block','Блок',.72,{type:'legacy',source:'block'});
add('Защита','parry','Парирование',.63,{type:'legacy',source:'parry'});
add('Защита','slip','Уклонение корпусом',.65,{type:'reaction',side:1,bend:12,drop:.12,travel:.20});
add('Защита','hop-back','Отскок назад',.72,{type:'jump',travel:-.82,height:.13});
add('Защита','roll','Перекат через плечо',1.06,{type:'roll',travel:1.26});

function reaction(id,name,seconds,side,bend,drop,travel) {
  add('Реакции',id,name,seconds,{type:'reaction',side,bend,drop,travel});
}
reaction('light-hit','Лёгкое попадание',.49,0,-9,.035,-.10);
reaction('heavy-hit','Тяжёлое попадание',1.05,0,-24,.16,-.43);
reaction('hit-left','Попадание слева',.72,-1,-13,.078,.24);
reaction('hit-right','Попадание справа',.72,1,-13,.078,.24);
reaction('hit-back','Попадание сзади',.86,0,28,.085,.33);
reaction('stumble','Потеря равновесия',1.21,-1,18,.19,.47);
add('Реакции','stun','Оглушение',1,{type:'legacy',source:'stun'});
add('Реакции','fall','Падение на колено',1.22,{type:'reaction',side:1,bend:32,drop:.51,travel:.32,hold:true});
add('Реакции','death','Падение и смерть',1,{type:'legacy',source:'death'});

export {library};
export const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=t=>t*t*(3-2*t);
const zero=[0,0,0];
const radians=Math.PI/180;
export function defaults(id) {
  return {version:1,id,style:'warrior',params:{},curve:'smooth',root:true,feet:true,grip:!!library[id]?.two,mirror:false,keys:[],layers:{body:1,limbs:1},sequence:[],blend:.18};
}
export function tuning(project) {
  const bias=styles[project.style]?.[1]||{};
  return Object.fromEntries(Object.entries(parameters).map(([k,[,min,max]])=>[k,clamp((project.params[k]??1)*(bias[k]??1),min,max)]));
}
export function easing(t,project,p) {
  t=clamp(t);
  if(project.curve==='linear')return t;
  const quintic=t*t*t*(t*(6*t-15)+10);
  const curved=project.curve==='smoother'?quintic:smooth(t);
  return p.smooth<=1?mix(t,curved,p.smooth):mix(curved,quintic,p.smooth-1);
}
function phase(t,p,curve) {
  const a=.3*p.windup,b=.23,c=.47*p.recovery,total=a+b+c;
  const sec=t*total;
  if(sec<a)return .30*easing(sec/a,curve,p);
  if(sec<a+b)return .30+.36*easing((sec-a)/b,curve,p);
  return .66+.34*easing((sec-a-b)/c,curve,p);
}
function interpolateFrames(keys,t,project,p) {
  const first=keys[0],last=keys.at(-1);
  if(t<=first.t)return first;
  if(t>=last.t)return last;
  let lo=0,hi=keys.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(keys[mid].t<t)lo=mid;else hi=mid}
  const a=keys[lo],b=keys[hi],u=easing((t-a.t)/(b.t-a.t),project,p);
  const pose={};
  for(const bone of new Set([...Object.keys(a.pose),...Object.keys(b.pose)])) {
    const x=a.pose[bone]||zero,y=b.pose[bone]||zero;
    pose[bone]=x.map((v,i)=>mix(v,y[i],u));
  }
  return {pose,pos:[mix(a.pos?.[0]||0,b.pos?.[0]||0,u),mix(a.pos?.[1]||0,b.pos?.[1]||0,u)],drop:mix(a.drop||0,b.drop||0,u),rot:mix(a.rot||0,b.rot||0,u)};
}
function blendPose(a,b,u) {
  const pose={};
  for(const bone of new Set([...Object.keys(a.pose),...Object.keys(b.pose)])) {
    const x=a.pose[bone]||zero,y=b.pose[bone]||zero;
    pose[bone]=x.map((v,i)=>mix(v,y[i],u));
  }
  return {pose,root:a.root.map((v,i)=>mix(v,b.root[i],u)),yaw:mix(a.yaw,b.yaw,u),feet:u<.5?a.feet:b.feet,hands:u<.5?a.hands:b.hands,base:u<.5?a.base:b.base};
}
function segments(project,data,p) {
  const ids=[project.id,...project.sequence].flatMap(id=>library[id]?.clips||[id]);
  return ids.map(id=>{
    const clip=library[id]||(id==='imported'&&project.imported?{type:'legacy',source:'imported',seconds:project.imported.duration}:null);
    if(!clip)throw Error('Неизвестное движение');
    const source=clip.source==='imported'?project.imported:data[clip.source];
    let duration=source?.duration||clip.seconds;
    if(clip.type==='strike')duration*=.30*p.windup+.23+.47*p.recovery;
    return {clip,source,duration:duration/p.speed};
  });
}
export function compile(project,data) {
  const p=tuning(project), clips=segments(project,data,p);
  let total=0;
  for(const [i,segment] of clips.entries()){
    segment.overlap=i?Math.min(project.blend,segment.duration*.4,clips[i-1].duration*.4):0;
    segment.start=total-segment.overlap; total=segment.start+segment.duration;
  }
  const offsets=[];
  let shift=[0,0,0],yaw=0;
  function transform(point,offset) {
    const [x,y,z]=point,[dx,,dz]=offset.shift;
    return [dx+x*offset.cos+z*offset.sin,y,dz-x*offset.sin+z*offset.cos];
  }
  for(const segment of clips){
    const last=motion(segment,1,project,p);
    const offset={shift,yaw,cos:Math.cos(yaw*radians),sin:Math.sin(yaw*radians)};
    offsets.push(offset);
    shift=transform(last.root,offset);yaw+=last.yaw;
  }
  const tracks=[];
  for(const layer of ['body','limbs']){
    const byBone=new Map();
    for(const key of project.keys){
      if(key.layer!==layer)continue;
      if(!byBone.has(key.bone))byBone.set(key.bone,[]);
      byBone.get(key.bone).push(key);
    }
    for(const [bone,keys] of byBone)tracks.push({bone,keys,weight:project.layers[layer]});
  }
  function at(time) {
    const t=clamp(time,0,total);
    let index=clips.length-1;
    while(index&&t<clips[index].start)index--;
    const get=i=>{
      const c=clips[i],m=motion(c,clamp((t-c.start)/c.duration),project,p);
      const off=offsets[i];m.root=transform(m.root,off);m.yaw+=off.yaw;
      if(m.feet)m.feet=m.feet.map(f=>transform(f,off));
      if(m.hands)m.hands=m.hands.map(f=>f&&transform(f,off));
      return m;
    };
    let m=get(index);
    const c=clips[index];
    if(index&&t<c.start+c.overlap)m=blendPose(get(index-1),m,smooth((t-c.start)/c.overlap));
    applyKeys(m,tracks,project,t,p);
    if(project.mirror){
      m.root[0]*=-1;m.yaw*=-1;
      for(const key of ['feet','hands'])if(m[key])m[key]=[...m[key]].reverse().map(f=>f&&[-f[0],f[1],f[2]]);
      m.pose=Object.fromEntries(Object.entries(m.pose).map(([k,r])=>[k.replace(/^[LR]_/,s=>s==='L_'?'R_':'L_'),[r[0],-r[1],-r[2]]]));
    }
    if(!project.root){
      for(const key of ['feet','hands'])if(m[key])m[key]=m[key].map(f=>f&&[f[0]-m.root[0],f[1],f[2]-m.root[2]]);
      m.root[0]=m.root[2]=0;
    }
    if(!project.feet)m.feet=null;
    return m;
  }
  return {at,duration:total,loop:clips.length===1&&!!clips[0].clip.loop};
}
function applyKeys(m,tracks,project,time,p) {
  for(const {bone,keys,weight} of tracks){
    const a=keys.findLast(k=>k.time<=time)||keys[0],b=keys.find(k=>k.time>=time)||keys.at(-1);
    const t=a===b||a.time===b.time?0:easing((time-a.time)/(b.time-a.time),project,p);
    m.pose[bone]=(m.pose[bone]||zero).map((v,i)=>v+mix(a.rotation[i],b.rotation[i],t)*weight);
  }
}
function motion(segment,t,project,p) {
  const c=segment.clip;
  const m={pose:{},root:[0,0,0],yaw:0,base:true,feet:null,hands:null};
  const pose=m.pose,body=(pitch,twist,roll)=>{
    pose.Pelvis=[pitch*.25,twist*.35,roll*.5];
    pose.Waist=[pitch*.30,twist*.24,roll*.28];
    pose.Spine01=[pitch*.28,twist*.23,roll*.22];
    pose.Spine02=[pitch*.17,twist*.18,roll*.18];
    pose.Head=[-pitch*.36,-twist*.25,-roll*.28];
  };
  const a=p.amplitude, wave=Math.sin(Math.PI*t);
  if(c.type==='stance'){
    const breath=Math.sin(2*Math.PI*t);
    body((c.lean+breath*1.8)*p.lean,c.shift*80,c.shift*45);
    m.root=[c.shift*a,-c.crouch*p.crouch+.006*breath,0];
    if(c.guard)m.hands=[[.22,1.28+c.guard*.23,.31+c.guard*.13],[-.25,1.15+c.guard*.23,.29]];
    m.feet=[[.17,0,.12],[-.17,0,-.11]];
  }else if(c.type==='gait'){
    m.root=[c.x*t*p.step,-(.08+(c.run?.035:0))*p.crouch+(c.run?.07:.035)*Math.cos(4*Math.PI*t)*a,c.z*t*p.step];
    m.yaw=c.yaw*easing(t,project,p);
    const swing=Math.sin(t*Math.PI*2);
    body((c.run?18:c.z<0?-4:7)*p.lean,swing*(c.run?20:12)*a+(c.run?7:4)*p.inertia*Math.cos(2*Math.PI*t),-swing*5*p.weight);
    pose.L_Upperarm=[swing*(c.run?34:19)*a,0,0];
    pose.R_Upperarm=[-swing*(c.run?34:19)*a,0,0];
    pose.L_Forearm=[c.run?-39:-7,0,0];
    pose.R_Forearm=[c.run?-39:-7,0,0];
    m.feet=[0,.5].map((offset,i)=>{
      const time=t+offset, cycle=Math.floor(time), f=time-cycle;
      const stance=c.run?.41:.60;
      const sw=clamp((f-stance)/(1-stance)),u=easing(sw,project,p);
      const anchor=cycle-offset+u+.25;
      const side=i===0?.17:-.17;
      const direction=c.yaw*clamp(anchor+.25)*radians;
      return [Math.cos(direction)*side+c.x*anchor*p.step,c.lift*Math.sin(sw*Math.PI)**2*a,-Math.sin(direction)*side+c.z*anchor*p.step];
    });
  }else if(c.type==='legacy'){
    const {source}=segment;
    const f=interpolateFrames(source.keys,t*source.duration,project,p);
    m.base=source.useStance!==false;
    m.pose=Object.fromEntries(Object.entries(f.pose).map(([k,v])=>[k,v.map(x=>x*a)]));
    m.root=[(f.pos?.[0]||0)*p.step,(f.drop||0)*a,(f.pos?.[1]||0)*p.step*(c.reverseTravel?-1:1)*(c.reach||1)];
    m.yaw=(f.rot||0)*a;
  }else if(c.type==='strike'){
    const u=phase(t,p,project);
    const loading=Math.sin(Math.PI*clamp(u/.60));
    const hit=Math.sin(Math.PI*clamp((u-.25)/.53));
    const lag=Math.sin(Math.PI*clamp((u-.54)/.46))*p.inertia;
    const swing=(-loading*.63+hit*.82+lag*.30)*c.angle*c.side*a;
    const pitch=(c.kind==='over'?-loading*13+hit*22:c.kind==='rise'?loading*19-hit*13:hit*11)*p.lean;
    body(pitch,swing,(-loading*9+hit*8)*c.side*p.weight);
    m.root=[(.09*loading-.10*hit)*c.side*p.weight,-(.075*loading+.03*hit+(c.kind==='low'?.13*hit:0))*p.crouch,c.drive*smooth(clamp((u-.30)/.56))*p.step];
    m.yaw=c.kind==='spin'?360*easing(clamp((u-.20)/.72),project,p):swing*.20;
    const vertical=c.kind==='over'?1.47+.59*loading-.49*hit:c.kind==='rise'?1.26-.48*loading+.55*hit:c.kind==='low'?1.26-.53*hit:1.4+.22*loading;
    const handX=c.kind==='thrust'?.20:.22+c.side*(loading*.37-hit*.61-lag*.19)*a;
    const reach=.28-loading*.36*p.aggression+hit*c.reach*p.force*.60+lag*.07;
    m.hands=[[handX,vertical,reach],[-.25-.10*hit,1.28+.12*loading,.26-.19*hit]].map(([x,y,z])=>[x+m.root[0],y+m.root[1],z+m.root[2]]);
    const localYaw=m.yaw*radians;
    if(c.kind==='spin')m.hands=m.hands.map(([x,y,z])=>{
      const dx=x-m.root[0],dz=z-m.root[2];
      return [m.root[0]+dx*Math.cos(localYaw)+dz*Math.sin(localYaw),y,m.root[2]-dx*Math.sin(localYaw)+dz*Math.cos(localYaw)];
    });
    const plant=easing(clamp((u-.31)/.30),project,p);
    m.feet=[[.19,.10*Math.sin(Math.PI*plant),.13+c.drive*p.step*plant],[-.18,0,-.17]];
  }else if(c.type==='jump'){
    const inAir=clamp((t-.19)/.56),arc=4*inAir*(1-inAir);
    const loading=Math.sin(Math.PI*clamp(t/.31)),land=Math.sin(Math.PI*clamp((t-.72)/.28));
    const travel=c.travel*easing(inAir,project,p)*p.step;
    m.root=[0,c.height*(c.landing?(1-easing(t,project,p)):arc)*a-(loading*.10+land*.16)*p.crouch,travel];
    body((loading*15+land*29)*p.lean,0,0);
    pose.L_Upperarm=[-35*arc,0,0];pose.R_Upperarm=[-35*arc,0,0];
    m.feet=[[.16,c.height*arc*a,.17+travel],[-.16,c.height*arc*a*.90,-.11+travel]];
    if(c.landing&&t<.45)m.feet=null;
  }else if(c.type==='roll'){
    const u=easing(clamp((t-.13)/.74),project,p),tuck=Math.sin(Math.PI*u);
    m.root=[.14*tuck,-.69*tuck*p.crouch,c.travel*u*p.step];
    body(56*tuck,17*tuck,20*tuck);
    pose.Hip=[-360*u,0,0];
    pose.L_Thigh=[-66*tuck,0,0];pose.R_Thigh=[-77*tuck,0,0];
    pose.L_Calf=[107*tuck,0,0];pose.R_Calf=[112*tuck,0,0];
    pose.L_Upperarm=[-68*tuck,0,13*tuck];pose.R_Upperarm=[-60*tuck,0,-17*tuck];
  }else{
    const impact=easing(clamp(t/.22),project,p);
    const settle=c.hold?impact:impact*(1-easing(clamp((t-.22)/.78),project,p));
    const travel=c.travel*easing(t,project,p)*p.step;
    body(c.bend*settle*p.lean,c.side*26*settle*a,c.side*32*settle*a);
    pose.L_Upperarm=[-23*settle,0,22*settle];pose.R_Upperarm=[-16*settle,0,-23*settle];
    m.root=[c.side*travel,-c.drop*settle*p.crouch,c.side===0?travel:0];
    m.feet=[[.18+m.root[0],.08*wave,.17+m.root[2]],[-.18,0,-.16]];
  }
  return m;
}
