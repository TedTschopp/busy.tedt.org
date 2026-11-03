import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { syncUpstream } from '../scripts/sync-upstream.mjs';
import { inspectApp, sha256 } from '../scripts/catalog-lib.mjs';
import { verifyImportChanges } from '../scripts/check-import-changes.mjs';

const git = (root, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', root, ...args], { stdio: 'pipe' }).toString().trim();
const commit = root => { git(root, 'add', '.'); git(root, 'commit', '-m', 'fixture'); return git(root, 'rev-parse', 'HEAD'); };
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'busy-patch-guard-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const up = path.join(dir, 'up'), root = path.join(dir, 'site');
  for (const folder of [up, root]) {
    mkdirSync(folder); git(folder, 'init', '-b', 'main');
    git(folder, 'config', 'user.name', 'Fixture'); git(folder, 'config', 'user.email', 'test@example.invalid');
  }
  const app = path.join(up, 'apps/clock'); mkdirSync(app, { recursive: true });
  writeFileSync(path.join(app, 'app.py'), '# upstream\n');
  writeFileSync(path.join(app, 'preview.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  writeFileSync(path.join(app, 'manifest.yaml'), 'name: Clock\nauthor: Tester\ndescription: Clock app.\npreview: preview.png\n');
  commit(up); syncUpstream({ root, upstreamDir: up });
  return { root, up, base: commit(root) };
}
function series(root, entries) {
  const file = path.join(root, 'src/data/import-state.json');
  const state = JSON.parse(readFileSync(file));
  const directory = path.join(root, 'patches/community/clock'); mkdirSync(directory, { recursive: true });
  const patches = entries.map(([name, before, after]) => {
    const text = `diff --git a/app.py b/app.py\n--- a/app.py\n+++ b/app.py\n@@ -1 +1 @@\n-${before}\n+${after}\n`;
    writeFileSync(path.join(directory, name), text);
    return { path: `patches/community/clock/${name}`, sha256: sha256(text) };
  });
  writeFileSync(path.join(directory, 'series.json'), JSON.stringify({ version: 1, upstreamContentHash: state.apps.clock.upstreamContentHash ?? state.apps.clock.contentHash, patches }));
}

test('PR guard reconstructs declared patches from a trusted unpatched base', t => {
  const { root, up, base } = fixture(t);
  series(root, [['0001.patch', '# upstream', '# local']]);
  syncUpstream({ root, upstreamDir: up }); commit(root);
  assert.equal(verifyImportChanges({ root, base }), 1);
});

test('PR guard reverses trusted existing patches before verifying a changed series', t => {
  const { root, up } = fixture(t);
  series(root, [['0001.patch', '# upstream', '# local']]);
  syncUpstream({ root, upstreamDir: up }); const base = commit(root);
  series(root, [['0001.patch', '# upstream', '# local'], ['0002.patch', '# local', '# revised']]);
  syncUpstream({ root, upstreamDir: up }); commit(root);
  assert.equal(verifyImportChanges({ root, base }), 1);
});

test('changing payload and its effective hash cannot authorize an undeclared edit', t => {
  const { root, up, base } = fixture(t);
  series(root, [['0001.patch', '# upstream', '# declared']]);
  syncUpstream({ root, upstreamDir: up });
  writeFileSync(path.join(root, 'apps/community/clock/app.py'), '# undeclared\n');
  const file = path.join(root, 'src/data/import-state.json');
  const state = JSON.parse(readFileSync(file));
  state.apps.clock.contentHash = inspectApp(path.join(root, 'apps/community/clock'), 'clock').contentHash;
  writeFileSync(file, JSON.stringify(state)); commit(root);
  assert.throws(() => verifyImportChanges({ root, base }), /do not match/);
});

test('PR guard preserves upstream identity and rejects direct dependency edits', t => {
  const { root, base } = fixture(t);
  writeFileSync(path.join(root, 'apps/community/clock/app.py'), '# direct edit\n'); commit(root);
  assert.throws(() => verifyImportChanges({ root, base }), /reviewed local patch series/);
  const file = path.join(root, 'src/data/import-state.json');
  const state = JSON.parse(readFileSync(file)); state.apps.clock.sourceCommit = 'f'.repeat(40);
  writeFileSync(file, JSON.stringify(state)); commit(root);
  assert.throws(() => verifyImportChanges({ root, base }), /cannot rewrite upstream identity/);
});

test('PR guard accepts unchanged unpatched records and JSON key reordering', t => {
  const { root, base } = fixture(t);
  const file = path.join(root, 'src/data/import-state.json');
  const state = JSON.parse(readFileSync(file));
  state.apps.clock = Object.fromEntries(Object.entries(state.apps.clock).reverse());
  writeFileSync(file, JSON.stringify(state)); commit(root);
  assert.equal(verifyImportChanges({ root, base }), 0);
});
