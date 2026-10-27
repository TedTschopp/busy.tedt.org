const SITE = 'https://busy.tedt.org';
let catalogCache = { expires: 0, ids: new Set() };
const json = (body, status = 200, origin) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin === SITE ? { 'Access-Control-Allow-Origin': SITE, Vary: 'Origin' } : {}) } });

async function knownApps(env) {
  if (env.APP_IDS) return new Set(JSON.parse(env.APP_IDS));
  if (Date.now() < catalogCache.expires) return catalogCache.ids;
  const response = await fetch(`${SITE}/apps.json`, { cf: { cacheTtl: 60 } });
  if (!response.ok) throw new Error('Catalog unavailable');
  const catalog = await response.json();
  if (!Array.isArray(catalog.apps) || catalog.apps.length === 0) throw new Error('Invalid catalog');
  const ids = new Set(catalog.apps.map(a => a.id));
  catalogCache = { ids, expires: Date.now() + 60000 };
  return ids;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin && origin !== SITE) return json({ error: 'Origin not allowed' }, 403);
    if (request.method === 'OPTIONS') {
      if (origin !== SITE) return json({ error: 'Origin required' }, 403);
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '3600', Vary: 'Origin' } });
    }
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        await env.DB.prepare('SELECT 1').first();
        return json({ status: 'ok' }, 200, origin);
      }
      if (request.method === 'GET' && url.pathname === '/v1/downloads') {
        const result = await env.DB.prepare('SELECT app_id, total FROM download_counts ORDER BY app_id').all();
        const response = json({ downloads: Object.fromEntries(result.results.map(r => [r.app_id, r.total])) }, 200, origin);
        response.headers.set('Cache-Control', 'public, max-age=30');
        return response;
      }
      if (request.method !== 'POST' || !url.pathname.startsWith('/v1/downloads/')) return json({ error: 'Not found' }, 404, origin);
      if (origin !== SITE) return json({ error: 'Origin required' }, 403);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415, origin);
      if (env.RATE_LIMITER) {
        const limit = await env.RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' });
        if (!limit.success) return json({ error: 'Rate limit exceeded' }, 429, origin);
      }
      const appId = decodeURIComponent(url.pathname.slice('/v1/downloads/'.length));
      if (!/^(?:community|tedt)\/[a-z0-9][a-z0-9_-]*$/.test(appId)) return json({ error: 'Invalid app' }, 400, origin);
      const body = await request.text();
      if (body.length > 1024) return json({ error: 'Request too large' }, 413, origin);
      let event;
      try { event = JSON.parse(body); } catch { return json({ error: 'Invalid JSON' }, 400, origin); }
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(event?.eventId ?? '')) return json({ error: 'Valid eventId required' }, 400, origin);
      if (!(await knownApps(env)).has(appId)) return json({ error: 'Unknown app' }, 404, origin);
      // The trigger increments the total atomically only when this UUID is new.
      const result = await env.DB.prepare('INSERT OR IGNORE INTO download_events(event_id, app_id) VALUES (?, ?)').bind(event.eventId, appId).run();
      return json({ accepted: true, duplicate: result.meta.changes === 0 }, 202, origin);
    } catch {
      return json({ error: 'Counter temporarily unavailable' }, 503, origin);
    }
  },
};
