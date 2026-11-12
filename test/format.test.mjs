import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money, pct, beirutDateTime, beirutDate, isNew } from '../public/js/format.js';

test('beirutDateTime and beirutDate show Beirut local time', () => {
  // 04:00 UTC in November = 06:00 in Beirut (UTC+2)
  assert.equal(beirutDateTime('2026-11-16T04:00:00.000Z'), 'Mon 16 Nov, 06:00');
  assert.equal(beirutDate('2026-11-16T04:00:00.000Z'), 'Mon 16 Nov');
  assert.equal(beirutDateTime(null), '—');
});

test('isNew is true for the last 7 days only', () => {
  assert.equal(isNew('2026-11-10', '2026-11-12'), true);
  assert.equal(isNew('2026-11-01', '2026-11-12'), false);
  assert.equal(isNew(null, '2026-11-12'), false);
});

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
