import "server-only";

/**
 * Typed client for HDCtool's `/api/public/*` surface.
 *
 * ── Security note ───────────────────────────────────────────────────────────
 * HDCtool currently authenticates this API with an ADMIN USER email+password
 * (`POST /api/public/auth` → a better-auth session token used as Bearer). That
 * is why this module is `server-only`: the credential must never reach a
 * client bundle. Fix H0a (BACKEND_ALIGNMENT.md §3) replaces it with an API key;
 * `HDCTOOL_API_KEY` is already read below and takes precedence once set.
 * ────────────────────────────────────────────────────────────────────────────
 */

const BASE_URL = process.env.HDCTOOL_BASE_URL ?? "https://hdctool.wwa.gr";
const REQUEST_TIMEOUT_MS = 30_000;

export class HdctoolError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = "HdctoolError";
  }
}

// ── Session cache ───────────────────────────────────────────────────────────
// The token is valid for 30 days; re-authenticating per request would be both
// slow and a needless credential round-trip. Cached in module scope and
// invalidated on the first 401.
let cachedToken: string | null = null;
let inFlightAuth: Promise<string> | null = null;

async function authenticate(): Promise<string> {
  const apiKey = process.env.HDCTOOL_API_KEY;
  if (apiKey) return apiKey; // post-H0a path

  const email = process.env.HDCTOOL_AUTH_EMAIL;
  const password = process.env.HDCTOOL_AUTH_PASSWORD;
  if (!email || !password) {
    throw new HdctoolError(
      "HDCtool credentials missing: set HDCTOOL_API_KEY, or HDCTOOL_AUTH_EMAIL + HDCTOOL_AUTH_PASSWORD",
      500,
      "/api/public/auth",
    );
  }

  const response = await fetch(`${BASE_URL}/api/public/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new HdctoolError(
      `Authentication failed (${response.status})`,
      response.status,
      "/api/public/auth",
    );
  }

  const data = (await response.json()) as { sessionId?: string };
  if (!data.sessionId) {
    throw new HdctoolError("No sessionId in response", 502, "/api/public/auth");
  }
  return data.sessionId;
}

async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  // Collapse concurrent callers onto a single auth round-trip.
  inFlightAuth ??= authenticate().then(
    (token) => {
      cachedToken = token;
      inFlightAuth = null;
      return token;
    },
    (error) => {
      inFlightAuth = null;
      throw error;
    },
  );
  return inFlightAuth;
}

export { request as hdctoolRequest };

async function request<T>(
  endpoint: string,
  body?: unknown,
  { method = "POST", retryOn401 = true }: { method?: string; retryOn401?: boolean } = {},
): Promise<T> {
  const token = await getToken();

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 401 && retryOn401) {
    cachedToken = null;
    return request<T>(endpoint, body, { method, retryOn401: false });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new HdctoolError(
      `${endpoint} failed (${response.status}) ${detail.slice(0, 200)}`,
      response.status,
      endpoint,
    );
  }

  return (await response.json()) as T;
}

// ── Response shapes (verified against the live API, 2026-07-26) ─────────────

export type HdctoolCursor = { name: string; mtrl: number };

export type HdctoolProduct = {
  id: string;
  mtrl: number;
  code: string;
  code1: string;
  code2: string;
  name: string;
  name1: string | null;
  priceRetail: number | null;
  priceWholesale: number | null;
  pricer01: number | null;
  /** The eshop web price. This is the one that matters. */
  pricer02: number | null;
  priceWeb: number | null;
  /** Returned as a STRING by the live API (e.g. "25") — coerce before using. */
  brandDiscount: string | number | null;
  quantity: number | null;
  unit: number | null;
  brand: {
    id: string | null;
    name: string | null;
    logo: string | null;
    mtrmark: number | null;
  };
  mtrcategory: number | null;
  mtrgroup: number | null;
  cccSubgroup2: number | null;
  vat: { code: number | null; percentage: number };
  country: { code: number | null; name: string | null; intCode: string | null };
  width: number | null;
  length: number | null;
  height: number | null;
  weight: number | null;
  guaranteeTime: number | null;
  images: Array<{
    id: string;
    filename: string;
    url: string;
    isFeature: boolean;
    order: number;
  }>;
  translations: Array<{
    language: "el" | "en" | "it";
    name: string | null;
    shortDescription: string | null;
    longDescription: string | null;
  }>;
  /*
   * Assigned colours and sizes.
   *
   * Optional because HDCtool only started returning them today: the eshop can
   * be deployed ahead of it, and a required field would turn that ordering into
   * a crash on every product rather than an absence.
   *
   * A size carries its family — "M" under ρούχα and "M" under γάντια are not
   * the same size.
   */
  colors?: Array<{ id: string; name: string }>;
  sizes?: Array<{ id: string; label: string; category: string | null }>;
  specifications: Array<Record<string, unknown> & { language: "el" | "en" | "it" }>;
  features: Array<{
    language: "el" | "en" | "it";
    featureType: string | null;
    feature: string | null;
    description: string | null;
    quantity: number | null;
  }>;
  insDate: string | null;
  updDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HdctoolProductsResponse = {
  products: HdctoolProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
    nextCursor: HdctoolCursor | null;
  };
};

export type HdctoolBrand = {
  id: string;
  brandNameGreek: string;
  brandNameEnglish: string;
  brandNameItalian: string;
  brandLogo: string | null;
  brandImage: string | null;
  /** Returned as 0 | 1, not a boolean. */
  eshop: number;
};

export type HdctoolCategory = {
  id: string;
  parentId: string | null;
  erpType: "CATEGORY" | "GROUP" | "SUBGROUP";
  erpCode: string;
  order: number;
  nameGreek: string;
  nameEnglish: string;
  nameItalian: string;
  mainImage: string | null;
  heroImage: string | null;
};

// ── Methods ─────────────────────────────────────────────────────────────────

/** Max the API accepts (PUBLIC_ESHOP_MAX_LIMIT). */
export type HdctoolDeltaResponse = {
  success: boolean;
  op: "changed" | "ids";
  mtrl: number[];
  /** Non-null when the page was capped — ask again from here. */
  nextAfterMtrl: number | null;
  /** `changed` only. Safe to store as the new cursor once paging is done. */
  upTo?: string;
  since?: string;
};

export const HDCTOOL_MAX_LIMIT = 200;

export const hdctool = {
  /**
   * Paginated product list. Pass `cursor` for keyset pagination — the sync must
   * use it, since offset paging degrades badly past ~50 pages (the API logs a
   * deep-page warning at that point).
   */
  products(params: {
    page?: number;
    limit?: number;
    cursor?: HdctoolCursor | null;
    search?: string;
    brandId?: string;
    categoryId?: string;
    groupId?: string;
    subgroupId?: string;
    /** Specific ERP ids. Capped at `HDCTOOL_MAX_LIMIT` server-side. */
    mtrl?: number[];
  }): Promise<HdctoolProductsResponse> {
    return request<HdctoolProductsResponse>("/api/public/products", params);
  },

  /**
   * H1 — the ids the projection should be holding.
   *
   * Two questions, both answered with plain integers:
   *
   *   changed   what moved since a timestamp — the catch-up after a lost push
   *   ids       every listed id — the reconcile
   *
   * Ids rather than products, so `products({ mtrl })` stays the single way a
   * product crosses between the two systems. It is also what makes the
   * reconcile affordable: the whole id list is one query and about 40 KB,
   * against the nine-minute full walk it replaces.
   */
  catalogDelta(
    // A union rather than two overloads: an object literal cannot carry
    // overload signatures, and this gets the same thing at the call site —
    // `since` required for "changed", rejected for "ids".
    params:
      | { op: "changed"; since: string; afterMtrl?: number }
      | { op: "ids"; afterMtrl?: number },
  ): Promise<HdctoolDeltaResponse> {
    return request<HdctoolDeltaResponse>("/api/public/catalog/delta", params);
  },

  brands(): Promise<{ brands: HdctoolBrand[] }> {
    return request<{ brands: HdctoolBrand[] }>("/api/public/brands", {});
  },

  categories(params: { categoryId?: string; brandId?: string; type?: string } = {}): Promise<{
    categories: HdctoolCategory[];
    count: number;
  }> {
    return request("/api/public/categories", params);
  },

  categoriesWithProducts(
    params: { categoryId?: string; brandId?: string; type?: string } = {},
  ): Promise<{ categories: unknown[]; count: number }> {
    return request("/api/public/categories-with-products", params);
  },

  similarProducts(params: { mtrl: number; limit?: number }): Promise<unknown> {
    return request("/api/public/similar-products", params);
  },

  specifications(params: { mtrl: number }): Promise<unknown> {
    return request("/api/public/specifications", params);
  },

  /** Health check — the only endpoint that needs no token. */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${BASE_URL}/api/public/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};
