/**
 * Runs once when a server instance starts.
 *
 * The only thing here is the nightly catalogue reconcile — the backstop under
 * HDCtool's change feed, which is a push and therefore lossy. See
 * `src/lib/sync/reconcile-schedule.ts` for why it lives in the server rather
 * than in a platform scheduled task.
 *
 * `register` blocks the server from accepting requests until it resolves, so
 * nothing in here may wait for work. It arms a timer and returns.
 */
export async function register(): Promise<void> {
  // Also called for the edge runtime, which has neither timers that outlive a
  // request nor a database connection.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // `next build` starts a server to prerender pages. That is not a deployment,
  // and it must not schedule anything.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startReconcileSchedule } = await import("@/lib/sync/reconcile-schedule");
  startReconcileSchedule();
}
