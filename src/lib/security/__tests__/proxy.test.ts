import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/*
 * The proxy as a whole, on what it answers itself: rate limits and listing
 * canonicalisation. Auth.js and the locale middleware are replaced by
 * pass-throughs; what is under test is the routing in front of them.
 */
vi.mock("next-auth", () => ({
  default: () => ({ auth: () => () => NextResponse.next() }),
}));
vi.mock("next-intl/middleware", () => ({ default: () => () => NextResponse.next() }));

type Proxy = (req: NextRequest, event?: unknown) => Response | Promise<Response>;
let proxy: Proxy;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://kolleris.com");
  proxy = (await import("@/proxy")).default as unknown as Proxy;
});

const call = (path: string, headers: Record<string, string> = {}, host = "kolleris.com") =>
  proxy(new NextRequest(`https://${host}${path}`, { headers: { host, ...headers } }));

describe("proxy: rate buckets", () => {
  const from = (ip: string, path: string, headers: Record<string, string> = {}) =>
    call(path, { "cf-connecting-ip": ip, ...headers });

  it("gives /api/suggest its own burst of 60, then a JSON 429", async () => {
    for (let i = 0; i < 60; i++) expect((await from("203.0.113.1", "/api/suggest?q=dr")).status).toBe(200);
    const refused = await from("203.0.113.1", "/api/suggest?q=dr");
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ error: "rate_limited" });
    expect((await from("203.0.113.1", "/api/acp/products?q=x")).status).toBe(200);
  });

  it("leaves keyed agent calls to the route and limits keyless ones", async () => {
    for (let i = 0; i < 150; i++) {
      expect((await from("203.0.113.2", "/api/acp/products?q=x", { "x-api-key": "k" })).status).toBe(200);
    }
    for (let i = 0; i < 30; i++) expect((await from("203.0.113.3", "/api/acp/products?q=x")).status).toBe(200);
    expect((await from("203.0.113.3", "/api/acp/products?q=x")).status).toBe(429);
  });

  it("limits /api/ready at a burst of 10", async () => {
    for (let i = 0; i < 10; i++) expect((await from("203.0.113.4", "/api/ready")).status).toBe(200);
    expect((await from("203.0.113.4", "/api/ready")).status).toBe(429);
  });

  it("never answers 429 to deep paging of a bare listing", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await from("203.0.113.5", `/katalogos/drapana?page=${2 + i}`)).status).toBe(200);
    }
  });

  it("gives a bare search a burst of 20", async () => {
    for (let i = 0; i < 20; i++) expect((await from("203.0.113.6", "/anazitisi?q=drill")).status).toBe(200);
    expect((await from("203.0.113.6", "/anazitisi?q=drill")).status).toBe(429);
  });
});
