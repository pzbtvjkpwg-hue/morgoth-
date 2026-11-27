import * as T from 'three';
import {dispose,names} from './rig.js';
import {clamp,defaults,library,parameters,styles} from './motion.js';

const key='animationEditor2.presets.v1';
const validBone=n=>typeof n==='string'&&/^[a-zA-Z][a-zA-Z0-9_]{0,45}$/.test(n);
const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
export function validate(data) {
  if(!data||data.version!==1||(!Object.hasOwn(library,data.id)&&data.id!=='imported'))throw Error('Формат пресета не поддерживается');
  const result=defaults(data.id);
  if(data.name!=null)result.name=String(data.name).slice(0,80);
  if(Object.hasOwn(styles,data.style))result.style=data.style;
  if(['linear','smooth','smoother'].includes(data.curve))result.curve=data.curve;
  for(const k of ['root','feet','grip','mirror'])if(typeof data[k]==='boolean')result[k]=data[k];
  for(const [k,[,min,max]] of Object.entries(parameters))if(Number.isFinite(data.params?.[k]))result.params[k]=clamp(data.params[k],min,max);
  for(const k of ['body','limbs'])if(Number.isFinite(data.layers?.[k]))result.layers[k]=clamp(data.layers[k]);
  if(Number.isFinite(data.blend))result.blend=clamp(data.blend,0,.6);
  if(Array.isArray(data.sequence))result.sequence=data.sequence.filter(id=>Object.hasOwn(library,id)).slice(0,20);
  if(Array.isArray(data.keys))result.keys=data.keys.slice(0,2000).filter(k=>k&&validBone(k.bone)&&['body','limbs'].includes(k.layer)&&Number.isFinite(k.time)&&k.time>=0&&vector(k.rotation,3)).sort((a,b)=>a.time-b.time);
  if(data.id==='imported'){
    const clip=data.imported;
    if(!clip||!(clip.duration>0&&clip.duration<=30)||!Array.isArray(clip.keys)||clip.keys.length<2||clip.keys.length>1000)throw Error('Недопустимая длительность или число кадров');
    const keys=clip.keys.map((k,i)=>{
      if(!k||!Number.isFinite(k.t)||k.t<0||k.t>clip.duration||(i&&k.t<=clip.keys[i-1].t)||!vector(k.pos,2)||!Number.isFinite(k.drop)||!Number.isFinite(k.rot)||!k.pose||typeof k.pose!=='object')throw Error('Некорректный ключ анимации');
      const fields=Object.entries(k.pose);
      if(fields.length>120||fields.some(([b,q])=>!validBone(b)||!vector(q,3)))throw Error('Некорректная поза');
      return {t:k.t,pose:Object.fromEntries(fields),pos:k.pos,drop:k.drop,rot:k.rot};
    });
    result.imported={duration:clip.duration,useStance:false,keys};
  }
  return result;
}
export function saved() {
  try{
    const items=JSON.parse(localStorage.getItem(key)||'[]');
    return Array.isArray(items)?items:[];
  }catch{return []}
}
export function writeSaved(items){localStorage.setItem(key,JSON.stringify(items))}
export function exportProject(project) {
  const a=document.createElement('a');
  a.download=(project.name||project.id).replace(/[^\p{L}\p{N}_ -]/gu,'_')+'.duoanim.json';
  a.href=URL.createObjectURL(new Blob([JSON.stringify(project)],{type:'application/json'}));
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
export async function importProject(files,onClips) {
  const file=files[0],ext=file.name.split('.').at(-1).toLowerCase();
  if(ext==='json')return validate(JSON.parse(await file.text()));
  let root,clips;
  if(ext==='glb'||ext==='gltf'){
    const manager=new T.LoadingManager(),urls=new Map();
    for(const f of files.slice(1))urls.set(f.name,URL.createObjectURL(f));
    manager.setURLModifier(url=>{
      if(/^(data|blob):/.test(url))return url;
      const path=decodeURIComponent(url.split(/[?#]/)[0]);
      return urls.get(path.split('/').at(-1))||'data:application/octet-stream;base64,';
    });
    try{
      const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
      const result=await new GLTFLoader(manager).parseAsync(await file.arrayBuffer(),'');
      root=result.scene;clips=result.animations;
    }finally{for(const url of urls.values())URL.revokeObjectURL(url)}
  }else if(ext==='fbx'){
    const {FBXLoader}=await import('three/addons/loaders/FBXLoader.js');
    const manager=new T.LoadingManager();
    manager.setURLModifier(url=>/^(data|blob):/.test(url)?url:'data:image/png;base64,');
    root=new FBXLoader(manager).parse(await file.arrayBuffer(),'');clips=root.animations;
  }else if(ext==='bvh'){
    const {BVHLoader}=await import('three/addons/loaders/BVHLoader.js');
    const result=new BVHLoader().parse(await file.text());
    root=new T.Group();root.add(result.skeleton.bones[0]);
    const byName=new Map(result.skeleton.bones.map(bone=>[bone.name,bone.uuid]));
    for(const track of result.clip.tracks){
      const match=track.name.match(/^\.bones\[(.*)\](\..+)$/);
      if(match&&byName.has(match[1]))track.name=byName.get(match[1])+match[2];
    }
    clips=[result.clip];
  }else throw Error('Выбери JSON, GLB, GLTF, FBX или BVH');
  try{
    clips=clips.filter(clip=>clip.duration>0&&clip.tracks.length);
    if(!clips.length)throw Error('В файле нет анимационных клипов');
    const index=onClips?await onClips(clips):0;
    return index==null?null:bake(root,clips[index],file.name);
  }finally{dispose(root)}
}
function bake(root,clip,fileName) {
  if(!(clip?.duration>0&&clip.duration<=30))throw Error('Длительность клипа должна быть от 0 до 30 секунд');
  const map=names(root),q=()=>new T.Quaternion(),v=()=>new T.Vector3();
  const pivot=map.Hip||map.Pelvis;
  if(!pivot||Object.keys(map).length<6)throw Error('Скелет не распознан. Нужны стандартные имена костей Duo, Mixamo или BVH');
  root.updateMatrixWorld(true);
  const rest=Object.entries(map).map(([key,bone])=>({key,bone,initial:bone.quaternion.clone().invert(),parent:bone.parent.getWorldQuaternion(q())}));
  const origin=pivot.getWorldPosition(v());
  const leg=map.L_Foot||map.R_Foot;
  const height=Math.max(Math.abs((map.Head?.getWorldPosition(v()).y??origin.y*1.8)-(leg?.getWorldPosition(v()).y??0)),.001);
  const scale=1.65/height;
  const mixer=new T.AnimationMixer(root),action=mixer.clipAction(clip);
  action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
  const frameCount=Math.max(1,Math.ceil(clip.duration*30));
  const prev={};
  const keys=Array.from({length:frameCount+1},(_,i)=>{
    const t=i/frameCount*clip.duration;
    mixer.setTime(t);root.updateMatrixWorld(true);
    const position=pivot.getWorldPosition(v()).sub(origin).multiplyScalar(scale);
    const pose={};
    for(const {key,bone,initial,parent} of rest){
      const delta=parent.clone().multiply(bone.quaternion).multiply(initial).multiply(parent.clone().invert());
      const e=new T.Euler().setFromQuaternion(delta);
      const angles=[e.x,e.y,e.z].map((a,j)=>{
        const degrees=T.MathUtils.radToDeg(a),last=prev[key]?.[j]??degrees;
        return degrees+360*Math.round((last-degrees)/360);
      });
      prev[key]=pose[key]=angles;
    }
    return {t,pose,pos:[position.x,position.z],drop:position.y,rot:0};
  });
  mixer.stopAllAction();mixer.uncacheRoot(root);
  const project=defaults('imported');
  project.name=clip.name||fileName;project.feet=false;
  project.imported={duration:clip.duration,useStance:false,keys};
  return validate(project);
}
