import "server-only";
import { prisma } from "@/lib/prisma";
import { isVivaBasicConfigured } from "@/lib/payment/viva";
import { recheckVivaPayment } from "@/lib/payment/confirm-payment";
import { describeRecheck, followUpWarnings } from "@/lib/payment/payment-messages";

/**
 * Ask Viva about every order still waiting for its money.
 *
 * The webhook is the fast path and it is a push: a notification that is not
 * delivered, or delivered while the shop is restarting past Viva's retries, is
 * simply gone. KOL-20261004-0001 sat at «Εκκρεμεί» for a week with the deposit
 * in the account because of exactly that. This sweep is the backstop — the
 * same `recheckVivaPayment` the admin's «Επανέλεγχος πληρωμής» runs, applied to
 * every pending order with a Viva code, oldest first.
 *
 * Nothing here decides a payment. `recheckVivaPayment` reads Viva's API, and
 * `markOrderPaid`'s conditional write is what stops a double confirmation; the
 * lock below only stops two replicas from asking Viva the same questions.
 *
 * Three callers: the in-process schedule (`payment-sweep-schedule.ts`), the
 * admin list's «Έλεγχος εκκρεμών πληρωμών», and `/api/payments/recheck`.
 */

export const SWEEP_CHANNEL = "payment-sweep";

/** Under the route's maxDuration (60 s), with room for the last order's follow-ups. */
export const DEFAULT_BUDGET_MS = 45_000;

/**
 * How long a RUNNING mark is believed. A replica that dies mid-sweep leaves
 * the row RUNNING; after this the next one takes over. Longer than any sweep
 * can last: the budget is checked before each order, and one order's
 * follow-ups (mail + HDCtool push) can take a further minute at worst.
 */
const LEASE_MS = 3 * 60_000;

export type SweepOptions = {
  /** Only this order, whatever its age. Skips the lock and the run bookkeeping. */
  orderNumber?: string;
  /** Orders created within this many days. */
  sinceDays?: number;
  /** At most this many orders per run. */
  limit?: number;
  /** Stop starting new orders after this long. */
  budgetMs?: number;
  /**
   * Skip the run if any replica STARTED one less than this many minutes ago.
   * The schedule sets it; on-demand runs leave it at 0.
   */
  minGapMinutes?: number;
  /** Written to the history rows, e.g. `payment-sweep` or `admin:…`. */
  actor?: string;
  /** For the tests. */
  now?: () => number;
};

export type SweepReport = {
  ok: true;
  checked: number;
  paid: Array<{ orderNumber: string; transactionId: string; warnings: string[] }>;
  stillPending: number;
  mismatches: Array<{ orderNumber: string; capturedCents: number; expectedCents: number }>;
  errors: Array<{ orderNumber: string; message: string }>;
  /** True when the time budget ran out before every selected order was checked. */
  truncated: boolean;
  durationMs: number;
};

export type SweepSkipped = {
  ok: false;
  skipped: "already_running" | "recently_ran" | "not_configured";
  message: string;
};

export type SweepResult = SweepReport | SweepSkipped;

/** «Waiting for money»: not yet paid, and not something Viva will never settle. */
const AWAITING = ["PENDING", "FAILED"] as const;

/**
 * Claim the run, or say why not.
 *
 * `pg_try_advisory_xact_lock` makes the check-and-mark atomic across replicas
 * and is released at the end of this short transaction, whatever happens — no
 * pooled connection is left holding a session lock. The RUNNING mark on the
 * `sync_state` row is what carries the claim for the length of the sweep, and
 * `lastRunAt` is what lets a freshly started replica see that another one
 * swept a few minutes ago. It also puts the sweep on the /admin/sync monitor.
 */
