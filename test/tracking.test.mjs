import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignFirstCaught, countNew } from '../pipeline/tracking.mjs';

test('first run: everything is already known (firstCaught null)', () => {
  const out = assignFirstCaught([{ id: 'a' }, { id: 'b' }], null, '2026-11-12');
  assert.deepEqual(out.map(x => x.firstCaught), [null, null]);
});

test('seen id keeps its date, baseline id stays null, new id gets today', () => {
  const prev = [{ id: 'old', firstCaught: '2026-11-03' }, { id: 'base', firstCaught: null }];
  const items = [{ id: 'old' }, { id: 'base' }, { id: 'fresh' }];
  const out = assignFirstCaught(items, prev, '2026-11-12');
  assert.deepEqual(out.map(x => x.firstCaught), ['2026-11-03', null, '2026-11-12']);
  assert.equal(items[2].firstCaught, undefined, 'input not mutated');
});

test('countNew counts the last 7 days only and ignores nulls', () => {
  const items = [{ firstCaught: '2026-11-12' }, { firstCaught: '2026-11-06' }, { firstCaught: '2026-11-05' }, { firstCaught: null }];
  assert.equal(countNew(items, '2026-11-12'), 2);
});
