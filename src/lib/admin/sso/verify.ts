import { timingSafeEqual } from "node:crypto";
import { createLocalJWKSet, decodeProtectedHeader, errors, jwtVerify, type JWK } from "jose";
import { adminSsoConfig, type AdminSsoConfig } from "./config";
import { getVerificationKeys } from "./jwks";

const ROLES = ["ADMIN", "EDITOR", "OPS"] as const;
const MAX_TOKEN_LENGTH = 4096;
const CLOCK_TOLERANCE_S = 30;

export type SsoClaims = {
  sub: string;
  email: string;
  name: string;
  role: (typeof ROLES)[number];
  jti: string;
  exp: number;
};

export type SsoRejection =
  | "bad_signature"
  | "bad_claims"
  | "expired"
  | "state_mismatch"
  | "bad_role"
  | "jwks_unavailable";

export type SsoVerifyResult = { ok: true; claims: SsoClaims } | { ok: false; reason: SsoRejection };

export interface VerifyDeps {
  cfg?: AdminSsoConfig;
  keys?: (kid: string) => Promise<JWK[] | null>;
  now?: () => Date;
}

const fail = (reason: SsoRejection): SsoVerifyResult => ({ ok: false, reason });

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v !== "";
}

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Spec §3.4 steps 2-5 and 7. The jti replay check (step 6) is the caller's. */
export async function verifySsoToken(
  token: string,
  expectedState: string,
  deps: VerifyDeps = {},
): Promise<SsoVerifyResult> {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return fail("bad_signature");
  const cfg = deps.cfg ?? adminSsoConfig();
  const now = deps.now ?? (() => new Date());
  const loadKeys = deps.keys ?? ((kid: string) => getVerificationKeys(kid));

  let kid: string | undefined;
  try {
    kid = decodeProtectedHeader(token).kid;
  } catch {
    return fail("bad_signature");
  }
  if (!nonEmpty(kid)) return fail("bad_signature");

  const keys = await loadKeys(kid);
  if (!keys || keys.length === 0) return fail("jwks_unavailable");

  let payload;
  try {
    ({ payload } = await jwtVerify(token, createLocalJWKSet({ keys }), {
      algorithms: ["ES256"],
      issuer: cfg.issuer,
      audience: cfg.clientId,
      clockTolerance: CLOCK_TOLERANCE_S,
      currentDate: now(),
    }));
  } catch (e) {
    if (e instanceof errors.JWTExpired) return fail("expired");
    if (e instanceof errors.JWTClaimValidationFailed) return fail("bad_claims");
    return fail("bad_signature");
  }

  const { sub, email, name, jti, exp, iat, role, state } = payload;
  if (!nonEmpty(sub) || !nonEmpty(email) || !nonEmpty(jti) || typeof exp !== "number") return fail("bad_claims");
  if (typeof iat !== "number" || iat > now().getTime() / 1000 + CLOCK_TOLERANCE_S) return fail("bad_claims");

  if (typeof state !== "string" || !sameState(state, expectedState)) return fail("state_mismatch");
  if (!(ROLES as readonly unknown[]).includes(role)) return fail("bad_role");

  return {
    ok: true,
    claims: {
      sub,
      email: email.toLowerCase(),
      name: typeof name === "string" ? name : "",
      role: role as SsoClaims["role"],
      jti,
      exp,
    },
  };
}
