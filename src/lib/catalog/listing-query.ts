import {
  PER_PAGE_OPTIONS,
  PER_ROW_OPTIONS,
  PRICE_BANDS,
  SORT_OPTIONS,
} from "@/lib/catalog/plp-options";

/**
 * The query string of a product listing, reduced to ONE spelling.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * On 1/10/2026 a distributed scraper (hundreds of cloud IPs, spoofed browser
 * user agents) walked the facet space of the catalogue: `sub=a,b,c,d`,
 * `brand=x,y,z`, random `min`/`max`, `perPage=96`, `perRow`. Every combination
 * was a cache miss and a full render of up to 96 products; 145 of 147 requests
 * in flight were such URLs and the container stopped answering its health
 * check.
 *
 * The facet space was infinite because the parser accepted anything: any
 * number of values per facet, any price, any order, any unknown parameter.
 * This module makes it finite and small:
 *
 *   - only the parameters a listing actually reads survive;
 *   - multi-value facets are deduplicated, sorted and capped;
 *   - prices must be one of the bands the filter offers;
 *   - defaults (`page=1`, `perPage=24`, `sort=relevance`) are dropped;
 *   - `perRow` is a display preference, not a different page: it becomes a
 *     cookie and leaves the URL.
 *
 * Pure and dependency-free so the proxy can run it on every request before
 * anything touches the database, and so the pages and the link builders can
 * share the exact same rules.
 */

export type ListingKind = "category" | "brand" | "products" | "offers" | "search";

export const LISTING_LIMITS = {
  /** `sub` and `brand` values. The filter UI replaces the oldest beyond this. */
  maxValuesPerFacet: 3,
  /**
   * Every facet value counted together: subs + brands + price + avail + sale +
   * new. Exactly the most the filter UI can produce (3 + 3 + 1 + 1 + 1 + 1), so
   * a person can never click past it; only hand-made URLs are trimmed.
   */
  maxFacetValues: 10,
  /**
   * The largest category is ~250 pages at 24. A higher page is clamped here;
   * a page past the real end renders the normal empty state.
   */
  maxPage: 2000,
  maxQueryLength: 200,
  maxSlugLength: 120,
} as const;

/** The perRow preference lives here instead of in the URL. */
export const PER_ROW_COOKIE = "KOLLERIS_PER_ROW";
export const DEFAULT_PER_ROW = 4;
export const DEFAULT_PER_PAGE = 24;

const FACETS_BY_KIND: Record<ListingKind, readonly string[]> = {
  category: ["sub", "brand", "min", "max", "avail", "sale", "new"],
  // A brand page is already scoped to one brand: `?brand=` there is nonsense.
  brand: ["sub", "min", "max", "avail", "sale", "new"],
  products: ["sub", "brand", "min", "max", "avail", "sale", "new"],
  offers: ["sub", "brand", "min", "max", "avail", "sale", "new"],
  search: ["q", "cat", "sub", "brand", "min", "max", "avail", "sale", "new"],
};

const VIEW_PARAMS = ["sort", "page", "perPage"] as const;

/**
 * Kept untouched and never counted as a filter: campaign attribution.
 * Stripping these with a redirect would erase the click from analytics before
 * the tag manager ever saw it. None of them changes what the page renders,
 * and none of them is part of any cache key. Every `utm_*` passes by prefix.
 *
 * (Not `_rsc`: Next 16 strips it, with the `rsc` and prefetch headers, before
 * the proxy runs, so it never reaches this code.)
 */
const PASS_THROUGH = new Set([
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "gad_source",
  "gad_campaignid",
  "srsltid",
  "_gl",
  "fbclid",
  "msclkid",
  "ttclid",
  "twclid",
  "li_fat_id",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_kx",
  "_hsenc",
  "_hsmi",
]);

function isPassThrough(key: string): boolean {
  return PASS_THROUGH.has(key) || key.startsWith("utm_");
}

/** Attribution parameters, as the canonicalisation and the rate limit see them. */
export const isPassThroughParam = isPassThrough;

/** Slugs are produced by `slugify` — kept permissive so no real slug is lost. */
const SLUG = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;

function isSlug(value: string): boolean {
  return value.length <= LISTING_LIMITS.maxSlugLength && SLUG.test(value);
}

/**
 * Which listing a pathname is, if any. Accepts the locale prefix that
 * `localePrefix: "as-needed"` puts in front of `/en` and `/it`.
 */
