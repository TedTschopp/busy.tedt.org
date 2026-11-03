import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { ROOT, safePath, inspectApp } from './catalog-lib.mjs';
import { applyLocalPatches, verifyProvenance } from './local-patches.mjs';

export function verifyImportChanges({ root = ROOT, base, upstreamDir }) {
  if (!/^[a-f0-9]{40}$/.test(base ?? '')) throw new Error('A full trusted base commit is required');
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', root, ...args], { maxBuffer: 100 * 1024 * 1024 });
  const before = JSON.parse(git('show', `${base}:src/data/import-state.json`));
  const after = JSON.parse(readFileSync(path.join(root, 'src/data/import-state.json')));
  const outer = record => Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'apps'));
  if (!isDeepStrictEqual(outer(before), outer(after))) throw new Error('Local patches cannot change the upstream repository');
  const affected = new Set();
  for (const file of git('diff', '--name-only', '-z', '--no-renames', `${base}...HEAD`, '--', 'apps/community', 'patches/community').toString().split('\0').filter(Boolean)) {
    safePath(file);
    const [, , slug] = file.split('/');
    affected.add(slug);
  }
  for (const slug of new Set([...Object.keys(before.apps), ...Object.keys(after.apps)])) {
    if (!isDeepStrictEqual(before.apps[slug], after.apps[slug])) affected.add(slug);
  }
  const temp = mkdtempSync(path.join(tmpdir(), 'busy-provenance-check-'));
  let upstream;
  const verifiedUpstream = commit => {
    if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('Invalid upstream source commit');
    if (!upstream) {
      const directory = upstreamDir ?? path.join(temp, 'upstream.git');
      const upstreamGit = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', directory, ...args], { maxBuffer: 100 * 1024 * 1024 });
      let ref = 'HEAD';
      if (!upstreamDir) {
        const url = 'https://github.com/maxswinkels/busybar-apps.git';
        const head = execFileSync('git', ['ls-remote', '--symref', url, 'HEAD']).toString().match(/ref: (refs\/heads\/[^\s]+)\s+HEAD/);
        if (!head) throw new Error('Could not resolve authoritative upstream default branch');
        execFileSync('git', ['init', '--bare', '--quiet', directory]);
        upstreamGit('fetch', '--no-tags', '--filter=blob:none', url, head[1]);
        ref = 'FETCH_HEAD';
      }
      upstream = { git: upstreamGit, ref };
    }
    try { upstream.git('merge-base', '--is-ancestor', commit, upstream.ref); }
    catch { throw new Error('Source commit is not in authoritative upstream default-branch history'); }
    return upstream.git;
  };
  const copyFile = (relative, destination) => {
    safePath(relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, git('show', `${base}:${relative}`));
  };
  try {
    for (const slug of affected) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) throw new Error('Invalid changed app slug');
      const previous = before.apps[slug], current = after.apps[slug];
      if (!previous || !current) throw new Error(`${slug}: app additions/removals must use the upstream importer`);
      const rebased = previous.sourceCommit !== current.sourceCommit;
      const mutable = ['contentHash', 'upstreamContentHash', 'localPatches', ...(rebased ? ['sourceCommit', 'updatedAt'] : [])];
      const identity = record => Object.fromEntries(Object.entries(record).filter(([key]) => !mutable.includes(key)));
      if (!isDeepStrictEqual(identity(previous), identity(current))) throw new Error(`${slug}: local patches cannot rewrite upstream identity, dates, or archive status`);
      const directory = path.join(temp, 'apps', slug);
      mkdirSync(directory, { recursive: true });
      const sourceGit = rebased ? verifiedUpstream(current.sourceCommit) : git;
      const sourceRef = rebased ? current.sourceCommit : base;
      const prefix = rebased ? `apps/${slug}/` : `apps/community/${slug}/`;
      const entries = sourceGit('ls-tree', '-rz', sourceRef, '--', prefix).toString().split('\0').filter(Boolean);
      if (!entries.length) throw new Error(`${slug}: verified source app is missing`);
      for (const row of entries) {
        const match = row.match(/^(100644|100755) blob [a-f0-9]+\t(.+)$/);
        if (!match || !match[2].startsWith(prefix)) throw new Error(`${slug}: unsafe trusted-base entry`);
        const relative = safePath(match[2].slice(prefix.length));
        const target = path.join(directory, relative);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, sourceGit('show', `${sourceRef}:${match[2]}`));
      }
      if (!rebased && inspectApp(directory, slug).contentHash !== previous.contentHash) throw new Error(`${slug}: trusted-base content hash differs`);
      const upstreamContentHash = rebased ? inspectApp(directory, slug).contentHash : previous.upstreamContentHash ?? previous.contentHash;
      if (rebased) {
        const updatedAt = sourceGit('log', '-1', '--format=%aI', sourceRef, '--', prefix).toString().trim();
        if (current.updatedAt !== updatedAt) throw new Error(`${slug}: update date differs from verified upstream history`);
      }
      if (!rebased && previous.localPatches?.length) {
        const metadata = path.join(temp, 'base-metadata', slug);
        for (const relative of [`patches/community/${slug}/series.json`, ...previous.localPatches.map(patch => patch.path)]) {
          copyFile(relative, path.join(metadata, safePath(relative)));
        }
        verifyProvenance(metadata, slug, previous.contentHash, previous);
        applyLocalPatches({ root: metadata, slug, directory, upstreamContentHash, reverse: true });
      }
      if (inspectApp(directory, slug).contentHash !== upstreamContentHash) throw new Error(`${slug}: cannot reconstruct original upstream bytes`);
      const series = applyLocalPatches({ root, slug, directory, upstreamContentHash });
      if (!series) throw new Error(`${slug}: imported edits require a reviewed local patch series`);
      const expected = inspectApp(directory, slug).contentHash;
      const actual = inspectApp(path.join(root, 'apps/community', slug), slug).contentHash;
      if (expected !== actual) throw new Error(`${slug}: source edits do not match the declared local patches`);
      verifyProvenance(root, slug, actual, current);
    }
    return affected.size;
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--base') throw new Error('Use --base <commit>');
  console.log(`Verified local patch provenance for ${verifyImportChanges({ base: process.argv[3] })} changed imported apps.`);
}
