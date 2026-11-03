import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { syncUpstream } from '../scripts/sync-upstream.mjs';
import { renderDocumentation, safePath, sha256 } from '../scripts/catalog-lib.mjs';
import { verifyProvenance } from '../scripts/local-patches.mjs';
import { deterministicZip } from '../scripts/zip.mjs';
import AdmZip from 'adm-zip';
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{stdio:'pipe'}).toString().trim();
function fixture(t){const root=mkdtempSync(path.join(tmpdir(),'busy-import-'));const up=path.join(root,'up');const site=path.join(root,'site');mkdirSync(up);mkdirSync(site);git(up,'init','-b','main');git(up,'config','user.email','test@example.invalid');git(up,'config','user.name','Fixture');t.after(()=>rmSync(root,{recursive:true,force:true}));return {up,site};}
function app(up,slug='clock'){const dir=path.join(up,'apps',slug);mkdirSync(path.join(dir,'assets'),{recursive:true});writeFileSync(path.join(dir,'manifest.yaml'),`name: Clock\nauthor: Tester\ndescription: A clock app.\ntags: [clock]\npreview: ./preview.png\n`);writeFileSync(path.join(dir,'preview.png'),Buffer.from('89504e470d0a1a0a','hex'));writeFileSync(path.join(dir,'app.py'),'# never executed\n');writeFileSync(path.join(dir,'assets/data.bin'),Buffer.from([0,255,1]));}
function commit(up){git(up,'add','.');git(up,'commit','-m','fixture');}
test('imports whole apps, updates exactly, archives removals, and preserves local submissions',t=>{const {up,site}=fixture(t);app(up);commit(up);mkdirSync(path.join(site,'apps/tedt/own'),{recursive:true});writeFileSync(path.join(site,'apps/tedt/own/app.py'),'keep');const first=syncUpstream({root:site,upstreamDir:up});assert.equal(first.count,1);assert.deepEqual(readFileSync(path.join(site,'apps/community/clock/assets/data.bin')),Buffer.from([0,255,1]));assert.equal(syncUpstream({root:site,upstreamDir:up}).changed,false);writeFileSync(path.join(up,'apps/clock/app.py'),'# version two\n');commit(up);assert.equal(syncUpstream({root:site,upstreamDir:up}).changed,true);assert.equal(readFileSync(path.join(site,'apps/community/clock/app.py'),'utf8'),'# version two\n');app(up,'second');rmSync(path.join(up,'apps/clock'),{recursive:true});commit(up);syncUpstream({root:site,upstreamDir:up});const state=JSON.parse(readFileSync(path.join(site,'src/data/import-state.json')));assert.equal(state.apps.clock.status,'archived');assert.equal(readFileSync(path.join(site,'apps/tedt/own/app.py'),'utf8'),'keep');});
test('invalid upstream content cannot change the last successful snapshot',t=>{const {up,site}=fixture(t);app(up);commit(up);syncUpstream({root:site,upstreamDir:up});const before=readFileSync(path.join(site,'src/data/import-state.json'),'utf8');writeFileSync(path.join(up,'apps/clock/README.md'),'<script>alert(1)</script>');commit(up);assert.throws(()=>syncUpstream({root:site,upstreamDir:up}),/Active HTML/);assert.equal(readFileSync(path.join(site,'src/data/import-state.json'),'utf8'),before);});
test('rejects symlinks and unsafe preview paths',t=>{const {up,site}=fixture(t);app(up);symlinkSync('/etc/passwd',path.join(up,'apps/clock/link'));commit(up);assert.throws(()=>syncUpstream({root:site,upstreamDir:up}),/Unsafe upstream entry/);for(const p of ['../secret','/absolute','a/../b','a\\b','a\u0000b'])assert.throws(()=>safePath(p));});
test('documentation keeps code samples inert and removes encoded unsafe links',()=>{assert.match(renderDocumentation('```html\n<script>alert(1)</script>\n```'),/&lt;script&gt;/);assert.throws(()=>renderDocumentation('[go](javascript:alert(1))'),/Unsafe/);assert.doesNotMatch(renderDocumentation('<a href="&#106;avascript:alert(1)">bad</a>'),/href="javascript/i);});
test('complete ZIPs are deterministic and retain nested file bytes',()=>{const records=[{path:'app.py',bytes:Buffer.from('print(1)\n')},{path:'assets/x.bin',bytes:Buffer.from([0,255,15])}];const one=deterministicZip(records);assert.deepEqual(one,deterministicZip([...records].reverse()));const zip=new AdmZip(one);for(const f of records)assert.deepEqual(zip.readFile(f.path),f.bytes);});

function localSeries(site, upstreamContentHash, entries) {
  const folder = path.join(site, 'patches/community/clock');
  mkdirSync(folder, { recursive: true });
  const patches = entries.map(([name, before, after, target = 'app.py']) => {
    const text = `diff --git a/${target} b/${target}\n--- a/${target}\n+++ b/${target}\n@@ -1 +1 @@\n-${before}\n+${after}\n`;
    writeFileSync(path.join(folder, name), text);
    return { path: `patches/community/clock/${name}`, sha256: sha256(text) };
  });
  const series = { version: 1, upstreamContentHash, patches };
  writeFileSync(path.join(folder, 'series.json'), JSON.stringify(series));
  return series;
}

test('reviewed patches preserve upstream provenance, apply in order, and remain a deterministic no-op', t => {
  const { up, site } = fixture(t);
  app(up); commit(up); syncUpstream({ root: site, upstreamDir: up });
  const stateFile = path.join(site, 'src/data/import-state.json');
  const original = JSON.parse(readFileSync(stateFile)).apps.clock;
  const series = localSeries(site, original.contentHash, [
    ['0001.patch', '# never executed', '# first local patch'],
    ['0002.patch', '# first local patch', '# second local patch'],
  ]);
  syncUpstream({ root: site, upstreamDir: up });
  const record = JSON.parse(readFileSync(stateFile)).apps.clock;
  assert.equal(record.upstreamContentHash, original.contentHash);
  assert.equal(record.sourceCommit, original.sourceCommit);
  assert.deepEqual(record.localPatches, series.patches);
  assert.notEqual(record.contentHash, original.contentHash);
  assert.equal(readFileSync(path.join(up, 'apps/clock/app.py'), 'utf8'), '# never executed\n');
  assert.equal(readFileSync(path.join(site, 'apps/community/clock/app.py'), 'utf8'), '# second local patch\n');
  assert.equal(syncUpstream({ root: site, upstreamDir: up }).changed, false);
  verifyProvenance(site, 'clock', record.contentHash, record);
  assert.throws(() => verifyProvenance(site, 'clock', 'a'.repeat(64), record), /payload differs/);
  const seriesFile = path.join(site, 'patches/community/clock/series.json');
  rmSync(seriesFile);
  assert.throws(() => syncUpstream({ root: site, upstreamDir: up }), /patch series is missing/);
  assert.equal(JSON.parse(readFileSync(stateFile)).apps.clock.contentHash, record.contentHash);
  writeFileSync(seriesFile, JSON.stringify(series));
  writeFileSync(path.join(site, series.patches[0].path), 'tampered');
  assert.throws(() => verifyProvenance(site, 'clock', record.contentHash, record), /hash mismatch/);
});

test('upstream drift and out-of-order patches preserve the last verified snapshot', t => {
  const { up, site } = fixture(t);
  app(up); commit(up); syncUpstream({ root: site, upstreamDir: up });
  const stateFile = path.join(site, 'src/data/import-state.json');
  const before = readFileSync(stateFile, 'utf8');
  const original = JSON.parse(before).apps.clock;
  localSeries(site, original.contentHash, [
    ['0002.patch', '# first local patch', '# second local patch'],
    ['0001.patch', '# never executed', '# first local patch'],
  ]);
  assert.throws(() => syncUpstream({ root: site, upstreamDir: up }));
  assert.equal(readFileSync(stateFile, 'utf8'), before);
  localSeries(site, original.contentHash, [['0001.patch', '# never executed', '# first local patch']]);
  writeFileSync(path.join(up, 'apps/clock/app.py'), '# upstream changed\n'); commit(up);
  assert.throws(() => syncUpstream({ root: site, upstreamDir: up }), /upstream changed/);
  assert.equal(readFileSync(stateFile, 'utf8'), before);
  assert.equal(readFileSync(path.join(site, 'apps/community/clock/app.py'), 'utf8'), '# never executed\n');
});

test('patch paths, symlinks, modes, and unrecorded provenance cannot escape the app', t => {
  const { up, site } = fixture(t);
  app(up); commit(up); syncUpstream({ root: site, upstreamDir: up });
  const original = JSON.parse(readFileSync(path.join(site, 'src/data/import-state.json'))).apps.clock;
  for (const target of ['../escape', 'nested/../../escape', '/absolute', '.git/config']) {
    localSeries(site, original.contentHash, [['0001.patch', '# never executed', '# changed', target]]);
    assert.throws(() => syncUpstream({ root: site, upstreamDir: up }));
    assert.equal(readFileSync(path.join(site, 'apps/community/clock/app.py'), 'utf8'), '# never executed\n');
  }
  const series = localSeries(site, original.contentHash, [['0001.patch', '# never executed', '# changed']]);
  assert.throws(() => verifyProvenance(site, 'clock', original.contentHash, original), /provenance differs/);
  const file = path.join(site, series.patches[0].path);
  rmSync(file); symlinkSync(path.join(up, 'apps/clock/app.py'), file);
  assert.throws(() => syncUpstream({ root: site, upstreamDir: up }), /Unsafe patch file/);
  rmSync(file);
  const text = 'diff --git a/app.py b/app.py\nold mode 100644\nnew mode 120000\n';
  writeFileSync(file, text);
  series.patches[0].sha256 = sha256(text);
  writeFileSync(path.join(site, 'patches/community/clock/series.json'), JSON.stringify(series));
  assert.throws(() => syncUpstream({ root: site, upstreamDir: up }), /regular text files/);
});

test('archived apps retain effective patched bytes without applying patches twice', t => {
  const { up, site } = fixture(t);
  app(up); commit(up); syncUpstream({ root: site, upstreamDir: up });
  const original = JSON.parse(readFileSync(path.join(site, 'src/data/import-state.json'))).apps.clock;
  localSeries(site, original.contentHash, [['0001.patch', '# never executed', '# patched archive']]);
  syncUpstream({ root: site, upstreamDir: up });
  app(up, 'second'); rmSync(path.join(up, 'apps/clock'), { recursive: true }); commit(up);
  syncUpstream({ root: site, upstreamDir: up });
  assert.equal(JSON.parse(readFileSync(path.join(site, 'src/data/import-state.json'))).apps.clock.status, 'archived');
  assert.equal(readFileSync(path.join(site, 'apps/community/clock/app.py'), 'utf8'), '# patched archive\n');
  assert.equal(syncUpstream({ root: site, upstreamDir: up }).changed, false);
});
