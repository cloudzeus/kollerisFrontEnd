/**
 * 10 VAT checks per 10 minutes per basket (intra-EU sales design §3.2).
 *
 * The checkout's «Έλεγχος» reaches VIES through HDCtool, which limits too
 * (per key and per number); this stops one basket from spending the shop's
 * whole budget. In memory, per instance — one container serves the shop, the
 * same trade-off as `lib/security/rate-limit`. Bounded and swept.
 */

export const VAT_CHECKS_PER_WINDOW = 10;
export const VAT_CHECK_WINDOW_MS = 10 * 60 * 1000;
const MAX_KEYS = 20_000;

const seen = new Map<string, number[]>();

/** Takes one check for `key` if the window allows it. */
export function takeVatCheck(key: string, now: number = Date.now()): boolean {
  const recent = (seen.get(key) ?? []).filter((t) => now - t < VAT_CHECK_WINDOW_MS);
  seen.delete(key);
  if (recent.length >= VAT_CHECKS_PER_WINDOW) {
    seen.set(key, recent);
    return false;
  }
  recent.push(now);
  seen.set(key, recent);
  // Least recently used first: a Map keeps insertion order.
  while (seen.size > MAX_KEYS) {
    const oldest = seen.keys().next().value;
    if (oldest === undefined) break;
    seen.delete(oldest);
  }
  return true;
}

/** For the tests. */
export function resetVatCheckLimit(): void {
  seen.clear();
}
