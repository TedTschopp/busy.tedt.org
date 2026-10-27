import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, sha256 } from './catalog-lib.mjs';
import AdmZip from 'adm-zip';
const dist = path.join(ROOT,'dist');
const apps = readJson(path.join(dist,'apps.json')).apps;
for (const app of apps) {
  const html = readFileSync(path.join(dist,app.url,'index.html'),'utf8');
  for (const field of ['rel="canonical"','og:image','twitter:card','data-trust-ack','Download Complete App']) if (!html.includes(field)) throw new Error(`${app.id}: missing ${field}`);
  if (!html.includes(`https://busy.tedt.org${app.url}`)) throw new Error(`${app.id}: wrong canonical`);
  const zipBytes = readFileSync(path.join(dist,app.downloadUrl));
  if (sha256(zipBytes)!==app.zipSha256) throw new Error(`${app.id}: ZIP hash mismatch`);
  const zip = new AdmZip(zipBytes);
  if (zip.getEntries().length!==app.files.length) throw new Error(`${app.id}: incomplete ZIP`);
  for (const file of app.files) {
    const bytes = readFileSync(path.join(dist,decodeURIComponent(file.url)));
    if (sha256(bytes)!==file.sha256 || sha256(zip.readFile(file.path))!==file.sha256) throw new Error(`${app.id}: file mismatch ${file.path}`);
  }
  for (const preview of [app.preview,app.stillPreview]) if (!existsSync(path.join(dist,preview))) throw new Error(`Missing preview: ${preview}`);
}
for (const route of ['index.html','ideas/index.html','contributors/index.html','submit/index.html','about/index.html','404.html','sitemap.xml','robots.txt','social/catalog.jpg','CNAME']) if (!existsSync(path.join(dist,route))) throw new Error(`Missing route: ${route}`);
console.log(`Verified ${apps.length} pages, exact ZIPs, individual files, metadata, and public routes.`);
