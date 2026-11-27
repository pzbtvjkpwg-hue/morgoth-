import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clamp} from './motion.js';

export const bones = {
  Hip:'Корпус',Pelvis:'Таз',Waist:'Поясница',Spine01:'Спина',Spine02:'Грудь',NeckTwist01:'Шея',Head:'Голова',
  ...Object.fromEntries(['L','R'].flatMap(side=>Object.entries({
    Clavicle:'ключица',Upperarm:'плечо',Forearm:'предплечье',Hand:'кисть',Thigh:'бедро',Calf:'голень',Foot:'стопа',ToeBase:'носок',
  }).map(([key,value])=>[side+'_'+key,(side==='L'?'Л · ':'П · ')+value]))),
};
const rad=Math.PI/180;
const norm=name=>name.toLowerCase().replace(/^.*[:|]/,'').replace(/^mixamorig\d*/,'').replace(/[^a-z0-9]/g,'');
const alias={
  Hip:['hips','root','pelvis'],Pelvis:['pelvis'],Waist:['spine','lowerback'],Spine01:['spine1','spine01','upperback'],
  Spine02:['spine2','spine02','chest','upperchest','thorax'],NeckTwist01:['neck','neck1'],Head:['head'],
};
const limbs={Clavicle:['clavicle','collar','shoulder'],Upperarm:['upperarm','arm'],Forearm:['forearm','lowerarm','elbow'],Hand:['hand','wrist'],Thigh:['thigh','upleg','upperleg'],Calf:['calf','leg','shin','lowerleg','knee'],Foot:['foot','ankle'],ToeBase:['toebase','toe']};
export function names(root,mapping) {
  const named=new Map();
  root.traverse(node=>{if(node.isBone&&!named.has(node.name))named.set(node.name,node)});
  const result={};
  const used=new Set();
  for(const key of Object.keys(bones)){
    const side=key[1]==='_'?key[0]:null;
    const variants=side?limbs[key.slice(2)].flatMap(val=>[side.toLowerCase()+val,(side==='L'?'left':'right')+val,val+side.toLowerCase()]):alias[key]||[];
    const node=mapping?named.get(mapping[key]):named.get(key)||[...named.values()].find(b=>variants.includes(norm(b.name)));
    if(node&&!used.has(node)){result[key]=node;used.add(node)}
  }
  for(const [key,node] of named)if(/^[LR]_(Thumb|Index|Mid|Ring|Pinky)\d$/.test(key)&&(!mapping||mapping[key]===key))result[key]=node;
  return result;
}
const vector=()=>new T.Vector3();
const quaternion=()=>new T.Quaternion();
const X=new T.Vector3(1,0,0);
const Y=new T.Vector3(0,1,0);

