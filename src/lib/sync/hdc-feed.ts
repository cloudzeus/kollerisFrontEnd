import "server-only";
import { hdctool } from "@/lib/hdctool/client";
import { syncProductsByMtrl, type TargetedSyncResult } from "./catalog-sync";

/**
 * Applying what HDCtool pushed, and recovering what it could not.
 *
 * Kept out of the route handler so the decisions — how many products one
 * delivery may carry, how far back a catch-up reaches — are testable without
 * an HTTP request, and so the route reads as what it is: verify, de-duplicate,
 * hand over.
 */

/**
 * Ceiling on one delivery.
 *
 * HDCtool batches at 500, so this is headroom rather than a limit anyone should
 * meet. It exists because a body is untrusted input even after the signature
 * checks out: a bug on the sending side that queues every product must not turn
 * one POST into a full catalogue rebuild inside a request handler.
 */
const MAX_PER_DELIVERY = 2_000;

/** How far back a catch-up will look before giving up and leaving it to the reconcile. */
const MAX_CATCHUP_HOURS = 48;

export async function applyHdcDelivery(mtrl: number[]): Promise<TargetedSyncResult> {
  const ids = mtrl.slice(0, MAX_PER_DELIVERY);
  if (ids.length < mtrl.length) {
    console.warn(
      `[hdc-feed] delivery carried ${mtrl.length} products; applying the first ${ids.length}. ` +
        `The rest are the reconcile's problem.`,
    );
  }
  return syncProductsByMtrl(ids);
}

/**
 * A delivery went missing. Ask what changed instead.
 *
 * The lost delivery's ids cannot be recovered — HDCtool has marked them sent —
 * so this asks the question they were an answer to: what has moved since the
 * last delivery we actually applied. The timestamps can still answer that,
 * which is the whole reason the sequence number is worth carrying.
 *
 * Failures are swallowed on purpose. This runs after a delivery that already
 * succeeded, and turning a failed catch-up into a failed delivery would make
 * HDCtool retry work that is already done. The reconcile is the next net.
 */
export async function catchUpFromGap(cursor: string | null): Promise<void> {
  let since: string;
  try {
    const parsed = cursor ? (JSON.parse(cursor) as { sentAt?: string }) : {};
    since = parsed.sentAt ?? "";
  } catch {
    since = "";
  }

  const floor = Date.now() - MAX_CATCHUP_HOURS * 3600_000;
  const parsedSince = since ? Date.parse(since) : Number.NaN;
  if (!Number.isFinite(parsedSince) || parsedSince < floor) {
    // Older than the window, or no usable timestamp. Asking for "everything
    // since the beginning" would be the full walk this exists to avoid, and
    // the reconcile does that job properly and on its own schedule.
    console.warn("[hdc-feed] gap is older than the catch-up window — leaving it to the reconcile");
    return;
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

    if (missed.size === 0) return;
    const result = await syncProductsByMtrl([...missed]);
    console.log(
      `[hdc-feed] catch-up: ${result.processed} product(s) — ` +
        `${result.created} new, ${result.updated} updated, ${result.removed} de-listed`,
    );
  } catch (error) {
    console.error("[hdc-feed] catch-up failed; the reconcile will correct it", error);
  }
}
