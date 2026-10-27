import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetJwksCacheForTests, getVerificationKeys } from "../jwks";

const HOUR = 60 * 60 * 1000;
const URL_BASE = "https://h.example";

function jwk(kid: string) {
  return { kty: "EC", crv: "P-256", x: "x", y: "y", kid, alg: "ES256", use: "sig" };
}

function okFetch(kids: string[]) {
  return vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify({ keys: kids.map(jwk) }), { status: 200 }));
}

describe("getVerificationKeys", () => {
  let t = 1_000_000;
  const now = () => new Date(t);
  beforeEach(() => {
    t = 1_000_000;
    __resetJwksCacheForTests();
  });

  it("does not fetch again within an hour for a known kid", async () => {
    const f = okFetch(["a"]);
    const deps = { fetch: f as unknown as typeof fetch, now, hdctoolUrl: URL_BASE };
    expect(await getVerificationKeys("a", deps)).toHaveLength(1);
    t += HOUR - 1000;
    expect(await getVerificationKeys("a", deps)).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe(`${URL_BASE}/.well-known/eshop-sso-keys`);
  });

  it("refetches an unknown kid at most once per 60 s", async () => {
    const f = okFetch(["a"]);
    const deps = { fetch: f as unknown as typeof fetch, now, hdctoolUrl: URL_BASE };
    await getVerificationKeys("a", deps);
    t += 61_000;
    await getVerificationKeys("zzz", deps);
    expect(f).toHaveBeenCalledTimes(2);
    t += 10_000;
    await getVerificationKeys("yyy", deps);
    expect(f).toHaveBeenCalledTimes(2);
    t += 61_000;
    await getVerificationKeys("yyy", deps);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("returns the stale set when the refetch fails", async () => {
    const good = okFetch(["a"]);
    await getVerificationKeys("a", { fetch: good as unknown as typeof fetch, now, hdctoolUrl: URL_BASE });
    t += HOUR + 1000;
    const bad = vi.fn(async () => {
      throw new Error("down");
    });
    const keys = await getVerificationKeys("a", { fetch: bad as unknown as typeof fetch, now, hdctoolUrl: URL_BASE });
    expect(bad).toHaveBeenCalledTimes(1);
    expect(keys?.[0].kid).toBe("a");
  });

  it("returns null when nothing was ever cached and the fetch fails", async () => {
    const bad = vi.fn(async () => new Response("nope", { status: 500 }));
    expect(
      await getVerificationKeys("a", { fetch: bad as unknown as typeof fetch, now, hdctoolUrl: URL_BASE }),
    ).toBeNull();
  });

  it("keeps only EC P-256 keys that have a kid", async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            keys: [jwk("a"), { ...jwk("b"), kty: "RSA" }, { ...jwk("c"), crv: "P-384" }, { kty: "EC", crv: "P-256" }],
          }),
        ),
    );
    const keys = await getVerificationKeys("a", { fetch: f as unknown as typeof fetch, now, hdctoolUrl: URL_BASE });
    expect(keys?.map((k) => k.kid)).toEqual(["a"]);
  });

  it("treats invalid JSON as a failed fetch", async () => {
    const f = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect(
      await getVerificationKeys("a", { fetch: f as unknown as typeof fetch, now, hdctoolUrl: URL_BASE }),
    ).toBeNull();
  });
});
