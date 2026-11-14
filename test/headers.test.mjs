// Guard: the page may run only the exact Chart.js build we reviewed, and the
// site must ship its Content-Security-Policy. Both live in files that are easy
// to edit by hand, so a test makes sure neither quietly disappears.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

test('every external script carries an integrity hash and crossorigin', () => {
  const tags = html.match(/<script[^>]*src="https?:[^"]*"[^>]*>/g) ?? [];
  assert.ok(tags.length > 0, 'expected at least one external script');
  for (const tag of tags) {
    assert.match(tag, /integrity="sha(256|384|512)-[A-Za-z0-9+/=]+"/, tag);
    assert.match(tag, /crossorigin="anonymous"/, tag);
  }
});

test('a Content-Security-Policy is sent for every path and allows only what the page uses', () => {
  const all = vercel.headers.find(h => h.source === '/(.*)');
  const csp = all?.headers.find(h => h.key === 'Content-Security-Policy')?.value ?? '';
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net(;| )/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  const names = all.headers.map(h => h.key);
  for (const k of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options']) assert.ok(names.includes(k), k);
});

test('the page sets no inline style attributes (the CSP would block them)', () => {
  for (const f of fs.readdirSync('public/js')) {
    const src = fs.readFileSync(`public/js/${f}`, 'utf8');
    assert.doesNotMatch(src, /setAttribute\(\s*['"]style['"]/, f);
  }
  assert.doesNotMatch(html, /<[a-z][^>]*\sstyle="/i, 'index.html has an inline style attribute');
});
