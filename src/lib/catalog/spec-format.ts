/**
 * Formatting a spec value for display.
 *
 * `ProductSpec` carries both `value` and `unit`, and the projection very often
 * has the unit inside the value already: `"220V"` with `unit: "V"`, `"50 Nm"`
 * with `unit: "Nm"`, `"1200 RPM"` with `unit: "rpm"`. Appending blindly gives
 * "220V V" and "1200 RPM rpm", which is what the PDP and the compare matrix
 * were both printing.
 *
 * So append only when the value does not already end with the unit — compared
 * case-insensitively and ignoring spaces, because the two disagree on both.
 */
/**
 * The ways the projection says "this field does not apply to this product".
 *
 * `N/A` alone is 164,000 of the roughly 400,000 spec rows in the catalogue, and
 * it is far from the only spelling: the same idea arrives as `Δεν ισχύει`, `Μη
 * εφαρμόσιμο`, `Μη εφαρμόζεται`, `Μη εφαρμοστέο`, `Not specified`, `Non
 * applicabile` and a dozen more. Matching them one at a time is whack-a-mole,
 * and the first pass shipped having caught only four of them — a safety boot
 * still listed a voltage, a chuck size and a battery life, all of them saying
 * nothing.
 */
const NOT_APPLICABLE = new Set([
  "n/a", "na", "n.a.",
  "δεν ισχύει", "δ/υ", "μη εφαρμόσιμο", "μη εφαρμόζεται", "μη εφαρμοστέο",
  "δεν εφαρμόζεται", "χωρίς εφαρμογή", "μη διαθέσιμο", "μη διαθέσιμα", "δεν διατίθεται",
  "μη απαιτούμενο", "μη απαιτούμενη", "μη απαιτείται", "δεν απαιτείται",
  "δεν καθορίζεται", "δεν εφαρμόζει",
  "not applicable", "not specified", "not available", "not required",
  "non applicabile", "non disponibile", "non specificato", "non richiesto",
  "-", "--", "—", "–", "",
]);

/**
 * True when a spec row says nothing and should not be shown at all — no value,
 * and no label either.
 *
 * A trailing parenthesis is dropped before matching, because the catalogue is
 * full of `N/A (utensile manuale)` and `Δεν ισχύει (συνδεδεμένο στο δίκτυο)`:
 * the bracket explains WHY the field does not apply, which is not information a
 * customer needs from a spec table.
 *
 * The match is on the whole remaining string, never a prefix. `Χωρίς ηλεκτρικό
 * θόρυβο` starts with the same word as `Χωρίς εφαρμογή` and is a real answer;
 * a prefix rule would delete it.
 */
export function isEmptySpec(value: string | null | undefined): boolean {
  const text = (value ?? "").trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
  return NOT_APPLICABLE.has(text.toLowerCase());
}

export function formatSpecValue(value: string, unit?: string | null): string {
  const text = value.trim();
  if (!unit) return text;

  const u = unit.trim();
  if (!u) return text;

  const tail = text.slice(-u.length).toLowerCase();
  if (tail === u.toLowerCase()) return text;

  return `${text} ${u}`;
}

/**
 * True when `long` merely restates `short`.
 *
 * The generated copy routinely opens the long description with the short one
 * word for word, so the PDP showed the same sentence twice — once as the lead
 * and once as the first line under it.
 */
export function longRestatesShort(long: string, short: string | null | undefined): boolean {
  if (!short) return false;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return norm(long).startsWith(norm(short).slice(0, 60));
}

/** Drops a leading restatement of `short` from `long`. */
export function stripRestatement(long: string, short: string | null | undefined): string {
  if (!short || !longRestatesShort(long, short)) return long;
  const trimmed = long.slice(short.trim().length).trim();
  // Only accept the trim if something substantial survives it.
  return trimmed.length > 80 ? trimmed.replace(/^[.,·—-]\s*/, "") : long;
}
