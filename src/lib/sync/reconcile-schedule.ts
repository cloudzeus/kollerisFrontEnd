import { prisma } from "@/lib/prisma";
import { reconcileCatalog, recomputeCounts } from "@/lib/sync/catalog-sync";

/**
 * The nightly reconcile, running inside the server.
 *
 * The change feed from HDCtool is a push, and a push is lossy in a way that is
 * invisible from either end. This was not theoretical: on 4 August 68 batches —
 * 185 product changes — were retried five times, refused, and then retired.
 * HDCtool marked them sent, the outbox emptied, and nothing anywhere said a
 * word. The catalogue kept serving 125 products the ERP had stopped listing
 * and was missing 60 it had added, for nine days, until somebody ran the
 * reconcile by hand.
 *
 * So the backstop cannot be a thing somebody remembers to run. It ships with
 * the code and starts with the server.
 *
 * In-process rather than a platform scheduled task, for the same reason
 * HDCtool runs its twenty-five crons this way: a deployment setting that has to
 * be recreated by hand is a deployment setting that is one day not recreated,
 * and this whole file exists because of exactly that class of failure.
 *
 * The reconcile is cheap — id-list set arithmetic, seconds, and it fetches only
 * the differences — so running it once a night costs nothing when nothing has
 * gone wrong, which will be almost every night.
 */

/** Local hour to run at. Quiet, and after the ERP's own nightly work. */
const RUN_AT_HOUR = 4;

/** How often to look at the clock. Twelve looks inside the target hour. */
const TICK_MS = 5 * 60_000;

/**
 * Two runs closer together than this are the same night.
 *
 * The guard is a database read, not a flag, because the flag lives in one
 * process and the answer has to hold across restarts and across replicas.
 */
const MIN_GAP_HOURS = 20;

/**
 * How stale is stale enough to reconcile on boot rather than wait for 04:00.
 *
 * A container that starts with a two-day-old reconcile has almost certainly
 * been through the outage that made it two days old. Waiting until tonight to
 * find out what was missed is the wrong instinct.
 */
const STALE_ON_BOOT_HOURS = 36;

/** Let the server finish coming up before asking HDCtool for 5.000 ids. */
const BOOT_DELAY_MS = 90_000;

const CHANNEL = "catalog-reconcile";

let started = false;
let running = false;

/**
 * The hour in Athens, which is the only clock anyone here reasons in.
 *
 * Via `Intl` rather than an offset, because Greece is UTC+3 for half the year
 * and UTC+2 for the other half. A hardcoded offset puts the reconcile at 03:00
 * every winter, which is the sort of thing nobody notices until it collides
 * with something else that runs at 03:00.
 *
 * Exported for the test; nothing else should need it.
 */
export function localHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Athens",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

/**
 * Hours since the last reconcile *attempt*, whatever became of it.
 *
 * Deliberately not "since the last success". A run that failed still means
 * another process is on the job or has just been, and starting a second one on
 * top of it turns one problem into two.
 */
async function hoursSinceLastRun(): Promise<number> {
  const state = await prisma.syncState.findUnique({
    where: { channel: CHANNEL },
    select: { id: true },
  });
  if (!state) return Number.POSITIVE_INFINITY;

  const last = await prisma.syncRun.findFirst({
    where: { stateId: state.id },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  if (!last) return Number.POSITIVE_INFINITY;

  return (Date.now() - last.startedAt.getTime()) / 3_600_000;
}

async function runNow(trigger: string): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await reconcileCatalog();

    // Loud on purpose, and loudest when it found something. A reconcile that
    // repairs 185 products is a report that the feed lost 185 products, and
    // that is the sentence somebody needs to read in the deployment log.
    const drift = result.created + result.removed;
    console.log(
      `[reconcile-cron] ${trigger}: synced ${result.processed}, created ${result.created}, ` +
        `de-listed ${result.removed}, failed ${result.failed} in ${(result.durationMs / 1000).toFixed(1)}s`,
    );
    if (drift > 0) {
      console.warn(
        `[reconcile-cron] the change feed had missed ${drift} products — ` +
          `check HDCtool's eshop_webhook_deliveries for retired batches`,
      );
    }

    // Full-table aggregates. Only worth paying for when something moved.
    if (result.processed > 0 || result.removed > 0) {
      const counts = await recomputeCounts();
      console.log(
        `[reconcile-cron] recomputed ${counts.categories} categories, ${counts.brands} brands`,
      );
    }
  } catch (error) {
    // Swallowed, never rethrown: an unhandled rejection from a timer takes the
    // server down, and a failed reconcile is not a reason to stop serving the
    // shop. `withRun` has already recorded the failure where the sync monitor
    // can show it.
    console.error(
      "[reconcile-cron] failed:",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    running = false;
  }
}

async function tick(): Promise<void> {
  if (running) return;
  if (localHour(new Date()) !== RUN_AT_HOUR) return;
  if ((await hoursSinceLastRun()) < MIN_GAP_HOURS) return;
  await runNow("nightly");
}

/**
 * Start the schedule. Safe to call more than once; only the first one counts.
 *
 * Returns without waiting for anything, because `register()` in
 * `instrumentation.ts` blocks the server from accepting requests until it
 * resolves.
 */
export function startReconcileSchedule(): void {
  if (started) return;

  // Without HDCtool there is nothing to reconcile against, and the reconcile
  // would fail once every five minutes saying so.
  const configured =
    Boolean(process.env.HDCTOOL_API_KEY) ||
    Boolean(process.env.HDCTOOL_AUTH_EMAIL && process.env.HDCTOOL_AUTH_PASSWORD);
  if (!configured) {
    console.log("[reconcile-cron] not started: HDCtool credentials are not set");
    return;
  }

  /*
   * Off in development unless asked for.
   *
   * `npm run dev` on a laptop points at the same database as production, and a
   * reconcile started by a dev server would de-list products for real
   * customers. Opt in with RECONCILE_CRON=1 to test it.
   */
  if (process.env.NODE_ENV !== "production" && process.env.RECONCILE_CRON !== "1") {
    return;
  }

  started = true;

  const timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  // Do not hold the process open on its own account.
  timer.unref?.();

  setTimeout(() => {
    void (async () => {
      try {
        const age = await hoursSinceLastRun();
        if (age >= STALE_ON_BOOT_HOURS) {
          console.warn(
            `[reconcile-cron] last reconcile was ${age === Number.POSITIVE_INFINITY ? "never" : `${age.toFixed(0)}h ago`} — running one now`,
          );
          await runNow("boot");
        }
      } catch (error) {
        console.error(
          "[reconcile-cron] boot check failed:",
          error instanceof Error ? error.message : String(error),
        );
      }
    })();
  }, BOOT_DELAY_MS).unref?.();

  console.log(
    `[reconcile-cron] started: nightly at ${String(RUN_AT_HOUR).padStart(2, "0")}:00 Europe/Athens`,
  );
}
