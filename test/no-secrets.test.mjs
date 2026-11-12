// Guard: nothing that would be committed may contain a GHL key, and .env must never be tracked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const KEY_PATTERN = /pit-[0-9a-f]{8}-[0-9a-f]{4}-/;

function committableFiles() {
  // Tracked files + untracked files that .gitignore does not exclude = what `git add .` would commit.
  return execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
    .split('\n').filter(f => f && fs.existsSync(f));
}

test('no committable file contains a GHL API key', () => {
  const leaks = committableFiles().filter(f => KEY_PATTERN.test(fs.readFileSync(f, 'latin1')));
  assert.deepEqual(leaks, []);
});

test('.env and raw dumps are never committable', () => {
  const files = committableFiles();
  assert.ok(!files.some(f => f === '.env' || f.startsWith('.env.')), '.env is committable');
  assert.ok(!files.some(f => f.startsWith('recon/raw/')), 'raw GHL dumps are committable');
});
