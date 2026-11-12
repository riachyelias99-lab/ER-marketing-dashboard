import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCtx, applyRemovalRules } from '../pipeline/rules.mjs';
import { makeContact as C, makeOpp as O, makeRaw } from './fixtures.mjs';

function run(contacts, opps = []) {
  const raw = makeRaw({ contacts, opps });
  return applyRemovalRules(raw, resolveCtx(raw));
}
const keptIds = r => r.kept.map(k => k.contact.id).sort();
const ruleOf = (r, id) => r.removed.find(x => x.id === id)?.rule;

test('resolveCtx finds the Sales Pipeline and returns null when missing', () => {
  const raw = makeRaw();
  const ctx = resolveCtx(raw);
  assert.equal(ctx.pipelineId, 'sp');
  assert.equal(ctx.stages.length, 8);
  assert.equal(ctx.stageNameById.get('s4'), 'Closed');
  assert.equal(resolveCtx({ ...raw, pipelines: raw.pipelines.slice(1) }), null);
});

test('A1 removes untagged contacts with no Sales Pipeline deal and only counts them', () => {
  const r = run([C({ id: 'a' }), C({ id: 'stranger', tags: [] })], [O({ contactId: 'stranger', pipelineId: 'other' })]);
  assert.deepEqual(keptIds(r), ['a']);
  assert.equal(r.removedA1Count, 1);
  assert.equal(r.removed.length, 0, 'A1 records are not listed');
  assert.equal(r.scopeCount, 1);
});

test('an untagged contact with a source and a Sales Pipeline deal is kept', () => {
  const r = run([C({ id: 'newlead', tags: [], source: 'Webinar' })], [O({ contactId: 'newlead' })]);
  assert.deepEqual(keptIds(r), ['newlead']);
});

test('A2 catches demo-data tag, demo@ email and "Demo Company"', () => {
  const r = run([
    C({ id: 'd1', tags: ['demo-data', 'sandbox'] }),
    C({ id: 'd2', email: 'demo@example.com' }),
    C({ id: 'd3', companyName: 'Demo Company' }),
  ], [O({ contactId: 'd1' })]); // real demo-data leads sit in the Sales Pipeline, so A1 doesn't catch them first
  assert.deepEqual(['d1', 'd2', 'd3'].map(id => ruleOf(r, id)), ['A2', 'A2', 'A2']);
});

test('A2 does not catch a "Demos Haddad" contact', () => {
  const r = run([C({ id: 'x', contactName: 'Demos Haddad', companyName: 'Demolition Experts' })]);
  assert.deepEqual(keptIds(r), ['x']);
});

test('A3 catches leadpulse-test tag and "TEST - …" deal name', () => {
  const r = run([C({ id: 't1', tags: ['dash-project', 'leadpulse-test'] }), C({ id: 't2' })],
    [O({ contactId: 't2', name: 'TEST - LeadPulse Website Inquiry' })]);
  assert.equal(ruleOf(r, 't1'), 'A3');
  assert.equal(ruleOf(r, 't2'), 'A3');
});

test('A3b catches untagged pipeline entry with blank source', () => {
  const r = run([C({ id: 'dane', tags: [], source: null, email: 'dane.h@personal-mail.example' })], [O({ contactId: 'dane', source: null })]);
  assert.equal(ruleOf(r, 'dane'), 'A3b');
});

test('A4 catches internal', () => {
  const r = run([C({ id: 'i', tags: ['dash-project', 'internal'] })]);
  assert.equal(ruleOf(r, 'i'), 'A4');
});

test('A5 keeps the original with a deal and removes the .2 copy', () => {
  const r = run([
    C({ id: 'orig', email: 'fadi.gerges161@example.com', source: 'Cold Email' }),
    C({ id: 'copy', email: 'fadi.gerges161.2@example.com', source: 'Instagram Ad' }),
  ], [O({ contactId: 'orig' })]);
  assert.deepEqual(keptIds(r), ['orig']);
  assert.equal(ruleOf(r, 'copy'), 'A5');
  assert.equal(r.removed[0].maskedEmail, 'fa***@example.com');
});

