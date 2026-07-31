/**
 * Deciding whether a spec value may be compared as a number.
 *
 * `ProductSpec.valueNumeric` is populated by the sync with "the leading number
 * in the value", which is fine for facets but actively wrong for a compare
 * matrix. Real rows from the projection:
 *
 *   "1,500 RPM"        → 1.5      (English thousands separator read as decimal)
 *   "0-140mm"          → 0        (start of a range)
 *   "0 - 1500 RPM,…"   → 0        (a list of ranges)
 *   "ISO 1173-1:2005"  → 1173     (a standard number)
 *   "-10°C to 50°C"    → -10      (start of a range)
 *
 * Marking a winner from those would tell a customer that a 800 rpm tool is
 * faster than a 1,500 rpm one. So the compare page does not trust
 * `valueNumeric` at all: a value earns a number here only when it is
 * unambiguously ONE number, and only fields with a known direction are ever
 * ranked. Everything else is shown as text and simply never wins.
 */

/** Words and glyphs that turn a value into a range rather than a measurement. */
const RANGE_WORDS = /έως|μέχρι|\bto\b|\.\.\./i;

/** A number token: optional sign, then digits with `.`/`,` inside. */
const NUMBER_TOKEN = /[-+]?\d[\d.,]*\d|[-+]?\d/g;

/**
 * `1,500` — a group separator, not a decimal point.
 *
 * Comma only. The projection uses the comma both ways ("0,15 Nm" Greek decimal,
 * "1,500 RPM" English thousands), and the leading digit tells them apart: a
 * thousands group never starts with 0, and a decimal is never written with
 * exactly three trailing digits after a 1–9 integer part in this data.
 *
 * A DOT is always decimal. Reading "1.500 mm" as 1500 would break far more rows
 * than it would fix — including `0.135 W`, whose leading zero is the only thing
 * separating it from a thousands group.
 */
const THOUSANDS = /^[-+]?[1-9]\d{0,2}(,\d{3})+$/;

/**
 * Parses a spec value into a comparable number, or null when it cannot be
 * compared honestly.
 *
 * Returns null for ranges ("0-140mm"), lists, and anything carrying more than
 * one number — which is most of what makes `valueNumeric` untrustworthy.
 */
export function comparableNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || RANGE_WORDS.test(value)) return null;

  const tokens = value.match(NUMBER_TOKEN);
  // Zero numbers ("Χάλυβας") or several ("1 1/4″", "0-102 mm") — not a measurement.
  if (!tokens || tokens.length !== 1) return null;

  const token = tokens[0];
  const normalised = THOUSANDS.test(token)
    ? token.replace(/,/g, "")
    : // Whatever remains is decimal — the data uses both `0,15` and `0.15`.
      token.replace(",", ".");

  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}
