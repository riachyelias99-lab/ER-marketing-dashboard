// The daily pipeline: fetch → validate → clean → calculate → publish (spec §6).
//   node pipeline/run.mjs                       live run (needs GHL_API_KEY, GHL_LOCATION_ID)
//   node pipeline/run.mjs --from-file recon/raw use saved downloads instead of calling GHL
//   --raw                                       Stage 1 preview: no cleaning (local only)
//   --out <dir>                                 output folder (default public/data)
//   --simulate-failure  (or SIMULATE_FAILURE=true) pretend GHL sent half the contacts
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchAll } from './ghl.mjs';
import { resolveCtx } from './rules.mjs';
import { cleanData } from './clean.mjs';
import { computeMetrics } from './metrics.mjs';
import { computeAdvice } from './advice.mjs';
import { buildInsights } from './insights.mjs';
import { runHealthChecks } from './health.mjs';
import { assignFirstCaught, countNew } from './tracking.mjs';
import { STAGE_GROUPS, NEW_BADGE_DAYS } from './config.mjs';
import { beirutDate, beirutDay } from '../public/js/format.js';

function parseArgs(argv, env) {
  const value = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  return {
    fromFile: value('--from-file'),
    outGiven: value('--out') !== null,
    out: value('--out') ?? 'public/data',
    raw: argv.includes('--raw'),
    simulateFailure: argv.includes('--simulate-failure') || String(env.SIMULATE_FAILURE).toLowerCase() === 'true',
  };
}

const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
};

function loadFromFiles(dir) {
  const rd = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const pipelines = rd('pipelines.json').pipelines, contacts = rd('contacts.json'), opportunities = rd('opportunities.json');
  const totals = readJson(path.join(dir, 'totals.json')) ?? { contacts: contacts.length, opportunities: opportunities.length };
  return { pipelines, contacts, opportunities, totals };
}

const pausedNote = lastSuccess => (lastSuccess
  ? `Today's update was paused because the data looked incomplete — showing data from ${beirutDate(lastSuccess)}.`
  : "Today's update was paused because the data looked incomplete — no earlier data is available yet.");

export async function run({ argv = [], env = {}, now = new Date(), fetchImpl = fetch }) {
  const opts = parseArgs(argv, env);
  if (opts.raw && !opts.outGiven) throw new Error('--raw needs --out <folder>: the uncleaned preview must never overwrite the live data in public/data');
  const iso = now.toISOString();
  // Belt and braces: whatever ends up in a committed file never contains the secrets.
  const secrets = [env.GHL_API_KEY, env.GHL_LOCATION_ID].filter(s => s && s.length >= 4);
  const redact = text => secrets.reduce((t, s) => t.split(s).join('<redacted>'), String(text));
  const today = beirutDay(now);
  const files = {
    latest: path.join(opts.out, 'latest.json'),
    status: path.join(opts.out, 'status.json'),
    history: path.join(opts.out, 'history', `${today}.json`),
  };
  const previous = opts.raw ? null : readJson(files.latest);   // missing or corrupt → first run
  const prevStatus = readJson(files.status);

  const fail = (notes, checks = []) => {
    const lastSuccess = prevStatus?.lastSuccess ?? null;
    const status = { lastAttempt: iso, lastSuccess, result: 'fail', notes: [pausedNote(lastSuccess), ...notes.map(redact)] };
    writeJson(files.status, status);
    writeJson(files.history, { status, checks: checks.map(c => ({ ...c, message: redact(c.message) })) });
    return { result: 'fail', latestWritten: false };
  };

  // 1. Fetch (B0: GHL unreachable)
  let raw;
  try {
    raw = opts.fromFile ? loadFromFiles(opts.fromFile)
      : await fetchAll({ apiKey: env.GHL_API_KEY, locationId: env.GHL_LOCATION_ID, baseUrl: env.GHL_BASE_URL || undefined, fetchImpl });
  } catch (err) {
    return fail([`Could not reach GHL (${err.message})`], [{ id: 'B0', level: 'fail', ok: false, message: 'Could not reach GHL' }]);
  }
  if (opts.simulateFailure) raw = { ...raw, contacts: raw.contacts.slice(0, Math.ceil(raw.contacts.length / 2)) };

  // Any unexpected error from here on still produces a "paused" note instead of a silently stale page.
  try {
    return publish(raw);
  } catch (err) {
    return fail([`The update stopped unexpectedly (${err.message})`], [{ id: 'CRASH', level: 'fail', ok: false, message: err.message }]);
  }

  function publish(raw) {
  // 2–4. Validate, clean, calculate
  const ctx = resolveCtx(raw);
  if (!ctx) return fail(['The "Sales Pipeline" was not found in GHL'], [{ id: 'B2', level: 'fail', ok: false, message: 'Sales Pipeline missing' }]);
  const clean = cleanData(raw, ctx, { raw: opts.raw });
  const metrics = computeMetrics(clean.leads, ctx.stages);
  const health = runHealthChecks({ raw, ctx, clean, metrics, previous });
  if (health.result === 'fail') return fail(health.checks.filter(c => !c.ok).map(c => c.message), health.checks);

  // 5. Publish
  const removed = assignFirstCaught(clean.removed, previous?.audit?.removed ?? null, today);
  const ignoredValues = assignFirstCaught(clean.ignoredValues, previous?.audit?.ignoredValues ?? null, today);
  const advice = computeAdvice(metrics.sources);
  const latest = {
    schemaVersion: 1,
    generatedAt: iso,
    mode: opts.raw ? 'raw' : 'clean',
    stages: ctx.stages,
    stageGroups: STAGE_GROUPS,
    totals: metrics.totals,
    sources: metrics.sources,
    advice,
    insights: buildInsights(metrics, advice),
    audit: {
      waterfall: clean.waterfall,
      removed,
      ignoredValues,
      removedA1Count: clean.removedA1Count,
      annotations: clean.annotations,
      newSuspiciousCount: countNew(removed, today) + countNew(ignoredValues, today),
      newSince: previous ? beirutDay(new Date(Date.parse(today) - NEW_BADGE_DAYS * 86400000)) : null,
    },
    health,
  };
  const status = { lastAttempt: iso, lastSuccess: iso, result: health.result, notes: health.checks.filter(c => !c.ok).map(c => c.message) };
  writeJson(files.latest, latest);
  writeJson(files.status, status);
  writeJson(files.history, { status, waterfall: clean.waterfall, removedIds: removed.map(r => r.id), ignoredIds: ignoredValues.map(v => v.id), checks: health.checks });
  return { result: health.result, latestWritten: true };
  }
}

// CLI entry. Prints only counts and messages — never the key or location id.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // Say the last word, wait for it to be flushed, then stop. Without the explicit exit the
  // process can linger on a connection the API server is holding open (seen on CI's Node 22),
  // long after every file has been written. All writes are synchronous, so nothing is lost.
  const finish = (stream, message, code) => stream.write(`${message}\n`, () => process.exit(code));
  run({ argv: process.argv.slice(2), env: process.env })
    .then(r => finish(process.stdout, `Run finished: ${r.result}${r.latestWritten ? ' (new data published)' : ' (kept previous data)'}`, 0))
    .catch(err => finish(process.stderr, `Run crashed: ${err.message}`, 1));
}
