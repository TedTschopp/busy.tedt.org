import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, cpSync, rmSync, renameSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, safePath, inspectApp, readJson } from './catalog-lib.mjs';

const UPSTREAM = 'https://github.com/maxswinkels/busybar-apps.git';
const git = (dir, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', dir, ...args], { maxBuffer: 100 * 1024 * 1024 });

export function syncUpstream({ root = ROOT, upstreamDir, ref = 'HEAD' } = {}) {
  if (!upstreamDir) {
    upstreamDir = path.join(root, '.upstream');
    if (!existsSync(upstreamDir)) execFileSync('git', ['clone', '--no-checkout', '--no-tags', UPSTREAM, upstreamDir], { stdio: 'inherit' });
    const head = git(upstreamDir, 'ls-remote', '--symref', 'origin', 'HEAD').toString().match(/ref: (refs\/heads\/[^\s]+)\s+HEAD/);
    if (!head) throw new Error('Could not resolve upstream default branch');
    git(upstreamDir, 'fetch', '--no-tags', 'origin', head[1]);
    ref = 'FETCH_HEAD';
  }
  const commit = git(upstreamDir, 'rev-parse', `${ref}^{commit}`).toString().trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid upstream commit');
  const previous = readJson(path.join(root, 'src/data/import-state.json'), { apps: {} });
  const stage = mkdtempSync(path.join(root, '.staging-import-'));
  const nextApps = {};
  try {
    const stagedApps = path.join(stage, 'community');
    const currentApps = path.join(root, 'apps/community');
    mkdirSync(stagedApps, { recursive: true });
    const entries = git(upstreamDir, 'ls-tree', '-rz', '--full-tree', commit, '--', 'apps/').toString().split('\0').filter(Boolean);
    const groups = new Map();
    for (const entry of entries) {
      const match = entry.match(/^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/);
      if (!match) throw new Error('Invalid Git tree');
      const [, mode, type, object, file] = match;
      if (file === 'apps/README.md') continue;
      safePath(file);
      const [, slug, ...parts] = file.split('/');
      if (!parts.length) continue;
      if (!['100644', '100755'].includes(mode) || type !== 'blob') throw new Error(`Unsafe upstream entry: ${file}`);
      if (!groups.has(slug)) groups.set(slug, []);
      groups.get(slug).push({ path: parts.join('/'), object });
    }
    // An empty or incomplete fetch must never archive the entire live catalog.
    if (groups.size === 0) throw new Error('Upstream contains no apps');
    for (const [slug, files] of groups) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) throw new Error(`Unsafe slug: ${slug}`);
      const dest = path.join(stagedApps, slug);
      for (const f of files) {
        const target = path.join(dest, safePath(f.path));
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, git(upstreamDir, 'cat-file', 'blob', f.object));
      }
      const { contentHash } = inspectApp(dest, slug);
      const old = previous.apps[slug];
      if (old?.contentHash === contentHash) nextApps[slug] = { ...old, status: 'active' };
      else {
        const dates = git(upstreamDir, 'log', '--format=%aI', commit, '--', `apps/${slug}/`).toString().trim().split('\n').filter(Boolean);
        nextApps[slug] = { contentHash, sourceCommit: commit, createdAt: old?.createdAt ?? dates.at(-1), updatedAt: dates[0], status: 'active' };
      }
    }
    for (const [slug, old] of Object.entries(previous.apps)) {
      if (groups.has(slug)) continue;
      if (!existsSync(path.join(currentApps, slug))) throw new Error(`Archived app folder missing: ${slug}`);
      cpSync(path.join(currentApps, slug), path.join(stagedApps, slug), { recursive: true });
      nextApps[slug] = { ...old, status: 'archived' };
    }
    const changed = JSON.stringify(nextApps) !== JSON.stringify(previous.apps);
    if (!changed) return { changed: false, commit, count: groups.size };
    mkdirSync(path.join(root, 'apps'), { recursive: true });
    mkdirSync(path.join(root, 'src/data'), { recursive: true });
    const backup = path.join(stage, 'old-community');
    if (existsSync(currentApps)) renameSync(currentApps, backup);
    try { renameSync(stagedApps, currentApps); } catch (error) {
      if (existsSync(backup)) renameSync(backup, currentApps);
      throw error;
    }
    writeFileSync(path.join(root, 'src/data/import-state.json'), JSON.stringify({ repository: 'maxswinkels/busybar-apps', apps: nextApps }, null, 2) + '\n');
    return { changed: true, commit, count: groups.size };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--upstream-dir');
  console.log(JSON.stringify(syncUpstream({ upstreamDir: i >= 0 ? path.resolve(process.argv[i + 1]) : undefined })));
}
