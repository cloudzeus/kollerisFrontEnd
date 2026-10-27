import type { JWK } from "jose";
import { adminSsoConfig } from "./config";

const FRESH_MS = 60 * 60 * 1000;
const MIN_REFETCH_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

interface Cache {
  keys: JWK[];
  fetchedAt: number;
}

let cache: Cache | null = null;
let lastAttemptAt = 0;

export interface JwksDeps {
  fetch?: typeof fetch;
  now?: () => Date;
  /** Defaults to HDCTOOL_SSO_URL. */
  hdctoolUrl?: string;
}

export function __resetJwksCacheForTests() {
  cache = null;
  lastAttemptAt = 0;
}

async function fetchKeys(url: string, doFetch: typeof fetch): Promise<JWK[] | null> {
  try {
    const res = await doFetch(`${url}/.well-known/eshop-sso-keys`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { keys?: unknown };
    if (!Array.isArray(body?.keys)) return null;
    const keys = (body.keys as JWK[]).filter(
      (k) => k && k.kty === "EC" && k.crv === "P-256" && typeof k.kid === "string" && k.kid !== "",
    );
    return keys.length ? keys : null;
  } catch {
    return null;
  }
}

/**
 * Public keys for a token's `kid`. Cached for 1 h; an unknown kid or a stale cache triggers
 * a refetch, at most once per 60 s. If HDCtool is down the last known set is returned (may be
 * stale). null only when nothing was ever cached.
 */
export async function getVerificationKeys(kid: string, deps: JwksDeps = {}): Promise<JWK[] | null> {
  const now = (deps.now ?? (() => new Date()))().getTime();
  const fresh = cache && now - cache.fetchedAt < FRESH_MS;
  if (cache && fresh && cache.keys.some((k) => k.kid === kid)) return cache.keys;

  if (now - lastAttemptAt >= MIN_REFETCH_MS) {
    lastAttemptAt = now;
    const url = deps.hdctoolUrl ?? adminSsoConfig().hdctoolUrl;
    const keys = url ? await fetchKeys(url, deps.fetch ?? fetch) : null;
    if (keys) cache = { keys, fetchedAt: now };
  }
  return cache ? cache.keys : null;
}
