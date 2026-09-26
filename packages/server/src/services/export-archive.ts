import { deflateRawSync } from 'node:zlib';

function crc32(data:Buffer):number {
  let crc=0xffffffff;
  for(const byte of data){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}

/** Creates a standards-compliant single-file ZIP without writing private data to disk. */
export function createJsonZip(fileName:string,json:string):Buffer {
  const name=Buffer.from(fileName.replace(/[^a-zA-Z0-9._-]/g,'_'),'utf8');
  const raw=Buffer.from(json,'utf8'),compressed=deflateRawSync(raw),crc=crc32(raw);
  const local=Buffer.alloc(30+name.length);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(8,8);
  local.writeUInt16LE(0,10);local.writeUInt16LE(0,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);name.copy(local,30);
  const central=Buffer.alloc(46+name.length);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0,8);central.writeUInt16LE(8,10);
  central.writeUInt16LE(0,12);central.writeUInt16LE(0,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(raw.length,24);
  central.writeUInt16LE(name.length,28);central.writeUInt16LE(0,30);central.writeUInt16LE(0,32);central.writeUInt16LE(0,34);central.writeUInt16LE(0,36);central.writeUInt32LE(0,38);central.writeUInt32LE(0,42);name.copy(central,46);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(local.length+compressed.length,16);end.writeUInt16LE(0,20);
  return Buffer.concat([local,compressed,central,end]);
}
