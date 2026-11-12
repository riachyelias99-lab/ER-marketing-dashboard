// Names come from a shared sandbox anyone can type into. The page must never parse data as HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('render never uses innerHTML for data', () => {
  const dir = 'public/js';
  const offenders = fs.readdirSync(dir).filter(f => f.endsWith('.js')).flatMap(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    return /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write/.test(src) ? [f] : [];
  });
  assert.deepEqual(offenders, []);
});
