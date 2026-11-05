// Serves site/ under https://theaipipe.com/demos/monday-sales-check/ and the small API the page reads.
// The role is simulated (a query parameter). In a real deployment it would come from the Workspace identity.
import { stateFor, accountFor, rowFor, answerFor, exportCsv, HttpError } from './src/core.js';

const BASE = '/demos/monday-sales-check';
const SECURITY = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY } });
}

export async function api(url) {
  const p = url.pathname.slice((BASE + '/api').length);
  const q = url.searchParams;
  const role = q.get('role') || '';
  const extras = (q.get('files') || '').split(',').filter(Boolean);
  try {
    if (p === '/state') return json(stateFor(role, extras));
    let m = p.match(/^\/account\/([A-Za-z0-9-]{1,20})$/);
    if (m) return json(accountFor(role, m[1].toUpperCase(), extras));
    if (p === '/row') return json(rowFor(role, q.get('file') || '', q.get('tab') || '', q.get('row') || '', extras));
    m = p.match(/^\/answer\/([a-z-]{1,40})$/);
    if (m) return json(answerFor(role, m[1], extras));
    if (p === '/export.csv') {
      const csv = exportCsv(role, (q.get('market') || '').toUpperCase(), extras);
      return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY } });
    }
    return json({ error: 'not_found', message: 'No such endpoint.' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
    return json({ error: 'server_error', message: 'Something failed on the server.' }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === BASE) return Response.redirect(`${url.origin}${BASE}/`, 308);
    if (!url.pathname.startsWith(BASE + '/')) return new Response('Not found', { status: 404 });
    if (url.pathname.startsWith(BASE + '/api/')) {
      if (request.method !== 'GET') return json({ error: 'method', message: 'Read only.' }, 405);
      return api(url);
    }
    const path = url.pathname.slice(BASE.length) || '/';
    const res = await env.ASSETS.fetch(new Request(new URL(path, url.origin), request));
    const out = new Response(res.body, res);
    const loc = out.headers.get('Location');
    if (loc && loc.startsWith('/')) out.headers.set('Location', BASE + loc);
    for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
    return out;
  },
};
