import { requestSweepLogLine, sweepRequests } from "@/lib/requests/request-sweep";

/**
 * The back-order request sweep, inside the server — the pattern of
 * `src/lib/payment/payment-sweep-schedule.ts`, for the same reasons: it ships
 * with the code, every replica arms a timer, and the database claim in
 * `sweepRequests` lets one of them run per tick.
 *
 *   REQUEST_SWEEP_ENABLED       on | off. Unset: on in production only.
 *   REQUEST_SWEEP_INTERVAL_MIN  minutes between ticks, default 15, 5–120.
 *   REQUEST_SWEEP_DEBUG         1 logs skipped ticks too.
 *
 * Needs nothing but the database: reminders and expiry are emails and an
 * intake post, each of which reports its own missing configuration.
 */

const GLOBAL_KEY = Symbol.for("kolleris.requestSweepSchedule");
type ScheduleHandle = { timer: ReturnType<typeof setTimeout> | null };
type GlobalWithSchedule = typeof globalThis & { [GLOBAL_KEY]?: ScheduleHandle };

export type RequestSweepConfig = { enabled: true; intervalMin: number } | { enabled: false; reason: string };

export function requestSweepConfig(env: Record<string, string | undefined> = process.env): RequestSweepConfig {
  const raw = env.REQUEST_SWEEP_ENABLED?.trim().toLowerCase();
  const off = raw === "off" || raw === "0" || raw === "false" || raw === "no";
  const on = raw === "on" || raw === "1" || raw === "true" || raw === "yes";
  if (off) return { enabled: false, reason: "REQUEST_SWEEP_ENABLED=off" };
  if (!on && env.NODE_ENV !== "production") {
    return { enabled: false, reason: "not production (set REQUEST_SWEEP_ENABLED=on to run it)" };
  }
  const parsed = Number(env.REQUEST_SWEEP_INTERVAL_MIN);
  const intervalMin =
    Number.isFinite(parsed) && env.REQUEST_SWEEP_INTERVAL_MIN?.trim()
      ? Math.min(120, Math.max(5, Math.round(parsed)))
      : 15;
  return { enabled: true, intervalMin };
}

export async function runScheduledRequestSweep(intervalMin: number, debug = false): Promise<void> {
  try {
    const result = await sweepRequests({ minGapMinutes: Math.min(10, Math.floor((intervalMin * 2) / 3)) });
    if (!result.ok) {
      if (debug) console.debug(`[request-sweep] skipped: ${result.skipped}`);
      return;
    }
    if (result.errors.length) console.warn(requestSweepLogLine(result), { errors: result.errors });
    else if (result.expired.length || result.reminded.length || debug) console.log(requestSweepLogLine(result));
  } catch (error) {
    // Never rethrown: an unhandled rejection from a timer takes the server down.
    console.error("[request-sweep] failed:", error instanceof Error ? error.message : String(error));
  }
}

export function startRequestSweepSchedule(
  deps: {
    env?: Record<string, string | undefined>;
    random?: () => number;
    run?: (intervalMin: number) => Promise<void>;
  } = {},
): { started: boolean; reason?: string } {
  const env = deps.env ?? process.env;
  if (env.NEXT_PHASE === "phase-production-build") return { started: false, reason: "build" };

  const g = globalThis as GlobalWithSchedule;
  if (g[GLOBAL_KEY]) return { started: false, reason: "already started" };

  const config = requestSweepConfig(env);
  if (!config.enabled) {
    console.log(`[request-sweep] not started: ${config.reason}`);
    return { started: false, reason: config.reason };
  }

  const random = deps.random ?? Math.random;
  const debug = env.REQUEST_SWEEP_DEBUG === "1";
  const run = deps.run ?? ((min: number) => runScheduledRequestSweep(min, debug));
  const intervalMs = config.intervalMin * 60_000;
  const handle: ScheduleHandle = { timer: null };
  g[GLOBAL_KEY] = handle;

  const schedule = (delay: number) => {
    handle.timer = setTimeout(() => {
      void run(config.intervalMin)
        .catch((error) => console.error("[request-sweep] tick failed:", error))
        .finally(() => schedule(Math.round(intervalMs * (0.9 + random() * 0.2))));
    }, delay);
    handle.timer.unref?.();
  };
  schedule(90_000 + Math.round(random() * 120_000));

  console.log(`[request-sweep] started: every ~${config.intervalMin} min`);
  return { started: true };
}

/** For the tests. */
export function stopRequestSweepSchedule(): void {
  const g = globalThis as GlobalWithSchedule;
  const handle = g[GLOBAL_KEY];
  if (handle?.timer) clearTimeout(handle.timer);
  delete g[GLOBAL_KEY];
}
