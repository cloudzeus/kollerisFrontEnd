import { prisma } from "@/lib/prisma";

/**
 * Readiness: does the database answer, and how fast?
 *
 * The `SELECT 1` that `/api/health` used to do, moved here so that a slow
 * database — or a pool queued behind a burst of renders — can no longer get
 * the container restarted. For people and monitoring: 200 when the query
 * returns within 1.5 s, 503 otherwise, with the timing in the body either way.
 *
 * The timeout bounds the RESPONSE, not the query: a Prisma query cannot be
 * cancelled, so one that is stuck finishes (or fails) on its own later.
 */

export const dynamic = "force-dynamic";

const READY_TIMEOUT_MS = 1_500;

export async function GET() {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), READY_TIMEOUT_MS);
  });

  try {
    const outcome = await Promise.race([
      prisma.$queryRaw`SELECT 1`.then(() => "up" as const),
      timeout,
    ]);
    const ms = Date.now() - started;
    if (outcome === "timeout") {
      return Response.json(
        { ok: false, db: "timeout", ms },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json({ ok: true, db: "up", ms }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // The message can name hosts and users; it goes to the log, not the body.
    console.error("[ready] database check failed:", error);
    return Response.json(
      {
        ok: false,
        db: "down",
        ms: Date.now() - started,
        error: error instanceof Error ? error.name : "Error",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timer);
  }
}
