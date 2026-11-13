// Page entry: load the published JSON, render both tabs, wire tabs and the funnel picker.
import { beirutDay } from './format.js';
import * as R from './render.js';
import * as C from './charts.js';

const isRaw = new URLSearchParams(location.search).get('raw') === '1';
const base = isRaw ? 'data-raw/' : 'data/';

async function getJson(file) {
  const res = await fetch(base + file, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  return res.json();
}

// Two views, no tab bar: the removed records are reached only from the "see why"
// and "review" links, which set #removed, and left again by the back link.
function showView(name) {
  for (const v of ['overview', 'removed']) document.getElementById(v).hidden = v !== name;
}

// #removed opens that view at the top; #ignored opens it at the list of deal
// values that were left out, which is where every ⚠️ mark points.
const REMOVED_HASHES = new Set(['#removed', '#ignored']);
const viewFromHash = () => (REMOVED_HASHES.has(location.hash) ? 'removed' : 'overview');

function routeToHash() {
  showView(viewFromHash());
  // The target section is unhidden only now, so the browser's own jump to the
  // anchor has already missed it: place the new view by hand.
  const target = location.hash === '#ignored' ? document.getElementById('sec-ignored') : null;
  if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
  else window.scrollTo({ top: 0, behavior: 'instant' });
}

function drawCharts(latest) {
  const { sources } = latest;
  C.volumeChart(document.getElementById('volume-chart'), sources);
  C.stageChart(document.getElementById('stage-chart'), sources);
  C.revenueChart(document.getElementById('revenue-chart'), sources);
  drawFunnels(latest);
}

function drawFunnels(latest) {
  const pick = id => latest.sources.find(s => s.source === document.getElementById(id).value) ?? latest.sources[0];
  const a = pick('funnel-a'), b = pick('funnel-b');
  document.getElementById('funnel-a-title').replaceChildren(R.el('span', { class: 'swatch', style: 'background: var(--series-1)' }), a.source);
  document.getElementById('funnel-b-title').replaceChildren(R.el('span', { class: 'swatch', style: 'background: var(--series-2)' }), b.source);
  C.funnelChart(document.getElementById('funnel-a-chart'), a, '--series-1');
  C.funnelChart(document.getElementById('funnel-b-chart'), b, '--series-2');
}

function setupFunnelPicker(latest) {
  // Default: the two best sources by revenue per lead (sources arrive sorted that way).
  const names = latest.sources.map(s => s.source);
  ['funnel-a', 'funnel-b'].forEach((id, i) => {
    const select = document.getElementById(id);
    select.replaceChildren(...names.map(n => R.el('option', { value: n, text: n })));
    select.value = names[Math.min(i, names.length - 1)];
    select.addEventListener('change', () => drawFunnels(latest));
  });
}

async function main() {
  if (isRaw) document.getElementById('raw-banner').hidden = false;
  window.addEventListener('hashchange', routeToHash);
  showView(viewFromHash());
  // A page opened straight on #ignored still needs placing, but only once the
  // tables below exist, so routeToHash runs again at the end of main().

  let latest, status;
  try {
    [latest, status] = await Promise.all([getJson('latest.json'), getJson('status.json').catch(() => null)]);
  } catch {
    document.getElementById('load-error').hidden = false;
    return;
  }

  // Safety net: uncleaned data is always labelled, however it got here.
  if (latest.mode === 'raw') document.getElementById('raw-banner').hidden = false;
  const today = beirutDay(new Date());
  R.renderTopBar(latest, status);
  R.renderStats(latest.totals);
  R.renderInsights('advice-insights', latest.insights.advice);
  R.renderLadder(latest.advice, latest.sources);
  R.renderScorecard(latest.sources);
  R.renderInsights('volume-insights', latest.insights.volume);
  R.renderInsights('pipeline-insights', latest.insights.pipeline);
  R.renderStageTable(latest.sources, C.STAGE_ORDER);
  R.renderInsights('conversion-insights', latest.insights.conversion);
  R.renderRatesTable(latest.sources);
  R.renderInsights('revenue-insights', latest.insights.revenue);
  R.renderRevenueTable(latest.sources);
  R.renderFooter(latest);
  R.renderWaterfall(latest.audit.waterfall);
  R.renderRemovedList(latest.audit.removed, latest.audit.waterfall, today);
  R.renderIgnoredList(latest.audit.ignoredValues, today);

  // Now that those tables have height, a page opened straight on #ignored can
  // be placed on the right section.
  if (REMOVED_HASHES.has(location.hash)) routeToHash();

  setupFunnelPicker(latest);
  const draw = () => (window.Chart ? drawCharts(latest) : window.addEventListener('load', () => drawCharts(latest), { once: true }));
  draw();
  // Light/dark switch: redraw so chart colours follow the new tokens.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => drawCharts(latest));
}

main();
