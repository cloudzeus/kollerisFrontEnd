import "server-only";
import { after } from "next/server";
import { isFilteredListing } from "@/lib/catalog/listing-query";
import { Semaphore, type SemaphoreStats } from "@/lib/server/semaphore";

/**
 * At most eight filtered listings rendering at once, per process.
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 *
 * In the incident of 1/10/2026, 145 filtered catalogue renders were in flight
 * at once. Each holds its query results, then its React tree, then its RSC
 * payload of up to 96 products; together they ran the heap to 2 GB with a
 * fifth of the CPU in GC, and the event loop could no longer answer the
 * health check. More concurrency did not mean more throughput — it meant all
 * of them slow and the process unreachable.
 *
 * With a gate, the ninth filtered render waits for a slot (up to 2 s) and
 * otherwise gives up before touching the database. Unfiltered pages, product
 * pages, the cart and the health check never queue here.
 *
 * ── Where the slot is held, and streaming ──────────────────────────────────
 *
 * Acquired at the top of the page component, before any query. Released in
 * `after()`, which runs once the response has finished streaming — so the
 * slot covers the expensive part that comes AFTER the page function returns:
 * rendering the product grid and serialising the RSC payload. Releasing when
 * the data arrived would have gated only the cheap half. A 30 s lease frees
 * the slot even if `after()` never runs.
 *
 * The listing routes have a `loading.tsx`, so by the time the page component
 * runs the response has already started streaming with status 200: a render
 * cannot turn itself into a 503. A refused render therefore returns a small
 * "busy" view (noindex, `router.refresh()` after 5 s) instead of the grid — no
 * queries, no products. The HTTP-level back-pressure with a real status code
 * is the proxy's 429; this gate is what keeps the process alive when the
 * traffic is spread thin enough to pass the per-IP limit.
 *
 * ── Why globalThis ─────────────────────────────────────────────────────────
 *
 * Each listing route is its own server bundle. A module-level instance could
 * exist once per bundle, and five gates of eight are not a gate of eight.
 */

export const LISTING_RENDER_SLOTS = 8;
export const LISTING_RENDER_WAIT_MS = 2_000;
const LEASE_MS = 30_000;

const KEY = Symbol.for("kolleris.listingRenderGate");
type GateHolder = { [KEY]?: Semaphore };

function gate(): Semaphore {
  const holder = globalThis as GateHolder;
  holder[KEY] ??= new Semaphore(LISTING_RENDER_SLOTS, LISTING_RENDER_SLOTS * 8);
  return holder[KEY];
}

export function listingRenderStats(): SemaphoreStats {
  return gate().stats();
}

/**
 * True when this render may proceed. Unfiltered listings always may; a
 * filtered one waits for a slot and holds it until the response is done.
 */
export async function admitListingRender(
  params: Record<string, string | string[] | undefined>,
): Promise<boolean> {
  if (!isFilteredListing(params)) return true;

  const release = await gate().acquire(LISTING_RENDER_WAIT_MS);
  if (!release) return false;

  const lease = setTimeout(release, LEASE_MS);
  lease.unref?.();
  after(() => {
    clearTimeout(lease);
    release();
  });
  return true;
}
