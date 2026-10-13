import "server-only";
import { prisma } from "@/lib/prisma";
import { OFFER_REMINDER_HOURS, readStoredOffer } from "@/lib/requests/model";
import { expireRequest, remindRequest } from "@/lib/requests/service";

/**
 * The back-order request timers (docs/backorder-requests.md §6).
 *
 *   - an offer unanswered for 24 hours gets ONE reminder;
 *   - an offer past its `offerExpiresAt` becomes EXPIRED, the customer is told,
 *     and HDCtool hears it through the intake.
 *
 * Same claim as the payment sweep next door: a transaction-scoped advisory
 * lock decides which replica runs, and the `sync_state` row carries the claim
 * and the last run for the /admin/sync monitor. Each order's transition is
 * itself conditional (`expireRequest`, `remindRequest`), so even two sweeps
 * that did both run would send one email per order.
 */

export const REQUEST_SWEEP_CHANNEL = "request-sweep";
const LEASE_MS = 3 * 60_000;
const BATCH = 100;

export type RequestSweepReport = {
  ok: true;
  expired: string[];
  reminded: string[];
  errors: Array<{ orderNumber: string; message: string }>;
};

export type RequestSweepResult =
  | RequestSweepReport
  | { ok: false; skipped: "already_running" | "recently_ran" };

async function claimRun(minGapMs: number, now: number) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtext('kolleris:request-sweep')) AS locked`;
    if (!rows[0]?.locked) return "already_running" as const;
    const state = await tx.syncState.findUnique({
      where: { channel: REQUEST_SWEEP_CHANNEL },
      select: { lastRunAt: true, lastStatus: true },
    });
    const last = state?.lastRunAt?.getTime() ?? null;
    if (state?.lastStatus === "RUNNING" && last != null && now - last < LEASE_MS) return "already_running" as const;
    if (minGapMs > 0 && last != null && now - last < minGapMs) return "recently_ran" as const;
    const at = new Date(now);
    await tx.syncState.upsert({
      where: { channel: REQUEST_SWEEP_CHANNEL },
      create: { channel: REQUEST_SWEEP_CHANNEL, lastRunAt: at, lastStatus: "RUNNING" },
      update: { lastRunAt: at, lastStatus: "RUNNING" },
    });
    return "claimed" as const;
  });
}

async function releaseRun(report: RequestSweepReport | null) {
  const status = report == null ? "FAILED" : report.errors.length ? "PARTIAL" : "SUCCESS";
  await prisma.syncState
    .update({
      where: { channel: REQUEST_SWEEP_CHANNEL },
      data: { lastStatus: status, ...(status !== "FAILED" ? { lastSuccessAt: new Date() } : {}) },
    })
    .catch((error) => console.error("[request-sweep] could not record the run", error));
}

export async function sweepRequests(
  options: { now?: () => number; minGapMinutes?: number } = {},
): Promise<RequestSweepResult> {
  const clock = options.now ?? Date.now;
  const started = clock();
  const claim = await claimRun(Math.max(0, options.minGapMinutes ?? 0) * 60_000, started);
  if (claim !== "claimed") return { ok: false, skipped: claim };

  let report: RequestSweepReport | null = null;
  try {
    report = { ok: true, expired: [], reminded: [], errors: [] };
    const now = new Date(started);

    const due = await prisma.order.findMany({
      where: { requestStatus: "OFFERED", offerExpiresAt: { lte: now } },
      orderBy: { offerExpiresAt: "asc" },
      take: BATCH,
      select: { id: true, orderNumber: true, status: true },
    });
    for (const order of due) {
      try {
        if (await expireRequest(order, now)) report.expired.push(order.orderNumber);
      } catch (error) {
        report.errors.push({ orderNumber: order.orderNumber, message: error instanceof Error ? error.message : String(error) });
      }
    }

    const waiting = await prisma.order.findMany({
      where: { requestStatus: "OFFERED", offerRemindedAt: null, offerExpiresAt: { gt: now } },
      orderBy: { offerExpiresAt: "asc" },
      take: BATCH,
      select: { id: true, orderNumber: true, offerJson: true },
    });
    const remindBefore = started - OFFER_REMINDER_HOURS * 3_600_000;
    for (const order of waiting) {
      const offer = readStoredOffer(order.offerJson);
      const offeredAt = offer ? Date.parse(offer.receivedAt) : NaN;
      if (!Number.isFinite(offeredAt) || offeredAt > remindBefore) continue;
      try {
        if (await remindRequest(order, now)) report.reminded.push(order.orderNumber);
      } catch (error) {
        report.errors.push({ orderNumber: order.orderNumber, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return report;
  } finally {
    await releaseRun(report);
  }
}

export function requestSweepLogLine(report: RequestSweepReport): string {
  return (
    `[request-sweep] expired ${report.expired.length}, reminded ${report.reminded.length}, errors ${report.errors.length}` +
    (report.expired.length || report.reminded.length
      ? ` (${[...report.expired, ...report.reminded].join(", ")})`
      : "")
  );
}
