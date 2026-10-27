import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey, type JWK } from "jose";
import type { AdminSsoConfig } from "../config";
import { verifySsoToken } from "../verify";

const cfg: AdminSsoConfig = {
  mode: "both",
  clientId: "kolleris",
  issuer: "https://hdctool.example",
  hdctoolUrl: "https://hdctool.example",
  emergencyEmails: [],
};
const NOW = new Date("2026-10-27T10:00:00Z");
const nowSec = Math.floor(NOW.getTime() / 1000);
const KID = "k1";

let priv: CryptoKey;
let other: CryptoKey;
let pub: JWK;

beforeAll(async () => {
  const a = await generateKeyPair("ES256");
  const b = await generateKeyPair("ES256");
  priv = a.privateKey;
  other = b.privateKey;
  pub = { ...(await exportJWK(a.publicKey)), kid: KID, alg: "ES256", use: "sig" };
});

const deps = (keys: JWK[] | null = [pub]) => ({ cfg, now: () => NOW, keys: async () => keys });

async function sign(over: Record<string, unknown> = {}, key: CryptoKey = priv) {
  const claims = {
    sub: "u1",
    email: "Boss@Example.GR",
    name: "Boss",
    role: "ADMIN",
    state: "st",
    jti: "j-1",
    ...over,
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setIssuer((over.iss as string) ?? cfg.issuer)
    .setAudience((over.aud as string) ?? cfg.clientId)
    .setIssuedAt((over.iat as number) ?? nowSec)
    .setExpirationTime((over.exp as number) ?? nowSec + 60)
    .sign(key);
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

describe("verifySsoToken", () => {
  it("accepts a valid token and lower-cases the email", async () => {
    const r = await verifySsoToken(await sign(), "st", deps());
    expect(r).toEqual({
      ok: true,
      claims: { sub: "u1", email: "boss@example.gr", name: "Boss", role: "ADMIN", jti: "j-1", exp: nowSec + 60 },
    });
  });

  it("defaults a missing name to an empty string", async () => {
    const r = await verifySsoToken(await sign({ name: undefined }), "st", deps());
    expect(r.ok && r.claims.name).toBe("");
  });

  it("rejects the wrong audience", async () => {
    expect(await verifySsoToken(await sign({ aud: "milwaukee" }), "st", deps())).toEqual({ ok: false, reason: "bad_claims" });
  });

  it("rejects the wrong issuer", async () => {
    expect(await verifySsoToken(await sign({ iss: "https://evil.example" }), "st", deps())).toEqual({ ok: false, reason: "bad_claims" });
  });

  it("rejects exp 31 s in the past but accepts 29 s", async () => {
    expect(await verifySsoToken(await sign({ exp: nowSec - 31 }), "st", deps())).toEqual({ ok: false, reason: "expired" });
    expect((await verifySsoToken(await sign({ exp: nowSec - 29 }), "st", deps())).ok).toBe(true);
  });

  it("rejects iat 120 s in the future", async () => {
    const t = await sign({ iat: nowSec + 120, exp: nowSec + 180 });
    expect(await verifySsoToken(t, "st", deps())).toEqual({ ok: false, reason: "bad_claims" });
  });

  it("rejects another state", async () => {
    expect(await verifySsoToken(await sign(), "other", deps())).toEqual({ ok: false, reason: "state_mismatch" });
    expect(await verifySsoToken(await sign(), "st-longer", deps())).toEqual({ ok: false, reason: "state_mismatch" });
  });

  it("rejects a token signed by another key with the same kid", async () => {
    expect(await verifySsoToken(await sign({}, other), "st", deps())).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects HS256", async () => {
    const h = b64({ alg: "HS256", kid: KID, typ: "JWT" });
    const p = b64({ iss: cfg.issuer, aud: cfg.clientId, sub: "u1", email: "a@b.gr", role: "ADMIN", state: "st", jti: "j", iat: nowSec, exp: nowSec + 60 });
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", "secret").update(`${h}.${p}`).digest("base64url");
    expect(await verifySsoToken(`${h}.${p}.${sig}`, "st", deps())).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects alg none", async () => {
    const h = b64({ alg: "none", kid: KID, typ: "JWT" });
    const p = b64({ iss: cfg.issuer, aud: cfg.clientId, sub: "u1", email: "a@b.gr", role: "ADMIN", state: "st", jti: "j", iat: nowSec, exp: nowSec + 60 });
    expect(await verifySsoToken(`${h}.${p}.`, "st", deps())).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an unknown role", async () => {
    expect(await verifySsoToken(await sign({ role: "SUPER" }), "st", deps())).toEqual({ ok: false, reason: "bad_role" });
  });

  it("rejects missing sub/email/jti", async () => {
    for (const k of ["sub", "email", "jti"]) {
      expect(await verifySsoToken(await sign({ [k]: "" }), "st", deps())).toEqual({ ok: false, reason: "bad_claims" });
    }
  });

  it("reports jwks_unavailable when there are no keys", async () => {
    expect(await verifySsoToken(await sign(), "st", deps(null))).toEqual({ ok: false, reason: "jwks_unavailable" });
    expect(await verifySsoToken(await sign(), "st", deps([]))).toEqual({ ok: false, reason: "jwks_unavailable" });
  });

  it("rejects malformed and oversized tokens", async () => {
    expect(await verifySsoToken("not-a-jwt", "st", deps())).toEqual({ ok: false, reason: "bad_signature" });
    expect(await verifySsoToken("a".repeat(5000), "st", deps())).toEqual({ ok: false, reason: "bad_signature" });
  });
});
