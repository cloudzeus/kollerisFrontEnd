import { isVivaBasicConfigured } from "@/lib/payment/viva";
import { sweepPendingPayments, sweepLogLine } from "@/lib/payment/payment-sweep";

/**
 * The payment sweep, running inside the server every few minutes.
 *
 * In-process for the same reason as the nightly catalogue reconcile next door
 * (`src/lib/sync/reconcile-schedule.ts`): a platform scheduled task is a
 * deployment setting somebody has to recreate by hand, and the day it is not
 * recreated is the day a paid order sits at «Εκκρεμεί» again.
 *
 * Every replica arms a timer. Only one sweeps per tick: `sweepPendingPayments`
 * claims the run under a Postgres advisory lock and skips when another replica
 * started one less than `minGapMinutes` ago. So N replicas cost N cheap
 * database reads per interval, and one round of questions to Viva.
 *
 * ── Settings ────────────────────────────────────────────────────────────────
 *
 *   PAYMENT_SWEEP_ENABLED       on | off. Unset: on in production when
 *                               VIVA_MERCHANT_ID + VIVA_API_KEY are set.
 *                               Never on without those — the sweep cannot ask
 *                               Viva anything without them.
 *   PAYMENT_SWEEP_INTERVAL_MIN  minutes between ticks, default 15, 5–120.
 *   PAYMENT_SWEEP_DEBUG         1 logs skipped ticks too.
 *
 * One line per run that did something: `[payment-sweep] checked N, paid X,
 * pending Y, errors Z`. Skipped ticks are silent.
 */

const GLOBAL_KEY = Symbol.for("kolleris.paymentSweepSchedule");

type ScheduleHandle = { timer: ReturnType<typeof setTimeout> | null; intervalMs: number };

type GlobalWithSchedule = typeof globalThis & { [GLOBAL_KEY]?: ScheduleHandle };

export type SweepScheduleConfig =
  | { enabled: true; intervalMin: number }
  | { enabled: false; reason: string };

export function paymentSweepConfig(
  env: Record<string, string | undefined> = process.env,
  vivaConfigured: boolean = isVivaBasicConfigured(),
): SweepScheduleConfig {
  const raw = env.PAYMENT_SWEEP_ENABLED?.trim().toLowerCase();
  const off = raw === "off" || raw === "0" || raw === "false" || raw === "no";
  const on = raw === "on" || raw === "1" || raw === "true" || raw === "yes";

  if (off) return { enabled: false, reason: "PAYMENT_SWEEP_ENABLED=off" };
  if (!vivaConfigured) return { enabled: false, reason: "VIVA_MERCHANT_ID / VIVA_API_KEY are not set" };
  if (!on && env.NODE_ENV !== "production") {
    return { enabled: false, reason: "not production (set PAYMENT_SWEEP_ENABLED=on to run it)" };
  }

  const parsed = Number(env.PAYMENT_SWEEP_INTERVAL_MIN);
  const intervalMin = Number.isFinite(parsed) && env.PAYMENT_SWEEP_INTERVAL_MIN?.trim()
    ? Math.min(120, Math.max(5, Math.round(parsed)))
    : 15;
  return { enabled: true, intervalMin };
}

/**
 * Another replica's run inside this window counts as this tick's run. Two
 * thirds of the interval, at most ten minutes: wide enough that replicas
 * firing a minute apart do not both sweep, narrow enough that this replica's
 * own previous run never blocks its next one.
 */
export function minGapMinutes(intervalMin: number): number {
  return Math.min(10, Math.floor((intervalMin * 2) / 3));
}

/** ±10% so replicas started together drift apart instead of colliding forever. */
function jittered(ms: number, random: () => number): number {
  return Math.round(ms * (0.9 + random() * 0.2));
}

export async function runScheduledSweep(intervalMin: number, debug = false): Promise<void> {
  try {
    const result = await sweepPendingPayments({
      minGapMinutes: minGapMinutes(intervalMin),
      actor: "payment-sweep",
    });
    if (!result.ok) {
      if (debug) console.debug(`[payment-sweep] skipped: ${result.skipped}`);
      return;
    }
    const line = sweepLogLine(result);
    if (result.errors.length || result.mismatches.length) {
      console.warn(line, { errors: result.errors, mismatches: result.mismatches });
    } else {
      console.log(line);
    }
  } catch (error) {
    // Never rethrown: an unhandled rejection from a timer takes the server down.
    console.error(
      "[payment-sweep] failed:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Arm the schedule. Idempotent across a double `register()` and across dev
 * HMR, which re-evaluates modules but keeps `globalThis`.
 *
 * Returns immediately: `register()` blocks the server until it resolves.
 */
export function startPaymentSweepSchedule(
  deps: {
    env?: Record<string, string | undefined>;
    vivaConfigured?: boolean;
    random?: () => number;
    run?: (intervalMin: number) => Promise<void>;
  } = {},
): { started: boolean; reason?: string } {
  const env = deps.env ?? process.env;
  // `next build` prerenders with a server; that is not a deployment.
  if (env.NEXT_PHASE === "phase-production-build") return { started: false, reason: "build" };

  const g = globalThis as GlobalWithSchedule;
  if (g[GLOBAL_KEY]) return { started: false, reason: "already started" };

  const config = paymentSweepConfig(env, deps.vivaConfigured ?? isVivaBasicConfigured());
  if (!config.enabled) {
    console.log(`[payment-sweep] not started: ${config.reason}`);
    return { started: false, reason: config.reason };
  }

  const random = deps.random ?? Math.random;
  const debug = env.PAYMENT_SWEEP_DEBUG === "1";
  const run = deps.run ?? ((min: number) => runScheduledSweep(min, debug));
  const intervalMs = config.intervalMin * 60_000;
  const handle: ScheduleHandle = { timer: null, intervalMs };
  g[GLOBAL_KEY] = handle;

  // A chain of timeouts rather than setInterval: a slow sweep never overlaps
  // the next tick in this process, and every gap gets its own jitter.
  const schedule = (delay: number) => {
    handle.timer = setTimeout(() => {
      void run(config.intervalMin)
        .catch((error) => console.error("[payment-sweep] tick failed:", error))
        .finally(() => schedule(jittered(intervalMs, random)));
    }, delay);
    handle.timer.unref?.();
  };

  // First tick 1–3 minutes after boot: let the server come up, and keep a
  // rolling deploy's replicas from all asking at once.
  schedule(60_000 + Math.round(random() * 120_000));

  console.log(`[payment-sweep] started: every ~${config.intervalMin} min`);
  return { started: true };
}

/** For the tests: forget a started schedule. */
export function stopPaymentSweepSchedule(): void {
  const g = globalThis as GlobalWithSchedule;
  const handle = g[GLOBAL_KEY];
  if (handle?.timer) clearTimeout(handle.timer);
  delete g[GLOBAL_KEY];
}
