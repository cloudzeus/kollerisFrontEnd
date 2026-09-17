import "server-only";
import { prisma } from "@/lib/prisma";
import { hdctool } from "@/lib/hdctool/client";
import { syncProductsByMtrl } from "./catalog-sync";
import {
  createSerialQueue,
  cursorAfterFailure,
  cursorAfterRun,
  isGap,
  planRun,
  readCursor,
  uniqueIds,
  writeCursor,
  type HdcCursor,
} from "./hdc-feed-state";

/**
 * Applying what HDCtool pushed, and recovering what it could not.
 *
 * Kept out of the route handler so the decisions — how many products one run
 * may carry, how far back a catch-up reaches, what a failure leaves behind —
 * are testable without an HTTP request, and so the route reads as what it is:
 * verify, de-duplicate, accept, hand over.
 *
 * ── Accepted is not applied ────────────────────────────────────────────────
 *
 * The route answers HDCtool as soon as the delivery is recorded and does the
 * work afterwards, through `after()`. Applying 50 products used to happen
 * inside the request, holding the sender's connection and eight pool
 * connections for the whole batch. The price of answering early is that
 * HDCtool no longer hears about a failure and no longer retries — so the
 * retry has to live here. It does, in three layers:
 *
 *   1. The delivery's ids go into `pendingMtrl` in the cursor the moment its
 *      run fails. They are then retried 30 seconds later, by the next
 *      delivery, and by the nightly reconcile — whichever comes first.
 *   2. The delivery row is removed, so a re-send of the same delivery id is
 *      processed again instead of being answered as a replay.
 *   3. If even recording the failure fails (the database is down) or the
 *      process dies mid-run, the cursor never moved: the next delivery's
 *      `prevSeq` no longer matches it, which is a gap, and the timestamp
 *      catch-up below pulls what changed since the last delivery that was
 *      fully accounted for.
 */

const CHANNEL = "catalog-webhook";

/**
 * Ceiling on one run.
 *
 * HDCtool batches at 50, so this is headroom rather than a limit anyone should
 * meet. It exists because a body is untrusted input even after the signature
 * checks out: a bug on the sending side that queues every product must not turn
 * one delivery into a full catalogue rebuild. Ids over it are not dropped —
 * they stay pending for the next run.
 */
const MAX_PER_DELIVERY = 2_000;

/** How far back a catch-up will look before giving up and leaving it to the reconcile. */
const MAX_CATCHUP_HOURS = 48;

/** A failed run's ids are tried again this long after the failure. */
const RETRY_AFTER_FAILURE_MS = 30_000;

export type HdcDelivery = {
  id: string;
  seq: number;
  prevSeq: number;
  /** HDCtool's clock when it sent this delivery. */
  sentAt: string | null;
  mtrl: number[];
};

/*
 * One queue per process, not per module instance: the route bundle and the
 * instrumentation bundle (which runs the nightly reconcile) can each load
 * their own copy of this file, and two queues would let a delivery and a
 * nightly drain write the same cursor at once.
 */
const globals = globalThis as unknown as {
  __hdcFeedQueue?: ReturnType<typeof createSerialQueue>;
  __hdcFeedRetry?: ReturnType<typeof setTimeout>;
};
const enqueue = (globals.__hdcFeedQueue ??= createSerialQueue());

/**
 * Apply a recorded delivery, after the ones already queued.
 *
 * Resolves when this delivery's run is over, whatever its outcome — never
 * rejects — so it can be handed straight to `after()`, which keeps a
 * gracefully stopping server alive until it settles.
 */
export function applyHdcDeliveryInBackground(delivery: HdcDelivery): Promise<void> {
  return enqueue(() => runDelivery(delivery));
}

/**
 * Retry whatever ids earlier runs could not apply.
 *
 * Called 30 seconds after a failed run and by the nightly reconcile, which is
 * what catches a failure on the last delivery before a quiet weekend. Never
 * rejects.
 */
