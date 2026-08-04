import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  signPayload,
  verifySignature,
  MAX_SKEW_SECONDS,
} from "../webhooks/hdc-signature";

/**
 * The signature is the only thing standing between this endpoint and anyone on
 * the internet writing to the catalogue, so the cases that must fail are tested
 * as carefully as the one that must pass.
 */

const SECRET = "δοκιμαστικό-μυστικό-δεν-χρησιμοποιείται-πουθενά";
const BODY = JSON.stringify({ id: "d1", seq: 7, mtrl: [2304, 2308] });
const NOW = 1_800_000_000;

const verify = (over: Partial<Parameters<typeof verifySignature>[0]> = {}) =>
  verifySignature({
    rawBody: BODY,
    secret: SECRET,
    signature: signPayload(BODY, SECRET, NOW),
    timestamp: String(NOW),
    now: NOW,
    ...over,
  });

describe("hdc webhook signature", () => {
  it("accepts what it produced", () => {
    expect(verify()).toEqual({ ok: true });
  });

  it("is deterministic", () => {
    expect(signPayload(BODY, SECRET, NOW)).toBe(signPayload(BODY, SECRET, NOW));
  });

  it("rejects a different secret", () => {
    expect(verify({ signature: signPayload(BODY, "άλλο", NOW) })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a body edited after signing", () => {
    // The exact attack the raw-bytes rule exists for: same headers, one field
    // changed. A verifier that re-serialised its own parse would miss this.
    expect(verify({ rawBody: BODY.replace("2304", "9999") })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a signature lifted onto a different timestamp", () => {
    // The timestamp is inside the signed material, so moving it invalidates the
    // signature — which is what stops an old capture being replayed with a
    // fresh header to get inside the skew window.
    expect(verify({ timestamp: String(NOW + 1) })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects a body older than the skew window, in both directions", () => {
    const stale = NOW - MAX_SKEW_SECONDS - 1;
    expect(
      verify({ signature: signPayload(BODY, SECRET, stale), timestamp: String(stale) }),
    ).toEqual({ ok: false, reason: "stale_timestamp" });

    const future = NOW + MAX_SKEW_SECONDS + 1;
    expect(
      verify({ signature: signPayload(BODY, SECRET, future), timestamp: String(future) }),
    ).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("accepts a body at the very edge of the window", () => {
    const edge = NOW - MAX_SKEW_SECONDS;
    expect(
      verify({ signature: signPayload(BODY, SECRET, edge), timestamp: String(edge) }),
    ).toEqual({ ok: true });
  });

  it("names what is missing rather than failing vaguely", () => {
    expect(verify({ signature: null })).toEqual({ ok: false, reason: "missing_signature" });
    expect(verify({ timestamp: null })).toEqual({ ok: false, reason: "missing_timestamp" });
    expect(verify({ timestamp: "όχι-αριθμός" })).toEqual({ ok: false, reason: "bad_timestamp" });
  });

  it("survives a signature of the wrong length", () => {
    // timingSafeEqual throws on a length mismatch; a guard that forgot this
    // would turn a malformed header into a 500 instead of a 401.
    expect(() => verify({ signature: "sha256=κοντό" })).not.toThrow();
    expect(verify({ signature: "sha256=κοντό" })).toEqual({ ok: false, reason: "bad_signature" });
  });
});

/**
 * The verifier here and the signer in HDCtool are two copies of one file. They
 * deploy separately, so nothing but this test stops them drifting apart — and a
 * drift would silently reject every delivery.
 */
describe("the HDCtool copy", () => {
  const TWIN = "/Volumes/EXTERNALSSD/hdckolleris/hdckolleris/src/lib/eshop-feed/sign.ts";

  it.skipIf(!existsSync(TWIN))("is identical apart from its comments", () => {
    const code = (path: string) =>
      readFileSync(path, "utf8")
        .replace(/\/\*\*[\s\S]*?\*\//g, "") // block comments
        .replace(/^\s*\/\/.*$/gm, "") // line comments
        .replace(/\s+/g, " ")
        .trim();

    expect(code(TWIN)).toBe(
      code(new URL("../webhooks/hdc-signature.ts", import.meta.url).pathname),
    );
  });
});
