/**
 * Postcode formats per country, and the normaliser that checks them.
 *
 * COPIED VERBATIM from the dhl-express skill
 * (~/.claude/skills/dhl-express/assets/dhl-express/src/api.ts, «ΤΚ / χώρες»,
 * from DHL's Reference Data Guide §1–§2) — the same helper HDCtool runs before
 * it asks DHL for a rate, so the shop and HDCtool agree on what a valid
 * postcode is. Only these helpers were copied: the shop never talks to DHL, it
 * asks HDCtool (docs/dhl-express.md §1).
 *
 * Pure and client-safe. Do not edit the data here; change it in the skill and
 * copy it again, so the two never drift.
 */

/** EU-27 (ISO). Η DHL κωδικοποιεί χωριστά Κανάρια (IC) και γαλλικά υπερπόντια (GF, GP, MQ, RE, YT) → εκτός λίστας. */
export const EU_COUNTRIES = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);

/** Μορφές ΤΚ του guide: 9 = ψηφίο, A = γράμμα, τα υπόλοιπα κυριολεκτικά. (IE: βλ. IE_EIRCODE) */
export const POSTCODE_FORMATS: Record<string, string[]> = {
  AT: ["9999"], BE: ["9999"], BG: ["9999"], HR: ["99999"], CY: ["9999"], CZ: ["999 99"], DK: ["9999"], EE: ["99999"],
  FI: ["99999"], FR: ["99999"], DE: ["99999"], GR: ["999 99"], HU: ["9999"], IT: ["99999"], LV: ["9999"], LT: ["99999"],
  LU: ["9999"], NL: ["9999", "9999 AA"], PL: ["99-999"], PT: ["9999-999"], RO: ["999999"], SK: ["999 99"], SI: ["9999"],
  ES: ["99999"], SE: ["999 99"],
  // εκτός ΕΕ, κοντινά/συχνά
  GB: ["AA9A 9AA", "A99 9AA", "A9A 9AA", "A9 9AA", "AA9 9AA", "AA99 9AA"], CH: ["9999"], LI: ["9999"], NO: ["9999"], IS: ["999"],
  MC: ["99999"], SM: ["99999"], VA: ["99999"], AD: ["AA999", "99999"], RS: ["99999"], MK: ["9999"], ME: ["99999"], TR: ["99999"],
  UA: ["99999"], US: ["99999", "99999-9999"], CA: ["A9A 9A9"], IC: ["99999"], GF: ["99999"], GP: ["99999"], MQ: ["99999"], RE: ["99999"], YT: ["99999"],
};
/** Ιρλανδία: το guide απαριθμεί όλους τους συνδυασμούς «A99 xxxx» και «A9A xxxx» (x = γράμμα ή ψηφίο). */
const IE_EIRCODE = /^[A-Z]\d[\dA-Z] [\dA-Z]{4}$/;
/** Χώρες χωρίς ΤΚ (guide §2) — στείλε postalCode "". Προσοχή: περιλαμβάνει τη ΜΑΛΤΑ (MT). */
export const NO_POSTCODE_COUNTRIES = new Set(("AE AF AG AI AL AO AW BB BF BH BI BJ BM BO BS BT BW BZ CD CF CG CI CK CL CM CR CV DJ DM DO EG ER ET FJ FK GA GD GH GI GM GN GQ GT GW GY HK HN HT IQ IR JM JO KE KI KM KN KP KW KY LA LB LC LR LS LY ML MM MO MR MS MT MU MW MZ NA NE NG NI NP NR NU OM PA PE PY QA RW SA SB SC SD SL SN SO SR SS ST SV SY TC TD TG TL TO TT TV TZ UG UY VC VE VG VN VU WS XB XC XE XM XN XS YE ZM ZW").split(" "));

const fmtRegex = (fmt: string) => new RegExp("^" + [...fmt].map((ch) => (ch === "9" ? "\\d" : ch === "A" ? "[A-Z]" : ch.replace(/[-\\^$.*+?()[\]{}|]/g, "\\$&"))).join("") + "$");

export interface PostcodeResult { ok: boolean; value: string; known: boolean; expected?: string[] }
/**
 * Κανονικοποίηση ΤΚ στη μορφή του guide (π.χ. GR "10563" → "105 63", PL "00950" → "00-950", NL "1012ab" → "1012 AB",
 * LV "LV-1050" → "1050"). Χώρα χωρίς ΤΚ → "". Άγνωστη χώρα → όπως δόθηκε (≤12) με known:false.
 */
export function normalizePostcode(countryCode: string, raw: string | null | undefined): PostcodeResult {
  const c = countryCode.trim().toUpperCase();
  if (NO_POSTCODE_COUNTRIES.has(c)) return { ok: true, value: "", known: true };
  let s = (raw ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  const pref = new RegExp(`^${c}[- ]`);
  if (pref.test(s)) s = s.replace(pref, "");
  if (c === "IE") {
    const ie = s.replace(/\s/g, "");
    const v = ie.length === 7 ? `${ie.slice(0, 3)} ${ie.slice(3)}` : s;
    return IE_EIRCODE.test(v) ? { ok: true, value: v, known: true } : { ok: false, value: s, known: true, expected: ["A99 XXXX", "A9A XXXX"] };
  }
  const formats = POSTCODE_FORMATS[c];
  if (!formats) return { ok: s.length > 0 && s.length <= 12, value: s.slice(0, 12), known: false };
  for (const f of formats) if (fmtRegex(f).test(s)) return { ok: true, value: s, known: true };
  const bare = s.replace(/[\s-]/g, "");
  for (const f of formats) {
    const fb = f.replace(/[\s-]/g, "");
    if (!fmtRegex(fb).test(bare)) continue;
    let out = "", j = 0;
    for (const ch of f) out += ch === "9" || ch === "A" ? bare[j++] : ch;
    return { ok: true, value: out, known: true };
  }
  return { ok: false, value: s, known: true, expected: formats };
}
