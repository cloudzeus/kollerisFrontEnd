import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ default: () => ({ auth: (fn: unknown) => fn }) }));
vi.mock("next-intl/middleware", () => ({ default: () => () => null }));
vi.mock("@/auth.config", () => ({ authConfig: {} }));

import { adminGate, isAdminLoginPath } from "@/lib/admin/gate";

describe("isAdminLoginPath", () => {
  it("matches the sign-in page and the emergency page only", () => {
    expect(isAdminLoginPath("/admin/login")).toBe(true);
    expect(isAdminLoginPath("/admin/login/emergency")).toBe(true);
    expect(isAdminLoginPath("/admin/login/other")).toBe(false);
    expect(isAdminLoginPath("/admin/orders")).toBe(false);
    expect(isAdminLoginPath("/admin")).toBe(false);
  });
});

describe("adminGate", () => {
  it("lets an unauthenticated visitor reach the emergency page", () => {
    expect(adminGate("/admin/login/emergency", false)).toEqual({ action: "next" });
  });
  it("sends an unauthenticated visitor from /admin/orders to login with redirect", () => {
    expect(adminGate("/admin/orders", false)).toEqual({
      action: "redirect",
      to: "/admin/login",
      redirect: "/admin/orders",
    });
  });
  it("sends an authenticated visitor on the emergency page to /admin", () => {
    expect(adminGate("/admin/login/emergency", true)).toEqual({ action: "redirect", to: "/admin" });
    expect(adminGate("/admin/login", true)).toEqual({ action: "redirect", to: "/admin" });
  });
  it("lets an authenticated visitor into protected pages", () => {
    expect(adminGate("/admin/orders", true)).toEqual({ action: "next" });
  });
});

describe("proxy matcher", () => {
  it("does not run the admin gate on /api/admin/sso/callback", async () => {
    const { config } = await import("@/proxy");
    const gate = new RegExp(`^${config.matcher[0]}$`);
    expect(gate.test("/api/admin/sso/callback")).toBe(false);
    expect(gate.test("/api/admin/sso/start")).toBe(false);
    expect(gate.test("/admin/login/emergency")).toBe(true);
  });
});
