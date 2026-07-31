/**
 * ΑΦΜ → company details, from the AADE registry.
 *
 * Pure helpers and shared types only — no `server-only` import, so the form
 * components can validate an ΑΦΜ before spending a round-trip on it. The
 * network call lives in `vat-lookup.ts`.
 */

export type VatCompany = {
  /** Εμπορική επωνυμία, falling back to the registered name. */
  name: string | null;
  afm: string | null;
  /** Κύρια δραστηριότητα. */
  profession: string | null;
  doy: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  /** SoftOne TRDR when the company is already a Kolleris customer. */
  trdr: number | null;
  phone: string | null;
  email: string | null;
};

export type VatLookupResult =
  | { found: true; source: "kolleris" | "aade"; company: VatCompany }
  | { found: false; reason: "invalid" | "not_found" | "unavailable" };

/**
 * Greek ΑΦΜ check digit (modulo 11 over powers of two, most significant first).
 *
 * Worth doing client-side: a typo caught here saves a round-trip, and the
 * registry answers "not found" to a mistyped ΑΦΜ exactly as it does to a real
 * company that is not registered — two very different things to tell a customer.
 */
export function isValidAfm(raw: string): boolean {
  const digits = normaliseAfm(raw);
  if (!/^\d{9}$/.test(digits)) return false;
  // All-zero passes the arithmetic but is not an ΑΦΜ.
  if (digits === "000000000") return false;

  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    sum += Number(digits[i]) * 2 ** (8 - i);
  }
  return sum % 11 % 10 === Number(digits[8]);
}

/** Strips spaces, dots and a leading `EL`/`GR` prefix. */
export function normaliseAfm(raw: string): string {
  return raw
    .trim()
    .replace(/^(EL|GR)/i, "")
    .replace(/\D/g, "");
}