export function listingKindOf(pathname: string): ListingKind | null {
  const path = pathname.replace(/^\/(?:el|en|it)(?=\/|$)/, "") || "/";
  if (/^\/katalogos\/[^/]+\/?$/.test(path)) return "category";
  if (/^\/brands\/[^/]+\/?$/.test(path)) return "brand";
  if (/^\/proionta\/?$/.test(path)) return "products";
  if (/^\/prosfores\/[^/]+\/?$/.test(path)) return "offers";
  if (/^\/anazitisi\/?$/.test(path)) return "search";
  return null;
}

export type CanonicalResult =
  | { action: "ok" }
  /** `search` is "" or starts with "?". `perRow` is the preference to store, if any. */
  | { action: "redirect"; search: string; perRow: number | null };

type Pair = [string, string];

/** Commas stay readable; everything else is percent-encoded. */
export function serializeQuery(pairs: Pair[]): string {
  if (pairs.length === 0) return "";
  return (
    "?" +
    pairs
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%2C/gi, ",")}`,
      )
      .join("&")
  );
}

function multiValues(all: string[]): string[] {
  const set = new Set<string>();
  for (const raw of all) {
    for (const part of raw.split(",")) {
      const value = part.trim();
      if (value && isSlug(value)) set.add(value);
    }
  }
  return [...set].sort();
}

function priceNumber(value: string | undefined): number | null {
  if (value == null || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  return Number(value.trim());
}

/** The band whose bounds are exactly these, or null. Only bands the UI offers are valid. */
function matchBand(min: number | null, max: number | null) {
  return (
    PRICE_BANDS.find((band) => (band.min ?? null) === min && (band.max ?? null) === max) ??
    null
  );
}

/** Truncates by code point, so a character is never cut in half. */
function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join("") : value;
}

type Facets = {
  sub: string[];
  brand: string[];
  band: (typeof PRICE_BANDS)[number] | null;
  avail: boolean;
  sale: boolean;
  isNew: boolean;
};

const countOf = (f: Facets) =>
  f.sub.length + f.brand.length + (f.band ? 1 : 0) + (f.avail ? 1 : 0) + (f.sale ? 1 : 0) + (f.isNew ? 1 : 0);

/**
 * Brings the facets within the combined cap, giving up the least specific
 * first: the flags, availability and price, then the last brand, then the
 * last subcategory. Deterministic, so the trimmed URL is itself canonical.
 */
function trimToTotal(f: Facets, max: number): void {
  while (countOf(f) > max) {
    if (f.isNew) f.isNew = false;
    else if (f.sale) f.sale = false;
    else if (f.avail) f.avail = false;
    else if (f.band) f.band = null;
    else if (f.brand.length) f.brand.pop();
    else f.sub.pop();
  }
}

/**
 * Canonicalises a listing query string.
 *
 * Returns `ok` when the input is already canonical (semantically — encoding
 * differences such as `%2C` versus `,` do not cause a redirect), and otherwise
 * `redirect` with the canonical query: unknown parameters dropped, values
 * sorted, anything over a limit trimmed. There is no rejection: every input,
 * however hand-made or old, has a canonical URL that is one cheap redirect
 * away — a person following an old link lands on a listing, not an error.
 *
 * Idempotent: the canonical output of a redirect is itself `ok`.
 */
export function canonicalizeListingQuery(
  kind: ListingKind,
  search: string | URLSearchParams,
  limits: { maxValuesPerFacet: number; maxFacetValues: number; maxPage: number; maxQueryLength: number } = LISTING_LIMITS,
): CanonicalResult {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const allowed = new Set<string>([...FACETS_BY_KIND[kind], ...VIEW_PARAMS]);

  const original: Pair[] = [...params.entries()];
  const keys: string[] = [];
  for (const [key] of original) if (!keys.includes(key)) keys.push(key);

  const first = (key: string) => (allowed.has(key) ? (params.get(key) ?? undefined) : undefined);

  const minRaw = first("min");
  const maxRaw = first("max");
  const facets: Facets = {
    sub: allowed.has("sub") ? multiValues(params.getAll("sub")).slice(0, limits.maxValuesPerFacet) : [],
    brand: allowed.has("brand")
      ? multiValues(params.getAll("brand")).slice(0, limits.maxValuesPerFacet)
      : [],
    band:
      minRaw != null || maxRaw != null ? matchBand(priceNumber(minRaw), priceNumber(maxRaw)) : null,
    avail: first("avail") === "in-stock",
    sale: first("sale") === "1",
    isNew: first("new") === "1",
  };
  trimToTotal(facets, limits.maxFacetValues);

  let perRow: number | null = null;
  const out: Pair[] = [];

  for (const key of keys) {
    if (isPassThrough(key)) {
      for (const value of params.getAll(key)) out.push([key, value]);
      continue;
    }
    if (key === "perRow") {
      const n = Number(params.get(key));
      if ((PER_ROW_OPTIONS as readonly number[]).includes(n)) perRow = n;
      continue;
    }
    if (!allowed.has(key)) continue;

    const value = first(key) ?? "";
    switch (key) {
      case "sub":
      case "brand":
        if (facets[key].length) out.push([key, facets[key].join(",")]);
        break;
      case "min":
      case "max": {
        const bound = facets.band ? (key === "min" ? facets.band.min : facets.band.max) : null;
        if (bound != null) out.push([key, String(bound)]);
        break;
      }
      case "avail":
        if (facets.avail) out.push([key, "in-stock"]);
        break;
      case "sale":
        if (facets.sale) out.push([key, "1"]);
        break;
      case "new":
        if (facets.isNew) out.push([key, "1"]);
        break;
      case "sort":
        if (value !== "relevance" && SORT_OPTIONS.some((o) => o.value === value)) {
          out.push([key, value]);
        }
        break;
      case "page": {
        if (!/^\d{1,12}$/.test(value)) break;
        const n = Math.min(Number(value), limits.maxPage);
        if (n > 1) out.push([key, String(n)]);
        break;
      }
      case "perPage": {
        const n = Number(value);
        if (n !== DEFAULT_PER_PAGE && (PER_PAGE_OPTIONS as readonly number[]).includes(n)) {
          out.push([key, String(n)]);
        }
        break;
      }
      case "q": {
        const q = truncate(value, limits.maxQueryLength);
        if (q.trim()) out.push([key, q]);
        break;
      }
      case "cat":
        if (isSlug(value.trim())) out.push([key, value.trim()]);
        break;
    }
  }

  const unchanged =
    perRow === null &&
    out.length === original.length &&
    out.every(([k, v], i) => original[i][0] === k && original[i][1] === v);
  if (unchanged) return { action: "ok" };

  return { action: "redirect", search: serializeQuery(out), perRow };
}

type RawParams = Record<string, string | string[] | undefined>;

/**
 * Whether a listing request is filtered: anything beyond paging and the
 * pass-through parameters. Filtered views are `noindex`, rate-limited harder
 * and gated by the render semaphore; a bare category and its `?page=` are not.
 */
export function isFilteredListing(params: URLSearchParams | RawParams): boolean {
  const keys =
    params instanceof URLSearchParams
      ? [...new Set(params.keys())]
      : Object.keys(params).filter((k) => params[k] != null);
  return keys.some((key) => key !== "page" && !isPassThrough(key));
}

/**
 * `noindex, follow` for a filtered listing, nothing for a bare one.
 *
 * The canonical already points every filtered view at the unfiltered listing;
 * a canonical is a hint, `noindex` is not. `follow` keeps the products linked
 * from the view discoverable.
 */
export function filteredListingRobots(
  params: RawParams,
): { index: false; follow: true } | undefined {
  return isFilteredListing(params) ? { index: false, follow: true } : undefined;
}

/**
 * Applies the per-facet cap the way a person expects when ticking one more:
 * the new value is kept and the oldest one (first in canonical order) gives
 * way. Used by the filter links so the UI never produces a URL the proxy would
 * have to rewrite.
 */
export function toggleCappedValue(current: string[], value: string): string[] {
  const set = new Set(current);
  if (set.has(value)) {
    set.delete(value);
    return [...set].sort();
  }
  const kept = [...set].sort();
  while (kept.length >= LISTING_LIMITS.maxValuesPerFacet) kept.shift();
  return [...kept, value].sort();
}

/** The multi-value cap applied to an already-parsed list (defence in depth for the pages). */
export function capFacetValues(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined;
  const clean = [...new Set(values.filter(isSlug))].sort();
  const capped = clean.slice(0, LISTING_LIMITS.maxValuesPerFacet);
  return capped.length ? capped : undefined;
}
