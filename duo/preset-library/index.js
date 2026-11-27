import {crc32,extract,readArchive} from './archive.js';
import {cacheName,cacheURL,list,load,modelURL,put,readClip,saveFile,storeClip,transaction} from './store.js';

const source='https://www.rokoko.com/resources/download-263-rokoko-motion-capture-assets';
const catalogURL=new URL('./rokoko-catalog.json',import.meta.url).href;
const mb=n=>new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(n/1048576)+' МБ';
const raw=id=>{try{return JSON.parse(localStorage.getItem(id)||'null')}catch{return null}};
const names={morgoth:'Моргот',knight:'Серебряный рыцарь'};
const modelSizes={"morgoth_lite.glb":2607272,"sword_knight_lite.glb":2122128,"sword_knight.glb":2918380,"morgoth.glb":5369188,"sword_morgoth.glb":1371472,"knight_lite.glb":2840164,"sword_morgoth_lite.glb":748820,"knight.glb":5530212};
const kClip=(entry,variant,target)=>JSON.stringify(['r1',entry.id,variant.crc,target.key]);
let catalog,archive,context,layout,cached=new Set(),prior=new Set(),importedIds=new Set(),localModels=new Set(),running=false;
let dialog,results,status,search,category,folder,type,pack,packButton,selectedButton,setupPromise;
const filesByPath=new Map(),localEntries=new Map(),selected=new Set();
let catalogFiles;
const savedLocalEntries=new Map();
let inventory=[],refresh=0,packRunning=false,stopPack=false;
let progress,preview,previewViewport,previewRequest,connectedOnly,connectedLabel;

