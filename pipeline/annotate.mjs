// Rules that KEEP a record but adjust or flag it: A6 (unknown source), A7 (unreliable
// value), A8 ($0 open deal), A9 (stage/status mismatch). Spec §7.
import { VALUE_OUTLIER_MULTIPLIER } from './config.mjs';
import { norm } from './text.mjs';
import { stageDepth } from './rules.mjs';

const UNKNOWN = 'Unknown source';
const EXPECTED_STATUS = {
  'Qualified Opt In': 'open', 'Booked call': 'open', 'Follow Up': 'open',
  Closed: 'won', Disqualified: 'lost', Lost: 'lost', Cancelled: 'abandoned', 'No Show': 'abandoned',
};
const REASON_HIGH = 'Unusually high value — likely a typing mistake';
const REASON_ZERO_WIN = 'Marked as a sale but the value is $0';

/** @returns {{ leads, ignoredValues, annotations }} */
export function buildLeads(kept, ctx, { raw = false } = {}) {
  const annotations = { stageStatusMismatch: 0, unknownSource: 0, extraDeals: 0, orphanDeals: 0 };
  const canonical = new Map(); // norm(source) → first-seen spelling
  const canon = s => {
    const k = norm(s);
    if (!k) return null;
    if (!canonical.has(k)) canonical.set(k, String(s).trim().replace(/\s+/g, ' '));
    return canonical.get(k);
  };
  const stageOf = o => ctx.stageNameById.get(o.pipelineStageId);

  const leads = kept.map(({ contact, opps }) => {
    const best = [...opps].sort((a, b) => stageDepth(stageOf(b)) - stageDepth(stageOf(a)))[0];
    annotations.extraDeals += Math.max(0, opps.length - 1);
    let source = canon(contact.source) ?? canon(opps.find(o => o.source)?.source);
    if (!source) { source = UNKNOWN; annotations.unknownSource++; }
    const deal = best ? {
      id: best.id, name: best.name, stage: stageOf(best), status: best.status,
      value: best.monetaryValue ?? 0, originalValue: best.monetaryValue ?? null, valueIgnored: false,
    } : null;
    if (deal && EXPECTED_STATUS[deal.stage] && EXPECTED_STATUS[deal.stage] !== deal.status) annotations.stageStatusMismatch++;
    return { id: contact.id, name: contact.contactName ?? '', email: contact.email ?? '', source, deal };
  });

  const ignoredValues = [];
  if (!raw) {
    const nonZero = leads.map(l => l.deal?.value).filter(v => v > 0).sort((a, b) => a - b);
    const median = nonZero.length ? nonZero[Math.floor((nonZero.length - 1) / 2)] : 0;
    for (const l of leads) {
      const d = l.deal;
      if (!d) continue;
      const tooHigh = median > 0 && d.value > VALUE_OUTLIER_MULTIPLIER * median;
      const zeroWin = d.stage === 'Closed' && !(d.value > 0);
      if (!tooHigh && !zeroWin) continue;
      ignoredValues.push({
        id: d.id, dealName: d.name, source: l.source, stage: d.stage, value: d.originalValue ?? 0,
        reason: tooHigh ? REASON_HIGH : REASON_ZERO_WIN, firstCaught: null,
      });
      d.value = null;
      d.valueIgnored = true;
    }
  }
  return { leads, ignoredValues, annotations };
}