test('A5 does not treat name.2@ as a copy when no base address exists', () => {
  const r = run([C({ id: 'solo', email: 'john.smith.2@example.com' })]);
  assert.deepEqual(keptIds(r), ['solo']);
});

test('A5 with both copies holding deals keeps the more advanced one and removes the other deal', () => {
  const r = run([
    C({ id: 'early', contactName: 'Rana Assaf', companyName: 'Marina Co' }),
    C({ id: 'later', contactName: 'rana  assaf', companyName: 'marina co' }),
  ], [O({ contactId: 'early', stage: 'Qualified Opt In' }), O({ contactId: 'later', stage: 'Closed' })]);
  assert.deepEqual(keptIds(r), ['later']);
  assert.equal(r.kept[0].opps.length, 1);
  assert.equal(ruleOf(r, 'early'), 'A5');
});

test('A5 respects "dq - duplicate" tag', () => {
  const r = run([
    C({ id: 'a', email: 'sami.sleiman180@example.com' }),
    C({ id: 'b', email: 'sami.sleiman180.2@example.com', tags: ['dash-project', 'dq - duplicate'] }),
  ], [O({ contactId: 'b', stage: 'Closed' })]);
  assert.deepEqual(keptIds(r), ['a']);
});

test('A5 matches on phone digits', () => {
  const r = run([C({ id: 'p1', phone: '+1 555 0100 123' }), C({ id: 'p2', phone: '1-555-0100123' })], [O({ contactId: 'p1' })]);
  assert.deepEqual(keptIds(r), ['p1']);
});

test('each record removed once; waterfall sums', () => {
  const contacts = [
    ...Array.from({ length: 6 }, (_, i) => C({ id: `ok${i}` })),
    C({ id: 'base', email: 'jo.b1@example.com' }),
    C({ id: 'both', email: 'jo.b1.2@example.com', tags: ['dash-project', 'internal'] }), // internal AND a copy
    C({ id: 'demo', tags: ['demo-data'] }),
    C({ id: 'other', tags: [] }),
  ];
  const r = run(contacts);
  assert.equal(ruleOf(r, 'both'), 'A4', 'first matching rule wins');
  assert.equal(r.removed.filter(x => x.id === 'both').length, 1);
  const start = r.waterfall[0];
  assert.equal(start.rule, 'START');
  assert.equal(start.remaining, 10);
  assert.deepEqual(r.waterfall.map(s => s.rule), ['START', 'A1', 'A2', 'A3', 'A3b', 'A4', 'A5']);
  const removedSum = r.waterfall.slice(1).reduce((a, s) => a + s.removed, 0);
  assert.equal(start.remaining - removedSum, r.kept.length);
  assert.equal(r.waterfall.at(-1).remaining, r.kept.length);
  for (let i = 1; i < r.waterfall.length; i++) assert.equal(r.waterfall[i].remaining, r.waterfall[i - 1].remaining - r.waterfall[i].removed);
});

test('resolveCtx: the pinned agency pipeline id wins over a same-named impostor', async () => {
  const { AGENCY_PIPELINE_ID } = await import('../pipeline/config.mjs');
  const raw = makeRaw();
  raw.pipelines = [{ id: 'impostor', name: 'Sales Pipeline', stages: [] }, { ...raw.pipelines[0], id: AGENCY_PIPELINE_ID }];
  assert.equal(resolveCtx(raw).pipelineId, AGENCY_PIPELINE_ID);
});

test('resolveCtx: two pipelines named "Sales Pipeline" without the pinned id → ambiguous → null', () => {
  const raw = makeRaw();
  raw.pipelines = [raw.pipelines[0], { ...raw.pipelines[0], id: 'copy' }];
  assert.equal(resolveCtx(raw), null);
});
