import { describe, expect, it } from "vitest";
import {
  POLICIES,
  TokenBucketLimiter,
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

describe("POLICIES", () => {
  it("holds facet combinations tight and leaves real browsing plenty of room", () => {
    // Prefetch headers never reach the proxy in Next 16, so prefetches count.
    expect(POLICIES.listing).toEqual({ capacity: 80, perMinute: 240 });
    expect(POLICIES["listing-bot"].perMinute).toBeGreaterThan(POLICIES.listing.perMinute);
    expect(POLICIES.filtered).toEqual({ capacity: 10, perMinute: 20 });
    expect(POLICIES.search).toEqual({ capacity: 20, perMinute: 60 });
    expect(POLICIES.suggest).toEqual({ capacity: 60, perMinute: 180 });
    expect(POLICIES.acp).toEqual({ capacity: 30, perMinute: 60 });
    expect(POLICIES.api).toEqual({ capacity: 10, perMinute: 30 });
  });
});

describe("policyFor", () => {
  const req = (url: string, headers: Record<string, string> = {}, method = "GET") => {
    const u = new URL(url, "https://kolleris.com");
    return { method, pathname: u.pathname, searchParams: u.searchParams, headers: new Headers(headers) };
  };
  const googlebot = { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" };

  it("puts real facet combinations in the strict bucket, for everyone", () => {
    expect(policyFor(req("/en/katalogos/x?sub=a,b"))).toBe("filtered");
    expect(policyFor(req("/brands/m?avail=in-stock", googlebot))).toBe("filtered");
    expect(policyFor(req("/katalogos/x?sort=price-asc&page=3"))).toBe("filtered");
    expect(policyFor(req("/anazitisi?q=drill&brand=x"))).toBe("filtered");
    expect(policyFor(req("/anazitisi?q=drill&cat=drapana"))).toBe("filtered");
  });

  it("keeps paging of a bare listing in the listing bucket, at any depth", () => {
    expect(policyFor(req("/katalogos/x?page=2"))).toBe("listing");
    expect(policyFor(req("/katalogos/x?page=180"))).toBe("listing");
    expect(policyFor(req("/katalogos/x?page=180", googlebot))).toBe("listing-bot");
    expect(policyFor(req("/proionta?page=7&utm_source=x"))).toBe("listing");
  });

  it("gives a bare search its own bucket", () => {
    expect(policyFor(req("/anazitisi?q=drill"))).toBe("search");
    expect(policyFor(req("/en/anazitisi?q=drill&page=3&gclid=1"))).toBe("search");
    expect(policyFor(req("/anazitisi?q=drill", googlebot))).toBe("listing-bot");
    expect(policyFor(req("/anazitisi"))).toBe("listing");
  });

  it("gives verified-looking bots a higher rate only on unfiltered listings", () => {
    expect(policyFor(req("/katalogos/x?page=2"))).toBe("listing");
    expect(policyFor(req("/katalogos/x?page=2", googlebot))).toBe("listing-bot");
  });

  it("gives search suggestions their own bucket", () => {
    expect(policyFor(req("/api/suggest?q=dr"))).toBe("suggest");
  });

  it("leaves a keyed agent call to the route's per-key limit, and buckets the rest", () => {
    expect(policyFor(req("/api/acp/products?q=x", { authorization: "Bearer k1" }))).toBeNull();
    expect(policyFor(req("/api/acp/products?q=x", { "x-api-key": "k1" }))).toBeNull();
    expect(policyFor(req("/api/acp/products?q=x"))).toBe("acp");
    expect(policyFor(req("/api/acp/products?q=x", { authorization: "Basic abc" }))).toBe("acp");
  });

  it("limits the database readiness check", () => {
    expect(policyFor(req("/api/ready"))).toBe("api");
  });

  it("leaves everything else alone", () => {
    expect(policyFor(req("/proion/x"))).toBeNull();
    expect(policyFor(req("/api/health"))).toBeNull();
    expect(policyFor(req("/katalogos/x?sub=a", {}, "POST"))).toBeNull();
  });
});
