import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_ORDER, STAGE_COLOR_VAR } from '../public/js/charts.js';

test('stage colours carry meaning: won = green, still moving = blues, dead ends = greys', () => {
  assert.equal(STAGE_COLOR_VAR.Closed, '--stage-won');
  for (const s of ['Qualified Opt In', 'Booked call', 'Follow Up']) assert.match(STAGE_COLOR_VAR[s], /^--stage-moving-\d$/, s);
  for (const s of ['Disqualified', 'Cancelled', 'No Show', 'Lost']) assert.match(STAGE_COLOR_VAR[s], /^--stage-dead-\d$/, s);
  assert.equal(STAGE_ORDER[0], 'Closed');
  assert.equal(new Set(Object.values(STAGE_COLOR_VAR)).size, 8);
});
