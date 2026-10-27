import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, lstatSync, existsSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const SOURCES = ['community', 'tedt'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const encodePath = value => value.split('/').map(encodeURIComponent).join('/');
export const readJson = (file, fallback) => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
export const authorSlug = value => `${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'contributor'}-${sha256(value).slice(0, 6)}`;

export function safePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value) || path.posix.isAbsolute(value) || value.split('/').some(p => !p || p === '.' || p === '..' || p === '.git')) throw new Error(`Unsafe path: ${value}`);
  return value;
}

export function filesIn(root, prefix = '') {
  const result = [];
  for (const name of readdirSync(path.join(root, prefix)).sort()) {
    const relative = safePath(prefix ? `${prefix}/${name}` : name);
    const stat = lstatSync(path.join(root, relative));
    if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${relative}`);
    if (stat.isDirectory()) result.push(...filesIn(root, relative));
    else if (stat.isFile()) result.push(relative);
    else throw new Error(`Unsupported file: ${relative}`);
  }
  return result;
}

export function manifestAt(dir, slug) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) throw new Error(`Invalid app slug: ${slug}`);
  const m = yaml.load(readFileSync(path.join(dir, 'manifest.yaml'), 'utf8'), { schema: yaml.JSON_SCHEMA });
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error(`Invalid manifest: ${slug}`);
  for (const key of ['name', 'author', 'description', 'preview']) if (typeof m[key] !== 'string' || !m[key].trim()) throw new Error(`${slug}: ${key} is required`);
  if (m.description.length > 200) throw new Error(`${slug}: description exceeds upstream 200-character limit`);
  if (m.tags !== undefined && (!Array.isArray(m.tags) || m.tags.some(t => typeof t !== 'string' || !t.trim()))) throw new Error(`${slug}: invalid tags`);
  const preview = safePath(m.preview.replace(/^\.\//, ''));
  if (!/\.(gif|png|jpe?g|webp)$/i.test(preview) || !existsSync(path.join(dir, preview))) throw new Error(`${slug}: missing or unsupported preview`);
  if (!existsSync(path.join(dir, 'app.py'))) throw new Error(`${slug}: missing app.py`);
  if (m.repo) {
    let url;
    try { url = new URL(m.repo); } catch { throw new Error(`${slug}: invalid project URL`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`${slug}: unsafe project URL`);
  }
  return { name: m.name, author: m.author, description: m.description, tags: [...new Set(m.tags ?? [])], preview, repo: m.repo ?? null };
}

// App documentation is untrusted input. Code fences remain inert, and the
// final renderer always sanitizes HTML even after rejecting active tokens.
export function renderDocumentation(markdown, resolveLink = value => value) {
  const tokens = marked.lexer(markdown);
  marked.walkTokens(tokens, token => {
    if (token.type === 'html' && /<(?:script|iframe|object|embed|style|form|input|meta|link)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["']?\s*(?:javascript|data|vbscript):/i.test(token.raw)) throw new Error('Active HTML rejected in documentation');
    if ((token.type === 'link' || token.type === 'image') && /^(?:javascript|data|vbscript):/i.test(token.href.replace(/[\s\u0000-\u0020]/g, ''))) throw new Error('Unsafe documentation link');
  });
  return sanitizeHtml(marked.parser(tokens), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'details', 'summary'],
    allowedAttributes: { a: ['href', 'title', 'rel'], img: ['src', 'alt', 'title', 'width', 'height'], code: ['class'], '*': ['id'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attrs) => ({ tagName, attribs: { ...attrs, href: resolveLink(attrs.href ?? ''), rel: 'noopener noreferrer' } }),
      img: (tagName, attrs) => ({ tagName, attribs: { ...attrs, src: resolveLink(attrs.src ?? '') } }),
    },
  });
}

export function inspectApp(dir, slug) {
  const files = filesIn(dir);
  const manifest = manifestAt(dir, slug);
  const records = files.map(file => ({ path: file, bytes: readFileSync(path.join(dir, file)) }));
  for (const f of records.filter(f => /\.md$/i.test(f.path))) renderDocumentation(f.bytes.toString('utf8'));
  const contentHash = sha256(Buffer.concat(records.flatMap(f => [Buffer.from(`${f.path}\0`), Buffer.from(sha256(f.bytes))])));
  return { manifest, records, contentHash };
}
