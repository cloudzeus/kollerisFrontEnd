import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifySignature,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/webhooks/hdc-signature";
import { applyHdcDelivery, catchUpFromGap } from "@/lib/sync/hdc-feed";

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
 * Three things are checked before any work happens, in this order:
 *
 *   1. the signature, over the raw bytes           — is this from HDCtool
 *   2. the delivery id                             — have we already done this
 *   3. `prevSeq` against the last seq we applied   — did we miss one
 *
 * The third is the one that makes a push feed safe to rely on. Without it a
 * delivery lost during a deploy is a catalogue that has quietly diverged, and
 * the first sign is a customer being shown a price that stopped existing a
 * week ago.
 */

/** Node, not edge: the HMAC and Prisma both need it. */
export const runtime = "nodejs";

const CHANNEL = "catalog-webhook";

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

  // Recorded BEFORE the work. A crash midway then leaves the delivery marked
  // seen and its changes unapplied — which the sequence check reports as a gap
  // and the delta pull repairs. Recording after would turn a crash into an
  // endless retry of the same batch.
  try {
    await prisma.webhookDelivery.create({
      data: { id: deliveryId.slice(0, 64), source: "hdctool", seq },
    });
  } catch {
    // Unique violation: HDCtool never saw our 200 and sent it again, or someone
    // replayed a capture. Same answer either way — it is done.
    return NextResponse.json({ ok: true, replay: true, ackSeq: seq });
  }

  const state = await prisma.syncState.findUnique({ where: { channel: CHANNEL } });
  const lastSeq = readLastSeq(state?.cursor);
  const prevSeq = payload.prevSeq ?? 0;

  /*
   * A gap means at least one delivery never arrived, and its ids are gone —
   * HDCtool has marked them sent. So do not try to reconstruct them: ask what
   * changed since the last delivery we actually applied, which is a question
   * the timestamps can still answer.
   *
   * `lastSeq === 0` is the first delivery ever, not a gap.
   */
  const gap = lastSeq > 0 && prevSeq !== lastSeq;

  const mtrl = Array.isArray(payload.mtrl) ? payload.mtrl : [];
  let applied: Awaited<ReturnType<typeof applyHdcDelivery>>;

  try {
    applied = await applyHdcDelivery(mtrl);
    if (gap) {
      console.warn(
        `[hdc-webhook] gap: expected prevSeq ${lastSeq}, got ${prevSeq} — pulling the delta`,
      );
      // After the delivery, not instead of it: this batch is current and the
      // catch-up is for what came before it.
      await catchUpFromGap(state?.cursor ?? null);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[hdc-webhook] apply failed", message);
    // 500 so HDCtool retries. The delivery row stays, so the retry is answered
    // as a replay — which is why the cursor below is only advanced on success:
    // the next delivery then reads as a gap and the delta pull repairs it.
    return NextResponse.json({ error: "apply_failed" }, { status: 500 });
  }

  await prisma.syncState.upsert({
    where: { channel: CHANNEL },
    update: {
      cursor: writeCursor(seq, payload.sentAt),
      lastRunAt: new Date(),
      lastSuccessAt: new Date(),
      lastStatus: applied.failed > 0 ? "PARTIAL" : "SUCCESS",
    },
    create: {
      channel: CHANNEL,
      cursor: writeCursor(seq, payload.sentAt),
      lastRunAt: new Date(),
      lastSuccessAt: new Date(),
      lastStatus: applied.failed > 0 ? "PARTIAL" : "SUCCESS",
    },
  });

  return NextResponse.json({
    ok: true,
    ackSeq: seq,
    gap,
    applied: applied.processed,
    created: applied.created,
    updated: applied.updated,
    removed: applied.removed,
    failed: applied.failed,
  });
}

/** The cursor is a small JSON blob in `SyncState.cursor`, which is free text. */
function readLastSeq(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(cursor) as { lastSeq?: number };
    return typeof parsed.lastSeq === "number" ? parsed.lastSeq : 0;
  } catch {
    return 0;
  }
}

function writeCursor(seq: number, sentAt?: string): string {
  // `sentAt` is HDCtool's clock, and it is what the delta pull asks "changed
  // since" with — so the catch-up window is measured on the side that owns the
  // timestamps being compared.
  return JSON.stringify({ lastSeq: seq, sentAt: sentAt ?? new Date().toISOString() });
}
