import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSsoConfig } from "../config";
import {
  SSO_STATE_COOKIE,
  clearStateCookie,
  completeSso,
  decodeStateCookie,
  encodeStateCookie,
  safeReturnTo,
  startSso,
  type CompleteSsoDeps,
} from "../flow";
import type { SsoClaims, SsoVerifyResult } from "../verify";

const cfg: AdminSsoConfig = {
  mode: "both",
  clientId: "kolleris",
  issuer: "https://hdctool.wwa.gr",
  hdctoolUrl: "https://hdctool.wwa.gr",
  emergencyEmails: [],
};

function cookieValue(setCookie: string): string {
  const first = setCookie.split(";")[0];
  return first.slice(first.indexOf("=") + 1);
}

describe("startSso", () => {
  it("sets a short-lived, cross-site, HttpOnly cookie scoped to the SSO routes", () => {
    const { cookie } = startSso("/admin", cfg);
    expect(cookie.startsWith(`${SSO_STATE_COOKIE}=`)).toBe(true);
    for (const attr of ["HttpOnly", "Secure", "SameSite=None", "Path=/api/admin/sso", "Max-Age=300"]) {
      expect(cookie).toContain(attr);
    }
  });

  it("redirects to HDCtool with the client id and a 43-char base64url state", () => {
    const { location, cookie } = startSso(null, cfg);
    const m = /^https:\/\/hdctool\.wwa\.gr\/sso\/eshop\?client=kolleris&state=([A-Za-z0-9_-]{43})$/.exec(location);
    expect(m).not.toBeNull();
    expect(decodeStateCookie(cookieValue(cookie))).toEqual({ state: m![1], returnTo: "/admin" });
  });

  it("uses a fresh state every time", () => {
    expect(startSso(null, cfg).location).not.toBe(startSso(null, cfg).location);
  });

  it.each(["https://evil.example", "//evil.example", "/shop", "/admin/../x", "/\\evil.example", "/admin\\x", "/admin\n"])(
    "returnTo %j becomes /admin",
    (raw) => {
      const { cookie } = startSso(raw, cfg);
      expect(decodeStateCookie(cookieValue(cookie))?.returnTo).toBe("/admin");
    },
  );

  it("keeps an /admin path with its query", () => {
    const { cookie } = startSso("/admin/orders?x=1", cfg);
    expect(decodeStateCookie(cookieValue(cookie))?.returnTo).toBe("/admin/orders?x=1");
  });
});

describe("safeReturnTo", () => {
  it("rejects lookalikes and keeps real admin paths", () => {
    expect(safeReturnTo("/administrator")).toBe("/admin");
    expect(safeReturnTo("/admin")).toBe("/admin");
    expect(safeReturnTo("/admin/products/1")).toBe("/admin/products/1");
    expect(safeReturnTo(null)).toBe("/admin");
  });
});

describe("state cookie", () => {
  it("round-trips and rejects garbage", () => {
    const v = encodeStateCookie({ state: "s", returnTo: "/admin/x" });
    expect(decodeStateCookie(v)).toEqual({ state: "s", returnTo: "/admin/x" });
    expect(decodeStateCookie("%%%")).toBeNull();
    expect(decodeStateCookie(Buffer.from('{"state":1}').toString("base64url"))).toBeNull();
    expect(decodeStateCookie(Buffer.from('{"state":""}').toString("base64url"))).toBeNull();
  });

  it("re-sanitises returnTo when decoding", () => {
    const v = Buffer.from(JSON.stringify({ state: "s", returnTo: "//evil" })).toString("base64url");
    expect(decodeStateCookie(v)?.returnTo).toBe("/admin");
  });

  it("clears with the same attributes and Max-Age=0", () => {
    const c = clearStateCookie();
    expect(c).toEqual({
      name: "sso_state",
      value: "",
      options: { httpOnly: true, secure: true, sameSite: "none", path: "/api/admin/sso", maxAge: 0 },
    });
  });
});

const claims: SsoClaims = {
  sub: "hdc-1",
  email: "a@kolleris.com",
  name: "A",
  role: "ADMIN",
  jti: "jti-1",
  exp: 2_000_000_000,
};

type Attempt = { identifier: string; successful: boolean; attemptedAt: Date };

function makeDeps(overrides: Partial<CompleteSsoDeps> = {}) {
  const attempts: Attempt[] = [];
  const usedJti = new Set<string>();
  const now = new Date("2026-10-27T10:00:00Z");
  const deps: CompleteSsoDeps = {
    verify: vi.fn(async (): Promise<SsoVerifyResult> => ({ ok: true, claims })),
    consumeJti: vi.fn(async (jti: string) => {
      if (usedJti.has(jti)) return false;
      usedJti.add(jti);
      return true;
    }),
    linkAdminUser: vi.fn(async () => ({
      ok: true as const,
      user: { id: "u1", email: claims.email, name: "A", role: "ADMIN" as const },
    })),
    issueTicket: vi.fn(async () => "ticket-1"),
    loginAttempt: {
      count: vi.fn(async ({ where }) =>
        attempts.filter(
          (a) =>
            a.identifier === where.identifier &&
            a.successful === where.successful &&
            a.attemptedAt >= where.attemptedAt.gte,
        ).length,
      ),
      create: vi.fn(async ({ data }) => {
        attempts.push({ ...data, attemptedAt: now });
        return data;
      }),
    },
    maxAttempts: 5,
    lockoutMinutes: 15,
    now: () => now,
    ...overrides,
  };
  return { deps, attempts };
}

