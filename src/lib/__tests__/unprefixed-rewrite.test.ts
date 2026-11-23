import { describe, expect, it } from "vitest";
// The same path-to-regexp Next uses to match `rewrites()` sources; shipped untyped.
// @ts-expect-error -- no declaration file
import { compile, match } from "next/dist/compiled/path-to-regexp";
import { routing } from "@/i18n/routing";
import { unprefixedToDefaultLocale } from "@/i18n/unprefixed-rewrite";

/*
 * Paths with a dot skip the proxy, so they reached `app/[locale]` with the
 * first segment as the locale and `toLocaleString(locale)` threw in production.
 * The afterFiles rewrite serves them under the default locale instead.
 */
const matchSource = match(unprefixedToDefaultLocale.source, {
  decode: decodeURIComponent,
});
const toDestination = compile(unprefixedToDefaultLocale.destination);

function rewrite(pathname: string): string | null {
  const m: false | { params: object } = matchSource(pathname);
  return m ? toDestination(m.params) : null;
}

describe("unprefixed paths go to the default locale", () => {
  it("is the failure it guards against", () => {
    expect(() => (1234).toLocaleString("wp-login.php")).toThrow(RangeError);
  });

  it.each([
    ["/wp-login.php", "/el/wp-login.php"],
    ["/xmlrpc.php", "/el/xmlrpc.php"],
    ["/wp-admin/setup-config.php", "/el/wp-admin/setup-config.php"],
    ["/proion/some.slug", "/el/proion/some.slug"],
    // Starts with "api" but is not /api: the proxy matcher skips it too.
    ["/apixyz", "/el/apixyz"],
  ])("%s → %s", (from, to) => {
    expect(rewrite(from)).toBe(to);
  });

  it.each([
    "/el/wp-login.php",
    "/en/proion/x",
    "/it",
    "/admin/banners/12",
    "/api/payment/callback",
    "/feeds/google.xml",
    "/_next/static/chunk.js",
    "/",
  ])("leaves %s alone", (pathname) => {
    expect(rewrite(pathname)).toBeNull();
  });

  it("only ever hands [locale] a supported locale", () => {
    for (const path of ["/wp-login.php", "/.env", "/a.b/c", "/EN.php"]) {
      const target = rewrite(path);
      expect(target).not.toBeNull();
      const locale = target!.split("/")[1];
      expect(routing.locales).toContain(locale);
      expect(() => (1).toLocaleString(locale)).not.toThrow();
    }
  });
});
