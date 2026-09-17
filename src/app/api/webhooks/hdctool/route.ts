import { after, NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifySignature,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/webhooks/hdc-signature";
import { applyHdcDeliveryInBackground } from "@/lib/sync/hdc-feed";

/**
 * HDCtool tells us what changed.
 *
 * This replaces the storefront walking the whole catalogue on a timer. That
 * cost about nine minutes and 5.301 UPDATE statements per run to express, on a
 * typical run, no change at all — because the ERP touches roughly 1.300
 * products a month, not 5.305 an hour. HDCtool is the only system that knows
 * what changed, because it is the one doing the writing.
 *
 * The body carries ids, never product data. Two reasons. A product already has
 * one description — the public API — and a second one inside a webhook body is
 * a second one to keep in step. And a body that cannot carry a price cannot
 * carry a wrong price: whatever we write comes from the API, over an
 * authenticated connection, at the moment we write it.
 *
 * Two things are checked before the delivery is accepted, in this order:
 *
 *   1. the signature, over the raw bytes           — is this from HDCtool
 *   2. the delivery id                             — have we already got this
 *
 * and a third when it is applied, in the background:
 *
 *   3. `prevSeq` against the last seq accounted for — did we miss one
 *
 * The third is the one that makes a push feed safe to rely on. Without it a
 * delivery lost during a deploy is a catalogue that has quietly diverged, and
 * the first sign is a customer being shown a price that stopped existing a
 * week ago.
 *
 * ── Answer first, work after ───────────────────────────────────────────────
 *
 * The response goes back as soon as the delivery is recorded; the products are
 * applied through `after()`, one delivery at a time. Applying inside the
 * request held HDCtool's connection — and up to eight pool connections — for
 * as long as the batch took, and HDCtool sends up to six back to back.
 *
 * Answering early means HDCtool no longer retries a failed apply, so the
 * recovery is on this side — see `hdc-feed.ts`: the ids are kept as pending
 * and retried, and when even that cannot be recorded the sequence check turns
 * it into a gap the next delivery repairs.
 */

/** Node, not edge: the HMAC and Prisma both need it. */
export const runtime = "nodejs";

type Payload = {
  id?: string;
  kind?: string;
  seq?: number;
  prevSeq?: number;
  sentAt?: string;
  mtrl?: number[];
};

export async function POST(request: NextRequest) {
  const secret = process.env.HDCTOOL_WEBHOOK_SECRET;
  if (!secret) {
    // 503, not 500: nothing is wrong with the request, this end is not ready.
    // HDCtool keeps the changes queued and re-sends once it is.
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // The RAW bytes, before any parsing. `JSON.stringify` of a parsed body is not
  // guaranteed to reproduce what was sent, so a verifier that re-serialises is
  // a verifier that fails on an unexpected key order.
  const rawBody = await request.text();

  const verified = verifySignature({
    rawBody,
    secret,
    signature: request.headers.get(SIGNATURE_HEADER),
    timestamp: request.headers.get(TIMESTAMP_HEADER),
  });
  if (!verified.ok) {
    console.warn(`[hdc-webhook] rejected: ${verified.reason}`);
    // No retry will fix a bad signature, and 401 says so. Deliberately terse —
    // an unauthenticated caller learns nothing from the reason.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = JSON.parse(rawBody) as Payload;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const deliveryId = payload.id;
  const seq = payload.seq;
  if (!deliveryId || typeof seq !== "number") {
    return NextResponse.json({ error: "missing_id_or_seq" }, { status: 400 });
  }

  // Recorded BEFORE the work, and before answering. A crash midway then leaves
  // the delivery marked seen and the cursor unmoved — which the sequence check
  // reports as a gap on the next delivery, and the delta pull repairs. A run
  // that fails without crashing removes this row again (see `hdc-feed.ts`), so
  // a re-send of the same id is applied rather than called a replay.
  try {
    await prisma.webhookDelivery.create({
      data: { id: deliveryId.slice(0, 64), source: "hdctool", seq },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // HDCtool never saw our answer and sent it again, or someone replayed a
      // capture. Same answer either way — it is done, or queued.
      return NextResponse.json({ ok: true, replay: true, ackSeq: seq });
    }
    // Anything else is this end being unwell, not a replay. Answering 200 here
    // used to turn a database hiccup into a gap for some later delivery to
    // notice; 503 keeps the batch queued on HDCtool, which retries a 5xx
    // rather than retiring it.
    console.error(
      "[hdc-webhook] could not record delivery",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const mtrl = Array.isArray(payload.mtrl)
    ? payload.mtrl.filter((m): m is number => Number.isInteger(m) && m > 0)
    : [];

  after(() =>
    applyHdcDeliveryInBackground({
      id: deliveryId.slice(0, 64),
      seq,
      prevSeq: typeof payload.prevSeq === "number" ? payload.prevSeq : 0,
      sentAt: typeof payload.sentAt === "string" ? payload.sentAt : null,
      mtrl,
    }),
  );

  // 202: accepted, not yet applied. HDCtool treats any 2xx as delivered and
  // records `ackSeq`; it has never read the old per-product counts.
  return NextResponse.json({ ok: true, accepted: true, ackSeq: seq, products: mtrl.length }, {
    status: 202,
  });
}

/**
 * Prisma's unique-constraint error, recognised by its code rather than its
 * class so it holds whichever copy of the runtime threw it.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
