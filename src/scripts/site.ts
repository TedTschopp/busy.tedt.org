import config from '../data/site.json';
const root = document.documentElement;
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch {} };
window.addEventListener('tedt:theme-change', () => {
  const frame = document.querySelector<HTMLIFrameElement>('iframe.giscus-frame');
  frame?.contentWindow?.postMessage({ giscus: { setConfig: { theme: root.dataset.theme } } }, 'https://giscus.app');
});

const motion = matchMedia('(prefers-reduced-motion: reduce)');
let paused = read('busy-motion') === 'paused';
const motionToggle = document.querySelector<HTMLButtonElement>('[data-motion-toggle]');
function applyMotion() {
  const animated = !motion.matches && !paused;
  root.classList.toggle('motion-on', animated);
  if (motionToggle) { motionToggle.textContent = animated ? 'Pause Previews' : 'Animate Previews'; motionToggle.setAttribute('aria-pressed', String(animated)); motionToggle.disabled = motion.matches; }
}
motion.addEventListener('change', applyMotion);
motionToggle?.addEventListener('click', () => { paused = !paused; save('busy-motion', paused ? 'paused' : 'animated'); applyMotion(); }); applyMotion();

document.querySelectorAll<HTMLElement>('[data-download-gate]').forEach(gate => {
  const checkbox = gate.querySelector<HTMLInputElement>('[data-trust-ack]');
  if (!checkbox) return;
  const links = [...gate.querySelectorAll<HTMLAnchorElement>('[data-download-gated]')];
  const sync = () => links.forEach(a => { a.setAttribute('aria-disabled', String(!checkbox.checked)); a.tabIndex = checkbox.checked ? 0 : -1; });
  gate.addEventListener('click', e => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('[data-download-gated]');
    if (!a) return;
    if (!checkbox.checked) { e.preventDefault(); checkbox.focus(); return; }
    const appId = a.dataset.trackDownload;
    if (!appId) return;
    // The static download never awaits the independent counter service.
    fetch(`https://api.busy.tedt.org/v1/downloads/${encodeURIComponent(appId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: crypto.randomUUID() }), keepalive: true }).catch(() => {});
  });
  checkbox.addEventListener('change', sync); sync();
});
document.querySelectorAll<HTMLButtonElement>('[data-copy-source]').forEach(button => button.addEventListener('click', async () => {
  const code = button.closest('details')?.querySelector('pre code');
  if (!code) return;
  try { await navigator.clipboard.writeText(code.textContent ?? ''); button.textContent = 'Copied'; setTimeout(() => button.textContent = 'Copy', 1600); }
  catch { button.textContent = 'Select the Source to Copy'; }
}));

for (const holder of document.querySelectorAll<HTMLElement>('[data-discussion]')) {
  const script = document.createElement('script');
  script.src = 'https://giscus.app/client.js'; script.async = true; script.crossOrigin = 'anonymous';
  const attrs: Record<string, string> = { repo: config.repository, 'repo-id': config.repoId, category: holder.dataset.category!, 'category-id': holder.dataset.categoryId!, mapping: holder.dataset.mapping!, term: holder.dataset.term!, strict: '1', 'reactions-enabled': '1', 'emit-metadata': '0', 'input-position': 'top', theme: root.dataset.theme!, lang: 'en', loading: 'lazy' };
  for (const [key,value] of Object.entries(attrs)) script.setAttribute(`data-${key}`, value);
  holder.append(script);
}

fetch('https://api.busy.tedt.org/v1/downloads', { signal: AbortSignal.timeout(5000) }).then(async r => {
  if (!r.ok) return;
  const result = await r.json();
  const counts = result.downloads;
  if (!counts || typeof counts !== 'object') return;
  document.querySelectorAll<HTMLElement>('[data-download-count]').forEach(el => {
    const n = counts[el.dataset.downloadCount!];
    if (Number.isSafeInteger(n) && n >= 0) el.textContent = n.toLocaleString('en-US');
  });
  document.querySelectorAll<HTMLElement>('[data-app-card]').forEach(card => {
    const n = counts[card.dataset.id!];
    if (Number.isSafeInteger(n) && n >= 0) card.dataset.downloads = String(n);
  });
  document.dispatchEvent(new Event('downloadcounts'));
}).catch(() => {});
