import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Who is calling the agent API, and how often.
 *
 * Keys live in an environment variable rather than a table, on purpose. There
 * are a handful of agents, they change when a contract changes rather than when
 * a user clicks something, and a table would need a migration, an admin screen
 * and a cache to answer a question a string already answers. If the list ever
 * outgrows that, this is the one file to rewrite.
 *
 *   ACP_API_KEYS=k_live_abc:openai,k_live_def:deepseek
 *
 * The name is not decoration. It is what makes "who is pulling the whole
 * catalogue" answerable in a log, and what lets one agent be cut off without
 * touching the others.
 */

export type AcpCaller = { key: string; name: string };

function parseKeys(): Map<string, string> {
  const raw = process.env.ACP_API_KEYS ?? "";
  const entries = raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const at = pair.indexOf(":");
      return at === -1
        ? ([pair, "unnamed"] as const)
        : ([pair.slice(0, at), pair.slice(at + 1) || "unnamed"] as const);
    });
  return new Map(entries);
}

/** Constant-time, so a key cannot be guessed a character at a time. */
function sameKey(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function identifyCaller(request: Request): AcpCaller | null {
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : (request.headers.get("x-api-key") ?? "").trim();
  if (!supplied) return null;

  for (const [key, name] of parseKeys()) {
    if (sameKey(key, supplied)) return { key, name };
  }
  return null;
}

export function isAcpConfigured(): boolean {
  return parseKeys().size > 0;
}

/**
 * A sliding window per caller, held in memory.
 *
 * Deliberately not Redis. This runs as one container, and a limiter that needs
 * infrastructure is a limiter that gets postponed. It is stated plainly rather
 * than implied: if the app is ever scaled to several instances, each keeps its
 * own count and the effective limit multiplies. That is a known and acceptable
 * looseness for stopping a runaway script, and not a security control.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;

const hits = new Map<string, number[]>();

export type RateVerdict = { ok: true; remaining: number } | { ok: false; retryAfter: number };

export function takeToken(caller: AcpCaller, now = Date.now()): RateVerdict {
  const window = (hits.get(caller.key) ?? []).filter((at) => now - at < WINDOW_MS);

  if (window.length >= MAX_PER_WINDOW) {
    hits.set(caller.key, window);
    const oldest = window[0]!;
    return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - oldest)) / 1000) };
  }

  window.push(now);
  hits.set(caller.key, window);

  // The map only ever grows by the number of distinct keys, which is small, but
  // an empty window is worth dropping so a retired key does not linger.
  if (window.length === 0) hits.delete(caller.key);

  return { ok: true, remaining: MAX_PER_WINDOW - window.length };
}

export const ACP_RATE = { windowMs: WINDOW_MS, max: MAX_PER_WINDOW } as const;