export function drainPendingHdcIds(trigger: string): Promise<void> {
  return enqueue(() => runDrain(trigger));
}

async function loadCursor(): Promise<HdcCursor> {
  const state = await prisma.syncState.findUnique({
    where: { channel: CHANNEL },
    select: { cursor: true },
  });
  return readCursor(state?.cursor);
}

async function saveCursor(
  cursor: HdcCursor,
  status: "SUCCESS" | "PARTIAL" | "FAILED",
): Promise<void> {
  const now = new Date();
  const fields = {
    cursor: writeCursor(cursor),
    lastRunAt: now,
    lastStatus: status,
    ...(status === "FAILED" ? {} : { lastSuccessAt: now }),
  };
  await prisma.syncState.upsert({
    where: { channel: CHANNEL },
    update: fields,
    create: { channel: CHANNEL, ...fields },
  });
}

async function runDelivery(delivery: HdcDelivery): Promise<void> {
  try {
    const cursor = await loadCursor();

    /*
     * A gap means at least one delivery never arrived, and its ids are gone —
     * HDCtool has marked them sent. So do not try to reconstruct them: ask what
     * changed since the last delivery we actually accounted for, which is a
     * question the timestamps can still answer.
     */
    const gap = isGap(cursor, delivery.prevSeq);

    const { now, later } = planRun(cursor.pendingMtrl, delivery.mtrl, MAX_PER_DELIVERY);
    if (later.length > 0) {
      console.warn(
        `[hdc-feed] ${now.length + later.length} products owed; applying ${now.length} now, ` +
          `${later.length} stay pending for the next run.`,
      );
    }

    const applied = await syncProductsByMtrl(now);

    let caughtUp = true;
    let catchUpFailed: number[] = [];
    if (gap) {
      console.warn(
        `[hdc-webhook] gap: expected prevSeq ${cursor.lastSeq}, got ${delivery.prevSeq} — pulling the delta`,
      );
      // After the delivery, not instead of it: this batch is current and the
      // catch-up is for what came before it.
      const result = await catchUpFromGap(cursor.sentAt);
      caughtUp = result.ok;
      catchUpFailed = result.failedMtrl;
    }

    const next = cursorAfterRun(cursor, delivery, {
      caughtUp,
      stillPending: uniqueIds(later, applied.failedMtrl, catchUpFailed),
    });
    await saveCursor(next, next.pendingMtrl.length > 0 || !caughtUp ? "PARTIAL" : "SUCCESS");

    console.log(
      `[hdc-webhook] seq ${delivery.seq}: ${applied.processed} product(s) — ` +
        `${applied.created} new, ${applied.updated} updated, ${applied.removed} de-listed, ` +
        `${applied.failed} failed in ${(applied.durationMs / 1000).toFixed(1)}s` +
        (next.pendingMtrl.length > 0 ? `; ${next.pendingMtrl.length} pending` : ""),
    );
  } catch (error) {
    console.error(
      `[hdc-webhook] seq ${delivery.seq} failed after it was accepted:`,
      error instanceof Error ? error.message : String(error),
    );
    await recordFailure(delivery);
  }
}

/**
 * Leave a failed run recoverable. Each step is independent: one failing does
 * not stop the next.
 */
async function recordFailure(delivery: HdcDelivery): Promise<void> {
  try {
    const next = cursorAfterFailure(await loadCursor(), delivery);
    await saveCursor(next, "FAILED");
    console.warn(
      `[hdc-webhook] seq ${delivery.seq}: ${delivery.mtrl.length} id(s) kept as pending ` +
        `(${next.pendingMtrl.length} owed in total) — retrying in ${RETRY_AFTER_FAILURE_MS / 1000}s`,
    );
  } catch (error) {
    // The cursor did not move, so the next delivery reads as a gap and the
    // timestamp catch-up covers this one.
    console.error(
      `[hdc-webhook] seq ${delivery.seq}: could not record the failure either — ` +
        `the next delivery will see a gap and pull the delta`,
      error instanceof Error ? error.message : String(error),
    );
  }

  // A re-send of this exact delivery must be applied, not answered as a replay.
  await prisma.webhookDelivery
    .delete({ where: { id: delivery.id } })
    .catch(() => undefined);

  scheduleRetry();
}

