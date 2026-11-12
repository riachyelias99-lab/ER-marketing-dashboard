import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../pipeline/run.mjs';
import { makeContact as C, makeOpp as O, makeRaw } from './fixtures.mjs';

const STAGES = ['Closed', 'Lost', 'Booked call', 'Follow Up', 'Qualified Opt In', 'No Show'];

/** A small but realistic agency: 30 clean leads with deals, 2 internal, 1 demo, 1 stranger. */
function sourceData(extraContacts = []) {
  const contacts = [], opps = [];
  for (let i = 0; i < 30; i++) {
    const c = C({ id: `lead${i}`, source: i % 2 ? 'Referral' : 'Billboard' });
    contacts.push(c);
    opps.push(O({ id: `deal${i}`, contactId: c.id, stage: STAGES[i % STAGES.length], status: i % STAGES.length === 0 ? 'won' : 'open', monetaryValue: 5000 + 250 * (i % 9) }));
  }
  contacts.push(C({ id: 'int1', tags: ['dash-project', 'internal'] }), C({ id: 'int2', tags: ['dash-project', 'internal'] }));
  contacts.push(C({ id: 'demo1', tags: ['demo-data'] }));
  opps.push(O({ contactId: 'demo1' }));
  contacts.push(C({ id: 'stranger', tags: [] }));
  contacts.push(...extraContacts);
  return makeRaw({ contacts, opps });
}

function tempDirs(raw = sourceData()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'er-run-'));
  const src = path.join(root, 'src'), out = path.join(root, 'out');
  writeSource(src, raw);
  return { src, out };
}
function writeSource(src, raw) {
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'pipelines.json'), JSON.stringify({ pipelines: raw.pipelines }));
  fs.writeFileSync(path.join(src, 'contacts.json'), JSON.stringify(raw.contacts));
  fs.writeFileSync(path.join(src, 'opportunities.json'), JSON.stringify(raw.opportunities));
}
const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const NOW = new Date('2026-11-16T04:00:00.000Z');

test('pass run writes latest, status and history', async () => {
  const { src, out } = tempDirs();
  const r = await run({ argv: ['--from-file', src, '--out', out], env: {}, now: NOW });
  assert.equal(r.result, 'pass');
  assert.equal(r.latestWritten, true);
  const latest = read(out, 'latest.json');
  assert.equal(latest.schemaVersion, 1);
  assert.equal(latest.mode, 'clean');
  assert.equal(latest.totals.leads, 30);
  assert.deepEqual(latest.audit.waterfall.map(s => s.remaining), [34, 33, 32, 32, 32, 30, 30]);
  assert.equal(latest.audit.newSince, null);
  const status = read(out, 'status.json');
  assert.equal(status.result, 'pass');
  assert.equal(status.lastSuccess, NOW.toISOString());
  assert.ok(fs.existsSync(path.join(out, 'history', '2026-11-16.json')));
});

test('simulate-failure writes fail status and keeps previous latest.json byte-identical', async () => {
  const { src, out } = tempDirs();
  await run({ argv: ['--from-file', src, '--out', out], env: {}, now: NOW });
  const before = fs.readFileSync(path.join(out, 'latest.json'));
  const later = new Date('2026-11-17T04:00:00.000Z');
  const r = await run({ argv: ['--from-file', src, '--out', out, '--simulate-failure'], env: {}, now: later });
  assert.equal(r.result, 'fail');
  assert.equal(r.latestWritten, false);
  assert.deepEqual(fs.readFileSync(path.join(out, 'latest.json')), before);
  const status = read(out, 'status.json');
  assert.equal(status.result, 'fail');
  assert.equal(status.lastSuccess, NOW.toISOString(), 'last success unchanged');
  assert.equal(status.notes[0], "Today's update was paused because the data looked incomplete — showing data from Mon 16 Nov.");
});

test('SIMULATE_FAILURE env var works too', async () => {
  const { src, out } = tempDirs();
  const r = await run({ argv: ['--from-file', src, '--out', out], env: { SIMULATE_FAILURE: 'true' }, now: NOW });
  assert.equal(r.result, 'fail');
});

test('fetch error writes fail status and keeps latest.json', async () => {
  const { src, out } = tempDirs();
  await run({ argv: ['--from-file', src, '--out', out], env: {}, now: NOW });
  const before = fs.readFileSync(path.join(out, 'latest.json'));
  const r = await run({ argv: ['--out', out], env: { GHL_API_KEY: 'k', GHL_LOCATION_ID: 'l' }, now: NOW,
    fetchImpl: async () => { throw new Error('network down'); } });
  assert.equal(r.result, 'fail');
  assert.deepEqual(fs.readFileSync(path.join(out, 'latest.json')), before);
  assert.ok(read(out, 'status.json').notes.some(n => /Could not reach GHL/.test(n)));
});

test('corrupt previous snapshot treated as first run', async () => {
  const { src, out } = tempDirs();
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'latest.json'), '{ not json');
  const r = await run({ argv: ['--from-file', src, '--out', out], env: {}, now: NOW });
  assert.equal(r.result, 'pass');
  const latest = read(out, 'latest.json');
  assert.equal(latest.health.checks.find(c => c.id === 'B3'), undefined);
  assert.ok(latest.audit.removed.every(x => x.firstCaught === null));
});

test('second run marks only newly removed ids as new', async () => {
  const { src, out } = tempDirs();
  await run({ argv: ['--from-file', src, '--out', out], env: {}, now: NOW });
  writeSource(src, sourceData([C({ id: 'int3', tags: ['dash-project', 'internal'] })]));
  await run({ argv: ['--from-file', src, '--out', out], env: {}, now: new Date('2026-11-17T04:00:00.000Z') });
  const latest = read(out, 'latest.json');
  const removed = Object.fromEntries(latest.audit.removed.map(x => [x.id, x.firstCaught]));
  assert.deepEqual(removed, { demo1: null, int1: null, int2: null, int3: '2026-11-17' });
  assert.equal(latest.audit.newSuspiciousCount, 1);
  assert.equal(latest.audit.newSince, '2026-11-10');
});

test('latest.json contains no raw email addresses', async () => {
  const { src, out } = tempDirs();
  await run({ argv: ['--from-file', src, '--out', out], env: {}, now: NOW });
  const text = fs.readFileSync(path.join(out, 'latest.json'), 'utf8');
  assert.doesNotMatch(text, /[A-Za-z0-9._%+-]@[A-Za-z0-9-]+\./);
  assert.match(text, /\*\*\*@example\.com/);
});

test('raw mode writes an uncleaned snapshot', async () => {
  const { src, out } = tempDirs();
  await run({ argv: ['--from-file', src, '--out', out, '--raw'], env: {}, now: NOW });
  const latest = read(out, 'latest.json');
  assert.equal(latest.mode, 'raw');
  assert.equal(latest.totals.leads, 33);
});

const REAL = 'recon/raw';
test('real data reproduces the agreed waterfall', { skip: !fs.existsSync(path.join(REAL, 'contacts.json')) && 'recon/raw not present (CI)' }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'er-real-'));
  await run({ argv: ['--from-file', REAL, '--out', out], env: {}, now: NOW });
  const latest = read(out, 'latest.json');
  assert.deepEqual(latest.audit.waterfall.map(s => s.remaining), [420, 355, 322, 322, 321, 306, 294]);
  assert.equal(latest.totals.deals, 204);
  assert.equal(latest.audit.ignoredValues.length, 7);
  assert.equal(latest.audit.removedA1Count, 65);
  assert.equal(latest.audit.annotations.stageStatusMismatch, 2);
  assert.notEqual(latest.health.result, 'fail');
});
