import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHealthChecks } from '../pipeline/health.mjs';
import { EXPECTED_STAGES } from '../pipeline/config.mjs';

function input({ contacts = 100, totalContacts = 100, opps = 50, totalOpps = 50, stages = EXPECTED_STAGES, ctx = true,
  leads = 80, scope = 100, sources = ['Referral', 'Billboard'], previous = { totals: { leads: 80 }, sources: [{ source: 'Referral' }, { source: 'Billboard' }] },
  consistent = true } = {}) {
  const leadsPerSource = Math.floor(leads / sources.length);
  const ms = sources.map((source, i) => ({ source, leads: i === 0 ? leads - leadsPerSource * (sources.length - 1) : leadsPerSource, deals: 0, sales: 0, revenue: 0, stageCounts: {} }));
  const metrics = { sources: ms, totals: { leads, deals: consistent ? 0 : 5, sales: 0, revenue: 0 } };
  return {
    raw: { contacts: Array(contacts).fill({}), opportunities: Array(opps).fill({}), totals: { contacts: totalContacts, opportunities: totalOpps } },
    ctx: ctx ? { stages } : null,
    clean: { scopeCount: scope, leads: Array(leads).fill({}) },
    metrics,
    previous,
  };
}
const check = (r, id) => r.checks.find(c => c.id === id);

test('pass when all good', () => {
  const r = runHealthChecks(input());
  assert.equal(r.result, 'pass');
  assert.ok(r.checks.every(c => c.ok));
});

test('B1 fails when contacts are half of the total', () => {
  const r = runHealthChecks(input({ contacts: 50 }));
  assert.equal(r.result, 'fail');
  assert.equal(check(r, 'B1').ok, false);
  assert.match(check(r, 'B1').message, /50 of 100/);
});

test('B2 fails on a renamed stage and on a missing pipeline', () => {
  assert.equal(check(runHealthChecks(input({ stages: [...EXPECTED_STAGES.slice(0, 7), 'Gone'] })), 'B2').ok, false);
  const r = runHealthChecks(input({ ctx: false }));
  assert.equal(check(r, 'B2').ok, false);
  assert.equal(r.result, 'fail');
});

test('B3 fails at a 25% drop, passes at 10%, skipped with no previous', () => {
  assert.equal(check(runHealthChecks(input({ leads: 60 })), 'B3').ok, false);
  assert.equal(check(runHealthChecks(input({ leads: 72 })), 'B3').ok, true);
  assert.equal(check(runHealthChecks(input({ leads: 10, previous: null })), 'B3'), undefined);
});

test('B4 warns on a never-seen source and names it', () => {
  const r = runHealthChecks(input({ sources: ['Referral', 'Billboard', 'TikTok Ad'] }));
  assert.equal(r.result, 'warn');
  assert.match(check(r, 'B4').message, /TikTok Ad/);
});

test('B5 warns when cleaning removes more than 40%', () => {
  const r = runHealthChecks(input({ leads: 55, scope: 100, previous: null }));
  assert.equal(r.result, 'warn');
  assert.equal(check(r, 'B5').ok, false);
});

test('consistency failure fails the run', () => {
  const r = runHealthChecks(input({ consistent: false }));
  assert.equal(r.result, 'fail');
  assert.equal(check(r, 'CONSISTENCY').ok, false);
});
