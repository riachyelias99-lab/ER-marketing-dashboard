// Rule-based plain-English sentences (spec §10). Every number comes from the metrics
// object and goes through the same formatter the page uses.
import { money, pct } from '../public/js/format.js';
import { OPEN_STAGES } from './config.mjs';

const list = names => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** All sources sharing the top value of `key`. */
function leaders(sources, key) {
  const valid = sources.filter(s => Number.isFinite(s[key]));
  if (!valid.length) return { names: [], value: null };
  const top = Math.max(...valid.map(s => s[key]));
  return { names: valid.filter(s => s[key] === top).map(s => s.source), value: top };
}

export function buildInsights(metrics, advice) {
  const { sources, totals } = metrics;
  const judged = sources.filter(s => !s.smallSample && s.source !== 'Unknown source');
  const out = { advice: [], volume: [], pipeline: [], conversion: [], revenue: [] };

  // Advice
  const rpl = items => items.map(i => `${i.source} (${money(i.revenuePerLead)} per lead)`);
  if (advice.invest.length) out.advice.push(`Put more budget into ${list(rpl(advice.invest))}: each lead there is worth well above the ${money(advice.average)} agency average.`);
  if (advice.cut.length) out.advice.push(`Consider cutting ${list(rpl(advice.cut))}: well below the ${money(advice.average)} agency average.`);
  if (!advice.invest.length && !advice.cut.length) out.advice.push(`All sources perform similarly — no channel is far enough above or below the ${money(advice.average)} average to move budget.`);
  const unfair = advice.keep.filter(i => i.badge);
  if (unfair.length) out.advice.push(`${list(unfair.map(i => i.source))} can't be judged fairly yet: a sale's value is missing, so its revenue looks lower than it really is.`);

  // Volume
  const vol = leaders(sources, 'leads');
  if (vol.names.length) out.volume.push(`${list(vol.names)} brought the most leads (${vol.value}${vol.names.length > 1 ? ' each' : ''}).`);
  const fewest = [...sources].sort((a, b) => a.leads - b.leads)[0];
  if (fewest && sources.length > 1 && !vol.names.includes(fewest.source)) out.volume.push(`${fewest.source} brought the fewest (${fewest.leads}).`);

  // Pipeline
  if (totals.leads) out.pipeline.push(`${pct(totals.deals / totals.leads)} of all leads entered the sales pipeline (${totals.deals} of ${totals.leads}).`);
  const withOpen = sources.map(s => ({ ...s, open: OPEN_STAGES.reduce((a, st) => a + (s.stageCounts?.[st] ?? 0), 0) }));
  const open = leaders(withOpen, 'open');
  if (open.value > 0) out.pipeline.push(`${list(open.names)} ${open.names.length > 1 ? 'have' : 'has'} the most deals still in progress (${open.value}).`);

  // Conversion
  const conv = leaders(judged, 'overallRate');
  if (conv.names.length) out.conversion.push(`${list(conv.names)} ${conv.names.length > 1 ? 'turn' : 'turns'} the most leads into sales: ${pct(conv.value)} of ${conv.names.length > 1 ? 'their' : 'its'} leads became clients.`);
  const steps = sources[0]?.funnel?.slice(1).map((step, i) => {
    const num = sources.reduce((a, s) => a + s.funnel[i + 1].count, 0);
    const den = sources.reduce((a, s) => a + s.funnel[i].count, 0);
    return { from: sources[0].funnel[i].label, to: step.label, rate: den ? num / den : null };
  }).filter(s => s.rate !== null) ?? [];
  if (steps.length) {
    const worst = steps.reduce((a, b) => (b.rate < a.rate ? b : a));
    out.conversion.push(`The biggest drop-off is from "${worst.from}" to "${worst.to}": only ${pct(worst.rate)} make it.`);
  }

  // Revenue
  const rev = leaders(sources, 'revenue');
  if (rev.names.length) out.revenue.push(`${list(rev.names)} brought the most closed revenue (${money(rev.value)}${rev.names.length > 1 ? ' each' : ''}).`);
  const ignored = sources.reduce((a, s) => a + (s.ignoredWonCount ?? 0), 0);
  if (ignored) out.revenue.push(`${ignored} ${ignored > 1 ? 'sales have' : 'sale has'} an unreliable value and ${ignored > 1 ? 'are' : 'is'} not counted, so some revenue may be understated (marked ⚠️).`);

  return out;
}
