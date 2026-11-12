// Text helpers used by the cleaning rules. Pure functions, no I/O.

/** Lowercase, trim and collapse inner whitespace. null/undefined → ''. */
export function norm(s) {
  return String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * True when any of `words` appears as a whole word in `text`.
 * Only letters count as part of a word, so digits, '@', '-', '.' and spaces are
 * boundaries: "demo@example.com" and "demo-data" match "demo"; "Demolition" does not.
 */
export function hasWholeWord(text, words) {
  const t = norm(text);
  return words.some(w => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(t));
}

/** Normalised email with a trailing ".<digits>" copy marker before the @ removed. */
export function emailBaseKey(email) {
  return norm(email).replace(/\.\d+@/, '@');
}

/** Digits only. */
export function phoneKey(phone) {
  return String(phone ?? '').replace(/\D/g, '');
}

/** "fadi.gerges161@example.com" → "fa***@example.com". */
export function maskEmail(email) {
  const e = String(email ?? '').trim();
  const at = e.indexOf('@');
  if (at < 0) return e ? `${e.slice(0, 2)}***` : '';
  return `${e.slice(0, Math.min(2, at))}***${e.slice(at)}`;
}
