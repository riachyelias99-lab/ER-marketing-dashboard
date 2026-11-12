// "New suspicious records" (spec §11): compare today's flagged ids with the last published snapshot.
import { NEW_BADGE_DAYS } from './config.mjs';

const DAY_MS = 86400000;
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/**
 * First run (previousItems === null): everything is already known → firstCaught null.
 * Seen before: keep the earlier date (or null for baseline). Otherwise: caught today.
 */
export function assignFirstCaught(items, previousItems, today) {
  const seen = previousItems ? new Map(previousItems.map(p => [p.id, p.firstCaught ?? null])) : null;
  return items.map(item => ({
    ...item,
    firstCaught: !seen ? null : seen.has(item.id) ? seen.get(item.id) : today,
  }));
}

/** Items caught within the last `days` days (today counts as day 0). */
export function countNew(items, today, days = NEW_BADGE_DAYS) {
  return items.filter(i => i.firstCaught && daysBetween(i.firstCaught, today) < days).length;
}
