import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { safePath, sha256 } from './catalog-lib.mjs';

const DIGEST = /^[a-f0-9]{64}$/;

function regularFile(root, relative) {
  const parts = safePath(relative).split('/');
  for (let i = 1; i <= parts.length; i++) {
    const file = path.join(root, ...parts.slice(0, i));
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || (i < parts.length ? !stat.isDirectory() : !stat.isFile())) throw new Error(`Unsafe patch file: ${relative}`);
  }
  return path.join(root, relative);
}

export function patchSeries(root, slug) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) throw new Error('Invalid patch app slug');
  const directory = `patches/community/${slug}`;
  const manifest = `${directory}/series.json`;
  if (!existsSync(path.join(root, manifest))) return null;
  const series = JSON.parse(readFileSync(regularFile(root, manifest), 'utf8'));
  if (series.version !== 1 || !DIGEST.test(series.upstreamContentHash) || !Array.isArray(series.patches) || !series.patches.length) throw new Error(`${slug}: invalid local patch series`);
  const seen = new Set();
  const patches = series.patches.map(patch => {
    if (typeof patch.path !== 'string' || !patch.path.startsWith(`${directory}/`) || !patch.path.endsWith('.patch') || !DIGEST.test(patch.sha256) || seen.has(patch.path)) throw new Error(`${slug}: invalid patch reference`);
    seen.add(patch.path);
    const file = regularFile(root, patch.path);
    const bytes = readFileSync(file);
    if (bytes.length > 5_000_000 || sha256(bytes) !== patch.sha256) throw new Error(`${slug}: patch hash mismatch: ${patch.path}`);
    const text = bytes.toString('utf8');
    if (!Buffer.from(text).equals(bytes) || bytes.includes(0) || /^(?:new file mode|deleted file mode|old mode|new mode|rename from|rename to|copy from|copy to|GIT binary patch|Binary files )/m.test(text)) throw new Error(`${slug}: only existing regular text files may be patched`);
    return { path: patch.path, sha256: patch.sha256 };
  });
  return { upstreamContentHash: series.upstreamContentHash, localPatches: patches };
}

export function applyLocalPatches({ root, slug, directory, upstreamContentHash }) {
  const series = patchSeries(root, slug);
  if (!series) return null;
  if (series.upstreamContentHash !== upstreamContentHash) throw new Error(`${slug}: upstream changed; review and rebase local patches`);
  // Git only processes text patches. Its repository and index are isolated
  // from both the site and upstream; imported hooks/installers never run.
  const gitDirectory = mkdtempSync(path.join(tmpdir(), 'busy-patch-git-'));
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', `--git-dir=${gitDirectory}`, `--work-tree=${directory}`, ...args], { cwd: directory, stdio: 'pipe', maxBuffer: 10_000_000 });
  try {
    execFileSync('git', ['init', '--bare', '--template=', gitDirectory], { stdio: 'pipe' });
    for (const patch of series.localPatches) {
      const file = regularFile(root, patch.path);
      const changes = git('apply', '--numstat', '-z', '--', file).toString('utf8').split('\0').filter(Boolean);
      if (!changes.length) throw new Error(`${slug}: empty local patch`);
      for (const change of changes) {
        const match = change.match(/^\d+\t\d+\t(.+)$/);
        if (!match) throw new Error(`${slug}: unsupported patch operation`);
        regularFile(directory, match[1]);
      }
      git('apply', '--check', '--', file);
      git('apply', '--', file);
    }
    return series;
  } finally { rmSync(gitDirectory, { recursive: true, force: true }); }
}

export function verifyProvenance(root, slug, contentHash, record) {
  if (!record || record.contentHash !== contentHash) throw new Error(`community/${slug}: imported payload differs from its provenance record`);
  const series = patchSeries(root, slug);
  if (series ? record.upstreamContentHash !== series.upstreamContentHash || JSON.stringify(record.localPatches) !== JSON.stringify(series.localPatches) : record.localPatches?.length || record.upstreamContentHash && record.upstreamContentHash !== contentHash) throw new Error(`${slug}: local patch provenance differs from the reviewed series`);
  return series;
}
