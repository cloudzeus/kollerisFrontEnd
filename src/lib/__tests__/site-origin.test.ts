import { describe, expect, it } from "vitest";
import { __resolveOrigin as resolveOrigin } from "@/lib/seo/urls";

/**
 * The site's own address.
 *
 * One setting, and everything absolute the site says about itself is built
 * from it: `rel="canonical"`, every sitemap entry, the shop's identity in
 * JSON-LD, and the link on all 5.200 items in the Merchant Center feed.
 *
 * Production ran with a trailing comma on it. Nothing crashed; every URL was
 * simply invalid, and the first anyone heard was Google reporting "Invalid URL"
 * and "Missing product page" days later. These are the shapes a deployment
 * form actually produces.
 */
describe("resolveOrigin", () => {
  it("repairs the trailing comma that broke production", () => {
    const { origin, problem } = resolveOrigin("https://web.kolleris.com,");
    expect(origin).toBe("https://web.kolleris.com");
    // Repaired, but never silently: this string is what reaches the deploy log.
    expect(problem).toMatch(/trailing characters/);
  });

  it("does not rely on the URL parser to catch it", () => {
    // The reason an explicit hostname check exists at all: WHATWG accepts a
    // comma as part of a host and hands back the broken origin unchanged.
    expect(new URL("https://web.kolleris.com,").origin).toBe("https://web.kolleris.com,");
  });

  it("accepts a correct value without complaint", () => {
    expect(resolveOrigin("https://web.kolleris.com")).toEqual({
      origin: "https://web.kolleris.com",
      problem: undefined,
      // Set only when a value was actually supplied — the redirect after a
      // payment needs to tell "configured" apart from "defaulted to localhost".
      configured: true,
    });
  });

  it("normalises whitespace, trailing slashes and stray semicolons", () => {
    for (const raw of [
      "  https://web.kolleris.com  ",
      "https://web.kolleris.com/",
      "https://web.kolleris.com///",
      "https://web.kolleris.com;",
      "https://web.kolleris.com, ",
    ]) {
      expect(resolveOrigin(raw).origin).toBe("https://web.kolleris.com");
    }
  });

  it("drops a path, query or fragment", () => {
    expect(resolveOrigin("https://web.kolleris.com/el?a=1#x").origin).toBe(
      "https://web.kolleris.com",
    );
  });

  it("keeps a port, which dev and staging need", () => {
    expect(resolveOrigin("http://localhost:3000").origin).toBe("http://localhost:3000");
  });

  it("falls back and reports when the value is not a URL at all", () => {
    // A bare host is the other thing people type. It has no scheme, so every
    // link built from it would be relative to whatever page it appeared on.
    const { origin, problem } = resolveOrigin("web.kolleris.com");
    expect(origin).toBe("http://localhost:3000");
    expect(problem).toMatch(/not a URL/);
  });

  it("refuses a host with characters a hostname cannot contain", () => {
    const { problem } = resolveOrigin("https://web kolleris.com");
    expect(problem).toBeTruthy();
  });

  it("refuses a non-http scheme", () => {
    expect(resolveOrigin("ftp://web.kolleris.com").problem).toMatch(/not http/);
  });

  it("treats an unset or blank value as development, silently", () => {
    // A blank line in .env is normal locally and is not worth an error.
    expect(resolveOrigin(undefined)).toEqual({ origin: "http://localhost:3000" });
    expect(resolveOrigin("   ")).toEqual({ origin: "http://localhost:3000" });
  });
});
