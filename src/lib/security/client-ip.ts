/**
 * Who is on the other end of a request — the one place that answers it, for
 * the rate limiter, the proxy and anything that records or shows an address.
 *
 * ── The chain ──────────────────────────────────────────────────────────────
 *
 *   visitor ─▶ Cloudflare ─▶ Traefik (Coolify) ─▶ Next server ─▶ proxy.ts
 *
 * The origin's IP is public, so a request can also skip Cloudflare and reach
 * Traefik directly, carrying any header it likes — `CF-Connecting-IP`
 * included. Trusting that header blindly gave every spoofed request a fresh
 * rate-limit bucket.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 * 1. The PEER is the address that opened the TCP connection to Traefik:
 *    `x-real-ip`. Traefik's forwarded-headers middleware, with no
 *    `forwardedHeaders.trustedIPs`/`insecure` on the entry point (Coolify's
 *    default), deletes every incoming `X-Forwarded-*` and `X-Real-Ip` and
 *    then sets `X-Real-Ip` to the socket's remote address
 *    (traefik/pkg/middlewares/forwardedheaders/forwarded_header.go). Without
 *    `x-real-ip` — no Traefik, e.g. `next dev`/`next start` locally, where
 *    Next fills `x-forwarded-for` with the socket address only if absent —
 *    the RIGHT-most `x-forwarded-for` entry: each proxy appends the address
 *    it saw, so the last one is the hop closest to us. The first entry is
 *    whatever the client wrote.
 * 2. `cf-connecting-ip` is the visitor only when the peer is a Cloudflare
 *    edge (the ranges below). Cloudflare overwrites that header on every
 *    request it forwards, so from one of its addresses it is trustworthy;
 *    from anywhere else it is a claim.
 * 3. Otherwise the peer itself is the client.
 *
 * Nothing at all (no proxy and no socket address) → null; callers decide what
 * that means (the limiter does not limit, a mail says «άγνωστη»).
 */

/*
 * Cloudflare's published edge ranges. Fetched 2026-10-01 from
 *   https://www.cloudflare.com/ips-v4
 *   https://www.cloudflare.com/ips-v6
 * Update both lists from those URLs when Cloudflare announces a change (they
 * rarely do, and with notice). A missing range only means visitors routed
 * through it share the edge's bucket; it never lets a spoof through.
 */
export const CLOUDFLARE_IPV4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

export const CLOUDFLARE_IPV6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

/** 4 bytes for IPv4 (and IPv4-mapped IPv6), 16 for IPv6. */
type IpBytes = number[];

function parseIPv4(s: string): IpBytes | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const bytes: IpBytes = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    bytes.push(n);
  }
  return bytes;
}

function parseIPv6(s: string): IpBytes | null {
  // A trailing dotted quad (`::ffff:1.2.3.4`, `64:ff9b::1.2.3.4`) is two groups.
  let text = s;
  let tail: IpBytes = [];
  const lastColon = text.lastIndexOf(":");
  if (lastColon >= 0 && text.slice(lastColon + 1).includes(".")) {
    const v4 = parseIPv4(text.slice(lastColon + 1));
    if (!v4) return null;
    tail = v4;
    text = `${text.slice(0, lastColon + 1)}0:0`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = halves.length === 1 ? head : [...head, ...Array<string>(missing).fill("0"), ...rest];

  const bytes: IpBytes = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

/**
 * Parses an address as headers carry it: optional brackets, an IPv6 zone, an
 * IPv4 `:port`. IPv4-mapped IPv6 (`::ffff:a.b.c.d`, also in hex) comes back
 * as the 4-byte IPv4 address it is.
 */
function parseIp(raw: string): IpBytes | null {
  let s = raw.trim();
  if (!s || s.length > 64) return null;
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (bracketed) s = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(":"));
  s = s.replace(/%.*$/, "");

  if (!s.includes(":")) return parseIPv4(s);
  const v6 = parseIPv6(s);
  if (!v6) return null;
  const mapped = v6.slice(0, 10).every((b) => b === 0) && v6[10] === 0xff && v6[11] === 0xff;
  return mapped ? v6.slice(12) : v6;
}

function format(bytes: IpBytes): string {
  if (bytes.length === 4) return bytes.join(".");
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  // Compress the longest run of two or more zero groups (RFC 5952).
  let best = -1;
  let bestLen = 1;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== "0") {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === "0") j++;
    if (j - i > bestLen) [best, bestLen] = [i, j - i];
    i = j;
  }
  if (best < 0) return groups.join(":");
  return `${groups.slice(0, best).join(":")}::${groups.slice(best + bestLen).join(":")}`;
}

/** The address in canonical text (IPv4-mapped → IPv4), or null if it is not one. */
export function normalizeIp(raw: string | null | undefined): string | null {
  const bytes = raw ? parseIp(raw) : null;
  return bytes ? format(bytes) : null;
}

type Cidr = { bytes: IpBytes; bits: number };

function parseCidr(cidr: string): Cidr {
  const [addr, bits] = cidr.split("/");
  const bytes = parseIp(addr);
  if (!bytes) throw new Error(`bad CIDR ${cidr}`);
  return { bytes, bits: Number(bits) };
}

const CLOUDFLARE_RANGES: Cidr[] = [...CLOUDFLARE_IPV4, ...CLOUDFLARE_IPV6].map(parseCidr);

function inCidr(ip: IpBytes, { bytes, bits }: Cidr): boolean {
  if (ip.length !== bytes.length) return false;
  const whole = bits >> 3;
  for (let i = 0; i < whole; i++) if (ip[i] !== bytes[i]) return false;
  const rem = bits & 7;
  if (rem === 0) return true;
  const mask = (0xff << (8 - rem)) & 0xff;
  return (ip[whole] & mask) === (bytes[whole] & mask);
}

/** Whether an address belongs to one of Cloudflare's published edge ranges. */
export function isCloudflareIp(raw: string | null | undefined): boolean {
  const ip = raw ? parseIp(raw) : null;
  return ip != null && CLOUDFLARE_RANGES.some((range) => inCidr(ip, range));
}

/**
 * The TCP peer of our edge proxy: `x-real-ip`, else the right-most
 * `x-forwarded-for` entry. Never the first entry — that one the client wrote.
 */
export function peerIp(headers: Headers): string | null {
  const real = normalizeIp(headers.get("x-real-ip"));
  if (real) return real;
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return normalizeIp(chain.at(-1));
}

/**
 * The visitor's full address (for records and notices): `cf-connecting-ip`
 * when the peer is a Cloudflare edge, otherwise the peer. Null when there is
 * no peer at all.
 */
export function clientAddress(headers: Headers): string | null {
  const peer = peerIp(headers);
  if (!peer) return null;
  if (isCloudflareIp(peer)) {
    const visitor = normalizeIp(headers.get("cf-connecting-ip"));
    if (visitor) return visitor;
  }
  return peer;
}

/**
 * The rate-limit key for the visitor: `clientAddress`, with IPv6 cut to its
 * /64 — one subscriber is handed a whole /64, and a scraper rotating through
 * it must not get 2^64 buckets. Null when there is no address (the
 * container's own health check, local runs without a proxy); those are not
 * limited.
 */
export function clientIp(headers: Headers): string | null {
  const address = clientAddress(headers);
  if (!address) return null;
  const bytes = parseIp(address);
  if (!bytes || bytes.length === 4) return address;
  const groups: string[] = [];
  for (let i = 0; i < 8; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  return `${groups.join(":")}::/64`;
}
