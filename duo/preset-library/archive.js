const utf8=new TextDecoder();
const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
async function bytes(file,start,end) {
  return new Uint8Array(await file.slice(start,end).arrayBuffer());
}
export async function readArchive(file) {
  const tail=await bytes(file,Math.max(0,file.size-65557),file.size);
  const end=view(tail);
  let i=tail.length-22;
  for(;i>=0;i--)if(end.getUint32(i,true)===0x06054b50&&i+22+end.getUint16(i+20,true)===tail.length)break;
  if(i<0||end.getUint16(i+4,true)!==0||end.getUint16(i+6,true)!==0)throw Error('Выбери обычный ZIP-архив Rokoko');
  const count=end.getUint16(i+10,true),size=end.getUint32(i+12,true),offset=end.getUint32(i+16,true);
  if(count===65535||size>4*1024*1024||offset+size>file.size)throw Error('Формат каталога ZIP не поддерживается');
  const directory=await bytes(file,offset,offset+size),d=view(directory),entries=new Map();
  for(let at=0,n=0;n<count;n++){
    if(at+46>directory.length||d.getUint32(at,true)!==0x02014b50)throw Error('Повреждён каталог ZIP');
    const length=d.getUint16(at+28,true),next=at+46+length+d.getUint16(at+30,true)+d.getUint16(at+32,true);
    if(next>directory.length)throw Error('Повреждено имя файла в ZIP');
    const path=utf8.decode(directory.subarray(at+46,at+46+length));
    entries.set(path,{size:d.getUint32(at+24,true),packed:d.getUint32(at+20,true),crc:d.getUint32(at+16,true),offset:d.getUint32(at+42,true),method:d.getUint16(at+10,true),flags:d.getUint16(at+8,true)});
    at=next;
  }
  return {file,entries};
}
const table=Uint32Array.from({length:256},(_,i)=>{
  for(let bit=0;bit<8;bit++)i=(i>>>1)^((i&1)?0xedb88320:0);
  return i;
});
function crc32(data) {
  let crc=0xffffffff;
  for(const value of data)crc=(crc>>>8)^table[(crc^value)&255];
  return (crc^0xffffffff)>>>0;
}
export async function extract(archive,variant) {
  const {file,entries}=archive,entry=entries.get(variant.path);
  if(!entry||entry.crc!==variant.crc||entry.size!==variant.size)throw Error('Этот файл не совпадает с каталогом Rokoko');
  if((entry.flags&1)||entry.size>96*1024*1024||entry.packed>96*1024*1024)throw Error('Файл зашифрован или слишком велик');
  const header=view(await bytes(file,entry.offset,entry.offset+30));
  if(header.byteLength!==30||header.getUint32(0,true)!==0x04034b50)throw Error('Повреждён заголовок файла');
  const start=entry.offset+30+header.getUint16(26,true)+header.getUint16(28,true);
  if(start+entry.packed>file.size)throw Error('Архив обрезан');
  let data=await bytes(file,start,start+entry.packed);
  if(entry.method===8){
    const {inflateSync}=await import('three/addons/libs/fflate.module.js');
    data=inflateSync(data,{out:new Uint8Array(entry.size)});
  }else if(entry.method!==0)throw Error('Метод упаковки ZIP не поддерживается');
  if(data.byteLength!==entry.size||crc32(data)!==entry.crc)throw Error('Контрольная сумма ZIP не совпадает');
  return data.buffer;
}
