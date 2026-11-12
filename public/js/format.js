// Formatting shared by the pipeline (insight sentences) and the page (charts, tables),
// so a number can never be written two different ways. Pure functions only.

/** 7000 → "$7,000"; null → "—". Whole US dollars. */
export function money(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

const TZ = 'Asia/Beirut';
function beirutParts(iso) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

/** ISO time → "Mon 16 Nov, 06:00" in Beirut time; null → "—". */
export function beirutDateTime(iso) {
  if (!iso) return '—';
  const p = beirutParts(iso);
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

/** ISO time → "Mon 16 Nov" in Beirut time; null → "—". */
export function beirutDate(iso) {
  if (!iso) return '—';
  const p = beirutParts(iso);
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** Date object → "2026-11-16" as the calendar day in Beirut. */
export function beirutDay(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** True when a record was first caught within the last `days` days (same rule as pipeline/tracking.mjs). */
export function isNew(firstCaught, today, days = 7) {
  if (!firstCaught) return false;
  return Math.round((Date.parse(today) - Date.parse(firstCaught)) / 86400000) < days;
}

/** 0.5427 → "54%"; null → "—". */
export function pct(rate) {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}