const limits={Head:[50,75,45],NeckTwist01:[32,40,30],Waist:[30,35,26],Spine01:[26,32,24],Spine02:[28,36,28],Hand:[75,55,65],Foot:[65,40,45],Calf:[145,20,20],Forearm:[150,85,25]};
function euler(value,work,lim) {
  const [x,y,z]=value||[0,0,0];
  return work.set(lim?clamp(x,-lim[0],lim[0])*rad:x*rad,lim?clamp(y,-lim[1],lim[1])*rad:y*rad,lim?clamp(z,-lim[2],lim[2])*rad:z*rad);
}
function currentHeight(root) {
  const box=new T.Box3().setFromObject(root,true);
  if(box.isEmpty())throw Error('В модели нет видимой геометрии');
  return box;
}
export function createRig(scene,asset,data,settings={}) {
  const group=new T.Group();
  const model=asset.scene;
  const box=currentHeight(model);
  const size=box.getSize(vector()),center=box.getCenter(vector());
  const height=settings.height||1.9;
  const scale=height/Math.max(size.y,.001);
  model.scale.multiplyScalar(scale);
  model.position.add(new T.Vector3(-center.x,-box.min.y,-center.z).multiplyScalar(scale));
  group.add(model);group.updateMatrixWorld(true);
  const mapped=names(model,settings.map);
  if(Object.keys(mapped).length<4)throw Error('Недостаточно костей. Сопоставь риг в Duo или выбери другой GLB.');
  const inverse=model.getWorldQuaternion(quaternion()).invert();
  const work=new T.Euler();
  const bind=Object.entries(mapped).map(([key,bone])=>{
    const p=inverse.clone().multiply(bone.parent.getWorldQuaternion(quaternion()));
    const base=quaternion().setFromEuler(euler(data.stance?.[key],work));
    const edit=quaternion().setFromEuler(euler(settings.stance?.[key],work));
    return {key,bone,pre:p,inv:p.clone().invert(),rest:bone.quaternion.clone(),base:edit.multiply(base)};
  });
  const handedness=mapped.L_Foot&&mapped.R_Foot&&mapped.L_Foot.getWorldPosition(vector()).x<mapped.R_Foot.getWorldPosition(vector()).x?-1:1;
  const footClearance=['L','R'].map(side=>Math.max(0,mapped[side+'_Foot']?.getWorldPosition(vector()).y||0));
  const helper=new T.SkeletonHelper(model);
  helper.visible=false;
  const rotation=quaternion(),parent=quaternion();
  const wrist=new T.Vector3(),shoulder=new T.Vector3(),elbow=new T.Vector3(),gripTarget=new T.Vector3();
  let sword=null;
  function hold(mirror){
    if(!sword)return;
    const hand=mapped[(mirror?'R':'L')+'_Hand'];
    if(hand&&sword.parent!==hand)hand.add(sword);
  }
  function place(m,project,offset=0) {
    group.position.set(offset+m.root[0]*handedness,m.root[1]*height/1.9,m.root[2]);
    group.rotation.y=m.yaw*rad*handedness;
    for(const item of bind){
      const lim=limits[item.key.split('_').at(-1)];
      rotation.setFromEuler(euler(m.pose[item.key],work,lim));
      if(m.base)rotation.multiply(item.base);
      item.bone.quaternion.copy(item.inv).multiply(rotation).multiply(item.pre).multiply(item.rest);
    }
    hold(project.mirror);
    group.updateMatrixWorld(true);
    const side=project.mirror?'R':'L';
    for(const [index,s] of ['L','R'].entries()){
      const f=m.feet?.[index];
      if(f){
        const foot=mapped[s+'_Foot'];
        const world=foot?.getWorldQuaternion(quaternion());
        solve(mapped[s+'_Thigh'],mapped[s+'_Calf'],foot,
          new T.Vector3(offset+f[0]*handedness,f[1]+footClearance[index],f[2]),
          new T.Vector3(Math.sin(group.rotation.y),.025,Math.cos(group.rotation.y)),.07,2.55);
        if(world&&f[1]<.003){
          // Preserve the planted ankle orientation from the prepared pose.
          parent.copy(foot.parent.getWorldQuaternion(parent)).invert();
          foot.quaternion.copy(parent).multiply(world);
          foot.updateWorldMatrix(false,true);
        }
      }
      const h=m.hands?.[index];
      if(!h||(project.grip&&s!==side))continue;
      solve(mapped[s+'_Upperarm'],mapped[s+'_Forearm'],mapped[s+'_Hand'],
        wrist.set(offset+h[0]*handedness,h[1]*height/1.9,h[2]),
        elbow.set((s==='L'?1:-1)*handedness,-.7,-.12),.09,2.65);
    }
    if(project.grip){
      const off=side==='L'?'R':'L',hand=mapped[side+'_Hand'];
      if(hand){
        if(sword){
          sword.getWorldPosition(gripTarget);
          const axis=new T.Vector3().setFromMatrixColumn(sword.matrixWorld,1).normalize();
          gripTarget.addScaledVector(axis,.13);
          const handPosition=hand.getWorldPosition(wrist);
          if(gripTarget.distanceTo(handPosition)>.3)gripTarget.copy(handPosition).addScaledVector(axis,.13);
        }else{
          hand.getWorldPosition(gripTarget);
          gripTarget.x-=(side==='L'?1:-1)*handedness*.15;
        }
        solve(mapped[off+'_Upperarm'],mapped[off+'_Forearm'],mapped[off+'_Hand'],gripTarget,
          shoulder.set((off==='L'?1:-1)*handedness,-.65,-.24),.09,2.65);
      }
    }
  }
  scene.add(group,helper);
  function attachWeapon(asset,matrix,config) {
    sword=new T.Group();
    sword.matrixAutoUpdate=false;
    sword.matrix.fromArray(matrix);
    if(config){
      const pos=vector(),q=quaternion(),scale=vector();
      sword.matrix.decompose(pos,q,scale);
      if(config.pos)pos.fromArray(config.pos);
      if(config.rot)q.premultiply(quaternion().setFromEuler(euler(config.rot,work)));
      scale.multiplyScalar(config.size||1);
      sword.matrix.compose(pos,q,scale);
    }
    sword.add(asset.scene);hold(false);
  }
  return {group,helper,height,place,attachWeapon,mapped,dispose(){
    scene.remove(group,helper);helper.dispose();if(sword&&!sword.parent)dispose(sword);dispose(group);
  }};
}
function orient(bone,from,to) {
  const world=bone.getWorldQuaternion(quaternion());
  const delta=quaternion().setFromUnitVectors(from.normalize(),to.normalize());
  bone.quaternion.copy(bone.parent.getWorldQuaternion(quaternion()).invert().multiply(delta).multiply(world));
  bone.updateWorldMatrix(false,true);
}
function solve(first,middle,last,target,pole,minFlex,maxFlex) {
  if(!first||!middle||!last)return false;
  const a=first.getWorldPosition(vector()),b=middle.getWorldPosition(vector()),c=last.getWorldPosition(vector());
  const upper=a.distanceTo(b),lower=b.distanceTo(c);
  if(upper<.001||lower<.001)return false;
  const lengthFor=angle=>Math.sqrt(upper**2+lower**2+2*upper*lower*Math.cos(angle));
  const axis=target.clone().sub(a),desired=axis.length();
  if(desired<1e-5)return false;
  axis.multiplyScalar(1/desired);
  const d=clamp(desired,lengthFor(maxFlex),lengthFor(minFlex));
  const bend=pole.clone().addScaledVector(axis,-pole.dot(axis));
  if(bend.lengthSq()<1e-6){
    bend.copy(Math.abs(axis.y)<.9?Y:X);bend.addScaledVector(axis,-bend.dot(axis));
  }
  const u=(upper**2+d**2-lower**2)/(2*d);
  const knee=a.clone().addScaledVector(axis,u).addScaledVector(bend.normalize(),Math.sqrt(Math.max(0,upper**2-u**2)));
  orient(first,b.sub(a),knee.clone().sub(a));
  const next=middle.getWorldPosition(vector()),end=last.getWorldPosition(vector());
  orient(middle,end.sub(next),a.addScaledVector(axis,d).sub(next));
  return true;
}
export function dispose(root) {
  const found=new Set();
  root.traverse(node=>{
    for(const item of [node.geometry,node.skeleton,...[].concat(node.material||[])])if(item)found.add(item);
    for(const mat of [].concat(node.material||[]))for(const value of Object.values(mat))if(value?.isTexture)found.add(value);
  });
  for(const item of found)item.dispose();
}
export const builtins=[{id:'morgoth',name:'Моргот',height:2},{id:'knight',name:'Серебряный рыцарь',height:1.85}];
const directory=new URL('../',location.href);
export async function loadModel(descriptor,signal) {
  if(!descriptor.record){
    const url=new URL(descriptor.id+'.glb',directory);
    const response=await fetch(url,{signal});
    if(!response.ok)throw Error('Модель недоступна · '+response.status);
    return new GLTFLoader().parseAsync(await response.arrayBuffer(),directory.href);
  }
  const data=descriptor.record.data||await descriptor.record.blob?.arrayBuffer();
  if(!data)throw Error('Файл пользовательской модели недоступен');
  return new GLTFLoader().parseAsync(data,directory.href);
}
export async function weapon(descriptor,signal){
  const id=descriptor.record?.rig?.sword||descriptor.record?.base||descriptor.id;
  if(id.startsWith('u:')){
    const [record]=await readStore('wpn',id.slice(2));
    if(!record)throw Error('Пользовательское оружие недоступно');
    return loadModel({record},signal);
  }
  return loadModel({id:'sword_'+id},signal);
}
export async function readStore(store,id) {
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('duoMedia');
    request.onupgradeneeded=()=>request.transaction.abort();
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  }).catch(()=>null);
  if(!db)return [];
  try{
    if(!db.objectStoreNames.contains(store))return [];
    return await new Promise((resolve,reject)=>{
      const s=db.transaction(store,'readonly').objectStore(store),r=id==null?s.getAll():s.get(id);
      r.onsuccess=()=>resolve(id==null?r.result:[r.result]);
      r.onerror=()=>reject(r.error);
    });
  }finally{db.close()}
}
