// The GHL location id is treated as a secret too (it lives in GitHub Secrets), and
// some GHL keys are JWT-style ("eyJ…") rather than "pit-…".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const files = () => execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' }).split('\n').filter(f => f && fs.existsSync(f));
const envValue = name => process.env[name] ?? (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim() : undefined);

test('no committable file contains the location id', { skip: !envValue('GHL_LOCATION_ID') && 'no location id available' }, () => {
  const loc = envValue('GHL_LOCATION_ID');
  assert.deepEqual(files().filter(f => fs.readFileSync(f, 'latin1').includes(loc)), []);
});

test('no committable file contains a JWT-style key', () => {
  const jwt = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./;
  assert.deepEqual(files().filter(f => jwt.test(fs.readFileSync(f, 'latin1'))), []);
});
