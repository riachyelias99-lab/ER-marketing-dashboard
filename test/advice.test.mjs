import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAdvice } from '../pipeline/advice.mjs';

const S = (source, revenue, leads, extra = {}) =>
  ({ source, revenue, leads, revenuePerLead: revenue / leads, smallSample: leads < 20, ignoredWonCount: 0, ...extra });
const names = items => items.map(i => i.source);
const BADGE_MISSING = "Can't judge fairly — a sale's value is missing";

test('classifies against the pooled average', () => {
  const a = computeAdvice([S('A', 4000, 20), S('B', 5000, 100), S('C', 3000, 100)]);
  assert.ok(Math.abs(a.average - 12000 / 220) < 0.01, `pooled average, got ${a.average}`);
  assert.deepEqual(names(a.invest), ['A']);
  assert.deepEqual(names(a.keep), ['B']);
  assert.deepEqual(names(a.cut), ['C']);
  assert.ok(Math.abs(a.keep[0].ratio - 50 / (12000 / 220)) < 0.001);
  assert.match(a.invest[0].reason, /^\$200 per lead, 3\.7× the average$/);
});

test('exactly ±25% lands in invest / cut (boundaries are inclusive)', () => {
  // average = 100/lead; X = 125 (ratio 1.25), Y = 75 (ratio 0.75), Z = 100
  const a = computeAdvice([S('X', 2500, 20), S('Y', 1500, 20), S('Z', 2000, 20)]);
  assert.deepEqual(names(a.invest), ['X']);
  assert.deepEqual(names(a.cut), ['Y']);
  assert.deepEqual(names(a.keep), ['Z']);
});

test('source with ignored won value is never cut', () => {
  const a = computeAdvice([S('A', 4000, 20), S('B', 5000, 100), S('C', 3000, 100, { ignoredWonCount: 1 })]);
  assert.deepEqual(names(a.cut), []);
  const c = a.keep.find(i => i.source === 'C');
  assert.equal(c.badge, BADGE_MISSING);
});

test('source with ignored won value can still be invest', () => {
  const a = computeAdvice([S('A', 4000, 20, { ignoredWonCount: 1 }), S('B', 5000, 100), S('C', 3000, 100)]);
  assert.deepEqual(names(a.invest), ['A']);
});

test('small and unknown sources are not judged and do not move the average', () => {
  const a = computeAdvice([S('A', 2000, 20), S('B', 2000, 20), S('Tiny', 9000, 5), S('Unknown source', 0, 30, { smallSample: false })]);
  assert.equal(a.average, 100);
  assert.deepEqual(names(a.notJudged).sort(), ['Tiny', 'Unknown source']);
  assert.equal(a.notJudged.find(i => i.source === 'Tiny').badge, 'Too few leads to judge');
});

test('zero-sale source is cut not crashed', () => {
  const a = computeAdvice([S('A', 3000, 20), S('B', 3000, 20), S('Zero', 0, 20)]);
  assert.deepEqual(names(a.cut), ['Zero']);
  assert.equal(a.cut[0].ratio, 0);
});

test('no revenue anywhere → everyone kept, no crash', () => {
  const a = computeAdvice([S('A', 0, 20), S('B', 0, 30)]);
  assert.equal(a.average, 0);
  assert.deepEqual(names(a.keep).sort(), ['A', 'B']);
  assert.ok(a.keep.every(i => i.ratio === null));
});