const cookieFor = (state = "st", returnTo = "/admin/orders") => encodeStateCookie({ state, returnTo });

describe("completeSso", () => {
  let env: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    env = makeDeps();
  });

  it("missing cookie → no_state, recorded as a failure", async () => {
    const r = await completeSso({ token: "t", cookie: null, ip: "1.2.3.4" }, env.deps);
    expect(r).toEqual({ ok: false, reason: "no_state" });
    expect(env.attempts).toEqual([expect.objectContaining({ identifier: "sso:1.2.3.4", successful: false })]);
    expect(env.deps.verify).not.toHaveBeenCalled();
  });

  it("undecodable cookie → no_state", async () => {
    expect(await completeSso({ token: "t", cookie: "!!", ip: null }, env.deps)).toEqual({
      ok: false,
      reason: "no_state",
    });
    expect(env.attempts[0].identifier).toBe("sso:unknown");
  });

  it("missing token → bad_signature without verifying", async () => {
    expect(await completeSso({ token: "", cookie: cookieFor(), ip: "1.2.3.4" }, env.deps)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    expect(env.deps.verify).not.toHaveBeenCalled();
  });

  it("a valid token → ok with a ticket and returnTo; success is not recorded", async () => {
    const r = await completeSso({ token: "tok", cookie: cookieFor("st"), ip: "1.2.3.4" }, env.deps);
    expect(r).toEqual({ ok: true, ticket: "ticket-1", returnTo: "/admin/orders" });
    expect(env.deps.verify).toHaveBeenCalledWith("tok", "st");
    expect(env.deps.consumeJti).toHaveBeenCalledWith("jti-1", new Date(claims.exp * 1000));
    expect(env.deps.issueTicket).toHaveBeenCalledWith("u1");
    expect(env.attempts).toEqual([]);
  });

  it("the same token again → replay", async () => {
    await completeSso({ token: "tok", cookie: cookieFor(), ip: "1.2.3.4" }, env.deps);
    const r = await completeSso({ token: "tok", cookie: cookieFor(), ip: "1.2.3.4" }, env.deps);
    expect(r).toEqual({ ok: false, reason: "replay" });
    expect(env.deps.linkAdminUser).toHaveBeenCalledTimes(1);
    expect(env.attempts).toHaveLength(1);
  });

  it("passes through the verify reason", async () => {
    const { deps, attempts } = makeDeps({ verify: vi.fn(async () => ({ ok: false as const, reason: "expired" as const })) });
    expect(await completeSso({ token: "tok", cookie: cookieFor(), ip: "1.2.3.4" }, deps)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(deps.consumeJti).not.toHaveBeenCalled();
    expect(attempts).toHaveLength(1);
  });

  it("passes through the link reason", async () => {
    const { deps, attempts } = makeDeps({
      linkAdminUser: vi.fn(async () => ({ ok: false as const, reason: "disabled_locally" as const })),
    });
    expect(await completeSso({ token: "tok", cookie: cookieFor(), ip: "1.2.3.4" }, deps)).toEqual({
      ok: false,
      reason: "disabled_locally",
    });
    expect(deps.issueTicket).not.toHaveBeenCalled();
    expect(attempts).toHaveLength(1);
  });

  it("5 failures from one IP in 15 min → rate_limited before verifying, and recorded", async () => {
    for (let i = 0; i < 5; i++) await completeSso({ token: "t", cookie: null, ip: "9.9.9.9" }, env.deps);
    expect(env.attempts).toHaveLength(5);
    const r = await completeSso({ token: "tok", cookie: cookieFor(), ip: "9.9.9.9" }, env.deps);
    expect(r).toEqual({ ok: false, reason: "rate_limited" });
    expect(env.deps.verify).not.toHaveBeenCalled();
    expect(env.attempts).toHaveLength(6);
    expect(env.attempts.every((a) => a.identifier === "sso:9.9.9.9" && !a.successful)).toBe(true);
    // Another IP is unaffected.
    expect((await completeSso({ token: "tok", cookie: cookieFor(), ip: "8.8.8.8" }, env.deps)).ok).toBe(true);
  });

  it("only counts failures inside the window", async () => {
    await completeSso({ token: "t", cookie: null, ip: "9.9.9.9" }, env.deps);
    const since = vi.mocked(env.deps.loginAttempt.count).mock.calls[0][0].where.attemptedAt.gte;
    expect(since).toEqual(new Date(new Date("2026-10-27T10:00:00Z").getTime() - 15 * 60_000));
  });
});
