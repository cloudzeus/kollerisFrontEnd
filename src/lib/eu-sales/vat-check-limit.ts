/**
 * VAT-check budgets (intra-EU sales design §3.2; R11-I3).
 *
 *   per basket   10 checks per 10 minutes (the spec's limit)
 *   per address  30 checks per 10 minutes — a fresh cart cookie is free to
 *                make, so the basket alone would let one client rotate
 *                cookies for unlimited VIES lookups. Looser than the basket
 *                because an office behind one IP has several buyers.
 *
 * A check is taken only when EVERY budget it draws on has room, and then from
 * all of them at once — a refusal spends nothing.
 *
 * The checkout's «Έλεγχος» reaches VIES through HDCtool, which limits too
 * (per key and per number); this stops one visitor from spending the shop's
 * whole budget. In memory, per instance — one container serves the shop, the
 * same trade-off as `lib/security/rate-limit`. Bounded (LRU).
 */

export const VAT_CHECKS_PER_WINDOW = 10;
export const VAT_CHECKS_PER_IP = 30;
export const VAT_CHECK_WINDOW_MS = 10 * 60 * 1000;
const MAX_KEYS = 20_000;

const seen = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  return (seen.get(key) ?? []).filter((t) => now - t < VAT_CHECK_WINDOW_MS);
}

/** Takes one check from every `[key, limit]` budget, or from none. */
export function takeVatCheck(
  budgets: ReadonlyArray<readonly [key: string, limit: number]>,
  now: number = Date.now(),
): boolean {
  const windows = budgets.map(([key, limit]) => ({ key, limit, times: recent(key, now) }));
  const ok = windows.every((w) => w.times.length < w.limit);
  for (const w of windows) {
    if (ok) w.times.push(now);
    // Re-inserted: a Map keeps insertion order, which is the LRU order.
    seen.delete(w.key);
    seen.set(w.key, w.times);
  }
  while (seen.size > MAX_KEYS) {
    const oldest = seen.keys().next().value;
    if (oldest === undefined) break;
    seen.delete(oldest);
  }
  return ok;
}

/** For the tests. */
export function resetVatCheckLimit(): void {
  seen.clear();
}
