// Budget advice cards (spec §10): compare each source's revenue per lead to the
// agency-wide (pooled) average and sort it into Invest more / Keep steady / Consider cutting.
import { ADVICE_BAND } from './config.mjs';
import { money } from '../public/js/format.js';

export const BADGE_SMALL = 'Too few leads to judge';
export const BADGE_MISSING_VALUE = "Can't judge fairly — a sale's value is missing";

/**
 * Decide which card one source belongs in.
 * @param {number|null} ratio  source revenue per lead ÷ agency average (null when the average is 0)
 * @param {number} ignoredWonCount  sales of this source whose dollar value we ignored (rule A7)
 * @returns {{ card: 'invest'|'keep'|'cut', badge: string|null }}
 */
export function classifySource(ratio, ignoredWonCount) {
  // No source made any money → nothing to compare against → don't move budget.
  if (ratio === null) return { card: 'keep', badge: null };
  // 25% or more above the agency average.
  if (ratio >= 1 + ADVICE_BAND) return { card: 'invest', badge: null };
  if (ratio <= 1 - ADVICE_BAND) {
    // Its revenue looks low partly because WE ignored a sale's value — don't blame the channel.
    if (ignoredWonCount > 0) return { card: 'keep', badge: BADGE_MISSING_VALUE };
    return { card: 'cut', badge: null };
  }
  return { card: 'keep', badge: null };
}

export function computeAdvice(sources) {
  const advice = { average: null, invest: [], keep: [], cut: [], notJudged: [] };
  const eligible = [];
  for (const s of sources) {
    if (s.source === 'Unknown source') advice.notJudged.push({ source: s.source, revenuePerLead: s.revenuePerLead, ratio: null, reason: 'Source unknown', badge: null });
    else if (s.smallSample) advice.notJudged.push({ source: s.source, revenuePerLead: s.revenuePerLead, ratio: null, reason: `Only ${s.leads} leads`, badge: BADGE_SMALL });
    else eligible.push(s);
  }
  const leads = eligible.reduce((a, s) => a + s.leads, 0);
  advice.average = leads ? eligible.reduce((a, s) => a + s.revenue, 0) / leads : null;

  for (const s of eligible) {
    const ratio = advice.average ? s.revenuePerLead / advice.average : null;
    const { card, badge } = classifySource(ratio, s.ignoredWonCount ?? 0);
    const reason = ratio === null ? `${money(s.revenuePerLead)} per lead` : `${money(s.revenuePerLead)} per lead, ${ratio.toFixed(1)}× the average`;
    advice[card].push({ source: s.source, revenuePerLead: s.revenuePerLead, ratio, reason, badge });
  }
  return advice;
}
