/**
 * The webhook's bookkeeping: the cursor, the ids still owed, and the queue.
 *
 * Pure, so the rules that decide whether a failed delivery is remembered or
 * forgotten can be tested without a database or an HTTP request.
 */

/**
 * `SyncState.cursor` for the `catalog-webhook` channel. Free text, so it grew
 * a field without a migration.
 *
 *   lastSeq      the last delivery that is fully accounted for
 *   sentAt       HDCtool's clock at that delivery — what a gap catch-up asks
 *                "changed since" with
 *   pendingMtrl  ids that were accepted but not yet applied: a background run
 *                that failed, products that failed individually, or the part
 *                of a delivery over the per-run ceiling. Retried by the next
 *                delivery, 30s after a failure, and by the nightly reconcile.
 */
export type HdcCursor = {
  lastSeq: number;
  sentAt: string | null;
  pendingMtrl: number[];
};

/**
 * Ceiling on remembered ids. 10.000 integers is ~60 KB of text — more than the
 * whole listed catalogue — so reaching it means something is badly wrong
 * upstream, and past it the timestamp catch-up has to carry the rest.
 */
export const MAX_PENDING = 10_000;

function validIds(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values.filter((v): v is number => Number.isInteger(v) && (v as number) > 0);
}

export function readCursor(raw: string | null | undefined): HdcCursor {
  const empty: HdcCursor = { lastSeq: 0, sentAt: null, pendingMtrl: [] };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as {
      lastSeq?: unknown;
      sentAt?: unknown;
      pendingMtrl?: unknown;
    };
    return {
      lastSeq: typeof parsed.lastSeq === "number" ? parsed.lastSeq : 0,
      sentAt: typeof parsed.sentAt === "string" ? parsed.sentAt : null,
      pendingMtrl: uniqueIds(validIds(parsed.pendingMtrl)),
    };
  } catch {
    return empty;
  }
}

export function writeCursor(cursor: HdcCursor): string {
  // `pendingMtrl` is left off when empty so the common cursor reads exactly as
  // it always has.
  const { lastSeq, sentAt, pendingMtrl } = cursor;
  return JSON.stringify(
    pendingMtrl.length > 0 ? { lastSeq, sentAt, pendingMtrl } : { lastSeq, sentAt },
  );
}

export function uniqueIds(...lists: ReadonlyArray<ReadonlyArray<number>>): number[] {
  const seen = new Set<number>();
  for (const list of lists) {
    for (const id of list) if (Number.isInteger(id) && id > 0) seen.add(id);
  }
  return [...seen];
}

/**
 * Split what is owed into what this run applies and what waits.
 *
 * Owed ids go first: they are older, and a delivery that keeps arriving at the
 * ceiling must not starve them forever. Nothing is dropped — the remainder is
 * carried as pending, where it used to be sliced off and left to a reconcile
 * that only ever looks at listed-or-not, never at a changed price.
 */
export function planRun(
  pending: ReadonlyArray<number>,
  incoming: ReadonlyArray<number>,
  max: number,
): { now: number[]; later: number[] } {
  const all = uniqueIds(pending, incoming);
  return { now: all.slice(0, max), later: all.slice(max) };
}

/** Is a delivery out of step with the last one we accounted for? */
export function isGap(cursor: HdcCursor, prevSeq: number): boolean {
  // lastSeq 0 is the first delivery ever, not a gap.
  return cursor.lastSeq > 0 && prevSeq !== cursor.lastSeq;
}

/**
 * The cursor after a delivery's background run THREW — nothing, or not all of
 * it, is known to be applied.
 *
 * The delivery's ids are added to the pending list, which is what keeps them
 * from being lost: HDCtool already has its 202 and will not send them again.
 *
 * The sequence moves on only when that is enough to account for everything:
 *   - there was no gap before this delivery (a gap still needs the timestamp
 *     catch-up, and moving `lastSeq` would hide it), and
 *   - the ids fit under MAX_PENDING (ids that do not fit are only recoverable
 *     through the timestamp catch-up, so the gap has to stay visible).
 */
export function cursorAfterFailure(
  cursor: HdcCursor,
  delivery: { seq: number; prevSeq: number; sentAt: string | null; mtrl: number[] },
): HdcCursor {
  const merged = uniqueIds(cursor.pendingMtrl, delivery.mtrl);
  const fits = merged.length <= MAX_PENDING;
  const advance = fits && !isGap(cursor, delivery.prevSeq);
  return {
    lastSeq: advance ? delivery.seq : cursor.lastSeq,
    sentAt: advance ? delivery.sentAt ?? cursor.sentAt : cursor.sentAt,
    pendingMtrl: merged.slice(0, MAX_PENDING),
  };
}

/**
 * The cursor after a background run that completed.
 *
 * `caughtUp` false means a gap was seen and the catch-up did not finish; the
 * sequence then stays where it was so the next delivery sees the gap again and
 * asks the same question over.
 */
export function cursorAfterRun(
  cursor: HdcCursor,
  delivery: { seq: number; sentAt: string | null },
  outcome: { caughtUp: boolean; stillPending: number[] },
): HdcCursor {
  return {
    lastSeq: outcome.caughtUp ? delivery.seq : cursor.lastSeq,
    sentAt: outcome.caughtUp ? delivery.sentAt ?? cursor.sentAt : cursor.sentAt,
    pendingMtrl: uniqueIds(outcome.stillPending).slice(0, MAX_PENDING),
  };
}

/**
 * One at a time.
 *
 * HDCtool sends up to six batches back to back, and now that each is answered
 * in milliseconds they would otherwise all be applied at once — six background
 * runs, each holding pool connections, all reading and writing the same cursor.
 * Serialising them keeps the connection footprint of one delivery and makes
 * the cursor's read-modify-write safe within the process.
 *
 * The returned promise settles when THIS task has run, so `after()` keeps the
 * server alive through a graceful shutdown until it is done. It never rejects:
 * a failed task must not stall the ones queued behind it.
 */
export function createSerialQueue() {
  let tail: Promise<void> = Promise.resolve();
  return function enqueue(task: () => Promise<void>): Promise<void> {
    // `tail` never rejects (see the catch below), so `then` always runs `task`.
    tail = tail.then(task).catch(() => undefined);
    return tail;
  };
}
