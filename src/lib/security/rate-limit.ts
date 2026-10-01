import {
  isFilteredListing,
  isPassThroughParam,
  listingKindOf,
} from "@/lib/catalog/listing-query";

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
 *   filtered    real facet combinations on catalogue/brand/offer/search
 *               listings (anything beyond paging, attribution or a bare
 *               search): the scraper case. 20 a minute, bursting to 10 — a
 *               person clicking filters does not come close. Applies to
 *               everyone, Googlebot included: user agents are spoofed, and the
 *               facet space is closed to crawlers by robots.txt anyway.
 *   listing     the same listings without filters, and their ?page= at any
 *               depth. Generous, because router prefetches DO count: Next 16
 *               strips the prefetch headers (`rsc`, `next-router-prefetch`)
 *               before the proxy runs, so a prefetch cannot be told from a
 *               visit. Pages that render many listing links (the brand index,
 *               the category pickers, the menus) set `prefetch={false}`.
 *   listing-bot the same, for a Googlebot/bingbot user agent, and their bare
 *               searches: a higher rate on the pages that ARE meant to be
 *               crawled. Spoofing it buys nothing on facet combinations.
 *   search      a bare `/anazitisi?q=` (with its page): 60 a minute, bursting
 *               to 20 — every query is a render nobody else shares.
 *   suggest     `/api/suggest`, the search box as you type: 180 a minute,
 *               bursting to 60.
 *   acp         `/api/acp/products` WITHOUT a key (it can only answer 401).
 *               A call that carries a key is not limited here: the route
 *               enforces the key's own contract (120 a minute, acp/auth.ts).
 *   api         `/api/ready`, the database check: 30 a minute.
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
  search: { capacity: 20, perMinute: 60 },
  suggest: { capacity: 60, perMinute: 180 },
  acp: { capacity: 30, perMinute: 60 },
  api: { capacity: 10, perMinute: 30 },
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

/** By user agent only — spoofable, which is why it never relaxes the filtered policy. */
const GOOD_BOT = /\b(Googlebot|Google-InspectionTool|Storebot-Google|AdsBot-Google|bingbot)\b/i;

export function isGoodBotUserAgent(userAgent: string | null): boolean {
  return userAgent != null && GOOD_BOT.test(userAgent);
}

/** An agent-API key, in either header the route reads (acp/auth.ts). */
function carriesAcpKey(headers: Headers): boolean {
  const authorization = headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ") && authorization.slice(7).trim()) return true;
  return Boolean(headers.get("x-api-key")?.trim());
}

/** `/anazitisi?q=…`, optionally with its page and attribution: no facet next to the query. */
function isBareSearch(searchParams: URLSearchParams): boolean {
  if (!searchParams.get("q")?.trim()) return false;
  return [...searchParams.keys()].every((key) => key === "q" || key === "page" || isPassThroughParam(key));
}

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
  if (request.pathname === "/api/suggest") return "suggest";
  if (request.pathname === "/api/acp/products") return carriesAcpKey(request.headers) ? null : "acp";
  if (request.pathname === "/api/ready") return "api";

  const kind = listingKindOf(request.pathname);
  if (!kind) return null;
  const bot = isGoodBotUserAgent(request.headers.get("user-agent"));
  if (kind === "search" && isBareSearch(request.searchParams)) return bot ? "listing-bot" : "search";
  if (isFilteredListing(request.searchParams)) return "filtered";
  return bot ? "listing-bot" : "listing";
}
