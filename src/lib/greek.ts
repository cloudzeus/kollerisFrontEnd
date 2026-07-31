/**
 * Greek text utilities.
 *
 * Two distinct jobs, deliberately not the same function:
 *
 *  - `upGreek`  — DISPLAY uppercasing. Greek typographic convention drops the
 *                 tonos when a word is set in capitals but KEEPS the dialytika
 *                 (ΑΪΔΑ, not ΑΙΔΑ). Every uppercase Greek string in the UI goes
 *                 through this.
 *
 *  - `searchKey` — MATCHING normalisation. Drops tonos AND dialytika, folds
 *                  final sigma, lowercases. Used on both sides of every search /
 *                  filter comparison so "ΠΡΙΟΝΙ", "πριόνι" and "πριονι" all match.
 *
 * Combining marks used below:
 *   U+0301 COMBINING ACUTE (tonos)
 *   U+0300 COMBINING GRAVE (varia — appears in polytonic / legacy ERP data)
 *   U+0308 COMBINING DIAERESIS (dialytika)
 */

const TONOS = /[̀́]/g;
const TONOS_AND_DIALYTIKA = /[̀́̈]/g;

/**
 * Uppercase for display: drops tonos, keeps dialytika.
 *
 *   upGreek('Πριόνι')   → 'ΠΡΙΟΝΙ'
 *   upGreek('παϊδάκια') → 'ΠΑΪΔΑΚΙΑ'   (dialytika survives)
 */
export function upGreek(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(TONOS, "").normalize("NFC");
}

/**
 * Accent-insensitive matching key: lowercase, no tonos, no dialytika,
 * final sigma folded to medial sigma, whitespace collapsed.
 *
 *   searchKey('ΠΡΙΟΝΙ') === searchKey('πριόνι') === 'πριονι'
 *   searchKey('ΟΔΟΣ')   === searchKey('οδός')   === 'οδος'
 *
 * Must be applied at index time as well as query time — see
 * BACKEND_ALIGNMENT.md §2 (the projection stores a `searchKey` column).
 */
export function searchKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(TONOS_AND_DIALYTIKA, "")
    .normalize("NFC")
    .replace(/ς/g, "σ") // ς → σ, so 'οδός' matches 'ΟΔΟΣ'
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * URL slug from Greek (or Latin) text. Transliterates to ASCII so product and
 * category URLs stay readable and stable — `/proion/prioni-diskou-190mm`.
 *
 * Built on `searchKey` so a renamed-but-equivalent title produces the same slug.
 */
const GREEK_TO_LATIN: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th",
  ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p",
  ρ: "r", σ: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};

/** Digraphs must be replaced before single letters (μπ → b, not m+p). */
const GREEK_DIGRAPHS: Array<[RegExp, string]> = [
  [/ου/g, "ou"],
  [/μπ/g, "b"],
  [/ντ/g, "nt"],
  [/γκ/g, "gk"],
  [/τσ/g, "ts"],
  [/τζ/g, "tz"],
];

export function slugify(s: string): string {
  let out = searchKey(s);

  for (const [pattern, replacement] of GREEK_DIGRAPHS) {
    out = out.replace(pattern, replacement);
  }

  out = out.replace(/[Ͱ-Ͽ]/g, (ch) => GREEK_TO_LATIN[ch] ?? ch);

  return out
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip any remaining Latin diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, ""); // slice may have left a trailing hyphen
}
