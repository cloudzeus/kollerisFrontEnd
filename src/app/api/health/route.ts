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
 * handler. Publicly it says only that it is alive; the listing render gate
 * and the heap, the two numbers that would have explained the incident at a
 * glance, go to the log.
 */

export const dynamic = "force-dynamic";

/*
 * Heap and render-gate numbers go to the log, not the public body: at most
 * once every five minutes, and at once when the gate has refused renders since
 * the last line. The check runs every 30 s; a line each time would be noise.
 */
const LOG_EVERY_MS = 5 * 60_000;
let lastLogAt = 0;
let lastRefused = -1;

function logVitals(): void {
  const gate = listingRenderStats();
  const now = Date.now();
  if (now - lastLogAt < LOG_EVERY_MS && gate.refused === lastRefused) return;
  lastLogAt = now;
  lastRefused = gate.refused;
  const heapMb = Math.round(process.memoryUsage().heapUsed / 1_048_576);
  console.log(
    `[health] heap ${heapMb} MB; listing renders active ${gate.active}/${gate.max}, ` +
      `waiting ${gate.waiting}, refused ${gate.refused}`,
  );
}

export function GET() {
  logVitals();
  return Response.json(
    { ok: true, uptimeS: Math.round(process.uptime()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