const element=(tag,text,attr={})=>{
  const e=document.createElement(tag);Object.assign(e,attr);if(text)e.textContent=text;return e;
};
function button(text,fn){
  return element('button',text,{type:'button',onclick:()=>run(fn)});
}
const say=message=>{status.textContent=message};
function setOptions(select,values,first){
  const value=select.value;
  select.replaceChildren(new Option(first,''),...values.map(x=>new Option(x,x)));
  if(values.includes(value))select.value=value;
}
function build(){
  dialog=element('dialog','',{ariaLabel:'Мои пресеты'});
  dialog.style.cssText='color:#eee;background:#202227;border:1px solid #56525b;border-radius:12px;width:min(950px,94vw);max-height:87dvh;padding:14px;box-sizing:border-box';
  const title=element('h2','Мои пресеты');
  title.style.margin='0';
  const close=element('button','Закрыть',{type:'button',onclick:()=>dialog.close()});
  dialog.addEventListener('close',()=>{stopPack=true;closePreview()});
  close.style.float='right';
  status=element('p','',{role:'status'});
  search=element('input','',{type:'search',placeholder:'Поиск по названию',ariaLabel:'Поиск по названию'});
  search.style.cssText='color:inherit;background:#15161a;font:inherit;border:1px solid #555;border-radius:6px;padding:7px;min-height:42px;max-width:100%';
  search.oninput=render;
  type=element('select','',{ariaLabel:'Тип ресурса'});
  type.onchange=()=>{setCategories();render()};
  category=element('select','',{ariaLabel:'Категория',onchange:render});
  connectedOnly=element('input','',{type:'checkbox',onchange:render});
  connectedLabel=element('label','',{hidden:true});
  connectedLabel.append(connectedOnly,document.createTextNode('Только подключённые'));
  folder=element('select','',{ariaLabel:'Папка',onchange:render});
  const importInput=element('input','',{type:'file',accept:'.zip,application/zip',hidden:true});
  importInput.onchange=()=>run(async()=>{
    const file=importInput.files[0];importInput.value='';
    if(!file)return;
    const next=await readArchive(file);
    const found=catalog.entries.filter(e=>e.variants.some(v=>next.entries.get(v.path)?.crc===v.crc)).length;
    if(!found)throw Error('Архив не совпадает с каталогом Rokoko');
    archive=next;showRokoko();
    say('Архив подключён · '+found+' записей · '+mb(file.size));
  });
  const importButton=button('Подключить ZIP Rokoko',()=>importInput.click());
  const files=element('input','',{type:'file',multiple:true,hidden:true,ariaLabel:'Файлы FBX'});
  const directory=element('input','',{type:'file',multiple:true,hidden:true,ariaLabel:'Папка с FBX'});
  directory.setAttribute('webkitdirectory','');
  for(const input of [files,directory])input.onchange=()=>run(async()=>{
    const picked=[...input.files];input.value='';
    if(!picked.length)return;
    connectFiles(picked);
    if(input===files&&picked.length===1&&context?.target){
      const entry=allEntries().find(e=>!e.face&&e.variants.some(v=>filesByPath.get(v.path)===picked[0]));
      if(entry)await saveClip(entry);
    }
  });
  const fileButton=button('Выбрать FBX',()=>files.click());
  const folderButton=button('Выбрать папку с FBX',()=>directory.webkitdirectory?directory.click():say('Этот браузер открывает только отдельные файлы. Нажми «Выбрать FBX».'));
  selectedButton=button('Добавить выбранные',()=>savePack(true));
  packButton=button('Сохранить пак офлайн',()=>savePack(false));
  const addFolder=button('Новая папка',async()=>{
    const name=prompt('Название папки')?.trim().slice(0,60);
    if(!name||layout.folders.includes(name))return;
    const next={...layout,folders:[...layout.folders,name]};
    await put('layout','state',next);layout=next;resetFolders();folder.value=name;render();
  });
  const vendor=element('a','Скачать ZIP у Rokoko',{href:source,target:'_blank',rel:'noopener noreferrer'});
  vendor.style.color='#ffb77c';
  const controls=element('div','',{className:'row'});
  controls.append(search,type,category,folder,connectedLabel,addFolder);
  pack=element('div','',{className:'row'});
  progress=element('progress','',{hidden:true,ariaLabel:'Загрузка'});
  pack.append(vendor,importButton,folderButton,fileButton,selectedButton,packButton,progress);
  results=element('section','',{ariaLabel:'Ресурсы'});
  preview=element('section','',{hidden:true,ariaLabel:'Предпросмотр 3D'});
  previewViewport=element('div');previewViewport.style.height='min(36dvh,360px)';
  preview.append(element('button','Закрыть предпросмотр',{type:'button',onclick:closePreview}),previewViewport);
  dialog.append(close,title,status,controls,pack,importInput,files,directory,preview,results);
  document.body.append(dialog);
}
function closePreview(){
  previewRequest?.abort();previewRequest=null;
  if(preview)preview.hidden=true;
}
async function previewModel(row){
  closePreview();
  const request=previewRequest=new AbortController();
  try{
    const {showModel}=await import('./model-preview.js');
    const bytes=await row.preview();
    if(request.signal.aborted)return;
    preview.hidden=false;
    await showModel(previewViewport,bytes,row.kind==='Риги и скелеты',request.signal);
    if(!request.signal.aborted)preview.scrollIntoView({block:'nearest'});
  }catch(error){
    if(!request.signal.aborted){closePreview();throw error}
  }
}
function resetFolders(){setOptions(folder,layout.folders,'Все папки')}
const allEntries=()=>[...catalog.entries,...localEntries.values()];
function showRokoko(){
  type.value='Анимации';
  search.value='';folder.value='';category.value='';connectedOnly.checked=true;
}
function connectFiles(picked){
  const fbx=picked.filter(file=>/\.fbx$/i.test(file.name));
  if(!fbx.length)throw Error('В выбранных файлах нет FBX');
  for(const file of fbx){
    const path=file.webkitRelativePath||file.name;
    const matching=catalogFiles.get(file.name.toLowerCase())?.filter(v=>v.size===file.size)||[];
    const known=matching.find(v=>path.endsWith('/'+v.path)||path===v.path)
      || (matching.every(v=>v.crc===matching[0]?.crc)?matching[0]:null);
    if(known){filesByPath.set(known.path,file);continue}
    const id='local:'+JSON.stringify([path,file.size,file.lastModified]);
    if(!localEntries.has(id))localEntries.set(id,{
      id,name:file.name.replace(/\.fbx$/i,''),category:'Мои FBX',local:true,
      variants:[{path:id,rig:'FBX',size:file.size,crc:id}],
    });
    filesByPath.set(id,file);
  }
  showRokoko();
  say('Подключено FBX: '+fbx.length+' · отметь нужные движения галочками');
}
function setCategories(){
  setOptions(category,type.value==='Анимации'?[...new Set((catalog?allEntries():[]).map(e=>e.category))]:[],'Все категории');
  category.hidden=connectedLabel.hidden=type.value!=='Анимации';
}
async function setup(){
  const response=fetch(catalogURL).then(async response=>{
    if(!response.ok)throw Error('Каталог Rokoko недоступен');
    const cache=await caches.open(cacheName);
    await cache.put(catalogURL,response.clone());
    return response;
  }).catch(async e=>{
    const cached=await (await caches.open(cacheName)).match(catalogURL);
    if(!cached)throw e;
    return cached;
  });
  const [fresh,old,local]=await Promise.all([response,load('layout','state'),load('layout','local-fbx')]);
  catalog=await fresh.json();
  catalogFiles=new Map();
  for(const entry of catalog.entries)for(const variant of entry.variants){
    const name=variant.path.split('/').pop().toLowerCase();
    if(!catalogFiles.has(name))catalogFiles.set(name,[]);
    catalogFiles.get(name).push(variant);
  }
  for(const entry of local||[]){
    localEntries.set(entry.id,entry);
    savedLocalEntries.set(entry.id,entry);
  }
  layout=old||{folders:[],assignments:{}};
}
function ensureCatalog(){
  return setupPromise??=setup().catch(e=>{setupPromise=null;throw e});
}
function clipRecord(key){
  try{
    const [version,id,,target]=JSON.parse(key);
    if(version==='r1'&&typeof id==='string'&&typeof target==='string')return {id,target};
  }catch{}
}
export async function listImported(target){
  const keys=await list('clips');
  if(!keys.some(key=>clipRecord(key)?.target===target.key))return [];
  await ensureCatalog();
  const stored=new Set(keys);
  return allEntries().flatMap(entry=>{
    const key=entry.variants.map(v=>kClip(entry,v,target)).find(k=>stored.has(k));
    return key?[{id:entry.id,name:entry.name,key}]:[];
  });
}
export {readClip};
export async function deleteImported(id){
  const keys=(await list('clips')).filter(key=>clipRecord(key)?.id===id);
  if(keys.length)await transaction('clips','readwrite',store=>{
    let request;
    for(const key of keys)request=store.delete(key);
    return request;
  });
  for(const key of keys)cached.delete(key);
  const entry=allEntries().find(e=>e.id===id);
  if(entry)for(const v of entry.variants)filesByPath.delete(v.path);
  selected.delete(id);
  importedIds.delete(id);
  if(savedLocalEntries.has(id)){
    const next=[...savedLocalEntries.values()].filter(e=>e.id!==id);
    await put('layout','local-fbx',next);
    savedLocalEntries.delete(id);
  }
  localEntries.delete(id);
}
export async function open(options={}){
  context=options;
  if(!dialog)build();
  if(!dialog.open)dialog.showModal();
  say('Загрузка каталога…');
  try{
    await ensureCatalog();
    resetFolders();
    await reload();
    say('Импорт анимаций · FBX, папка или ZIP');
  }catch(e){say(e.message)}
}
async function reload(){
  const version=++refresh;
  const cache=await caches.open(cacheName);
  const [characters,weapons,keys,urls]=await Promise.all([DS.chrList(),DS.wpnList(),list('clips'),cache.keys()]);
  if(version!==refresh)return;
  cached=new Set(keys);
  const records=keys.map(clipRecord).filter(Boolean);
  prior=new Set(records.map(({id,target})=>target+':'+id));
  importedIds=new Set(records.map(({id})=>id));
  localModels=new Set(urls.map(r=>r.url));
  inventory=makeInventory(characters,weapons);
  setOptions(type,[...new Set(inventory.map(row=>row.kind))],'Все ресурсы');
  setCategories();render();
}
function presetRows(id,label){
  return (raw(id+'Presets')||[]).filter(p=>p?.id&&p.data).map(p=>({
    id:'preset:'+id+':'+p.id,kind:'Пользовательские пресеты',name:p.name,description:label,writable:!p.lock,
    export:()=>saveFile(p.name+'.json',JSON.stringify(p.data)),
    apply:context?.owner===id&&context.openPreset?()=>context.openPreset(p.id):context?.openClip?async()=>{
      const data=p.data.mocap?await adaptPreset(p.data):p.data;
      context.openClip(data);
    }:null,
    rename:name=>editPreset(id,p.id,name),delete:()=>editPreset(id,p.id,null),
  }));
}
async function adaptPreset(data){
  const {adaptEditedClip}=await import('./retarget.js');
  return adaptEditedClip(data,context.target);
}
function editPreset(owner,id,name){
  if(context?.owner===owner&&context.editPreset)return context.editPreset(id,name);
  const key=owner+'Presets',entries=raw(key)||[];
  const p=entries.find(p=>p.id===id);
  if(!p||p.lock)throw Error('Пресет защищён');
  if(name){p.name=name;p.data.name=name}
  else entries.splice(entries.indexOf(p),1);
  localStorage.setItem(key,JSON.stringify(entries));
}
function makeInventory(characters,weapons){
  const out=[];
  for(const [id,label] of Object.entries(names)){
    const url=modelURL(id),sword=modelURL('sword_'+id),dependencies=[url,sword,modelURL(id+'_lite'),modelURL('sword_'+id+'_lite')];
    out.push({
      id:'fighter:'+id,name:label,kind:'Персонажи',urls:dependencies,
      download:()=>downloadURLs(dependencies),preview:()=>modelBytes(url),description:'Встроенный боец · модель и оружие',
    },binary('mesh:'+id,label,'3D-модели',url),binary('sword:'+id,'Меч · '+label,'Оружие',sword),{
      id:'rig:'+id,name:label,kind:'Риги и скелеты',preview:()=>modelBytes(url),description:'Костная карта GLB и настройки рига',
      export:()=>saveFile(id+'-rig.json',JSON.stringify({base:id,model:id+'.glb',rig:raw('duoRig_'+id)})),
    });
    const data=JSON.parse(document.getElementById('animdata_'+id).textContent);
    for(const [key,value] of Object.entries(data)){
      if(!Array.isArray(value?.keys))continue;
      const name=value.name||key;
      out.push({id:'animation:'+id+':'+key,name,kind:'Анимации',description:label+' · '+value.duration.toFixed(2)+' с',
        export:()=>saveFile(name+'.json',JSON.stringify(value)),
        apply:context?.openClip?()=>context.openClip(value):null});
    }
  }
  for(const item of characters){
    const file=async()=>{const r=await DS.chrGet(item.id);if(!r)throw Error('Модель недоступна');return r};
    const bytes=async()=>DS.recBuf(await file());
    // Keep model and rig as views of the same record.
    out.push({id:'custom:'+item.id,name:item.name,kind:'Персонажи',preview:bytes,description:'Пользовательская модель и риг',writable:true,
      export:async()=>{const r=await file();saveFile(r.name+'.glb',await DS.recBuf(r),'model/gltf-binary')},
      rename:async name=>{const r=await file();r.name=name;await DS.chrPut(r);await globalThis.duoRefreshCharacters?.()},
      delete:async()=>{if(context?.owner===item.id)throw Error('Закрой редактор этого персонажа перед удалением');await DS.chrDel(item.id);await globalThis.duoRefreshCharacters?.()},
    },{id:'custommesh:'+item.id,name:item.name,kind:'3D-модели',preview:bytes,description:'Геометрия пользовательского персонажа',
      export:async()=>{const r=await file();saveFile(r.name+'.glb',await DS.recBuf(r),'model/gltf-binary')},
    },{id:'customrig:'+item.id,name:item.name,kind:'Риги и скелеты',preview:bytes,description:'Настройки и сопоставление костей',
      export:async()=>{const r=await file();saveFile(r.name+'-rig.json',JSON.stringify({map:r.map,rig:r.rig,base:r.base}))},
    });
  }
  for(const item of weapons){
    const file=async()=>{const r=await DS.wpnGet(item.id);if(!r)throw Error('Оружие недоступно');return r};
    out.push({id:'userweapon:'+item.id,name:item.name,kind:'Оружие',description:'Пользовательский GLB',preview:async()=>DS.recBuf(await file()),writable:true,
      export:async()=>{const r=await file();saveFile(r.name+'.glb',await DS.recBuf(r),'model/gltf-binary')},
      rename:async name=>{const r=await file();r.name=name;await DS.wpnPut(r)},
      delete:()=>DS.wpnDel(item.id),
    });
  }
  for(const [id,label] of [...Object.entries(names),...characters.map(c=>[c.id,c.name])])out.push(...presetRows(id,label));
  for(const entry of allEntries()){
    if(!variantFor(entry)&&!importedIds.has(entry.id))continue;
    const v=entry.variants[0];
    out.push({id:'rokoko:'+entry.id,name:entry.name,kind:'Анимации',category:entry.category,
      description:entry.category+' · '+v.rig+' · '+mb(v.size),
      entry,state:()=>clipState(entry),download:context?.target&&!entry.face&&variantFor(entry)?()=>saveClip(entry):null,
      apply:context?.target&&!entry.face&&(variantFor(entry)||clipState(entry)==='Доступен офлайн')
        ?async()=>context.openClip(await saveClip(entry)):null,
      clear:importedIds.has(entry.id)?()=>clearClip(entry):null});
  }
  return out;
}
async function modelBytes(url){return (await cacheURL(url)).arrayBuffer()}
function binary(id,name,kind,url){
  const bytes=modelSizes[new URL(url).pathname.split('/').pop()];
  return {id,name,kind,description:bytes?mb(bytes):'',urls:[url],preview:()=>modelBytes(url),download:()=>downloadURLs([url]),
    export:async()=>saveFile(name+'.glb',await (await cacheURL(url)).arrayBuffer(),'model/gltf-binary')};
}
async function downloadURLs(urls){
  for(const [i,url] of urls.entries()){
    say('Скачивается · '+(i+1)+' / '+urls.length);
    await cacheURL(url);
  }
  say('Доступен офлайн');
}
function connected(variant){
  return filesByPath.has(variant.path)||archive?.entries.get(variant.path)?.crc===variant.crc;
}
function variantFor(entry){return entry.variants.find(connected)}
async function inputBytes(variant){
  const file=filesByPath.get(variant.path);
  if(!file)return extract(archive,variant);
  if(file.size>96*1024*1024)throw Error('FBX слишком велик');
  const bytes=await file.arrayBuffer();
  if(typeof variant.crc==='number'&&crc32(new Uint8Array(bytes))!==variant.crc){
    if(archive?.entries.get(variant.path)?.crc===variant.crc)return extract(archive,variant);
    throw Error('FBX отличается от оригинала Rokoko: '+file.name);
  }
  return bytes;
}
function clipState(entry){
  if(entry.face)return 'Лицевая дорожка · нужен лицевой риг';
  if(!context?.target)return importedIds.has(entry.id)?'Доступен офлайн':'Выбери персонажа в редакторе';
  if(entry.variants.some(v=>cached.has(kClip(entry,v,context.target))))return 'Доступен офлайн';
  if(prior.has(context.target.key+':'+entry.id))return 'Доступно обновление';
  return importedIds.has(entry.id)&&!variantFor(entry)?'Импортировано для другого персонажа':'Не скачан';
}
async function saveClip(entry){
  const target=context.target;
  if(!target)throw Error('Открой редактор персонажа');
  for(const v of entry.variants){
    const key=kClip(entry,v,target);
    if(cached.has(key)){
      const saved=await readClip(key);
      if(saved){selected.delete(entry.id);return saved;}
      cached.delete(key);
    }
  }
  if(!packRunning)say('Импортируется · '+entry.name);
  let failure;
  for(const v of entry.variants.filter(connected)){
    try{
      const {retarget}=await import('./retarget.js');
      const anim=await retarget(await inputBytes(v),entry.name,target);
      const key=kClip(entry,v,target);
      if(entry.local&&!savedLocalEntries.has(entry.id)){
        const next=new Map(savedLocalEntries).set(entry.id,entry);
        await put('layout','local-fbx',[...next.values()]);
        savedLocalEntries.set(entry.id,entry);
      }
      await storeClip(key,anim);cached.add(key);selected.delete(entry.id);
      if(!packRunning)say('Доступен офлайн · '+entry.name);
      return anim;
    }catch(e){failure=e}
  }
  throw failure||Error('Подключи ZIP, папку или файл FBX для этого движения');
}
async function clearClip(entry){
  if(!confirm('Удалить импорт «'+entry.name+'» из игры? Сохранённые пресеты останутся.'))return;
  await deleteImported(entry.id);
  say('Импорт удалён');
}
async function savePack(onlySelected){
  if(!context?.target)throw Error('Открой редактор персонажа');
  const entries=onlySelected?allEntries().filter(entry=>selected.has(entry.id)):catalog.entries;
  const pending=entries.filter(e=>!e.face&&clipState(e)!=='Доступен офлайн'&&variantFor(e));
  if(!pending.length){say('Подключи файлы и отметь движения для импорта');return}
  const size=pending.reduce((n,e)=>n+variantFor(e).size,0);
  const quota=await navigator.storage?.estimate?.();
  if(quota?.quota&&quota.quota-quota.usage<16*1048576)throw Error('В браузере осталось мало места');
  if(!confirm('Подготовить '+pending.length+' движений · '+mb(size)+' исходных FBX?'))return;
  let success=0;const failed=[];
  packRunning=true;stopPack=false;progress.max=pending.length;progress.value=0;progress.hidden=false;
  try{
    for(const [i,entry] of pending.entries()){
      if(stopPack)break;
      say('Скачивается пак · '+(i+1)+' / '+pending.length+' · '+entry.name);
      await new Promise(resolve=>setTimeout(resolve,0));
      try{await saveClip(entry);success++}
      catch(e){failed.push(entry.name+': '+e.message);if(e.name==='QuotaExceededError')break}
      progress.value=i+1;
    }
  }finally{packRunning=false;progress.hidden=true}
  say('Сохранено '+success+' / '+pending.length+(failed.length?' · '+failed.slice(0,2).join(' · '):''));
}
function render(){
  if(!catalog||!layout)return;
  const term=search.value.trim().toLocaleLowerCase(),group=type.value,cat=category.value,dir=folder.value;
  const connectedFilter=group==='Анимации'&&connectedOnly.checked;
  const rows=inventory.filter(row=>(!group||row.kind===group)&&(!cat||cat===row.category)
    &&(!dir||layout.assignments[row.id]===dir)&&(!connectedFilter||row.entry&&variantFor(row.entry))
    &&row.name.toLocaleLowerCase().includes(term));
  const list=element('div');
  let limit=50;
  const more=element('button','Показать ещё',{type:'button',onclick:()=>{limit+=50;show()}});
  function show(){
    const nodes=rows.slice(0,limit).map(row=>{
      const tile=element('article');tile.style.cssText='padding:8px 0;border-bottom:1px solid #45454c';
      const entry=row.entry;
      if(context?.target&&entry&&!entry.face&&variantFor(entry)&&clipState(entry)!=='Доступен офлайн'){
        const check=element('input','',{type:'checkbox',checked:selected.has(entry.id),disabled:running});
        check.onchange=()=>{
          if(check.checked)selected.add(entry.id);else selected.delete(entry.id);
          updateImportButtons();
        };
        const label=element('label');label.append(check,element('b',row.name));tile.append(label);
      }else tile.append(element('b',row.name));
      const state=row.state?.()||(row.urls?(row.urls.every(url=>localModels.has(url))?'Доступен офлайн':'Не скачан'):'Доступен офлайн');
      tile.append(element('div',[row.kind,row.description,state,layout.assignments[row.id]].filter(Boolean).join(' · ')));
      const actions=element('div','',{className:'row'});
      if(row.apply)actions.append(button(row.kind==='Паки анимаций'?'Открыть пак':'Открыть движение',async()=>{
        await row.apply();if(row.kind!=='Паки анимаций')dialog.close();
      }));
      if(row.preview)actions.append(button('Предпросмотр',()=>previewModel(row)));
      if(row.download&&state!=='Доступен офлайн')actions.append(button('Скачать офлайн',row.download));
      if(row.export)actions.append(button('Скачать файл',row.export));
      if(layout.folders.length)actions.append(button('В папку',async()=>{
        const name=prompt('Название папки. Пустое поле убирает ресурс из папки.\n'+layout.folders.join(', '),layout.assignments[row.id]||'');
        if(name===null||name&&!layout.folders.includes(name))return;
        const assignments={...layout.assignments};
        if(name)assignments[row.id]=name;else delete assignments[row.id];
        const next={...layout,assignments};await put('layout','state',next);layout=next;
      }));
      if(row.writable){
        actions.append(button('Переименовать',async()=>{const n=prompt('Новое название',row.name)?.trim().slice(0,80);if(n)await row.rename(n)}));
        actions.append(button('Удалить',async()=>{if(confirm('Удалить «'+row.name+'»?'))await row.delete()}));
      }
      if(row.clear)actions.append(button('Удалить импорт',row.clear));
      tile.append(actions);return tile;
    });
    const body=[];
    let previous=null;
    for(const [i,node] of nodes.entries()){
      const name=rows[i].category;
      if(group==='Анимации'&&name&&name!==previous){body.push(element('h3',name));previous=name}
      body.push(node);
    }
    list.replaceChildren(element('div','Ресурсов: '+rows.length),...body);
    if(limit<rows.length)list.append(more);
  }
  show();results.replaceChildren(list);
  updateImportButtons();
}
function updateImportButtons(){
  if(!packButton)return;
  packButton.disabled=!context?.target||running||!catalog?.entries.some(e=>!e.face&&variantFor(e));
  selectedButton.disabled=!context?.target||running||!selected.size;
  selectedButton.textContent='Добавить выбранные'+(selected.size?' ('+selected.size+')':'');
}
async function run(fn){
  if(running)return;
  running=true;updateImportButtons();
  try{await fn();await reload();await context?.onImportsChanged?.()}
  catch(e){say(e.message)}
  finally{running=false;render()}
}
