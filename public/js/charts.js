// Chart.js configurations. Colours come from CSS tokens so light/dark mode stay in one place.
// Chart.js is loaded as a global (window.Chart) from a pinned CDN build.
import { money, pct } from './format.js';

// "Closed" first: the segment against the axis is the only one whose length compares
// directly across sources. Then the stages still moving, then the dead ends.
export const STAGE_ORDER = ['Closed', 'Follow Up', 'Booked call', 'Qualified Opt In', 'Lost', 'No Show', 'Cancelled', 'Disqualified'];

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const charts = new Map();
const BAR = 26;   // px per bar row

function make(canvas, rows, config) {
  charts.get(canvas)?.destroy();
  canvas.parentElement.style.height = `${rows * BAR + 70}px`;
  const Chart = window.Chart;
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  Chart.defaults.color = css('--text-secondary');
  const chart = new Chart(canvas, config);
  charts.set(canvas, chart);
  return chart;
}

/** Writes a value just past the end of each bar (selective direct label: one per bar). */
const endLabels = format => ({
  id: 'endLabels',
  afterDatasetsDraw(chart) {
    const { ctx, scales: { x, y } } = chart;
    ctx.save();
    ctx.fillStyle = css('--text-primary');
    ctx.font = `600 12px ${chart.options.font?.family ?? 'system-ui'}`;
    ctx.textBaseline = 'middle';
    chart.data.labels.forEach((_, i) => {
      const { text, value } = format(i);
      ctx.fillText(text, x.getPixelForValue(value) + 6, y.getPixelForValue(i));
    });
    ctx.restore();
  },
});

const baseOptions = () => ({
  indexAxis: 'y',
  maintainAspectRatio: false,
  animation: false,
  layout: { padding: { right: 90 } },
  plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
  scales: {
    x: { beginAtZero: true, grid: { color: css('--grid') }, border: { color: css('--axis') }, ticks: { color: css('--text-muted') } },
    y: { grid: { display: false }, border: { color: css('--axis') }, ticks: { color: css('--text-primary'), autoSkip: false } },
  },
});

const barStyle = color => ({
  backgroundColor: color, borderColor: css('--surface-1'), borderWidth: { right: 2 },
  borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: false, maxBarThickness: 18,
});

export function volumeChart(canvas, sources) {
  const rows = [...sources].sort((a, b) => b.leads - a.leads);
  const options = baseOptions();
  options.plugins.tooltip.callbacks = { label: c => `${c.parsed.x} leads` };
  return make(canvas, rows.length, {
    type: 'bar',
    data: { labels: rows.map(s => s.source), datasets: [{ label: 'Leads', data: rows.map(s => s.leads), ...barStyle(css('--series-1')) }] },
    options,
    plugins: [endLabels(i => ({ text: String(rows[i].leads), value: rows[i].leads }))],
  });
}

export function stageChart(canvas, sources) {
  const rows = [...sources].sort((a, b) => b.deals - a.deals);
  const options = baseOptions();
  options.scales.x.stacked = true;
  options.scales.y.stacked = true;
  options.plugins.legend = { display: true, position: 'top', align: 'start', labels: { boxWidth: 12, boxHeight: 12, color: css('--text-primary') } };
  options.plugins.tooltip = { mode: 'nearest', intersect: true, callbacks: { label: c => `${c.dataset.label}: ${c.parsed.x} deal${c.parsed.x === 1 ? '' : 's'}` } };
  const datasets = STAGE_ORDER.map((stage, i) => ({
    label: stage,
    data: rows.map(s => s.stageCounts[stage] ?? 0),
    backgroundColor: css(`--series-${i + 1}`),
    borderColor: css('--surface-1'),
    borderWidth: { right: 2 },
    borderSkipped: false,
    maxBarThickness: 18,
  }));
  return make(canvas, rows.length + 2, {
    type: 'bar',
    data: { labels: rows.map(s => s.source), datasets },
    options,
    plugins: [endLabels(i => ({ text: `${rows[i].deals} deals`, value: rows[i].deals }))],
  });
}

export function funnelChart(canvas, source, colorVar) {
  const steps = source.funnel;
  const top = Math.max(1, steps[0].count);
  const options = baseOptions();
  options.layout.padding.right = 40;
  options.scales.x = { display: false, min: -top / 2, max: top / 2 };
  options.plugins.tooltip = {
    callbacks: {
      label: c => {
        const i = c.dataIndex, count = steps[i].count;
        return i === 0 ? `${count} leads` : `${count} (${pct(source.stepRates[i - 1].rate)} of the step before)`;
      },
    },
  };
  canvas.setAttribute('aria-label', `Conversion funnel for ${source.source}`);
  return make(canvas, steps.length, {
    type: 'bar',
    data: {
      labels: steps.map(s => s.label),
      datasets: [{ label: source.source, data: steps.map(s => [-s.count / 2, s.count / 2]), backgroundColor: css(colorVar), borderRadius: 4, borderSkipped: false, maxBarThickness: 22 }],
    },
    options,
    plugins: [endLabels(i => ({ text: String(steps[i].count), value: steps[i].count / 2 }))],
  });
}

export function revenueChart(canvas, sources) {
  const rows = [...sources].sort((a, b) => b.revenue - a.revenue);
  const options = baseOptions();
  options.plugins.tooltip.callbacks = {
    label: c => `Closed revenue: ${money(c.parsed.x)}`,
    afterLabel: c => {
      const s = rows[c.dataIndex];
      if (!s.ignoredWonCount) return '';
      const n = s.ignoredWonCount;
      return `${n} sale${n > 1 ? 's' : ''} ${n > 1 ? 'have' : 'has'} an unreliable value (${s.ignoredWonValues.map(money).join(', ')}) — not counted. Revenue may be understated.`;
    },
  };
  options.scales.x.ticks.callback = v => money(v);
  return make(canvas, rows.length, {
    type: 'bar',
    data: { labels: rows.map(s => (s.ignoredWonCount ? `${s.source} ⚠️` : s.source)), datasets: [{ label: 'Closed revenue', data: rows.map(s => s.revenue), ...barStyle(css('--series-1')) }] },
    options,
    plugins: [endLabels(i => ({ text: money(rows[i].revenue), value: rows[i].revenue }))],
  });
}
