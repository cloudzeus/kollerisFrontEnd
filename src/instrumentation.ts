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

  /*
   * Say so at boot if the site's own address is malformed.
   *
   * Production ran with `NEXT_PUBLIC_SITE_URL=https://web.kolleris.com,` — one
   * trailing comma — and every absolute URL the site emits was invalid: the
   * canonical on every page, every sitemap entry, and all 5.200 product links
   * in the Merchant Center feed. Nothing broke, nothing logged, and the first
   * report came from Google days later as "Invalid URL".
   *
   * `siteOrigin()` now repairs what it safely can. This is so the repair is
   * visible in the deployment log instead of quietly compensating forever.
   */
  const { siteOriginProblem, siteOrigin } = await import("@/lib/seo/urls");
  const problem = siteOriginProblem();
  if (problem) {
    console.error(
      `[site-url] NEXT_PUBLIC_SITE_URL is malformed: ${problem}. ` +
        `Using ${siteOrigin()} — fix the setting.`,
    );
  }

  const { startReconcileSchedule } = await import("@/lib/sync/reconcile-schedule");
  startReconcileSchedule();
}
