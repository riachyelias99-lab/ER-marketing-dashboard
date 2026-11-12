// Read-only GoHighLevel client. Only GET requests to three endpoints (spec §5).

const BASE = 'https://services.leadconnectorhq.com';
const MAX_ATTEMPTS = 5;

/**
 * Download pipelines, all contacts and all opportunities for one location.
 * @returns {Promise<{pipelines, contacts, opportunities, totals: {contacts:number, opportunities:number}}>}
 */
export async function fetchAll({ apiKey, locationId, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (!apiKey || !locationId) throw new Error('GHL_API_KEY and GHL_LOCATION_ID must be set');
  const headers = { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28', Accept: 'application/json' };

  async function get(url) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await fetchImpl(url, { method: 'GET', headers });
      if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
      // Only the path goes into errors: the query string carries the location id.
      if (!res.ok) throw new Error(`GHL ${res.status} ${new URL(url).pathname}`);
      return JSON.parse(await res.text());
    }
    throw new Error(`GHL 429 ${new URL(url).pathname} (still rate-limited after ${MAX_ATTEMPTS} attempts)`);
  }

  const { pipelines } = await get(`${BASE}/opportunities/pipelines?locationId=${locationId}`);

  const contacts = [];
  let contactTotal = 0;
  for (let url = `${BASE}/contacts/?locationId=${locationId}&limit=100`; url;) {
    const page = await get(url);
    contacts.push(...page.contacts);
    contactTotal = page.meta?.total ?? contacts.length;
    url = page.contacts.length && page.meta?.nextPageUrl ? page.meta.nextPageUrl : null;
  }

  const opportunities = [];
  let oppTotal = 0;
  for (let p = 1; ; p++) {
    const page = await get(`${BASE}/opportunities/search?location_id=${locationId}&limit=100&page=${p}`);
    opportunities.push(...page.opportunities);
    oppTotal = page.meta?.total ?? opportunities.length;
    if (!page.opportunities.length || opportunities.length >= oppTotal) break;
  }

  return { pipelines, contacts, opportunities, totals: { contacts: contactTotal, opportunities: oppTotal } };
}
