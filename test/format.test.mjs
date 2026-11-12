import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money, pct } from '../public/js/format.js';

test('money formats whole US dollars and null as a dash', () => {
  assert.equal(money(7000), '$7,000');
  assert.equal(money(1086.2), '$1,086');
  assert.equal(money(0), '$0');
  assert.equal(money(null), '—');
});

test('pct formats a 0–1 rate as a whole percentage and null as a dash', () => {
  assert.equal(pct(0.5427), '54%');
  assert.equal(pct(1), '100%');
  assert.equal(pct(null), '—');
});
