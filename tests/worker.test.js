import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const B = 'https://theaipipe.com/demos/monday-sales-check';
const env = { ASSETS: { fetch: async () => new Response('<html>ok</html>', { headers: { 'Content-Type': 'text/html' } }) } };
const get = (path) => worker.fetch(new Request(B + path), env);

test('direct API calls as Michigan sales never return Ohio rows', async () => {
  for (const path of [
    '/api/account/OH-005?role=mi-sales&files=mi-w44b',
    '/api/account/oh-005?role=mi-sales',
    '/api/answer/ohio-close?role=mi-sales&files=mi-w44b',
    '/api/export.csv?market=OH&role=mi-sales',
    '/api/row?file=oh-w44&tab=Sales&row=5&role=mi-sales',
  ]) {
    const res = await get(path);
    assert.equal(res.status, 403, path);
    const body = await res.text();
    assert.ok(!/OH-0|7\d{3}|740|715/.test(body), `${path} leaked: ${body}`);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  }
  const st = await (await get('/api/state?role=mi-sales&files=mi-w44b')).text();
  assert.ok(!/OH-|Ohio/.test(st));
});

test('the same calls as leadership succeed', async () => {
  assert.equal((await get('/api/account/OH-005?role=leadership')).status, 200);
  const csv = await (await get('/api/export.csv?market=OH&role=leadership')).text();
  assert.match(csv, /OH-005/);
  const st = await (await get('/api/state?role=leadership&files=mi-w44b')).json();
  assert.equal(st.markets[0].focus.qty, 1020);
});

test('bad input is refused plainly; writes are not allowed', async () => {
  assert.equal((await get('/api/state')).status, 400);
  assert.equal((await get('/api/state?role=leadership&files=oh-w44')).status, 400);
  assert.equal((await get('/api/nothing?role=leadership')).status, 404);
  const post = await worker.fetch(new Request(B + '/api/state?role=leadership', { method: 'POST' }), env);
  assert.equal(post.status, 405);
});

test('static pages are served with noindex', async () => {
  const res = await get('/');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const redirect = await worker.fetch(new Request(B), env);
  assert.equal(redirect.status, 308);
});
