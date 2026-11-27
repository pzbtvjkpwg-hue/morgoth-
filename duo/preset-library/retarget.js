import {AnimationMixer, Euler, LoadingManager, LoopOnce, Quaternion, Vector3} from 'three';

const rad=Math.PI/180;
const normalize=name=>name.replace(/^.*[:|]/,'').toLowerCase().replace(/^(mixamorig\d*|character\d+[_ -]*|cc_base)/,'').replace(/[^a-z0-9]/g,'');
const body={
  Hip:['hips','hip','pelvis'],
  Waist:['spine','spine00'],
  Spine01:['spine1','spine01'],
  Spine02:['spine2','spine02','spine3','spine03','chest'],
  NeckTwist01:['neck','neck01','neck1'],
  Head:['head'],
};
const limbs={
  Clavicle:['shoulder','clavicle','collar'],
  Upperarm:['arm','upperarm'],Forearm:['forearm','lowerarm'],
  Hand:['hand','wrist'],Thigh:['upleg','upperleg','thigh'],
  Calf:['leg','lowerleg','calf','shin'],Foot:['foot','ankle'],
};
function aliases(id,unreal) {
  if(id==='Waist'&&unreal)return ['spine01'];
  if(id==='Spine01'&&unreal)return ['spine02'];
  if(id==='Spine02'&&unreal)return ['spine03','spine04','spine05'];
  if(id in body)return body[id];
  const match=id.match(/^([LR])_(.+)$/);
  if(!match)return [];
  const [,side,part]=match,short=side.toLowerCase(),long=side==='L'?'left':'right';
  if(limbs[part])return limbs[part].flatMap(n=>[long+n,short+n,n+short]);
  const finger=part.match(/^(Thumb|Index|Mid|Ring|Pinky)([123])$/);
  if(!finger)return [];
  const f=finger[1]==='Mid'?'middle':finger[1].toLowerCase(),n=finger[2];
  return [long+'hand'+f+n,long+f+n,f+'0'+n+short];
}
function sourceBones(root,ids) {
  const all=new Map();
  root.traverse(b=>{
    if(!b.isBone&&!(b.isGroup&&b.name))return;
    const id=normalize(b.name);
    if(!all.has(id))all.set(id,b);
  });
  const unreal=all.has('pelvis')&&all.has('upperarml');
  const used=new Set();
  return Object.fromEntries(ids.flatMap(id=>{
    const b=[...aliases(id,unreal),normalize(id)].map(n=>all.get(n)).find(n=>n&&!used.has(n));
    if(!b)return [];
    used.add(b);return [[id,b]];
  }));
}
const heightOf=map=>{
  const feet=['L_Foot','R_Foot'].map(k=>map[k]?.getWorldPosition(new Vector3()).y).filter(Number.isFinite);
  const top=map.Head?.getWorldPosition(new Vector3()).y;
  return feet.length&&Number.isFinite(top)?top-Math.min(...feet):0;
};
const turnaround=map=>{
  const left=map.L_Upperarm||map.L_Thigh,right=map.R_Upperarm||map.R_Thigh;
  if(!left||!right)return 0;
  const across=left.getWorldPosition(new Vector3()).sub(right.getWorldPosition(new Vector3()));
  return Math.atan2(-across.z,across.x);
};
const rounded=n=>Math.round(n*1000)/1000;
function continuousEuler(e,previous){
  const angles=[e.x/rad,e.y/rad,e.z/rad];
  if(!previous)return angles.map(rounded);
  const unwrap=next=>next.map((n,i)=>n+360*Math.round((previous[i]-n)/360));
  const primary=unwrap(angles),alternative=unwrap([angles[0]+180,180-angles[1],angles[2]+180]);
  const distance=v=>v.reduce((total,n,i)=>total+(n-previous[i])**2,0);
  return (distance(primary)<=distance(alternative)?primary:alternative).map(rounded);
}
export async function retarget(buffer,name,target) {
  const {FBXLoader}=await import('three/addons/loaders/FBXLoader.js');
  const manager=new LoadingManager();
  manager.setURLModifier(url=>/^(blob|data):/.test(url)?url:'data:image/png;base64,');
  const root=new FBXLoader(manager).parse(buffer,'');
  try{
    const clip=root.animations.filter(a=>a.duration>0&&a.tracks.length).sort((a,b)=>b.tracks.length-a.tracks.length)[0];
    if(!clip||!Number.isFinite(clip.duration))throw Error('В FBX не найдена анимация');
    const frames=Math.ceil(clip.duration*30);
    if(frames>5400)throw Error('Клип длиннее трёх минут');
    root.updateMatrixWorld(true);
    const map=sourceBones(root,target.ids);
    if(!map.Hip||!map.L_Thigh||!map.R_Thigh||!map.L_Upperarm||!map.R_Upperarm)throw Error('Скелет FBX не распознан');
    const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),target.yaw-turnaround(map));
    const inverse=rotation.clone().invert(),height=heightOf(map),scale=target.height/height;
    if(!Number.isFinite(scale)||height<=0)throw Error('Невозможно определить масштаб скелета');
    const tracks=Object.entries(map).map(([id,bone])=>{
      const parent=bone.parent.getWorldQuaternion(new Quaternion());
      return {id,bone,pre:rotation.clone().multiply(parent),
        post:bone.quaternion.clone().invert().multiply(parent.clone().invert()).multiply(inverse),
        stance:new Quaternion().setFromEuler(new Euler(...(target.stance[id]||[0,0,0]).map(x=>x*rad))).invert()};
    });
    const mixer=new AnimationMixer(root);
    const action=mixer.clipAction(clip).setLoop(LoopOnce,1);
    action.clampWhenFinished=true;action.play();
    mixer.setTime(0);root.updateMatrixWorld(true);
    const origin=map.Hip.getWorldPosition(new Vector3());
    const prev={},e=new Euler(),q=new Quaternion(),pos=new Vector3();
    const keys=[];
    for(let i=0;i<=frames;i++){
      const t=i/frames*clip.duration;
      mixer.setTime(t);
      map.Hip.getWorldPosition(pos).sub(origin).applyQuaternion(rotation).multiplyScalar(scale);
      const pose={};
      for(const {id,bone,pre,post,stance} of tracks){
        q.copy(pre).multiply(bone.quaternion).multiply(post).multiply(stance);
        e.setFromQuaternion(q);
        const v=continuousEuler(e,prev[id]);
        prev[id]=pose[id]=v;
      }
      keys.push({t,pose,pos:[rounded(pos.x),rounded(pos.z)],drop:rounded(pos.y),rot:0,smoke:0});
    }
    mixer.stopAllAction();mixer.uncacheRoot(root);
    return {name,duration:clip.duration,loop:false,smooth:false,useStance:false,keys,mocap:{stance:target.stance,yaw:target.yaw,height:target.height}};
  }finally{
    const resources=new Set();
    root.traverse(o=>{
      if(o.skeleton)resources.add(o.skeleton);
      if(o.geometry)resources.add(o.geometry);
      for(const m of [].concat(o.material||[])){
        resources.add(m);for(const value of Object.values(m))if(value?.isTexture)resources.add(value);
      }
    });
    for(const resource of resources)resource.dispose();
  }
}

