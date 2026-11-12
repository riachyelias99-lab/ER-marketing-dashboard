import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights } from '../pipeline/insights.mjs';

function src(source, o) {
  const leads = o.leads, deals = o.deals ?? 0, sales = o.sales ?? 0, revenue = o.revenue ?? 0;
  const counts = [leads, deals, o.qualified ?? deals, o.booked ?? deals, o.attended ?? sales, sales];
  const labels = ['Lead', 'Entered pipeline', 'Qualified', 'Booked a call', 'Attended the call', 'Won'];
  const funnel = counts.map((count, i) => ({ key: String(i), label: labels[i], count }));
  return {
    source, leads, deals, sales, revenue, revenuePerLead: revenue / leads, smallSample: leads < 20,
    overallRate: sales / leads, ignoredWonCount: o.ignored ?? 0, funnel,
    stepRates: funnel.slice(1).map((s, i) => ({ from: funnel[i].label, to: s.label, rate: funnel[i].count ? s.count / funnel[i].count : null })),
    stageCounts: { 'Qualified Opt In': o.open ?? 0, 'Booked call': 0, 'Follow Up': 0 },
  };
}
const metrics = sources => ({
  sources,
  totals: ['leads', 'deals', 'sales', 'revenue'].reduce((t, k) => ({ ...t, [k]: sources.reduce((a, s) => a + s[k], 0) }), {}),
});
const advice = { average: 100, invest: [{ source: 'Billboard', revenuePerLead: 1081, ratio: 1.67, reason: 'x', badge: null }], keep: [], cut: [], notJudged: [] };

test('numbers in sentences match metrics', () => {
  const m = metrics([
    src('Referral', { leads: 46, deals: 30, sales: 3, revenue: 19250, open: 9 }),
    src('Billboard', { leads: 37, deals: 24, sales: 4, revenue: 40000, booked: 20, attended: 6 }),
  ]);
  const ins = buildInsights(m, advice);
  assert.match(ins.volume[0], /Referral brought the most leads \(46\)/);
  assert.match(ins.revenue[0], /Billboard brought the most closed revenue \(\$40,000\)/);
  assert.match(ins.conversion[0], /Billboard turns the most leads into sales: 11% of its leads became clients/);
  assert.match(ins.advice[0], /Billboard/);
  assert.match(ins.advice[0], /\$1,081/);
});

test('insights handle a tie for top source', () => {
  const m = metrics([src('A', { leads: 30 }), src('B', { leads: 30 }), src('C', { leads: 10 })]);
  assert.match(buildInsights(m, advice).volume[0], /A and B brought the most leads \(30 each\)/);
});

test('all similar → "All sources perform similarly"', () => {
  const m = metrics([src('A', { leads: 30, revenue: 3000 })]);
  const ins = buildInsights(m, { average: 100, invest: [], cut: [], keep: [{ source: 'A', revenuePerLead: 100, ratio: 1, reason: '', badge: null }], notJudged: [] });
  assert.match(ins.advice[0], /^All sources perform similarly/);
});

test('revenue insight warns when values were ignored', () => {
  const m = metrics([src('Facebook Ad', { leads: 37, deals: 24, sales: 3, revenue: 7000, ignored: 1 })]);
  assert.ok(buildInsights(m, advice).revenue.some(s => /not counted/.test(s)));
});

test('no sentence contains NaN, Infinity or undefined', () => {
  const m = metrics([src('Zero', { leads: 20 })]);
  const ins = buildInsights(m, { average: 0, invest: [], keep: [], cut: [], notJudged: [] });
  for (const s of Object.values(ins).flat()) assert.doesNotMatch(s, /NaN|Infinity|undefined|null/);
});
