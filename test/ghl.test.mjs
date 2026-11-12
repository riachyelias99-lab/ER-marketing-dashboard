import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAll } from '../pipeline/ghl.mjs';

const KEY = 'pit-00000000-test-key';
const LOC = 'LOC123';
const ok = body => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
const status = code => ({ ok: false, status: code, text: async () => '{"message":"nope"}' });
const range = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));

/** Fake GHL: 220 contacts over 3 pages, 150 opps over 2 pages, 1 pipeline. */
function fakeGhl(overrides = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    for (const [match, fn] of Object.entries(overrides)) if (url.includes(match)) { const r = fn(calls); if (r) return r; }
    const u = new URL(url);
    if (u.pathname === '/opportunities/pipelines') return ok({ pipelines: [{ id: 'p1', name: 'Sales Pipeline', stages: [] }] });
    if (u.pathname === '/contacts/') {
      const start = Number(u.searchParams.get('startAfterId')?.slice(1) ?? -1) + 1;
      const page = range(220, 'c').slice(start, start + 100);
      const next = start + 100 < 220 ? `https://services.leadconnectorhq.com/contacts/?locationId=${LOC}&limit=100&startAfterId=c${start + 99}` : null;
      return ok({ contacts: page, meta: { total: 220, nextPageUrl: next } });
    }
    if (u.pathname === '/opportunities/search') {
      const p = Number(u.searchParams.get('page'));
      return ok({ opportunities: range(150, 'o').slice((p - 1) * 100, p * 100), meta: { total: 150 } });
    }
    throw new Error('unexpected url ' + url);
  };
  return { impl, calls };
}
const noSleep = async () => {};

test('paginates contacts and opportunities', async () => {
  const { impl, calls } = fakeGhl();
  const raw = await fetchAll({ apiKey: KEY, locationId: LOC, fetchImpl: impl, sleep: noSleep });
  assert.equal(raw.contacts.length, 220);
  assert.equal(raw.opportunities.length, 150);
  assert.equal(raw.pipelines.length, 1);
  assert.deepEqual(raw.totals, { contacts: 220, opportunities: 150 });
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(calls[0].init.headers.Version, '2021-07-28');
  assert.ok(calls.every(c => !c.init.method || c.init.method === 'GET'), 'read-only');
});

test('retries on 429 then succeeds', async () => {
  let slept = 0;
  const { impl } = fakeGhl({ '/opportunities/pipelines': calls => (calls.length === 1 ? status(429) : null) });
  const raw = await fetchAll({ apiKey: KEY, locationId: LOC, fetchImpl: impl, sleep: async () => { slept++; } });
  assert.equal(raw.pipelines.length, 1);
  assert.ok(slept >= 1);
});

test('throws after retries on persistent 429', async () => {
  const { impl } = fakeGhl({ '/opportunities/pipelines': () => status(429) });
  await assert.rejects(fetchAll({ apiKey: KEY, locationId: LOC, fetchImpl: impl, sleep: noSleep }));
});

test('throws immediately on a 500 mid-pagination', async () => {
  const { impl, calls } = fakeGhl({ startAfterId: () => status(500) });
  await assert.rejects(fetchAll({ apiKey: KEY, locationId: LOC, fetchImpl: impl, sleep: noSleep }), /500/);
  assert.equal(calls.filter(c => c.url.includes('startAfterId')).length, 1, 'no retry on 500');
});

test('never leaks key or location in errors', async () => {
  const { impl } = fakeGhl({ '/opportunities/pipelines': () => status(401) });
  await assert.rejects(fetchAll({ apiKey: KEY, locationId: LOC, fetchImpl: impl, sleep: noSleep }), err => {
    assert.ok(!err.message.includes(KEY));
    assert.ok(!err.message.includes(LOC));
    return true;
  });
});

test('network/header errors never contain the key', async () => {
  const impl = async () => { throw new TypeError(`Headers.append: "Bearer ${KEY}" is an invalid header value.`); };
  await assert.rejects(fetchAll({ apiKey: KEY, locationId: LOC, fetchImpl: impl, sleep: noSleep }), err => {
    assert.ok(!err.message.includes(KEY), err.message);
    assert.match(err.message, /GHL request failed/);
    return true;
  });
});

test('rejects a key containing whitespace or control characters without echoing it', async () => {
  const { impl, calls } = fakeGhl();
  await assert.rejects(fetchAll({ apiKey: `${KEY}\n`, locationId: LOC, fetchImpl: impl, sleep: noSleep }), err => {
    assert.ok(!err.message.includes(KEY));
    return true;
  });
  assert.equal(calls.length, 0);
});

test('missing meta.total is treated as an error, not as complete', async () => {
  const { impl } = fakeGhl({ '/opportunities/search': () => ok({ opportunities: range(100, 'o') }) });
  await assert.rejects(fetchAll({ apiKey: KEY, locationId: LOC, fetchImpl: impl, sleep: noSleep }), /total/);
});
