import { randomBytes } from "node:crypto";
import type { AdminSsoConfig } from "./config";
import type { LinkResult } from "./link-user";
import type { SsoClaims, SsoRejection, SsoVerifyResult } from "./verify";

/**
 * The SSO round trip, without Next or next-auth (spec §3.1, §3.4).
 *
 * The routes in src/app/api/admin/sso are thin wrappers around these.
 */

export const SSO_STATE_COOKIE = "sso_state";
const COOKIE_PATH = "/api/admin/sso";
const COOKIE_MAX_AGE_S = 300;
const DEFAULT_RETURN = "/admin";
const MAX_COOKIE_LENGTH = 2048;

export type SsoFailure =
  | SsoRejection
  | "no_state"
  | "replay"
  | "rate_limited"
  | "emergency_account"
  | Extract<LinkResult, { ok: false }>["reason"];

/**
 * Only failures an attacker can produce on purpose count towards the per-IP
 * limit. Staff behind one office NAT routinely hit the others (a slow HDCtool
 * login, Back to the auto-POST page, a JWKS hiccup) and must not lock each
 * other out.
 */
const COUNTED_FAILURES: ReadonlySet<SsoFailure> = new Set<SsoFailure>(["bad_signature", "bad_claims", "bad_role"]);

export type StateCookie = { state: string; returnTo: string };

/** A relative path under /admin, or /admin. Never anything that leaves the site. */
export function safeReturnTo(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length > 1024) return DEFAULT_RETURN;
  if (!raw.startsWith("/admin") || raw.startsWith("//") || raw.includes("\\")) return DEFAULT_RETURN;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_RETURN;
  let url: URL;
  try {
    url = new URL(raw, "http://x");
  } catch {
    return DEFAULT_RETURN;
  }
  // `/admin/../x` normalises out of /admin; `/administrator` is not /admin either.
  const path = url.pathname;
  if (url.host !== "x" || !(path === "/admin" || path.startsWith("/admin/"))) return DEFAULT_RETURN;
  return path + url.search;
}

export function encodeStateCookie(value: StateCookie): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeStateCookie(raw: string | null | undefined): StateCookie | null {
  if (!raw || raw.length > MAX_COOKIE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { state, returnTo } = parsed as Record<string, unknown>;
    if (typeof state !== "string" || state === "") return null;
    return { state, returnTo: safeReturnTo(typeof returnTo === "string" ? returnTo : null) };
  } catch {
    return null;
  }
}

const COOKIE_ATTRIBUTES = `HttpOnly; Secure; SameSite=None; Path=${COOKIE_PATH}`;

/** For `cookies().set(...)`: the same cookie, expired. */
export function clearStateCookie() {
  return {
    name: SSO_STATE_COOKIE,
    value: "",
    options: { httpOnly: true, secure: true, sameSite: "none" as const, path: COOKIE_PATH, maxAge: 0 },
  };
}

/** Spec §3.1. `SameSite=None` because the callback is a cross-site POST from HDCtool. */
export function startSso(returnTo: string | null, cfg: AdminSsoConfig): { location: string; cookie: string } {
  const state = randomBytes(32).toString("base64url");
  const value = encodeStateCookie({ state, returnTo: safeReturnTo(returnTo) });
  const params = new URLSearchParams({ client: cfg.clientId, state });
  return {
    location: `${cfg.hdctoolUrl}/sso/eshop?${params}`,
    cookie: `${SSO_STATE_COOKIE}=${value}; ${COOKIE_ATTRIBUTES}; Max-Age=${COOKIE_MAX_AGE_S}`,
  };
}

export interface LoginAttemptStore {
  count(args: {
    where: { identifier: string; successful: boolean; attemptedAt: { gte: Date } };
  }): Promise<number>;
  create(args: { data: { identifier: string; successful: boolean; ipAddress?: string | null } }): Promise<unknown>;
}

export interface CompleteSsoDeps {
  verify: (token: string, expectedState: string) => Promise<SsoVerifyResult>;
  consumeJti: (jti: string, expiresAt: Date) => Promise<boolean>;
  linkAdminUser: (claims: SsoClaims) => Promise<LinkResult>;
  issueTicket: (userId: string) => Promise<string>;
  /** Lower-cased break-glass addresses: never an SSO identity (spec §4.3). */
  emergencyEmails: string[];
  loginAttempt: LoginAttemptStore;
  maxAttempts: number;
  lockoutMinutes: number;
  now?: () => Date;
}

export type CompleteSsoResult = { ok: true; ticket: string; returnTo: string } | { ok: false; reason: SsoFailure };

/**
 * Spec §3.4, with the per-IP rate limit of the password login in front.
 * The first failure stops the flow. Only COUNTED_FAILURES are recorded, and
 * nothing is recorded while locked, so the lockout cannot keep extending itself.
 */
export async function completeSso(
  input: { token: string | null; cookie: string | null; ip: string | null },
  deps: CompleteSsoDeps,
): Promise<CompleteSsoResult> {
  const now = deps.now?.() ?? new Date();
  const identifier = `sso:${input.ip ?? "unknown"}`;

  const fail = async (reason: SsoFailure): Promise<CompleteSsoResult> => {
    if (COUNTED_FAILURES.has(reason)) {
      await deps.loginAttempt.create({ data: { identifier, successful: false, ipAddress: input.ip } });
    }
    return { ok: false, reason };
  };

  const since = new Date(now.getTime() - deps.lockoutMinutes * 60_000);
  const failures = await deps.loginAttempt.count({
    where: { identifier, successful: false, attemptedAt: { gte: since } },
  });
  if (failures >= deps.maxAttempts) return { ok: false, reason: "rate_limited" };

  const cookie = decodeStateCookie(input.cookie);
  if (!cookie) return fail("no_state");
  if (!input.token) return fail("bad_signature");

  const verified = await deps.verify(input.token, cookie.state);
  if (!verified.ok) return fail(verified.reason);
  const { claims } = verified;

  // verify accepts a token until exp + 30s (clock tolerance), and purgeExpired
  // drops rows past expiresAt: keep the row 30s beyond that so a late token
  // cannot be replayed once its row is purged.
  const JTI_RETENTION_AFTER_EXP_S = 60;
  const jtiExpiresAt = new Date((claims.exp + JTI_RETENTION_AFTER_EXP_S) * 1000);
  if (!(await deps.consumeJti(claims.jti, jtiExpiresAt))) return fail("replay");

  // Break-glass accounts stay password-only: linking would let HDCtool re-role
  // them and would block their password reset. Checked on the token's email,
  // so a rule-1 email change onto an emergency address is refused too.
  if (deps.emergencyEmails.includes(claims.email.toLowerCase())) return fail("emergency_account");

  const linked = await deps.linkAdminUser(claims);
  if (!linked.ok) return fail(linked.reason);

  const ticket = await deps.issueTicket(linked.user.id);
  return { ok: true, ticket, returnTo: cookie.returnTo };
}
