import { listingKindOf, isFilteredListing } from "@/lib/catalog/listing-query";

/**
 * Per-IP token buckets for the routes that cost a render.
 *
 * ── Why in the proxy, and why in memory ────────────────────────────────────
 *
 * The proxy answers before auth, i18n and the render, so a refused request
 * costs a Map lookup and a few hundred bytes. One container serves the shop;
 * a shared store (Redis) would be another moving part during an incident for
 * no gain. Each instance limits on its own — with N instances a client gets N
 * times the budget, which is acceptable for a guard whose job is to stop
 * hundreds of requests a minute, not the tenth.
 *
 * ── Policies ───────────────────────────────────────────────────────────────
 *
 *   filtered    catalogue/brand/offer/search listings WITH a query: the scraper
 *               case. 20 a minute, bursting to 10 — a person clicking filters
 *               does not come close. Applies to everyone, Googlebot included:
 *               user agents are spoofed, and the facet space is closed to
 *               crawlers by robots.txt anyway.
 *   listing     the same listings without filters (and with ?page=). Generous,
 *               because router prefetches DO count: Next 16 strips the
 *               prefetch headers (`rsc`, `next-router-prefetch`) before the
 *               proxy runs, so a prefetch cannot be told from a visit. Pages
 *               that render many listing links (the brand index, the
 *               category pickers, the menus) set `prefetch={false}`.
 *   listing-bot the same, for a Googlebot/bingbot user agent: a higher rate on
 *               the pages that ARE meant to be crawled. Spoofing it buys
 *               nothing on filtered URLs.
 *   api         the product listing APIs (search suggestions, the agent API).
 *
 * ── Memory ─────────────────────────────────────────────────────────────────
 *
 * Bounded at `maxKeys` (50k) with least-recently-used eviction — a Map keeps
 * insertion order, and touching a key re-inserts it — plus a sweep once a
 * minute that drops buckets which have refilled completely, since a full
 * bucket is indistinguishable from a missing one. A few MB at worst.
 */

export type BucketPolicy = {
  /** Burst: how many requests can be made back to back. */
  capacity: number;
  /** Sustained rate. */
  perMinute: number;
};

export const POLICIES = {
  filtered: { capacity: 10, perMinute: 20 },
  listing: { capacity: 80, perMinute: 240 },
  "listing-bot": { capacity: 120, perMinute: 600 },
  api: { capacity: 30, perMinute: 60 },
} as const satisfies Record<string, BucketPolicy>;

export type PolicyName = keyof typeof POLICIES;

export type TakeResult = { ok: true } | { ok: false; retryAfterSeconds: number };

type Bucket = { tokens: number; updated: number; capacity: number; perSecond: number };

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxKeys: number;
  private readonly now: () => number;
  private readonly sweepEveryMs: number;
  private lastSweep: number;

  constructor(options: { maxKeys?: number; now?: () => number; sweepEveryMs?: number } = {}) {
    this.maxKeys = options.maxKeys ?? 50_000;
    this.now = options.now ?? Date.now;
    this.sweepEveryMs = options.sweepEveryMs ?? 60_000;
    this.lastSweep = this.now();
  }

  get size(): number {
    return this.buckets.size;
  }

  take(key: string, policy: BucketPolicy): TakeResult {
    const now = this.now();
    this.maybeSweep(now);

    const perSecond = policy.perMinute / 60;
    const existing = this.buckets.get(key);
    let tokens = policy.capacity;
    if (existing) {
      const elapsed = Math.max(0, now - existing.updated) / 1000;
      tokens = Math.min(policy.capacity, existing.tokens + elapsed * perSecond);
      // Re-inserted below: the Map's order is the LRU order.
      this.buckets.delete(key);
    }

    let result: TakeResult;
    if (tokens >= 1) {
      tokens -= 1;
      result = { ok: true };
    } else {
      result = { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / perSecond)) };
    }

    this.buckets.set(key, { tokens, updated: now, capacity: policy.capacity, perSecond });
    while (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
    return result;
  }

  /** Drops buckets that have refilled completely: forgetting them changes nothing. */
  private maybeSweep(now: number): void {
    if (now - this.lastSweep < this.sweepEveryMs) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      const elapsed = (now - bucket.updated) / 1000;
      if (bucket.tokens + elapsed * bucket.perSecond >= bucket.capacity) this.buckets.delete(key);
    }
  }
}

/**
 * Expands an IPv6 address and keeps its /64: one subscriber is handed a whole
 * /64, and a scraper rotating through it must not get 2^64 buckets.
 */
function ipv6Prefix64(ip: string): string | null {
  const [head, tail] = ip.split("::");
  if (ip.split("::").length > 2) return null;
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (tail === undefined ? headParts.length !== 8 : missing < 0) return null;
  const parts = tail === undefined ? headParts : [...headParts, ...Array(missing).fill("0"), ...tailParts];
  if (!parts.every((p) => /^[0-9a-f]{1,4}$/i.test(p))) return null;
  return `${parts
    .slice(0, 4)
    .map((p) => p.toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/**
 * The client's address. Cloudflare's `cf-connecting-ip` first — the site is
 * behind Cloudflare and Traefik, so the socket address is a proxy's — then
 * the first `x-forwarded-for` hop, then `x-real-ip`. Null when none is
 * present, which only happens for requests that did not come through the
 * proxies (the container's own health check); those are not limited.
 */
export function clientIp(headers: Headers): string | null {
  const raw =
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "";
  if (!raw) return null;
  if (raw.includes(":") && !raw.includes(".")) return ipv6Prefix64(raw) ?? raw;
  return raw;
}

/** By user agent only — spoofable, which is why it never relaxes the filtered policy. */
const GOOD_BOT = /\b(Googlebot|Google-InspectionTool|Storebot-Google|AdsBot-Google|bingbot)\b/i;

export function isGoodBotUserAgent(userAgent: string | null): boolean {
  return userAgent != null && GOOD_BOT.test(userAgent);
}

const LIMITED_APIS = new Set(["/api/suggest", "/api/acp/products"]);

/**
 * Which bucket a request draws from, or null when it is not limited. Only
 * GET/HEAD: a Server Action is a POST to the page's own URL, and the cart must
 * keep working for someone who has just been browsing fast.
 */
export function policyFor(request: {
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  headers: Headers;
}): PolicyName | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (LIMITED_APIS.has(request.pathname)) return "api";

  const kind = listingKindOf(request.pathname);
  if (!kind) return null;
  if (isFilteredListing(request.searchParams)) return "filtered";
  return isGoodBotUserAgent(request.headers.get("user-agent")) ? "listing-bot" : "listing";
}
