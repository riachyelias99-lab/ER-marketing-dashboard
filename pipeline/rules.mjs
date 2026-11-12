// Removal rules A1–A5 (spec §7). Each contact is removed by the FIRST rule that
// catches it, so the waterfall always sums exactly.
import { AGENCY_PIPELINE_NAME, AGENCY_TAG, FUNNEL_STEPS, RULE_TEXT } from './config.mjs';
import { norm, hasWholeWord, emailBaseKey, phoneKey, maskEmail } from './text.mjs';

/** Locate the agency pipeline. Returns null if it no longer exists (health check B2 fails). */
export function resolveCtx(raw) {
  const p = raw.pipelines.find(x => norm(x.name) === norm(AGENCY_PIPELINE_NAME));
  if (!p) return null;
  return {
    pipelineId: p.id,
    stageNameById: new Map(p.stages.map(s => [s.id, s.name])),
    stages: p.stages.map(s => s.name),
  };
}

/** How far a stage got in the "reached at least" funnel: Disqualified = 2 … Closed = 6. */
export function stageDepth(stageName) {
  return 2 + FUNNEL_STEPS.filter(s => s.stages?.includes(stageName)).length;
}

const hasTag = (contact, tag) => (contact.tags ?? []).some(t => norm(t) === norm(tag));

/** Every text field a demo/test marker could hide in. */
const markerFields = ({ contact, opps }) =>
  [contact.contactName, contact.email, contact.companyName, ...opps.map(o => o.name), ...(contact.tags ?? [])];

const sourceOf = ({ contact, opps }) => contact.source || opps.find(o => o.source)?.source || '';

const RULES = [
  ['A1', r => !hasTag(r.contact, AGENCY_TAG) && r.opps.length === 0],
  ['A2', r => hasTag(r.contact, 'demo-data') || hasTag(r.contact, 'sandbox') || markerFields(r).some(f => hasWholeWord(f, ['demo']))],
  ['A3', r => markerFields(r).some(f => hasWholeWord(f, ['test', 'dummy', 'fake']))],
  ['A3b', r => !hasTag(r.contact, AGENCY_TAG) && !norm(sourceOf(r))],
  ['A4', r => hasTag(r.contact, 'internal')],
];

/**
 * @returns {{ kept: Array<{contact, opps}>, removed: object[], removedA1Count: number,
 *             scopeCount: number, waterfall: object[] }}
 */
export function applyRemovalRules(raw, ctx) {
  const oppsByContact = new Map();
  for (const o of raw.opportunities) {
    if (o.pipelineId !== ctx.pipelineId) continue;
    if (!oppsByContact.has(o.contactId)) oppsByContact.set(o.contactId, []);
    oppsByContact.get(o.contactId).push(o);
  }

  let records = raw.contacts.map(contact => ({ contact, opps: oppsByContact.get(contact.id) ?? [] }));
  const removed = [];
  const waterfall = [{ rule: 'START', ...RULE_TEXT.START, removed: 0, remaining: records.length }];
  let removedA1Count = 0;

  const record = (rule, out) => {
    if (rule === 'A1') removedA1Count = out.length;
    else for (const r of out) removed.push(toRemoved(r, rule));
    waterfall.push({ rule, ...RULE_TEXT[rule], removed: out.length, remaining: records.length });
  };

  for (const [rule, catches] of RULES) {
    const out = records.filter(catches);
    records = records.filter(r => !catches(r));
    record(rule, out);
  }
  const scopeCount = waterfall[1].remaining;

  const copies = findDuplicateCopies(records, ctx);
  const out = records.filter(r => copies.has(r.contact.id));
  records = records.filter(r => !copies.has(r.contact.id));
  record('A5', out);

  return { kept: records, removed, removedA1Count, scopeCount, waterfall };
}

function toRemoved(r, rule) {
  return {
    id: r.contact.id,
    name: r.contact.contactName ?? '',
    maskedEmail: maskEmail(r.contact.email),
    source: sourceOf(r) || 'Unknown source',
    rule,
    reason: RULE_TEXT[rule].reason,
    firstCaught: null,
  };
}

/** A5: group records that are the same person, return the ids of the copies to remove. */
function findDuplicateCopies(records, ctx) {
  const depth = r => Math.max(0, ...r.opps.map(o => stageDepth(ctx.stageNameById.get(o.pipelineStageId))));
  // Prefer: has a deal → furthest-advanced deal → earliest added → stable id.
  const keeperOrder = (a, b) =>
    (b.opps.length > 0) - (a.opps.length > 0)
    || depth(b) - depth(a)
    || String(a.contact.dateAdded).localeCompare(String(b.contact.dateAdded))
    || String(a.contact.id).localeCompare(String(b.contact.id));

  const parent = records.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { parent[find(a)] = find(b); };

  const byKey = new Map();
  const link = (key, i) => {
    if (!key) return;
    if (byKey.has(key)) union(i, byKey.get(key)); else byKey.set(key, i);
  };
  const fullEmails = new Set(records.map(r => norm(r.contact.email)).filter(Boolean));
  records.forEach((r, i) => {
    const full = norm(r.contact.email);
    // A "name.N.2@" address only counts as a copy when "name.N@" really exists.
    const base = emailBaseKey(r.contact.email);
    link(full && `email:${fullEmails.has(base) ? base : full}`, i);
    const phone = phoneKey(r.contact.phone);
    link(phone && `phone:${phone}`, i);
    const name = norm(r.contact.contactName), company = norm(r.contact.companyName);
    link(name && company && `nc:${name}|${company}`, i);
  });

  const groups = new Map();
  records.forEach((r, i) => {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  });

  const copies = new Set();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const notMarked = group.filter(r => !hasTag(r.contact, 'dq - duplicate'));
    const candidates = notMarked.length ? notMarked : group;
    const keeper = [...candidates].sort(keeperOrder)[0];
    for (const r of group) if (r !== keeper) copies.add(r.contact.id);
  }
  return copies;
}
