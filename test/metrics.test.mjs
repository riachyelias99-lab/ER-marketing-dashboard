import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, checkConsistency } from '../pipeline/metrics.mjs';
import { EXPECTED_STAGES } from '../pipeline/config.mjs';

let n = 0;
/** Lead builder: L('Referral', 'Closed', 8000) — stage null = no deal. */
function L(source, stage = null, value = 5000, extra = {}) {
  const id = `l${++n}`;
  return { id, name: id, email: '', source, deal: stage ? { id: `d${id}`, name: 'x', stage, status: 'open', value, originalValue: value, valueIgnored: false, ...extra } : null };
}
const many = (k, f) => Array.from({ length: k }, f);
const src = (m, s) => m.sources.find(x => x.source === s);

// Referral: 20 leads, 10 deals: 4 Closed ($8k), 2 Lost, 1 No Show, 1 Disqualified, 2 Qualified Opt In
const referral = () => [
  ...many(4, () => L('Referral', 'Closed', 8000)), ...many(2, () => L('Referral', 'Lost')),
  L('Referral', 'No Show'), L('Referral', 'Disqualified'), ...many(2, () => L('Referral', 'Qualified Opt In')),
  ...many(10, () => L('Referral')),
];

test('stage counts sum to deals per source and overall', () => {
  const m = computeMetrics([...referral(), L('Billboard', 'Booked call')], EXPECTED_STAGES);
  const r = src(m, 'Referral');
  assert.equal(r.leads, 20);
  assert.equal(r.deals, 10);
  assert.equal(Object.keys(r.stageCounts).length, 8);
  assert.equal(Object.values(r.stageCounts).reduce((a, b) => a + b, 0), 10);
  assert.equal(m.totals.deals, 11);
  assert.equal(m.totals.leads, 21);
  assert.deepEqual(checkConsistency(m), []);
});

test('funnel uses "reached at least"', () => {
  const r = src(computeMetrics(referral(), EXPECTED_STAGES), 'Referral');
  assert.deepEqual(r.funnel.map(s => s.count), [20, 10, 9, 7, 6, 4]);
  assert.deepEqual(r.funnel.map(s => s.key), ['lead', 'pipeline', 'qualified', 'booked', 'attended', 'won']);
  assert.equal(r.stepRates[0].rate, 0.5);
  assert.equal(r.stepRates[3].rate, 6 / 7);
  assert.equal(r.overallRate, 0.2);
});

test('revenue, revenue per lead, close rate, projection and forecast', () => {
  const r = src(computeMetrics(referral(), EXPECTED_STAGES), 'Referral');
  assert.equal(r.sales, 4);
  assert.equal(r.revenue, 32000);
  assert.equal(r.revenuePerLead, 1600);
  assert.equal(r.closeRate, 0.2);
  assert.equal(r.smallSample, false);
  assert.deepEqual(r.projection, { per10Sales: 2, per10Revenue: 16000 });
  // open = 2 (Qualified Opt In); decided = 4 won + 2 Lost + 1 No Show + 1 Disqualified = 8 → winRate 0.5; avg won $8000
  assert.deepEqual(r.openForecast, { openDeals: 2, winRate: 0.5, avgWonValue: 8000, expectedRevenue: 8000 });
});

test('zero denominators yield null', () => {
  const r = src(computeMetrics(many(25, () => L('Billboard')), EXPECTED_STAGES), 'Billboard');
  assert.equal(r.deals, 0);
  assert.ok(r.stepRates.slice(1).every(s => s.rate === null));
  assert.equal(r.revenuePerLead, 0);
  assert.equal(r.openForecast.winRate, null);
  assert.equal(r.openForecast.expectedRevenue, null);
  for (const v of [r.closeRate, r.overallRate, r.revenue]) assert.ok(Number.isFinite(v));
});

test('ignored value counts as a sale but adds $0', () => {
  const leads = [...referral(), L('Referral', 'Closed', null, { valueIgnored: true, originalValue: 145000 })];
  const r = src(computeMetrics(leads, EXPECTED_STAGES), 'Referral');
  assert.equal(r.sales, 5);
  assert.equal(r.revenue, 32000);
  assert.equal(r.ignoredWonCount, 1);
  assert.deepEqual(r.ignoredWonValues, [145000]);
});

test('small sample source has null projection and forecast', () => {
  const r = src(computeMetrics([L('Webinar', 'Closed', 9000), ...many(5, () => L('Webinar'))], EXPECTED_STAGES), 'Webinar');
  assert.equal(r.smallSample, true);
  assert.equal(r.projection, null);
  assert.equal(r.openForecast, null);
});

test('avg won value falls back to agency-wide when a source has no trusted wins', () => {
  const leads = [...referral(), ...many(20, () => L('Billboard', 'Booked call'))];
  const b = src(computeMetrics(leads, EXPECTED_STAGES), 'Billboard');
  assert.equal(b.openForecast.avgWonValue, 8000);
});

test('sources sorted by revenue per lead, best first', () => {
  const m = computeMetrics([...referral(), ...many(20, () => L('Billboard'))], EXPECTED_STAGES);
  assert.deepEqual(m.sources.map(s => s.source), ['Referral', 'Billboard']);
});

test('checkConsistency flags a tampered stageCounts', () => {
  const m = computeMetrics(referral(), EXPECTED_STAGES);
  m.sources[0].stageCounts.Closed += 1;
  assert.equal(checkConsistency(m).length > 0, true);
});
