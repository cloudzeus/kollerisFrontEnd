import { describe, expect, it } from "vitest";
import {
  POLICIES,
  TokenBucketLimiter,
  clientIp,
  isGoodBotUserAgent,
  policyFor,
} from "@/lib/security/rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("TokenBucketLimiter", () => {
  it("allows the burst, then refuses with a Retry-After", () => {
    const c = clock();
    const limiter = new TokenBucketLimiter({ now: c.now });
    const policy = POLICIES.filtered; // burst 10, 20/min
    for (let i = 0; i < policy.capacity; i++) {
      expect(limiter.take("ip", policy)).toEqual({ ok: true });
    }
    const refused = limiter.take("ip", policy);
    expect(refused.ok).toBe(false);
    // 20/min = one token every 3 s.
    expect(refused).toEqual({ ok: false, retryAfterSeconds: 3 });
  });

  it("refills at the sustained rate", () => {
    const c = clock();
    const limiter = new TokenBucketLimiter({ now: c.now });
    const policy = POLICIES.filtered;
    for (let i = 0; i < policy.capacity; i++) limiter.take("ip", policy);
    expect(limiter.take("ip", policy).ok).toBe(false);
    c.advance(3_000);
    expect(limiter.take("ip", policy).ok).toBe(true);
    expect(limiter.take("ip", policy).ok).toBe(false);
  });

  it("holds a scraper to about 20 a minute after the burst", () => {
    const c = clock();
    const limiter = new TokenBucketLimiter({ now: c.now });
    let allowed = 0;
    // One request every 100 ms for a minute: 600 attempts.
    for (let i = 0; i < 600; i++) {
      if (limiter.take("ip", POLICIES.filtered).ok) allowed++;
      c.advance(100);
    }
    expect(allowed).toBeGreaterThanOrEqual(29);
    expect(allowed).toBeLessThanOrEqual(31);
  });

  it("keeps separate buckets per key", () => {
    const limiter = new TokenBucketLimiter({ now: clock().now });
    for (let i = 0; i < 10; i++) limiter.take("a", POLICIES.filtered);
    expect(limiter.take("a", POLICIES.filtered).ok).toBe(false);
    expect(limiter.take("b", POLICIES.filtered).ok).toBe(true);
  });

  it("caps memory with LRU eviction", () => {
    const limiter = new TokenBucketLimiter({ now: clock().now, maxKeys: 100 });
    for (let i = 0; i < 1_000; i++) limiter.take(`ip-${i}`, POLICIES.filtered);
    expect(limiter.size).toBe(100);
  });

  it("evicts the least recently used key, not a busy one", () => {
    const limiter = new TokenBucketLimiter({ now: clock().now, maxKeys: 3 });
    for (let i = 0; i < 10; i++) limiter.take("busy", POLICIES.filtered);
    limiter.take("x", POLICIES.filtered);
    limiter.take("y", POLICIES.filtered);
    limiter.take("busy", POLICIES.filtered); // touch
    limiter.take("z", POLICIES.filtered); // evicts x
    // `busy` kept its (empty) bucket: still refused.
    expect(limiter.take("busy", POLICIES.filtered).ok).toBe(false);
  });

  it("sweeps buckets that have refilled", () => {
    const c = clock();
    const limiter = new TokenBucketLimiter({ now: c.now, sweepEveryMs: 60_000 });
    for (let i = 0; i < 500; i++) limiter.take(`ip-${i}`, POLICIES.filtered);
    expect(limiter.size).toBe(500);
    c.advance(120_000);
    limiter.take("trigger", POLICIES.filtered);
    expect(limiter.size).toBe(1);
  });
});

describe("clientIp", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("prefers cf-connecting-ip, then the first x-forwarded-for hop", () => {
    expect(clientIp(h({ "cf-connecting-ip": "43.1.2.3", "x-forwarded-for": "10.0.0.1" }))).toBe(
      "43.1.2.3",
    );
    expect(clientIp(h({ "x-forwarded-for": "129.226.1.1, 172.18.0.2" }))).toBe("129.226.1.1");
    expect(clientIp(h({ "x-real-ip": "170.106.0.9" }))).toBe("170.106.0.9");
    expect(clientIp(h({}))).toBeNull();
  });

  it("groups IPv6 clients by /64", () => {
    expect(clientIp(h({ "cf-connecting-ip": "2001:db8:abcd:12:1::5" }))).toBe("2001:db8:abcd:12::/64");
    expect(clientIp(h({ "cf-connecting-ip": "2001:db8:abcd:12:ffff:1:2:3" }))).toBe(
      "2001:db8:abcd:12::/64",
    );
  });
});

describe("isGoodBotUserAgent", () => {
  it("recognises Googlebot and bingbot by user agent", () => {
    expect(
      isGoodBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"),
    ).toBe(true);
    expect(isGoodBotUserAgent("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
    expect(isGoodBotUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126")).toBe(false);
    expect(isGoodBotUserAgent(null)).toBe(false);
  });
});

describe("policyFor", () => {
  const req = (url: string, headers: Record<string, string> = {}, method = "GET") => {
    const u = new URL(url, "https://kolleris.com");
    return { method, pathname: u.pathname, searchParams: u.searchParams, headers: new Headers(headers) };
  };
  const googlebot = { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" };

  it("puts filtered listings in the strict bucket, for everyone", () => {
    expect(policyFor(req("/en/katalogos/x?sub=a,b"))).toBe("filtered");
    expect(policyFor(req("/brands/m?avail=in-stock", googlebot))).toBe("filtered");
    expect(policyFor(req("/anazitisi?q=drill"))).toBe("filtered");
  });

  it("gives verified-looking bots a higher rate only on unfiltered listings", () => {
    expect(policyFor(req("/katalogos/x?page=2"))).toBe("listing");
    expect(policyFor(req("/katalogos/x?page=2", googlebot))).toBe("listing-bot");
  });

  it("limits the product listing APIs", () => {
    expect(policyFor(req("/api/suggest?q=dr"))).toBe("api");
    expect(policyFor(req("/api/acp/products?q=x"))).toBe("api");
  });

  it("leaves everything else alone", () => {
    expect(policyFor(req("/proion/x"))).toBeNull();
    expect(policyFor(req("/api/health"))).toBeNull();
    expect(policyFor(req("/katalogos/x?sub=a", {}, "POST"))).toBeNull();
    expect(policyFor(req("/katalogos/x", { "next-router-prefetch": "1" }))).toBeNull();
  });
});
