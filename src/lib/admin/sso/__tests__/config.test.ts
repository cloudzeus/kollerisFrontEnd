import { describe, expect, it } from "vitest";
import { adminSsoConfig, passwordLoginAllowed, ssoReady } from "../config";

describe("adminSsoConfig", () => {
  it.each(["off", "both", "only"])("accepts mode %s", (m) => {
    expect(adminSsoConfig({ ADMIN_SSO: m }).mode).toBe(m);
  });

  it.each([undefined, "", "garbage", "ONLY2"])("falls back to off for %s", (m) => {
    expect(adminSsoConfig({ ADMIN_SSO: m }).mode).toBe("off");
  });

  it("lower-cases and trims emergency emails", () => {
    const cfg = adminSsoConfig({ ADMIN_EMERGENCY_EMAILS: "A@x.gr, b@x.gr ,," });
    expect(cfg.emergencyEmails).toEqual(["a@x.gr", "b@x.gr"]);
  });

  it("defaults to empty values and strips trailing slash from the HDCtool url", () => {
    expect(adminSsoConfig({})).toEqual({
      mode: "off",
      clientId: "",
      issuer: "",
      hdctoolUrl: "",
      emergencyEmails: [],
    });
    expect(adminSsoConfig({ HDCTOOL_SSO_URL: "https://h.example/" }).hdctoolUrl).toBe("https://h.example");
  });
});

describe("passwordLoginAllowed", () => {
  const only = adminSsoConfig({ ADMIN_SSO: "only", ADMIN_EMERGENCY_EMAILS: "boss@x.gr" });
  it("only + listed → true (case-insensitive)", () => {
    expect(passwordLoginAllowed("Boss@X.gr", only)).toBe(true);
  });
  it("only + unlisted → false", () => {
    expect(passwordLoginAllowed("other@x.gr", only)).toBe(false);
  });
  it("both + unlisted → true", () => {
    expect(passwordLoginAllowed("other@x.gr", adminSsoConfig({ ADMIN_SSO: "both" }))).toBe(true);
  });
  it("off + unlisted → true", () => {
    expect(passwordLoginAllowed("other@x.gr", adminSsoConfig({}))).toBe(true);
  });
});

describe("ssoReady", () => {
  const full = {
    ADMIN_SSO: "both",
    ADMIN_SSO_CLIENT_ID: "kolleris",
    ADMIN_SSO_ISSUER: "hdctool",
    HDCTOOL_SSO_URL: "https://h.example",
  };
  it("true when mode on and all values present", () => {
    expect(ssoReady(adminSsoConfig(full))).toBe(true);
  });
  it("false when off", () => {
    expect(ssoReady(adminSsoConfig({ ...full, ADMIN_SSO: "off" }))).toBe(false);
  });
  it.each(["ADMIN_SSO_CLIENT_ID", "ADMIN_SSO_ISSUER", "HDCTOOL_SSO_URL"])("false when %s empty", (k) => {
    expect(ssoReady(adminSsoConfig({ ...full, [k]: "" }))).toBe(false);
  });
});
