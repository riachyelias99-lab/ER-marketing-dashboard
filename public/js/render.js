// DOM building. Data is ALWAYS inserted as text (textContent / text nodes), never parsed as HTML.
import { money, pct, beirutDateTime, beirutDate, isNew } from './format.js';

/** el('td', { class: 'num', text: '5' }, child, 'more text') */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = String(v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
const fill = (id, ...nodes) => { const n = document.getElementById(id); n.replaceChildren(...nodes); return n; };
const badge = (text, kind = 'warn') => el('span', { class: `badge badge-${kind}`, text });

/** Table from column specs: [{ head, get(row) → string|Node, num? }]. */
export function table(columns, rows, rowClass = () => null) {
  return el('table', {},
    el('thead', {}, el('tr', {}, columns.map(c => el('th', { class: c.num ? 'num' : null, scope: 'col', text: c.head })))),
    el('tbody', {}, rows.map(r => el('tr', { class: rowClass(r) }, columns.map(c => el('td', { class: c.num ? 'num' : null }, c.get(r)))))));
}

export function renderTopBar(latest, status) {
  const nodes = [el('p', { class: 'meta' }, 'Last updated: ', el('strong', { text: beirutDateTime(status?.lastSuccess ?? latest.generatedAt) }), ' (Beirut time)')];
  if (status && status.result !== 'pass') for (const note of status.notes ?? []) nodes.push(el('div', { class: 'note note-warn', role: 'status', text: `⚠️ ${note}` }));
  const a = latest.audit;
  if (a.newSuspiciousCount > 0) {
    nodes.push(el('div', { class: 'note note-alert', role: 'status' },
      `🔔 ${a.newSuspiciousCount} new suspicious record${a.newSuspiciousCount > 1 ? 's' : ''} since ${beirutDate(a.newSince)} — `,
      el('a', { href: '#removed', text: 'review' })));
  }
  const total = a.waterfall[0].remaining;
  nodes.push(el('p', { class: 'meta' }, `Based on ${latest.totals.leads} real leads. ${total - latest.totals.leads} records were left out — `,
    el('a', { href: '#removed', text: 'see why' }), '.'));
  fill('topbar', ...nodes);
}

/** Four headline numbers, so the size of the business is clear before any chart. */
export function renderStats(totals) {
  const tiles = [
    { value: String(totals.leads), label: 'Real leads', hint: 'after cleaning' },
    { value: String(totals.deals), label: 'Entered the pipeline', hint: `${pct(totals.leads ? totals.deals / totals.leads : null)} of leads` },
    { value: String(totals.sales), label: 'Sales won', hint: `${pct(totals.leads ? totals.sales / totals.leads : null)} of leads` },
    { value: money(totals.revenue), label: 'Closed revenue', hint: 'all sources together' },
  ];
  fill('stats', ...tiles.map(t => el('div', { class: 'stat' },
    el('span', { class: 'stat-value', text: t.value }),
    el('span', { class: 'stat-label', text: t.label }),
    el('span', { class: 'stat-hint', text: t.hint }))));
}

export function renderInsights(id, sentences) {
  fill(id, ...sentences.map(s => el('p', { text: s })));
}

const CARDS = [
  { key: 'invest', title: '▲ Invest more' },
  { key: 'keep', title: '● Keep steady' },
  { key: 'cut', title: '▼ Consider cutting' },
];
export function renderAdvice(advice) {
  fill('advice-cards', ...CARDS.map(c => el('div', { class: `advice-card ${c.key}` },
    el('h3', { text: c.title }),
    advice[c.key].length
      ? el('ul', {}, advice[c.key].map(i => el('li', {},
        el('span', { class: 'name' }, i.source, i.badge ? badge(`⚠️ ${i.badge}`) : null),
        el('span', { class: 'why', text: i.reason }))))
      : el('p', { class: 'empty', text: 'No sources here right now.' }))));
  fill('not-judged', ...(advice.notJudged.length
    ? [el('p', { class: 'sub' }, 'Not judged: ', advice.notJudged.map(i => `${i.source} (${i.badge ?? i.reason})`).join(', '), '.')]
    : []));
}

function sourceBadges(s) {
  return [
    s.smallSample ? badge('⚠️ Too few leads to judge') : null,
    s.ignoredWonCount ? badge(`⚠️ ${s.ignoredWonCount} sale value ignored`) : null,
  ];
}

export function renderScorecard(sources) {
  fill('scorecard', table([
    { head: 'Source', get: s => el('span', {}, s.source, ...sourceBadges(s)) },
    { head: 'Leads', num: true, get: s => String(s.leads) },
    { head: 'Sales', num: true, get: s => String(s.sales) },
    { head: 'Close rate', num: true, get: s => pct(s.closeRate) },
    { head: 'Closed revenue', num: true, get: s => money(s.revenue) },
    { head: 'Revenue per lead', num: true, get: s => el('strong', { text: money(s.revenuePerLead) }) },
  ], sources));
}

export function renderStageTable(sources, stageOrder) {
  fill('stage-table', table([
    { head: 'Source', get: s => s.source },
    ...stageOrder.map(st => ({ head: st, num: true, get: s => String(s.stageCounts[st] ?? 0) })),
    { head: 'Total deals', num: true, get: s => el('strong', { text: String(s.deals) }) },
  ], sources));
}

export function renderRatesTable(sources) {
  const steps = sources[0]?.stepRates ?? [];
  fill('rates-table', table([
    { head: 'Source', get: s => s.source },
    ...steps.map((st, i) => ({ head: `${st.from} → ${st.to}`, num: true, get: s => pct(s.stepRates[i].rate) })),
    { head: 'Lead → Won', num: true, get: s => el('strong', { text: pct(s.overallRate) }) },
  ], sources));
}

export function renderRevenueTable(sources) {
  const est = (s, f) => (s.smallSample ? 'Too few leads' : f(s));
  fill('revenue-table', table([
    { head: 'Source', get: s => el('span', {}, s.source, ...sourceBadges(s)) },
    { head: 'Revenue per lead', num: true, get: s => money(s.revenuePerLead) },
    { head: 'Every 10 more leads ≈ (estimate)', num: true, get: s => est(s, x => `${x.projection.per10Sales.toFixed(1)} sales, ${money(x.projection.per10Revenue)}`) },
    { head: 'Deals still open', num: true, get: s => est(s, x => String(x.openForecast.openDeals)) },
    { head: 'Expected from open deals (estimate)', num: true, get: s => est(s, x => money(x.openForecast.expectedRevenue)) },
  ], sources));
}

export function renderFooter(latest) {
  const a = latest.audit;
  const items = [
    ['Lead', 'A real person who contacted the agency, after removing other users\' records, demo/test entries, internal contacts and duplicates (see the Removed records tab).'],
    ['Source', 'Where the lead came from, as recorded in GoHighLevel. Each lead counts for exactly one source.'],
    ['Revenue per lead', 'Closed revenue of a source ÷ its number of leads. This is the budget yardstick, because there is no ad-spend data to compare against.'],
    ['Budget advice', `Sources at least 25% above the agency average (${money(latest.advice.average)} per lead) → Invest more; at least 25% below → Consider cutting; in between → Keep steady. Sources with fewer than 20 leads are not judged.`],
    ['Funnel steps', 'Qualified = every deal except "Disqualified". Booked a call = Booked call, Cancelled, No Show, Follow Up, Closed, Lost. Attended the call = Follow Up, Closed, Lost. "Lost" is assumed to happen after a sales conversation.'],
    ['Ignored dollar values', a.ignoredValues.length
      ? `${a.ignoredValues.length} deal values looked like mistakes and were not added to revenue: ${a.ignoredValues.map(v => `${v.source} ${money(v.value)} (${v.stage})`).join('; ')}. The deals themselves still count.`
      : 'None this time.'],
    ['Why no timeline', 'All leads were imported into GoHighLevel on the same day, so their dates can\'t show month-by-month trends. Showing one would be misleading.'],
    ['Estimates', '"Every 10 more leads" and "Expected from open deals" repeat each source\'s past results. They are not guarantees.'],
  ];
  if (a.annotations.stageStatusMismatch) items.push(['Stage vs status', `${a.annotations.stageStatusMismatch} deals had a status that contradicted their stage; the stage was used.`]);
  fill('footer', el('dl', { class: 'method' }, items.flatMap(([t, d]) => [el('dt', { text: t }), el('dd', { text: d })])));
}

export function renderWaterfall(steps) {
  fill('waterfall', table([
    { head: 'Step', get: s => (s.rule === 'START' ? s.label : el('span', {}, el('strong', { text: s.label }))) },
    { head: 'Why', get: s => s.reason },
    // "−0" reads like a glitch, so a rule that caught nothing today shows a dash.
    { head: 'Removed', num: true, get: s => (s.rule === 'START' ? '' : s.removed === 0 ? '—' : `−${s.removed}`) },
    { head: 'Records left', num: true, get: s => el('strong', { text: String(s.remaining) }) },
  ], steps));
}

const newFirst = (rows, today) => [...rows].sort((a, b) => isNew(b.firstCaught, today) - isNew(a.firstCaught, today));
const caught = (r, today) => el('span', {}, r.firstCaught ?? '—', isNew(r.firstCaught, today) ? badge('NEW', 'new') : null);

export function renderRemovedList(removed, waterfall, today) {
  const labels = Object.fromEntries(waterfall.map(s => [s.rule, s.label]));
  fill('removed-list', removed.length ? table([
    { head: 'Name', get: r => r.name },
    { head: 'Source', get: r => r.source },
    { head: 'Removed because', get: r => el('span', {}, el('strong', { text: labels[r.rule] ?? r.rule }), ' — ', r.reason) },
    { head: 'Email', get: r => r.maskedEmail },
    { head: 'First caught', get: r => caught(r, today) },
  ], newFirst(removed, today), r => (isNew(r.firstCaught, today) ? 'is-new' : null)) : el('p', { class: 'empty', text: 'Nothing removed.' }));
}

export function renderIgnoredList(ignored, today) {
  fill('ignored-list', ignored.length ? table([
    { head: 'Deal', get: v => v.dealName },
    { head: 'Source', get: v => v.source },
    { head: 'Stage', get: v => v.stage },
    { head: 'Value ignored', num: true, get: v => money(v.value) },
    { head: 'Why', get: v => v.reason },
    { head: 'First caught', get: v => caught(v, today) },
  ], newFirst(ignored, today), v => (isNew(v.firstCaught, today) ? 'is-new' : null)) : el('p', { class: 'empty', text: 'No values were ignored.' }));
}
