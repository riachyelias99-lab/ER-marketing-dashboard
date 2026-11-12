import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanData } from '../pipeline/clean.mjs';
import { resolveCtx } from '../pipeline/rules.mjs';
import { makeContact as C, makeOpp as O, makeRaw } from './fixtures.mjs';

function clean(contacts, opps = [], opts) {
  const raw = makeRaw({ contacts, opps });
  return cleanData(raw, resolveCtx(raw), opts);
}
const lead = (r, id) => r.leads.find(l => l.id === id);

// Five normal deals around a $7,000 median, so outliers are judged against something realistic.
const normalDeals = () => [5000, 6000, 7000, 8000, 9000].map((v, i) => {
  const c = C({ id: `n${i}` });
  return { c, o: O({ contactId: c.id, monetaryValue: v }) };
});

test('source variants merge', () => {
  const r = clean([C({ id: 'a', source: 'Facebook Ad' }), C({ id: 'b', source: 'facebook ad ' }), C({ id: 'c', source: 'Facebook  Ad' })]);
  assert.deepEqual(r.leads.map(l => l.source), ['Facebook Ad', 'Facebook Ad', 'Facebook Ad']);
});

test('blank source on a tagged lead becomes "Unknown source"', () => {
  const r = clean([C({ id: 'u', source: '' })]);
  assert.equal(lead(r, 'u').source, 'Unknown source');
  assert.equal(r.annotations.unknownSource, 1);
});

test('deal source is used when the contact has none', () => {
  const r = clean([C({ id: 'd', source: null })], [O({ contactId: 'd', source: 'Webinar' })]);
  assert.equal(lead(r, 'd').source, 'Webinar');
});

test('A7 ignores 145000 when median is 7000 and keeps the sale', () => {
  const n = normalDeals();
  const big = C({ id: 'big', source: 'Facebook Ad' });
  const r = clean([...n.map(x => x.c), big], [...n.map(x => x.o), O({ id: 'bigdeal', contactId: 'big', stage: 'Closed', status: 'won', monetaryValue: 145000 })]);
  const d = lead(r, 'big').deal;
  assert.equal(d.value, null);
  assert.equal(d.originalValue, 145000);
  assert.equal(d.valueIgnored, true);
  assert.equal(d.stage, 'Closed');
  assert.equal(r.ignoredValues.length, 1);
  assert.deepEqual({ ...r.ignoredValues[0], reason: undefined },
    { id: 'bigdeal', dealName: 'Deal bigdeal', source: 'Facebook Ad', stage: 'Closed', value: 145000, reason: undefined, firstCaught: null });
});

test('A7 ignores $0 on a Closed deal; A8 keeps $0 on an open deal', () => {
  const n = normalDeals();
  const r = clean([...n.map(x => x.c), C({ id: 'zw' }), C({ id: 'zo' })],
    [...n.map(x => x.o), O({ contactId: 'zw', stage: 'Closed', status: 'won', monetaryValue: 0 }), O({ contactId: 'zo', stage: 'Booked call', monetaryValue: 0 })]);
  assert.equal(lead(r, 'zw').deal.valueIgnored, true);
  assert.equal(lead(r, 'zo').deal.valueIgnored, false);
  assert.equal(lead(r, 'zo').deal.value, 0);
  assert.equal(r.ignoredValues.length, 1);
});

test('A9 counts Disqualified+open as a mismatch and keeps stage', () => {
  const r = clean([C({ id: 'm' })], [O({ contactId: 'm', stage: 'Disqualified', status: 'open' })]);
  assert.equal(r.annotations.stageStatusMismatch, 1);
  assert.equal(lead(r, 'm').deal.stage, 'Disqualified');
});

test('multiple deals per contact uses furthest-advanced', () => {
  const r = clean([C({ id: 'x' })], [O({ contactId: 'x', stage: 'Booked call' }), O({ id: 'win', contactId: 'x', stage: 'Closed', status: 'won' })]);
  assert.equal(lead(r, 'x').deal.id, 'win');
  assert.equal(r.annotations.extraDeals, 1);
});

test('orphan deal is counted, not a lead', () => {
  const r = clean([C({ id: 'a' })], [O({ contactId: 'ghost' })]);
  assert.equal(r.leads.length, 1);
  assert.equal(r.annotations.orphanDeals, 1);
});

test('raw mode applies only A1 and ignores no values', () => {
  const n = normalDeals();
  const r = clean(
    [...n.map(x => x.c), C({ id: 'int', tags: ['dash-project', 'internal'] }), C({ id: 'big' }), C({ id: 'other', tags: [] })],
    [...n.map(x => x.o), O({ contactId: 'big', stage: 'Closed', status: 'won', monetaryValue: 145000 })],
    { raw: true });
  assert.deepEqual(r.waterfall.map(s => s.rule), ['START', 'A1']);
  assert.ok(lead(r, 'int'), 'internal kept in raw mode');
  assert.equal(lead(r, 'big').deal.value, 145000);
  assert.equal(r.ignoredValues.length, 0);
  assert.equal(r.leads.length, 7);
});

test('the most common spelling names the merged source', () => {
  const r = clean([C({ id: 'v', source: 'facebook ad ' }), C({ id: 'a', source: 'Facebook Ad' }), C({ id: 'b', source: 'Facebook Ad' })]);
  assert.deepEqual(r.leads.map(l => l.source), ['Facebook Ad', 'Facebook Ad', 'Facebook Ad']);
});