export function adaptEditedClip(clip,target) {
  const source=clip.mocap;
  if(!source||!(source.height>0)||!Number.isFinite(source.yaw))return clip;
  const yaw=target.yaw-source.yaw,scale=target.height/source.height;
  const align=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw);
  const inverse=align.clone().invert(),rotation=new Quaternion(),e=new Euler(),position=new Vector3();
  const stance=(map,id)=>new Quaternion().setFromEuler(new Euler(...(map?.[id]||[0,0,0]).map(n=>n*rad)));
  const tables=target.ids.map(id=>[id,stance(source.stance,id),stance(target.stance,id).invert()]);
  const prev={};
  const keys=clip.keys.map(key=>{
    const pose={};
    for(const [id,from,to] of tables){
      const angles=key.pose[id];
      if(!angles)continue;
      e.set(...angles.map(n=>n*rad));
      rotation.setFromEuler(e).multiply(from).premultiply(align).multiply(inverse).multiply(to);
      e.setFromQuaternion(rotation);
      const value=continuousEuler(e,prev[id]);
      pose[id]=prev[id]=value;
    }
    position.set(key.pos?.[0]||0,key.drop||0,key.pos?.[1]||0).applyQuaternion(align).multiplyScalar(scale);
    return {...key,pose,pos:[rounded(position.x),rounded(position.z)],drop:rounded(position.y)};
  });
  return {...clip,useStance:false,keys,mocap:{stance:target.stance,yaw:target.yaw,height:target.height}};
}
