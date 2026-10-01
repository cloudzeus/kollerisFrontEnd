import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

/**
 * Google's robots.txt semantics, small enough to trust: `*` is any run of
 * characters, `$` anchors the end, the longest matching rule wins and a tie
 * goes to Allow.
 */
function allowed(rules: { allow: string[]; disallow: string[] }, url: string): boolean {
  const matches = (pattern: string) => {
    const anchored = pattern.endsWith("$");
    const body = (anchored ? pattern.slice(0, -1) : pattern)
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${body}${anchored ? "$" : ""}`).test(url);
  };
  const best = (patterns: string[]) =>
    Math.max(-1, ...patterns.filter(matches).map((p) => p.length));
  const a = best(rules.allow);
  const d = best(rules.disallow);
  return d === -1 || a >= d;
}

function rulesOf() {
  const rule = [robots().rules].flat()[0];
  const list = (v: string | string[] | undefined) => (v == null ? [] : [v].flat());
  return { allow: list(rule.allow), disallow: list(rule.disallow) };
}

describe("robots.txt", () => {
  const rules = rulesOf();

  it.each([
    "/katalogos/drapana",
    "/katalogos/drapana?page=3",
    "/en/katalogos/drapana?page=2",
    "/it/brands/milwaukee",
    "/brands/milwaukee?page=4",
    "/proionta?page=2",
    "/prosfores/summer",
    "/proion/some-product",
    "/",
  ])("lets crawlers fetch %s", (url) => {
    expect(allowed(rules, url)).toBe(true);
  });

  it.each([
    "/katalogos/drapana?sub=a",
    "/en/katalogos/drapana?sub=a,b&brand=x&perPage=96",
    "/katalogos/drapana?page=2&brand=x",
    "/katalogos/drapana?brand=x&page=2",
    "/it/brands/milwaukee?avail=in-stock",
    "/proionta?sort=price-asc",
    "/en/prosfores/summer?brand=x",
    "/kalathi",
    "/checkout/epibebaiosi/123?token=x",
    "/admin",
  ])("keeps crawlers off %s", (url) => {
    expect(allowed(rules, url)).toBe(false);
  });
});
