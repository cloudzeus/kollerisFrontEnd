import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The signature on a webhook from HDCtool.
 *
 * The twin of `src/lib/eshop-feed/sign.ts` in the HDCtool repo, duplicated on
 * purpose: forty lines, no dependencies, and the two repos deploy separately.
 * A shared package would allow the signer and the verifier to be at different
 * versions, which is the one difference that would silently reject every
 * delivery. Keep the two files identical.
 *
 * Why a signature and not a bearer token. This endpoint sits on the public
 * internet and anything can POST to it — and HDCtool's own public API still
 * accepts a `session_<userId>_0_x` bearer that can be constructed by hand, so a
 * shared secret in a header would be a poor guard in exactly the direction it
 * matters. An HMAC proves the body was written by whoever holds the secret;
 * the timestamp inside the signed material proves it is not a recording of one
 * we accepted an hour ago.
 *
 * Signed material is `${timestamp}.${rawBody}` over the RAW BYTES. Never over a
 * re-serialised object: `JSON.stringify` of a parsed body does not reliably
 * reproduce what was sent, and a verifier that re-serialises is a verifier that
 * fails the first time key order differs.
 */

export const SIGNATURE_HEADER = "x-hdc-signature";
export const TIMESTAMP_HEADER = "x-hdc-timestamp";
export const DELIVERY_HEADER = "x-hdc-delivery";

/** How far out of step the clocks may be before a delivery is refused. */
export const MAX_SKEW_SECONDS = 300;

export function signPayload(rawBody: string, secret: string, timestamp: number): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64");
  return `sha256=${mac}`;
}

/**
 * Constant-time verification.
 *
 * Returns a reason rather than a boolean, so a rejected delivery says whether
 * the secret is wrong or the clock is — otherwise that is an afternoon of
 * guessing.
 */
export function verifySignature({
  rawBody,
  secret,
  signature,
  timestamp,
  now = Math.floor(Date.now() / 1000),
}: {
  rawBody: string;
  secret: string;
  signature: string | null;
  timestamp: string | null;
  now?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!signature) return { ok: false, reason: "missing_signature" };
  if (!timestamp) return { ok: false, reason: "missing_timestamp" };

  const sent = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(sent)) return { ok: false, reason: "bad_timestamp" };
  if (Math.abs(now - sent) > MAX_SKEW_SECONDS) return { ok: false, reason: "stale_timestamp" };

  const expected = Buffer.from(signPayload(rawBody, secret, sent));
  const actual = Buffer.from(signature);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (expected.length !== actual.length) return { ok: false, reason: "bad_signature" };
  if (!timingSafeEqual(expected, actual)) return { ok: false, reason: "bad_signature" };

  return { ok: true };
}