async function claimRun(
  minGapMs: number,
  now: number,
): Promise<"claimed" | "already_running" | "recently_ran"> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtext('kolleris:payment-sweep')) AS locked`;
    if (!rows[0]?.locked) return "already_running";

    const state = await tx.syncState.findUnique({
      where: { channel: SWEEP_CHANNEL },
      select: { lastRunAt: true, lastStatus: true },
    });
    const last = state?.lastRunAt?.getTime() ?? null;
    if (state?.lastStatus === "RUNNING" && last != null && now - last < LEASE_MS) {
      return "already_running";
    }
    if (minGapMs > 0 && last != null && now - last < minGapMs) return "recently_ran";

    const at = new Date(now);
    await tx.syncState.upsert({
      where: { channel: SWEEP_CHANNEL },
      create: { channel: SWEEP_CHANNEL, lastRunAt: at, lastStatus: "RUNNING" },
      update: { lastRunAt: at, lastStatus: "RUNNING" },
    });
    return "claimed";
  });
}

async function releaseRun(report: SweepReport | null): Promise<void> {
  const status = report == null ? "FAILED" : report.errors.length > 0 ? "PARTIAL" : "SUCCESS";
  await prisma.syncState
    .update({
      where: { channel: SWEEP_CHANNEL },
      data: {
        lastStatus: status,
        ...(status !== "FAILED" ? { lastSuccessAt: new Date() } : {}),
      },
    })
    .catch((error) => console.error("[payment-sweep] could not record the run", error));
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = value == null || !Number.isFinite(value) ? fallback : Math.trunc(value);
  return Math.min(max, Math.max(min, n));
}

export async function sweepPendingPayments(options: SweepOptions = {}): Promise<SweepResult> {
  const clock = options.now ?? Date.now;
  const started = clock();

  if (!isVivaBasicConfigured()) {
    return {
      ok: false,
      skipped: "not_configured",
      message: "Λείπουν τα VIVA_MERCHANT_ID / VIVA_API_KEY — ο έλεγχος πληρωμών στη Viva δεν μπορεί να τρέξει.",
    };
  }

  const single = options.orderNumber?.trim() || null;
  const sinceDays = clampInt(options.sinceDays, 10, 1, 60);
  const limit = clampInt(options.limit, 50, 1, 200);
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const actor = (options.actor ?? "payment-sweep").slice(0, 64);

  if (!single) {
    const claim = await claimRun(Math.max(0, options.minGapMinutes ?? 0) * 60_000, started);
    if (claim !== "claimed") {
      return {
        ok: false,
        skipped: claim,
        message:
          claim === "already_running"
            ? "Ο έλεγχος πληρωμών τρέχει ήδη (άλλο αντίγραφο ή άλλος χρήστης) — δοκιμάστε σε λίγο."
            : "Ο έλεγχος πληρωμών έτρεξε πριν από λίγα λεπτά.",
      };
    }
  }

  let report: SweepReport | null = null;
  try {
    const orders = await prisma.order.findMany({
      where: single
        ? { orderNumber: single }
        : {
            paymentStatus: { in: [...AWAITING] },
            status: { not: "CANCELLED" },
            vivaOrderCode: { not: null },
            createdAt: { gte: new Date(started - sinceDays * 86_400_000) },
          },
      orderBy: { createdAt: "asc" },
      take: single ? 1 : limit,
      select: { orderNumber: true },
    });

    report = {
      ok: true,
      checked: 0,
      paid: [],
      stillPending: 0,
      mismatches: [],
      errors: [],
      truncated: false,
      durationMs: 0,
    };

    // One at a time: Viva is a payment provider, not a search engine, and a
    // backstop that runs every few minutes has no reason to hurry.
    for (const { orderNumber } of orders) {
      if (clock() - started >= budgetMs) {
        report.truncated = true;
        break;
      }
      report.checked += 1;
      try {
        const outcome = await recheckVivaPayment(orderNumber, actor);
        switch (outcome.kind) {
          case "paid":
            report.paid.push({
              orderNumber,
              transactionId: outcome.transactionId,
              warnings: followUpWarnings(outcome.followUps),
            });
            break;
          case "amount_mismatch":
            report.mismatches.push({
              orderNumber,
              capturedCents: outcome.capturedCents,
              expectedCents: outcome.expectedCents,
            });
            break;
          case "not_paid":
            report.stillPending += 1;
            break;
          case "already_paid":
            // The webhook got there between the query and the check.
            break;
          default: {
            // error · no_order_code · not_found · not_configured
            const described = describeRecheck(outcome);
            report.errors.push({ orderNumber, message: described.ok ? outcome.kind : described.error });
          }
        }
      } catch (error) {
        report.errors.push({
          orderNumber,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    report.durationMs = clock() - started;
    return report;
  } finally {
    if (!single) await releaseRun(report);
  }
}

/** The one log line per run. */
export function sweepLogLine(report: SweepReport): string {
  return (
    `[payment-sweep] checked ${report.checked}, paid ${report.paid.length}, ` +
    `pending ${report.stillPending}, errors ${report.errors.length}` +
    (report.mismatches.length ? `, mismatches ${report.mismatches.length}` : "") +
    (report.truncated ? ", truncated" : "") +
    (report.paid.length ? ` (${report.paid.map((p) => p.orderNumber).join(", ")})` : "")
  );
}

/**
 * `?order=KOL-…&days=10&limit=50` → sweep options, clamped: days 1–60,
 * limit 1–200. Anything unparseable falls back to the default.
 */
export function parseSweepParams(params: URLSearchParams): Pick<SweepOptions, "orderNumber" | "sinceDays" | "limit"> {
  const int = (raw: string | null, fallback: number, min: number, max: number) => {
    const n = raw == null || raw.trim() === "" ? NaN : Number(raw);
    return clampInt(Number.isFinite(n) ? n : undefined, fallback, min, max);
  };
  const order = params.get("order")?.trim();
  return {
    ...(order ? { orderNumber: order.slice(0, 32) } : {}),
    sinceDays: int(params.get("days"), 10, 1, 60),
    limit: int(params.get("limit"), 50, 1, 200),
  };
}
