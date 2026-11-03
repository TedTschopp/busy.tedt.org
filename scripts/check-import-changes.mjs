import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { ROOT, safePath, inspectApp } from './catalog-lib.mjs';
import { applyLocalPatches, verifyProvenance } from './local-patches.mjs';

export function verifyImportChanges({ root = ROOT, base }) {
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
      const identity = record => Object.fromEntries(Object.entries(record).filter(([key]) => !['contentHash', 'upstreamContentHash', 'localPatches'].includes(key)));
      if (!isDeepStrictEqual(identity(previous), identity(current))) throw new Error(`${slug}: local patches cannot rewrite upstream identity, dates, or archive status`);
      const directory = path.join(temp, 'apps', slug);
      mkdirSync(directory, { recursive: true });
      const prefix = `apps/community/${slug}/`;
      for (const row of git('ls-tree', '-rz', base, '--', prefix).toString().split('\0').filter(Boolean)) {
        const match = row.match(/^(100644|100755) blob [a-f0-9]+\t(.+)$/);
        if (!match || !match[2].startsWith(prefix)) throw new Error(`${slug}: unsafe trusted-base entry`);
        const relative = safePath(match[2].slice(prefix.length));
        copyFile(match[2], path.join(directory, relative));
      }
      if (inspectApp(directory, slug).contentHash !== previous.contentHash) throw new Error(`${slug}: trusted-base content hash differs`);
      const upstreamContentHash = previous.upstreamContentHash ?? previous.contentHash;
      if (previous.localPatches?.length) {
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
