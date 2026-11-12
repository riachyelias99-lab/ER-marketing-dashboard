import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, hasWholeWord, emailBaseKey, phoneKey, maskEmail } from '../pipeline/text.mjs';

test('norm lowercases, trims and collapses spaces', () => {
  assert.equal(norm('  Facebook   Ad '), 'facebook ad');
  assert.equal(norm(null), '');
});

test('hasWholeWord matches demo/test as whole words', () => {
  for (const s of ['demo@example.com', 'Demo Company', 'demo-data']) assert.equal(hasWholeWord(s, ['demo']), true, s);
  for (const s of ['TEST - LeadPulse', 'leadpulse-test']) assert.equal(hasWholeWord(s, ['test']), true, s);
});

test('hasWholeWord ignores words inside longer words', () => {
  assert.equal(hasWholeWord('Demos Haddad', ['demo']), false);
  assert.equal(hasWholeWord('Demolition Experts', ['demo']), false);
  assert.equal(hasWholeWord('Contest Winners', ['test']), false);
});

test('emailBaseKey strips a trailing .<digits> copy marker', () => {
  assert.equal(emailBaseKey('Fadi.Gerges161.2@Example.com'), 'fadi.gerges161@example.com');
  assert.equal(emailBaseKey('fadi.gerges161@example.com'), 'fadi.gerges161@example.com');
});

test('maskEmail keeps 2 chars and the domain', () => {
  assert.equal(maskEmail('fadi.gerges161@example.com'), 'fa***@example.com');
  assert.equal(maskEmail(''), '');
});

test('phoneKey keeps digits only', () => {
  assert.equal(phoneKey('+1 555-0100 199'), '15550100199');
});
