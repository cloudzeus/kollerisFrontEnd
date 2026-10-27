import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  sets: [] as { name: string; value: string; options: Record<string, unknown> }[],
  signIn: vi.fn(),
  purgeExpired: vi.fn(),
  verify: vi.fn(),
  consumeJti: vi.fn(),
  linkAdminUser: vi.fn(),
  issueTicket: vi.fn(),
  order: [] as string[],
}));

vi.mock("next-auth", () => {
  class AuthError extends Error {}
  class CredentialsSignin extends AuthError {}
  return { AuthError, CredentialsSignin };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (h.jar.has(name) ? { name, value: h.jar.get(name)! } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      h.order.push("clear-cookie");
      h.sets.push({ name, value, options });
    },
  }),
}));
vi.mock("@/auth", () => ({
  MAX_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
  signIn: (...args: unknown[]) => {
    h.order.push("signIn");
    return h.signIn(...args);
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { loginAttempt: { count: vi.fn(async () => 0), create: vi.fn(async () => ({})) } },
}));
vi.mock("@/lib/admin/sso/verify", () => ({ verifySsoToken: h.verify }));
vi.mock("@/lib/admin/sso/link-user", () => ({ linkAdminUser: h.linkAdminUser }));
vi.mock("@/lib/admin/sso/once", () => ({
  consumeJti: h.consumeJti,
  issueTicket: h.issueTicket,
  purgeExpired: (...a: unknown[]) => {
    h.order.push("purge");
    return h.purgeExpired(...a);
  },
}));

import { POST as callback } from "@/app/api/admin/sso/callback/route";
import { POST as start } from "@/app/api/admin/sso/start/route";
import { encodeStateCookie } from "@/lib/admin/sso/flow";

const CLEARED = { httpOnly: true, secure: true, sameSite: "none", path: "/api/admin/sso", maxAge: 0 };

function form(fields: Record<string, string>, url = "https://kolleris.com/api/admin/sso/callback") {
  return new Request(url, { method: "POST", body: new URLSearchParams(fields), headers: { "x-real-ip": "1.2.3.4" } });
}

beforeEach(() => {
  h.jar.clear();
  h.sets.length = 0;
  h.order.length = 0;
  for (const f of [h.signIn, h.purgeExpired, h.verify, h.consumeJti, h.linkAdminUser, h.issueTicket]) f.mockReset();
  h.verify.mockResolvedValue({
    ok: true,
    claims: { sub: "s", email: "a@kolleris.com", name: "A", role: "ADMIN", jti: "j", exp: 2_000_000_000 },
  });
  h.consumeJti.mockResolvedValue(true);
  h.linkAdminUser.mockResolvedValue({ ok: true, user: { id: "u1", email: "a@kolleris.com", name: "A", role: "ADMIN" } });
  h.issueTicket.mockResolvedValue("tk");
  h.signIn.mockResolvedValue("https://kolleris.com/admin/orders");
  h.purgeExpired.mockResolvedValue(undefined);
  vi.unstubAllEnvs();
  vi.stubEnv("ADMIN_SSO", "both");
  vi.stubEnv("ADMIN_SSO_CLIENT_ID", "kolleris");
  vi.stubEnv("ADMIN_SSO_ISSUER", "https://hdctool.wwa.gr");
  vi.stubEnv("HDCTOOL_SSO_URL", "https://hdctool.wwa.gr/");
});

describe("POST /api/admin/sso/start", () => {
  it("303s to HDCtool with the state cookie", async () => {
    const res = await start(form({ redirect: "/admin/orders" }, "https://kolleris.com/api/admin/sso/start"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^https:\/\/hdctool\.wwa\.gr\/sso\/eshop\?client=kolleris&state=[\w-]{43}$/);
    expect(res.headers.get("set-cookie")).toMatch(/^sso_state=[\w-]+; HttpOnly; Secure; SameSite=None; Path=\/api\/admin\/sso; Max-Age=300$/);
  });

  it("404 when SSO is off", async () => {
    vi.stubEnv("ADMIN_SSO", "off");
    expect((await start(form({}, "https://kolleris.com/api/admin/sso/start"))).status).toBe(404);
  });
});

describe("POST /api/admin/sso/callback", () => {
  it("success: clears the cookie, purges, then signs in and 303s to returnTo", async () => {
    h.jar.set("sso_state", encodeStateCookie({ state: "st", returnTo: "/admin/orders" }));
    const res = await callback(form({ token: "tok" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/orders");
    expect(h.sets).toEqual([{ name: "sso_state", value: "", options: CLEARED }]);
    expect(h.signIn).toHaveBeenCalledWith("hdctool-sso", { ticket: "tk", redirectTo: "/admin/orders", redirect: false });
    expect(h.order).toEqual(["clear-cookie", "purge", "signIn"]);
  });

  it("failure: clears the cookie, logs the reason only, 303s to the generic error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await callback(form({ token: "secret-token-value" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/login?error=sso");
    expect(h.sets).toEqual([{ name: "sso_state", value: "", options: CLEARED }]);
    expect(warn).toHaveBeenCalledWith("admin_sso_rejected reason=no_state");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-token-value");
    expect(h.signIn).not.toHaveBeenCalled();
    expect(h.purgeExpired).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("a purgeExpired failure does not fail the login", async () => {
    h.jar.set("sso_state", encodeStateCookie({ state: "st", returnTo: "/admin" }));
    h.purgeExpired.mockRejectedValue(new Error("db hiccup"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await callback(form({ token: "tok" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin");
    expect(h.signIn).toHaveBeenCalled();
    err.mockRestore();
  });

  it("a next-auth rejection after the ticket → generic failure", async () => {
    const { CredentialsSignin } = await import("next-auth");
    h.jar.set("sso_state", encodeStateCookie({ state: "st", returnTo: "/admin" }));
    h.signIn.mockRejectedValue(new CredentialsSignin());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await callback(form({ token: "tok" }));
    expect(res.headers.get("location")).toBe("/admin/login?error=sso");
    expect(h.sets).toHaveLength(1);
    warn.mockRestore();
  });

  it("an unexpected error → generic failure with the cookie cleared, token not logged", async () => {
    h.jar.set("sso_state", encodeStateCookie({ state: "st", returnTo: "/admin" }));
    h.verify.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await callback(form({ token: "secret-token-value" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/login?error=sso");
    expect(h.sets).toEqual([{ name: "sso_state", value: "", options: CLEARED }]);
    expect(err).toHaveBeenCalledWith("admin_sso_error db down");
    expect(JSON.stringify(err.mock.calls)).not.toContain("secret-token-value");
    err.mockRestore();
  });

  it("a non-auth error from signIn → generic failure", async () => {
    h.jar.set("sso_state", encodeStateCookie({ state: "st", returnTo: "/admin" }));
    h.signIn.mockRejectedValue(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await callback(form({ token: "tok" }));
    expect(res.headers.get("location")).toBe("/admin/login?error=sso");
    expect(h.sets).toHaveLength(1);
    err.mockRestore();
  });

  it("404 when SSO is not fully configured", async () => {
    vi.stubEnv("ADMIN_SSO_ISSUER", "");
    expect((await callback(form({ token: "tok" }))).status).toBe(404);
  });
});
