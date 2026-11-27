import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {bones,builtins,createRig,dispose,loadModel,readStore,weapon} from './rig.js';
import {clamp,compile,defaults,library,parameters,styles} from './motion.js';
import {exportProject,importProject,saved,validate,writeSaved} from './files.js';

const el=id=>document.getElementById(id);
const report=message=>{el('status').textContent=message};
const clone=value=>structuredClone(value);
const option=(name,value)=>new Option(name,value);
const fps=30;
let project=defaults('guard'),original=clone(project),undo=[],redo=[],time=0,playing=false,last=0;
let descriptor,data,assets,rig,reference,comparisonToken=0,request,compiled,baseline,renderer,scene,camera,controls;
let poseDirty=true,trailDirty=true,trailGroup;
let models=builtins;
const sliders={};
const info=(p=project)=>p.name||library[p.id]?.name||'Импортированный клип';

function populate(select){
  const groups=new Map();
  for(const item of Object.values(library)){
    if(!groups.has(item.group)){
      const group=document.createElement('optgroup');group.label=item.group;select.add(group);groups.set(item.group,group);
    }
    groups.get(item.group).append(option(item.name,item.id));
  }
}
function setupControls(){
  populate(el('library'));populate(el('next'));
  el('style').replaceChildren(...Object.entries(styles).map(([k,[name]])=>option(name,k)));
  el('bone').replaceChildren(...Object.entries(bones).map(([id,name])=>option(name,id)));
  el('bone').value='Spine02';
  for(const [id,[name,min,max]] of Object.entries(parameters)){
    const label=document.createElement('label'),input=document.createElement('input'),out=document.createElement('output');
    label.append(name,input,out);el('params').append(label);
    Object.assign(input,{type:'range',min,max,step:.01,value:1});
    sliders[id]={input,out};
    input.oninput=()=>{
      out.value=Number(input.value).toFixed(2);
      rebuild({...project,params:{...project.params,[id]:Number(input.value)}});
    };
    input.onchange=()=>change(p=>{p.params[id]=Number(input.value)});
  }
  el('library').onchange=()=>choose(defaults(el('library').value));
  el('style').onchange=()=>change(p=>{p.style=el('style').value});
  for(const id of ['root','feet','grip','mirror'])el(id).onchange=()=>change(p=>{p[id]=el(id).checked});
  el('curve').onchange=()=>change(p=>{p.curve=el('curve').value});
  el('layer').onchange=syncKeys;
  el('bone').onchange=syncKeys;
  el('layerWeight').onchange=()=>change(p=>{p.layers[el('layer').value]=Number(el('layerWeight').value)});
  el('blend').onchange=()=>change(p=>{p.blend=clamp(Number(el('blend').value),0,.6)});
  el('name').onchange=()=>change(p=>{p.name=el('name').value.trim()});
  el('append').onclick=()=>change(p=>{if(p.sequence.length<20)p.sequence.push(el('next').value)});
  el('clear').onclick=()=>change(p=>{p.sequence=[]});
  el('undo').onclick=()=>history(undo,redo);
  el('redo').onclick=()=>history(redo,undo);
  el('play').onclick=()=>{if(compiled){if(!playing&&time>=compiled.duration)seek(0);play(!playing)}};
  el('time').oninput=()=>{play(false);seek(Number(el('time').value))};
  for(const [id,step] of [['back',-1],['forward',1]])el(id).onclick=()=>{play(false);seek((Math.round(time*fps)+step)/fps)};
  el('compare').onchange=()=>compare();
  el('skeleton').onchange=()=>{poseDirty=true};
  el('trails').onchange=()=>{trailDirty=true};
  el('model').onchange=()=>selectModel(el('model').value);
  el('keys').onchange=()=>{
    const key=project.keys[Number(el('keys').value)];
    if(key){play(false);seek(key.time);setRotation(key.rotation)}
  };
  el('key').onclick=()=>{
    if(!compiled)return;
    play(false);
    const timeKey=Math.round(time*fps)/fps,bone=el('bone').value,layer=el('layer').value;
    const rotation=['rx','ry','rz'].map(id=>clamp(Number(el(id).value),-180,180));
    change(p=>{
      p.keys=p.keys.filter(k=>k.bone!==bone||k.layer!==layer||Math.abs(k.time-timeKey)>.001);
      p.keys.push({time:timeKey,bone,layer,rotation});p.keys.sort((a,b)=>a.time-b.time);
    });
  };
  el('removeKey').onclick=()=>{
    if(el('keys').selectedIndex<0)return;
    change(p=>{p.keys.splice(Number(el('keys').value),1)});
  };
  el('save').onclick=()=>{
    try{
      const item=validate({...project,name:el('name').value.trim()||info()});
      const items=saved(),index=items.findIndex(p=>p.name===item.name);
      if(index<0)items.push(item);
      else if(confirm('Заменить сохранённый пресет «'+item.name+'»?'))items[index]=item;
      else return;
      writeSaved(items);syncSaved();report('Пресет сохранён');
    }catch(e){report('Сохранение: '+e.message)}
  };
  el('open').onclick=()=>{
    try{if(el('saved').selectedIndex>=0)choose(validate(saved()[Number(el('saved').value)]))}
    catch(e){report(e.message)}
  };
  el('delete').onclick=()=>{
    if(el('saved').selectedIndex<0)return;
    const items=saved(),index=Number(el('saved').value);
    if(confirm('Удалить пресет «'+items[index].name+'»?')){
      try{items.splice(index,1);writeSaved(items);syncSaved()}
      catch(e){report(e.message)}
    }
  };
  el('export').onclick=()=>exportProject({...project,name:el('name').value.trim()||info()});
  el('import').onclick=()=>el('file').click();
  el('file').onchange=async()=>{
    const files=[...el('file').files];el('file').value='';
    const index=files.findIndex(f=>/\.(json|glb|gltf|fbx|bvh)$/i.test(f.name));
    if(index<0)return;
    const [primary]=files.splice(index,1);
    el('import').disabled=true;
    try{
      report('Адаптация скелета…');
      const item=await importProject([primary,...files],async clips=>{
        if(clips.length===1)return 0;
        const value=prompt(clips.map((clip,i)=>i+1+' · '+clip.name).join('\n'),'1');
        const n=Number(value)-1;
        return Number.isInteger(n)&&n>=0&&n<clips.length?n:null;
      });
      if(item){choose(item);report('Анимация импортирована')}
      else report('Импорт отменён');
    }catch(e){report('Импорт: '+e.message)}
    finally{el('import').disabled=false}
  };
  el('file').accept='.json,.glb,.gltf,.fbx,.bvh,.bin,.png,.webp,.jpg,.jpeg';
  syncSaved();
}
function syncSaved(){el('saved').replaceChildren(...saved().map((item,i)=>option(item?.name||'Пресет '+(i+1),String(i))))}
function setRotation(rotation){['rx','ry','rz'].forEach((axis,i)=>{el(axis).value=rotation[i]})}
function syncKeys(){
  const layer=el('layer').value,bone=el('bone').value;
  el('layerWeight').value=project.layers[layer];
  el('keys').replaceChildren(...project.keys.flatMap((key,i)=>key.bone===bone&&key.layer===layer?[option(key.time.toFixed(3)+' с',String(i))]:[]));
  const here=project.keys.find(k=>k.layer===layer&&k.bone===bone&&Math.abs(k.time-time)<1/(2*fps));
  setRotation(here?.rotation||[0,0,0]);
}
function sync(){
  if(project.id==='imported'){
    if(!el('library').querySelector('[value=imported]'))el('library').add(option('Импортированный клип','imported'));
  }else el('library').querySelector('[value=imported]')?.remove();
  el('library').value=project.id;
  el('style').value=project.style;el('curve').value=project.curve;el('name').value=project.name||'';
  for(const id of ['root','feet','grip','mirror'])el(id).checked=project[id];
  el('blend').value=project.blend;
  for(const [id,{input,out}] of Object.entries(sliders)){input.value=project.params[id]??1;out.value=Number(input.value).toFixed(2)}
  el('sequence').replaceChildren(...project.sequence.map(id=>{
    const item=document.createElement('li');item.textContent=library[id].name;return item;
  }));
  el('undo').disabled=!undo.length;el('redo').disabled=!redo.length;
  syncKeys();
}
function change(edit){
  const next=clone(project);
  edit(next);
  if(JSON.stringify(next)===JSON.stringify(project))return;
  undo.push({project,original});if(undo.length>40)undo.shift();redo=[];
  project=next;rebuild();sync();
}
function choose(next){
  undo.push({project,original});if(undo.length>40)undo.shift();redo=[];
  project=next;original=next.id==='imported'?defaults('imported'):defaults(next.id);
  if(next.id==='imported')original.imported=next.imported;
  play(false);time=0;rebuild();sync();
}
function history(from,to){
  if(!from.length)return;
  to.push({project,original});
  ({project,original}=from.pop());
  rebuild();sync();
}
function rebuild(temporary){
  if(!data)return;
  compiled=compile(temporary||project,data);
  baseline=compile(original,data);
  el('time').max=compiled.duration;
  seek(time);trailDirty=true;
}
function seek(t){
  time=clamp(t,0,compiled?.duration||0);
  el('time').value=time;
  el('clock').textContent=time.toFixed(2)+' / '+(compiled?.duration||0).toFixed(2)+' с';
  poseDirty=true;
}
function play(on){playing=on;el('play').textContent=on?'Пауза':'Пуск'}
function stanceFor(id){
  try{return JSON.parse(localStorage.getItem(id+'StanceCur2')||'{}').x||{}}
  catch{return {}}
}
function settingsFor(item){
  let rigSettings=item.record?.rig;
  if(!rigSettings)try{rigSettings=JSON.parse(localStorage.getItem('duoRig_'+item.id)||'null')}catch{}
  return {height:item.height,map:item.record?.map,stance:stanceFor(item.id),rig:rigSettings};
}
function weaponFor(item,token,activeRig,signal){
  const cfg=settingsFor(item).rig;
  if(!data.sword||cfg?.noWeapon||localStorage.getItem(item.id+'Sword')==='0')return;
  const matrix=data.sword.local;
  weapon(item,signal).then(asset=>{
    if(token!==request||![rig,reference].includes(activeRig)){dispose(asset.scene);return}
    activeRig.attachWeapon(asset,matrix,cfg?.weapon);poseDirty=true;
  }).catch(e=>{if(e.name!=='AbortError')console.warn('Duo editor weapon',e)});
}
async function selectModel(id){
  let item=models.find(m=>m.id===id);
  if(!item)return;
  request?.abort();
  const token=request=new AbortController();
  play(false);report('Загрузка модели…');
  try{
    if(item.custom){
      const [record]=await readStore('chr',id);
      if(!record)throw Error('Пользовательская модель недоступна');
      if(token!==request)return;
      item={...item,record};
    }
    const model=await loadModel(item,token.signal);
    if(token!==request){dispose(model.scene);return}
    const nextData=assets[item.record?.base||id]||assets.morgoth;
    let next;
    try{next=createRig(scene,model,nextData,settingsFor(item))}
    catch(e){dispose(model.scene);throw e}
    rig?.dispose();rig=next;descriptor=item;data=nextData;
    reference?.dispose();reference=null;
    rebuild();weaponFor(item,token,rig,token.signal);
    compare();report('Модель загружена');
  }catch(e){
    if(token!==request)return;
    if(descriptor)el('model').value=descriptor.id;
    report(e.message);
  }
}
async function compare(){
  const token=++comparisonToken;
  if(!el('compare').checked||!descriptor){
    reference?.dispose();reference=null;poseDirty=trailDirty=true;return;
  }
  const item=descriptor,modelRequest=request;
  try{
    const model=await loadModel(item,request.signal);
    if(token!==comparisonToken||modelRequest!==request){dispose(model.scene);return}
    try{reference=createRig(scene,model,data,settingsFor(item))}
    catch(e){dispose(model.scene);throw e}
    weaponFor(item,modelRequest,reference,request.signal);poseDirty=trailDirty=true;
  }catch(e){if(token===comparisonToken&&e.name!=='AbortError'){el('compare').checked=false;report('Сравнение: '+e.message)}}
}
function updateTrails(){
  if(trailGroup){scene.remove(trailGroup);dispose(trailGroup);trailGroup=null}
  if(!el('trails').checked||!rig||!compiled)return;
  trailGroup=new T.Group();
  const tracks=['L_Hand','R_Hand','L_Foot','R_Foot'].map(k=>[rig.mapped[k],[]]);
  const offset=reference?-.85:0;
  for(let i=0;i<=44;i++){
    rig.place(compiled.at(compiled.duration*i/44),project,offset);
    for(const [node,points] of tracks)if(node)points.push(node.getWorldPosition(new T.Vector3()));
  }
  for(const [[,points],color] of tracks.map((v,i)=>[v,[0xe7ad63,0xe96b68,0x70d7a5,0x78b8ed][i]])){
    if(points.length)trailGroup.add(new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color})));
  }
  scene.add(trailGroup);poseDirty=true;
}
function render(now){
  requestAnimationFrame(render);
  const dt=last?Math.min(.05,(now-last)/1000):0;last=now;
  if(document.hidden||!renderer)return;
  if(playing&&compiled){
    const next=time+dt*Number(el('playback').value);
    if(next>=compiled.duration){
      if(compiled.loop)seek(next%compiled.duration);
      else{seek(compiled.duration);play(false)}
    }else seek(next);
  }
  if(trailDirty){trailDirty=false;updateTrails()}
  const moved=controls.update();
  if(!poseDirty&&!moved)return;
  if(poseDirty&&rig){
    const skeleton=el('skeleton').checked;
    rig.helper.visible=skeleton;
    rig.place(compiled.at(time),project,reference?-.85:0);
    if(reference){
      reference.helper.visible=skeleton;
      reference.place(baseline.at(time/compiled.duration*baseline.duration),original,.85);
    }
  }
  poseDirty=false;
  renderer.render(scene,camera);
}
function setupScene(){
  renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.setClearColor(0x26252a);
  renderer.toneMapping=T.ACESFilmicToneMapping;
  scene=new T.Scene();
  const generator=new T.PMREMGenerator(renderer),room=new RoomEnvironment();
  scene.environment=generator.fromScene(room,.04).texture;
  scene.environmentIntensity=.85;room.dispose();generator.dispose();
  scene.add(new T.HemisphereLight(0xffedde,0x526080,2));
  const key=new T.DirectionalLight(0xffe1bf,2.15);key.position.set(-3,6,5);scene.add(key);
  const fill=new T.DirectionalLight(0x98b8ff,1.4);fill.position.set(3,2,-4);scene.add(fill);
  const grid=new T.GridHelper(20,40,0x777175,0x454249);grid.position.y=-.005;scene.add(grid);
  const viewport=el('viewport');viewport.append(renderer.domElement);
  camera=new T.PerspectiveCamera(38,1,.02,90);camera.position.set(3,2.2,4.8);
  controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,1,0);
  controls.enableDamping=true;controls.maxDistance=24;controls.minDistance=1.2;controls.update();
  new ResizeObserver(()=>{
    const w=viewport.clientWidth,h=viewport.clientHeight;
    if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();poseDirty=true}
  }).observe(viewport);
  requestAnimationFrame(render);
}
async function init(){
  setupControls();sync();setupScene();
  const response=await fetch('../');
  if(!response.ok)throw Error('Анимации Duo недоступны');
  const source=new DOMParser().parseFromString(await response.text(),'text/html');
  assets=Object.fromEntries(builtins.map(({id})=>[id,JSON.parse(source.getElementById('animdata_'+id).textContent)]));
  el('model').replaceChildren(...models.map(m=>option(m.name,m.id)));
  const custom=readStore('chr');
  await selectModel('morgoth');
  const selected=el('model').value;
  models=[...builtins,...(await custom).filter(r=>r?.id&&r.name).map(r=>({id:r.id,name:r.name,height:r.h||1.9,custom:true}))];
  el('model').replaceChildren(...models.map(m=>option(m.name,m.id)));el('model').value=selected;
}
init().catch(e=>report(e.message));
