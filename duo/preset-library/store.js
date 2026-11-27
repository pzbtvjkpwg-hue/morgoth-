export const cacheName='duo-cache';
const stores=['clips','layout'];
let ready;
function db() {
  return ready??=new Promise((resolve,reject)=>{
    const r=indexedDB.open('duoPresetLibrary',1);
    r.onupgradeneeded=()=>{for(const name of stores)r.result.createObjectStore(name)};
    r.onsuccess=()=>{
      r.result.onversionchange=()=>{r.result.close();ready=null};
      r.result.onclose=()=>{ready=null};
      resolve(r.result);
    };
    r.onerror=()=>reject(r.error);
  }).catch(e=>{ready=null;throw e});
}
export async function transaction(store,mode,operation) {
  const connection=await db();
  return new Promise((resolve,reject)=>{
    const t=connection.transaction(store,mode),r=operation(t.objectStore(store));
    t.oncomplete=()=>resolve(r.result);
    t.onabort=t.onerror=()=>reject(t.error||r.error||Error('Ошибка локального хранилища'));
  });
}
export const load=(store,key)=>transaction(store,'readonly',s=>s.get(key));
export const list=store=>transaction(store,'readonly',s=>s.getAllKeys());
export const put=(store,key,value)=>transaction(store,'readwrite',s=>s.put(value,key));
export const remove=(store,key)=>transaction(store,'readwrite',s=>s.delete(key));

export function saveFile(name,data,type='application/json') {
  const a=document.createElement('a');
  a.download=name;
  a.href=URL.createObjectURL(new Blob([data],{type}));
  document.body.append(a);
  a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),60000);
}
export const modelURL=id=>new URL('../'+id+'.glb?v=8e4254d1',import.meta.url).href;
export async function cacheURL(url) {
  const cache=await caches.open(cacheName);
  const saved=await cache.match(url);
  if(saved)return saved;
  const response=await fetch(url);
  if(!response.ok)throw Error('Ресурс недоступен · '+response.status);
  await cache.put(url,response.clone());
  return response;
}

export async function storeClip(key,clip) {
  if(!globalThis.CompressionStream||!globalThis.DecompressionStream)return put('clips',key,clip);
  const json=new Blob([JSON.stringify(clip)]);
  const gzip=await new Response(json.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return put('clips',key,{gzip});
}
export async function readClip(key) {
  const record=await load('clips',key);
  if(!record?.gzip)return record;
  const raw=new Blob([record.gzip]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(raw).json();
}
