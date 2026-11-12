// Formatting shared by the pipeline (insight sentences) and the page (charts, tables),
// so a number can never be written two different ways. Pure functions only.

/** 7000 → "$7,000"; null → "—". Whole US dollars. */
export function money(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** 0.5427 → "54%"; null → "—". */
export function pct(rate) {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}
