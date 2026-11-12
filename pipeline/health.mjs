// Batch-level health checks — the quality gate (spec §8). B0 (GHL unreachable) is raised by run.mjs.
import { EXPECTED_STAGES, DROP_FAIL_SHARE, REMOVAL_WARN_SHARE } from './config.mjs';
import { checkConsistency } from './metrics.mjs';

/** @returns {{ result: 'pass'|'warn'|'fail', checks: Array<{id, level, ok, message}> }} */
export function runHealthChecks({ raw, ctx, clean, metrics, previous }) {
  const checks = [];
  const add = (id, level, ok, message) => checks.push({ id, level, ok, message });

  const got = raw.contacts.length, want = raw.totals.contacts;
  const gotO = raw.opportunities.length, wantO = raw.totals.opportunities;
  add('B1', 'fail', got === want && gotO === wantO,
    got === want && gotO === wantO ? 'Received every record GHL reported'
      : `Incomplete download: ${got} of ${want} contacts and ${gotO} of ${wantO} deals arrived`);

  const stagesOk = !!ctx && ctx.stages.length === EXPECTED_STAGES.length && ctx.stages.every((s, i) => s === EXPECTED_STAGES[i]);
  add('B2', 'fail', stagesOk, !ctx ? 'The "Sales Pipeline" was not found in GHL'
    : stagesOk ? 'Sales Pipeline has the expected 8 stages' : `Sales Pipeline stages changed: ${ctx.stages.join(', ')}`);

  if (previous) {
    const before = previous.totals?.leads ?? 0, now = metrics.totals.leads;
    const ok = now >= before * (1 - DROP_FAIL_SHARE);
    add('B3', 'fail', ok, ok ? 'No sudden drop in leads' : `Leads dropped from ${before} to ${now} since the last update`);

    const known = new Set((previous.sources ?? []).map(s => s.source));
    const fresh = metrics.sources.map(s => s.source).filter(s => !known.has(s));
    add('B4', 'warn', fresh.length === 0, fresh.length ? `New source appeared: ${fresh.join(', ')}` : 'No unfamiliar sources');
  }

  const share = clean.scopeCount ? (clean.scopeCount - clean.leads.length) / clean.scopeCount : 0;
  add('B5', 'warn', share <= REMOVAL_WARN_SHARE,
    share <= REMOVAL_WARN_SHARE ? 'Removal share is normal' : `Cleaning removed ${Math.round(share * 100)}% of the agency's records today`);

  const problems = checkConsistency(metrics);
  add('CONSISTENCY', 'fail', problems.length === 0, problems.length ? problems.join('; ') : 'All breakdowns add up to the totals');

  const failed = checks.filter(c => !c.ok);
  const result = failed.some(c => c.level === 'fail') ? 'fail' : failed.length ? 'warn' : 'pass';
  return { result, checks };
}
