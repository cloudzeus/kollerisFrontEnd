import { listingRenderStats } from "@/lib/server/render-gate";

/**
 * Liveness: is this process able to answer an HTTP request at all?
 *
 * ── Why no database ────────────────────────────────────────────────────────
 *
 * It used to run `SELECT 1`. On 1/10/2026 a scraper kept 140+ filtered
 * catalogue renders in flight; the event loop and the connection pool were
 * both queued behind them, the `SELECT 1` waited its turn, the 10 s check
 * timed out, and Traefik took the container out of rotation — "no available
 * server" for every visitor, while the database itself sat idle at 34 of 97
 * connections. A liveness check that depends on a shared resource turns that
 * resource's queue into an outage.
 *
 * So this answers from memory and nothing else: if the process can run this
 * handler, it is alive. Whether the database answers is a different question,
 * asked by `/api/ready` — for people and monitoring, not for the restart loop.
 *
 * ── Why still a route ──────────────────────────────────────────────────────
 *
 * Kept from the old check: a Next server that has broken inside its request
 * handler still accepts TCP connections, so the check must go through the
 * handler. The body reports the listing render gate and the heap, which are
 * the two numbers that would have explained the incident at a glance.
 */

export const dynamic = "force-dynamic";

export function GET() {
  const memory = process.memoryUsage();
  return Response.json(
    {
      ok: true,
      uptimeS: Math.round(process.uptime()),
      heapUsedMb: Math.round(memory.heapUsed / 1_048_576),
      listingRenders: listingRenderStats(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
