import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { ROOT, SOURCES, inspectApp, readJson, sha256, encodePath, authorSlug } from './catalog-lib.mjs';
import { deterministicZip } from './zip.mjs';

const write = (file, data) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, data); };
const state = readJson(path.join(ROOT, 'src/data/import-state.json'), { apps: {} });
const community = readJson(path.join(ROOT, 'src/data/community.json'), { apps: {}, ideas: [] });
const downloads = readJson(path.join(ROOT, 'src/data/downloads.json'), {});
const apps = [];
const check = process.argv.includes('--check');
if (!check) for (const folder of ['public/downloads', 'public/previews']) rmSync(path.join(ROOT, folder), { recursive: true, force: true });

for (const source of SOURCES) {
  const base = path.join(ROOT, 'apps', source);
  if (!existsSync(base)) continue;
  for (const slug of readdirSync(base).filter(n => !n.startsWith('.')).sort()) {
    const dir = path.join(base, slug);
    const { manifest, records, contentHash } = inspectApp(dir, slug);
    if (source === 'community' && !records.some(f=>f.path==='LICENSES/UPSTREAM-MIT.txt')) records.push({ path: 'LICENSES/UPSTREAM-MIT.txt', bytes: readFileSync(path.join(ROOT,'docs/UPSTREAM-LICENSE')), generated: true });
    if (source === 'tedt' && !records.some(r => /^licen[cs]e(?:\.[^/]+)?$/i.test(r.path))) throw new Error(`${slug}: a LICENSE file is required for local submissions`);
    const revision = contentHash.slice(0, 16);
    const id = `${source}/${slug}`;
    const dates = source === 'community' ? state.apps[slug] : (() => {
      try {
        const dates = execFileSync('git', ['log', '--format=%aI', '--', `apps/tedt/${slug}`], { cwd: ROOT }).toString().trim().split('\n').filter(Boolean);
        return { createdAt: dates.at(-1) ?? '2026-01-01T00:00:00Z', updatedAt: dates[0] ?? '2026-01-01T00:00:00Z' };
      } catch { return { createdAt: null, updatedAt: null }; }
    })();
    if (source === 'community' && (!dates || dates.contentHash !== contentHash)) throw new Error(`${id}: imported payload differs from its provenance record`);
    const prefix = `/downloads/${source}/${slug}/${revision}`;
    const meta = await sharp(path.join(dir, manifest.preview), { animated: true }).metadata();
    if (!['gif', 'png', 'jpeg', 'webp'].includes(meta.format) || (meta.width ?? 0) > 4096 || (meta.pageHeight ?? meta.height ?? 0) > 4096) throw new Error(`${id}: invalid preview image`);
    const frame = `/previews/${source}-${slug}-${revision}.png`;
    const preview = `/previews/${source}-${slug}-${revision}.${meta.format === 'jpeg' ? 'jpg' : meta.format}`;
    const socialImage = `/social/${source}/${slug}.jpg`;
    if (!check) {
      mkdirSync(path.join(ROOT, 'public/previews'), { recursive: true });
      copyFileSync(path.join(dir, manifest.preview), path.join(ROOT, 'public', preview));
      await sharp(path.join(dir, manifest.preview), { page: 0, pages: 1 }).png().toFile(path.join(ROOT, 'public', frame + '.tmp'));
      copyFileSync(path.join(ROOT, 'public', frame + '.tmp'), path.join(ROOT, 'public', frame));
      rmSync(path.join(ROOT, 'public', frame + '.tmp'));
      const escape = text => text.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
      const lines = manifest.name.match(/.{1,34}(?:\s|$)|\S{1,34}/g)?.map(t=>t.trim()) ?? [manifest.name];
      const background = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#F8F6F0"/><text x="72" y="80" fill="#00446F" font-family="sans-serif" font-size="22">BUSY BAR APPS · ${escape(manifest.author)}</text>${lines.slice(0,2).map((line,i)=>`<text x="72" y="${155+i*60}" fill="#00446F" font-family="sans-serif" font-size="54" font-weight="700">${escape(line)}</text>`).join('')}<rect x="72" y="260" width="1056" height="234" fill="#101820"/><text x="72" y="564" fill="#00446F" font-family="monospace" font-size="24">busy.tedt.org</text><rect x="72" y="590" width="1056" height="4" fill="#E86027"/></svg>`;
      const pixels = await sharp(path.join(dir,manifest.preview),{page:0,pages:1}).resize(1056,234,{fit:'contain',background:'#101820',kernel:'nearest'}).png().toBuffer();
      mkdirSync(path.dirname(path.join(ROOT,'public',socialImage)),{recursive:true});
      await sharp(Buffer.from(background)).composite([{input:pixels,left:72,top:260}]).jpeg({quality:90}).toFile(path.join(ROOT,'public',socialImage));
    }
    const files = records.map(f => {
      const url = `${prefix}/files/${encodePath(f.path)}.bin`;
      if (!check) write(path.join(ROOT, 'public', prefix, 'files', `${f.path}.bin`), f.bytes);
      return { path: f.path, bytes: f.bytes.length, sha256: sha256(f.bytes), url, ...(f.generated ? {generated:true} : {}) };
    });
    const zip = deterministicZip(records);
    const downloadUrl = `${prefix}/${slug}.zip`;
    if (!check) write(path.join(ROOT, 'public', downloadUrl), zip);
    const readme = records.find(f => /^readme\.md$/i.test(f.path));
    const requirements = records.find(f => f.path === 'requirements.txt');
    const app = {
      id, source, slug, ...manifest, preview, stillPreview: frame, socialImage,
      animated: (meta.pages ?? 1) > 1,
      authorSlug: authorSlug(manifest.author), revision, contentHash,
      status: dates?.status ?? 'active', createdAt: dates?.createdAt ?? null, updatedAt: dates?.updatedAt ?? null,
      provenance: { repository: source === 'community' ? 'maxswinkels/busybar-apps' : 'TedTschopp/busy.tedt.org', path: source === 'community' ? `apps/${slug}` : `apps/tedt/${slug}`, commit: dates?.sourceCommit ?? null },
      url: `/apps/${source}/${slug}/`, downloadUrl, zipSha256: sha256(zip), zipBytes: zip.length, files,
      readme: readme?.path ?? null,
      requirements: requirements?.bytes.toString('utf8').trim() ?? '',
      rating: community.apps[id]?.rating ?? 0, comments: community.apps[id]?.comments ?? 0,
      discussionNumber: community.apps[id]?.number ?? null,
      downloads: Number(downloads[id]) || 0,
    };
    apps.push(app);
  }
}
if (!check) {
  write(path.join(ROOT, 'src/data/catalog.json'), JSON.stringify(apps, null, 2) + '\n');
  write(path.join(ROOT, 'public/apps.json'), JSON.stringify({ version: 1, apps }, null, 2) + '\n');
  write(path.join(ROOT, 'public/ideas.json'), JSON.stringify({ version: 1, ideas: community.ideas }, null, 2) + '\n');
  // Stable artwork: original device render within the same paper/navy brand.
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#F8F6F0"/><rect x="72" y="70" width="88" height="6" fill="#00A9E0"/><text x="72" y="150" font-family="sans-serif" font-size="24" fill="#00446F">THE PUBLIC WORKBENCH</text><text x="72" y="260" font-family="sans-serif" font-weight="700" font-size="80" fill="#00446F">BUSY Bar Apps</text><text x="72" y="330" font-family="sans-serif" font-size="29" fill="#37383C">Find an app. See how it works. Make it yours.</text><text x="72" y="535" font-family="monospace" font-size="24" fill="#00446F">busy.tedt.org</text><rect x="72" y="566" width="1056" height="4" fill="#E86027"/></svg>`;
  mkdirSync(path.join(ROOT, 'public/social'), { recursive: true });
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(path.join(ROOT, 'public/social/catalog.jpg'));
  const device = path.join(ROOT, 'public/brand/busybar-device.png');
  if (existsSync(device)) await sharp(device).resize(64, 64, { fit: 'contain', background: '#101820' }).png().toFile(path.join(ROOT, 'public/favicon.png'));
}
console.log(`${check ? 'Validated' : 'Built'} ${apps.length} complete apps (${apps.filter(a => a.status === 'active').length} active).`);