function scheduleRetry(): void {
  if (globals.__hdcFeedRetry) return;
  const timer = setTimeout(() => {
    globals.__hdcFeedRetry = undefined;
    void drainPendingHdcIds("retry");
  }, RETRY_AFTER_FAILURE_MS);
  // Never the reason the process stays up. A retry lost to a restart is picked
  // up by the next delivery or the nightly reconcile.
  timer.unref?.();
  globals.__hdcFeedRetry = timer;
}

async function runDrain(trigger: string): Promise<void> {
  try {
    const cursor = await loadCursor();
    if (cursor.pendingMtrl.length === 0) return;

    const { now, later } = planRun(cursor.pendingMtrl, [], MAX_PER_DELIVERY);
    const applied = await syncProductsByMtrl(now);

    // The sequence is left alone: a drain accounts for ids, not deliveries.
    // Reading and writing the cursor here is safe because this runs on the
    // same queue as every delivery.
    const next: HdcCursor = {
      ...cursor,
      pendingMtrl: uniqueIds(later, applied.failedMtrl),
    };
    await saveCursor(next, next.pendingMtrl.length > 0 ? "PARTIAL" : "SUCCESS");
    console.log(
      `[hdc-feed] ${trigger}: applied ${applied.processed} pending product(s), ` +
        `${next.pendingMtrl.length} still pending`,
    );
  } catch (error) {
    // Pending ids stay where they are for the next delivery or the next night.
    console.error(
      `[hdc-feed] ${trigger}: pending retry failed`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * A delivery went missing. Ask what changed instead.
 *
 * The lost delivery's ids cannot be recovered — HDCtool has marked them sent —
 * so this asks the question they were an answer to: what has moved since the
 * last delivery we actually accounted for. The timestamps can still answer
 * that, which is the whole reason the sequence number is worth carrying.
 *
 * Never throws. `ok: false` means the question could not be answered, and the
 * caller then leaves the cursor where it was so the next delivery asks again.
 * A gap older than the window is `ok: true` — given up on deliberately, not
 * failed; the reconcile owns it.
 */
export async function catchUpFromGap(
  sentAt: string | null,
): Promise<{ ok: boolean; failedMtrl: number[] }> {
  const floor = Date.now() - MAX_CATCHUP_HOURS * 3600_000;
  const parsedSince = sentAt ? Date.parse(sentAt) : Number.NaN;
  if (!Number.isFinite(parsedSince) || parsedSince < floor) {
    // Older than the window, or no usable timestamp. Asking for "everything
    // since the beginning" would be the full walk this exists to avoid, and
    // the reconcile does that job properly and on its own schedule.
    console.warn("[hdc-feed] gap is older than the catch-up window — leaving it to the reconcile");
    return { ok: true, failedMtrl: [] };
  }

  try {
    const missed = new Set<number>();
    let afterMtrl: number | undefined;
    for (let page = 0; page < 20; page++) {
      const response = await hdctool.catalogDelta({
        op: "changed",
        since: new Date(parsedSince).toISOString(),
        afterMtrl,
      });
      for (const id of response.mtrl) missed.add(id);
      if (response.nextAfterMtrl == null) break;
      afterMtrl = response.nextAfterMtrl;
    }

    if (missed.size === 0) return { ok: true, failedMtrl: [] };
    const result = await syncProductsByMtrl([...missed]);
    console.log(
      `[hdc-feed] catch-up: ${result.processed} product(s) — ` +
        `${result.created} new, ${result.updated} updated, ${result.removed} de-listed`,
    );
    return { ok: true, failedMtrl: result.failedMtrl };
  } catch (error) {
    console.error("[hdc-feed] catch-up failed; the next delivery will try again", error);
    return { ok: false, failedMtrl: [] };
  }
}
