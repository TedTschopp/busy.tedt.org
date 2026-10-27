import AdmZip from 'adm-zip';
export function deterministicZip(records) {
  const zip = new AdmZip();
  for (const f of [...records].sort((a,b)=>a.path.localeCompare(b.path,'en'))) {
    zip.addFile(f.path,f.bytes);
    const entry=zip.getEntry(f.path);
    entry.header.time=new Date(1980,0,1,0,0,0);
    entry.attr=0x81a40000;
  }
  return zip.toBuffer();
}
