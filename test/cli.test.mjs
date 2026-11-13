// The daily run is a command-line program: when its work is done it must EXIT.
// A server that holds the connection open (GHL does on GitHub's network) used to keep
// Node alive long after "Run finished" was printed, so the workflow never moved on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { EXPECTED_STAGES } from '../pipeline/config.mjs';

const EXIT_BUDGET_MS = 15000;   // a finished run should exit in about a second

/** A stand-in GHL that asks clients to keep the connection open for 2 minutes. */
function startSlowToCloseServer() {
  const stages = EXPECTED_STAGES.map((name, i) => ({ id: `s${i + 1}`, name }));
  const contacts = Array.from({ length: 12 }, (_, i) => ({
    id: `c${i}`, contactName: `person ${i}`, email: `person${i}@example.com`, phone: null, companyName: null,
    source: i % 2 ? 'Referral' : 'Billboard', tags: ['dash-project'], dateAdded: '2026-09-04T10:00:00.000Z',
  }));
  const opportunities = contacts.map((c, i) => ({
    id: `o${i}`, name: `Deal ${i}`, monetaryValue: 5000 + 250 * (i % 5), pipelineId: 'sp',
    pipelineStageId: i < 3 ? 's4' : 's1', status: i < 3 ? 'won' : 'open', source: null, contactId: c.id,
  }));

  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    const body = pathname === '/opportunities/pipelines' ? { pipelines: [{ id: 'sp', name: 'Sales Pipeline', stages }] }
      : pathname === '/contacts/' ? { contacts, meta: { total: contacts.length, nextPageUrl: null } }
        : { opportunities, meta: { total: opportunities.length } };
    res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'keep-alive' });
    res.end(JSON.stringify(body));
  });
  server.keepAliveTimeout = 120000;   // tells the client: hold this socket for 2 minutes
  server.headersTimeout = 125000;
  return server;
}

test('the daily run exits as soon as it has finished, even when the API holds the connection open', async () => {
  const server = startSlowToCloseServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'er-cli-'));

  try {
    const child = spawn(process.execPath, ['pipeline/run.mjs', '--out', out], {
      stdio: ['ignore', 'pipe', 'pipe'],   // pipes, like GitHub Actions — not a terminal
      env: {
        ...process.env,
        GHL_API_KEY: 'pit-cli-test-key', GHL_LOCATION_ID: 'LOC-CLI-TEST',
        GHL_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      },
    });
    let stdout = '';
    child.stdout.on('data', d => { stdout += d; });

    const finished = new Promise(resolve => child.on('close', code => resolve(code)));
    const timedOut = Symbol('timed out');
    let timer;
    const budget = new Promise(resolve => { timer = setTimeout(() => resolve(timedOut), EXIT_BUDGET_MS); });
    const result = await Promise.race([finished, budget]);
    clearTimeout(timer);

    if (result === timedOut) {
      child.kill('SIGKILL');
      assert.fail(`the run did not exit within ${EXIT_BUDGET_MS / 1000}s — it printed: ${JSON.stringify(stdout)}`);
    }
    assert.equal(result, 0, `expected exit code 0, got ${result}`);
    assert.match(stdout, /Run finished: pass/, 'the final message must survive the exit');
    assert.ok(fs.existsSync(path.join(out, 'latest.json')));
  } finally {
    server.close();
    fs.rmSync(out, { recursive: true, force: true });
  }
});
