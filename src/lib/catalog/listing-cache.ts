import { TtlCache } from "@/lib/server/ttl-cache";
import type { ProductCardData } from "@/lib/catalog/queries";

/**
 * The in-process cache of listing grids (see `getPlpData` in `plp.ts` for
 * why it exists and why it is not `unstable_cache`).
 *
 * Its own module, with no database import, so whatever changes the catalogue
 * can clear it without pulling in the listing code: the HDCtool feed after it
 * applies a delivery, and the campaign editor after it saves or deletes an
 * offer (a campaign decides what "Σε προσφορά" and an offer listing contain).
 * The TTL stays as the backstop for anything that changes without telling.
 *
 * On `globalThis`: each route is its own bundle, and the webhook route must
 * clear the same cache the listing pages read.
 */

export type Listing = { products: ProductCardData[]; total: number };

const KEY = Symbol.for("kolleris.listingCache");
type Holder = { [KEY]?: TtlCache<Listing> };

export function listingCache(): TtlCache<Listing> {
  const holder = globalThis as Holder;
  holder[KEY] ??= new TtlCache<Listing>({ maxEntries: 300, ttlMs: 300_000 });
  return holder[KEY];
}

export function clearListingCache(reason: string): void {
  const cache = (globalThis as Holder)[KEY];
  if (!cache) return;
  const entries = cache.size;
  cache.clear();
  console.log(`[listing-cache] cleared ${entries} entr${entries === 1 ? "y" : "ies"}: ${reason}`);
}
