// Read-only download of GHL sandbox data for exploration.
// Usage: node recon/fetch.mjs   (reads key from .env, never prints it)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split(/=(.*)/s).slice(0, 2))
);
const KEY = env.GHL_API_KEY, LOC = env.GHL_LOCATION_ID;
const BASE = 'https://services.leadconnectorhq.com';
const headers = { Authorization: `Bearer ${KEY}`, Version: '2021-07-28', Accept: 'application/json' };
const out = path.join(root, 'recon', 'raw');

async function get(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers });
    if (r.status === 429) { await new Promise(s => setTimeout(s, 2000 * (attempt + 1))); continue; }
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${url.replace(LOC, '<loc>')}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  }
  throw new Error('rate limited');
}

async function contacts() {
  const all = [];
  let url = `${BASE}/contacts/?locationId=${LOC}&limit=100`;
  while (url) {
    const j = await get(url);
    all.push(...j.contacts);
    const next = j.meta?.nextPageUrl;
    url = next && j.contacts.length ? next : null;
    process.stdout.write(`\rcontacts: ${all.length} / ${j.meta?.total ?? '?'}`);
  }
  console.log();
  return all;
}

async function opportunities() {
  const all = [];
  let page = 1;
  while (true) {
    const j = await get(`${BASE}/opportunities/search?location_id=${LOC}&limit=100&page=${page}`);
    all.push(...j.opportunities);
    process.stdout.write(`\ropportunities: ${all.length} / ${j.meta?.total ?? '?'}`);
    if (!j.opportunities.length || all.length >= (j.meta?.total ?? 0)) break;
    page++;
  }
  console.log();
  return all;
}

const pipelines = await get(`${BASE}/opportunities/pipelines?locationId=${LOC}`);
fs.writeFileSync(path.join(out, 'pipelines.json'), JSON.stringify(pipelines, null, 2));
console.log('pipelines:', pipelines.pipelines.length);

const c = await contacts();
fs.writeFileSync(path.join(out, 'contacts.json'), JSON.stringify(c, null, 2));

const o = await opportunities();
fs.writeFileSync(path.join(out, 'opportunities.json'), JSON.stringify(o, null, 2));

try {
  const cf = await get(`${BASE}/locations/${LOC}/customFields`);
  fs.writeFileSync(path.join(out, 'customFields.json'), JSON.stringify(cf, null, 2));
  console.log('custom fields:', cf.customFields?.length);
} catch (e) { console.log('custom fields: not accessible -', e.message.slice(0, 80)); }

try {
  const t = await get(`${BASE}/locations/${LOC}/tags`);
  fs.writeFileSync(path.join(out, 'tags.json'), JSON.stringify(t, null, 2));
  console.log('tags:', t.tags?.length);
} catch (e) { console.log('tags: not accessible -', e.message.slice(0, 80)); }
