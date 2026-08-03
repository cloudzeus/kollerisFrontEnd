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
 * `N/A` alone is 164,000 of the roughly 400,000 spec rows in the catalogue —
 * the single most common value by a wide margin, ahead of every real answer.
 * Each one rendered as a labelled row, so a hand spanner listed a voltage, a
 * wattage and a maximum speed, all of them saying nothing, and the unit was
 * appended on top: "Τάση — Δεν ισχύει V".
 */
const NOT_APPLICABLE = new Set([
  "n/a",
  "na",
  "n.a.",
  "δεν ισχύει",
  "δ/υ",
  "not applicable",
  "non applicabile",
  "-",
  "--",
  "—",
  "–",
  "",
]);

/**
 * True when a spec row says nothing and should not be shown at all — no value,
 * and no label either.
 *
 * Matched on the whole trimmed value, not as a prefix: a handful of rows read
 * "Non applicabile (coppia: 25 Nm)" and carry a real number inside the
 * parenthesis, and dropping those would delete information rather than noise.
 */
export function isEmptySpec(value: string | null | undefined): boolean {
  return NOT_APPLICABLE.has((value ?? "").trim().toLowerCase());
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
