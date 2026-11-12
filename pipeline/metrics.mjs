// Every number on the dashboard comes from here (spec §9). All per source, never blended.
import { FUNNEL_STEPS, OPEN_STAGES, DECIDED_STAGES, MIN_LEADS_FOR_ADVICE } from './config.mjs';

const ratio = (num, den) => (den ? num / den : null);
const sum = xs => xs.reduce((a, b) => a + b, 0);
const mean = xs => (xs.length ? sum(xs) / xs.length : null);
const isTrustedWin = d => d?.stage === 'Closed' && !d.valueIgnored && d.value > 0;

/** @returns {{ totals: {leads, deals, sales, revenue}, sources: object[] }} */
export function computeMetrics(leads, stages) {
  const bySource = new Map();
  for (const l of leads) {
    if (!bySource.has(l.source)) bySource.set(l.source, []);
    bySource.get(l.source).push(l);
  }
  const agencyAvgWon = mean(leads.map(l => l.deal).filter(isTrustedWin).map(d => d.value));

  const sources = [...bySource].map(([source, group]) => {
    const deals = group.map(l => l.deal).filter(Boolean);
    const inStages = list => deals.filter(d => list.includes(d.stage)).length;

    const stageCounts = Object.fromEntries(stages.map(s => [s, deals.filter(d => d.stage === s).length]));
    const funnel = FUNNEL_STEPS.map(step => ({
      key: step.key,
      label: step.label,
      count: step.key === 'lead' ? group.length : step.key === 'pipeline' ? deals.length : inStages(step.stages),
    }));
    const stepRates = funnel.slice(1).map((s, i) => ({ from: funnel[i].label, to: s.label, rate: ratio(s.count, funnel[i].count) }));

    const won = deals.filter(d => d.stage === 'Closed');
    const sales = won.length;
    const revenue = sum(won.map(d => (d.valueIgnored ? 0 : d.value ?? 0)));
    const ignoredWonValues = won.filter(d => d.valueIgnored).map(d => d.originalValue ?? 0);
    const smallSample = group.length < MIN_LEADS_FOR_ADVICE;
    const revenuePerLead = ratio(revenue, group.length) ?? 0;

    let openForecast = null;
    if (!smallSample) {
      const openDeals = inStages(OPEN_STAGES);
      const winRate = ratio(sales, inStages(DECIDED_STAGES));
      const avgWonValue = mean(won.filter(isTrustedWin).map(d => d.value)) ?? agencyAvgWon;
      const expectedRevenue = winRate === null || avgWonValue === null ? null : openDeals * winRate * avgWonValue;
      openForecast = { openDeals, winRate, avgWonValue, expectedRevenue };
    }

    return {
      source, leads: group.length, deals: deals.length, stageCounts, funnel, stepRates,
      overallRate: ratio(sales, group.length),
      sales, revenue, revenuePerLead,
      closeRate: ratio(sales, group.length),
      ignoredWonCount: ignoredWonValues.length, ignoredWonValues,
      smallSample,
      projection: smallSample ? null : { per10Sales: (10 * sales) / group.length, per10Revenue: 10 * revenuePerLead },
      openForecast,
    };
  }).sort((a, b) => b.revenuePerLead - a.revenuePerLead || b.leads - a.leads);

  const totals = {
    leads: sum(sources.map(s => s.leads)),
    deals: sum(sources.map(s => s.deals)),
    sales: sum(sources.map(s => s.sales)),
    revenue: sum(sources.map(s => s.revenue)),
  };
  return { totals, sources };
}

/** Brief rule: stage breakdowns must sum to reported totals. Returns problems (empty = consistent). */
export function checkConsistency(metrics) {
  const problems = [];
  for (const s of metrics.sources) {
    const stageSum = sum(Object.values(s.stageCounts));
    if (stageSum !== s.deals) problems.push(`${s.source}: stages add up to ${stageSum}, but it has ${s.deals} deals`);
  }
  for (const key of ['leads', 'deals', 'sales', 'revenue']) {
    const total = sum(metrics.sources.map(s => s[key]));
    if (total !== metrics.totals[key]) problems.push(`Total ${key} is ${metrics.totals[key]}, but sources add up to ${total}`);
  }
  return problems;
}
