import { describe, expect, it } from "vitest";
import {
  CLOUDFLARE_IPV4,
  CLOUDFLARE_IPV6,
  clientAddress,
  clientIp,
  isCloudflareIp,
  normalizeIp,
  peerIp,
} from "@/lib/security/client-ip";

const h = (init: Record<string, string>) => new Headers(init);

describe("isCloudflareIp", () => {
  it("matches Cloudflare's IPv4 and IPv6 edges, and nothing next to them", () => {
    expect(isCloudflareIp("173.245.48.1")).toBe(true);
    expect(isCloudflareIp("173.245.63.255")).toBe(true);
    expect(isCloudflareIp("173.245.64.0")).toBe(false);
    expect(isCloudflareIp("162.159.255.1")).toBe(true); // 162.158.0.0/15
    expect(isCloudflareIp("162.160.0.1")).toBe(false);
    expect(isCloudflareIp("2400:cb00::1")).toBe(true);
    expect(isCloudflareIp("2a06:98c7:ffff::1")).toBe(true); // 2a06:98c0::/29
    expect(isCloudflareIp("2a06:98c8::1")).toBe(false);
    expect(isCloudflareIp("2001:db8::1")).toBe(false);
    expect(isCloudflareIp("203.0.113.9")).toBe(false);
    expect(isCloudflareIp("not-an-ip")).toBe(false);
    expect(isCloudflareIp(null)).toBe(false);
  });

  it("sees an IPv4-mapped IPv6 address as the IPv4 address it is", () => {
    expect(isCloudflareIp("::ffff:173.245.48.1")).toBe(true);
    expect(isCloudflareIp("::ffff:adf5:3001")).toBe(true);
    expect(isCloudflareIp("::ffff:203.0.113.9")).toBe(false);
  });

  it("parses every embedded range", () => {
    for (const cidr of [...CLOUDFLARE_IPV4, ...CLOUDFLARE_IPV6]) {
      expect(isCloudflareIp(cidr.split("/")[0])).toBe(true);
    }
  });
});

describe("normalizeIp", () => {
  it("canonicalises what headers carry", () => {
    expect(normalizeIp(" 203.0.113.9 ")).toBe("203.0.113.9");
    expect(normalizeIp("203.0.113.9:4431")).toBe("203.0.113.9");
    expect(normalizeIp("[2001:DB8:0:0::1]:443")).toBe("2001:db8::1");
    expect(normalizeIp("fe80::1%eth0")).toBe("fe80::1");
    expect(normalizeIp("::ffff:127.0.0.1")).toBe("127.0.0.1");
    expect(normalizeIp("::1")).toBe("::1");
    expect(normalizeIp("256.1.1.1")).toBeNull();
    expect(normalizeIp("1:2:3:4:5:6:7:8:9")).toBeNull();
    expect(normalizeIp("<script>")).toBeNull();
    expect(normalizeIp("")).toBeNull();
  });
});

describe("peerIp", () => {
  it("is x-real-ip, which Traefik sets to the TCP peer", () => {
    expect(peerIp(h({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 198.51.100.7" }))).toBe(
      "203.0.113.9",
    );
  });

  it("falls back to the RIGHT-most x-forwarded-for entry, never the client-written first", () => {
    expect(peerIp(h({ "x-forwarded-for": "6.6.6.6, 129.226.1.1, 172.18.0.2" }))).toBe("172.18.0.2");
    expect(peerIp(h({ "x-forwarded-for": "129.226.1.1" }))).toBe("129.226.1.1");
    expect(peerIp(h({ "x-forwarded-for": "6.6.6.6, 172.18.0.2, " }))).toBe("172.18.0.2");
  });

  it("is null with neither header", () => {
    expect(peerIp(h({}))).toBeNull();
    expect(peerIp(h({ "cf-connecting-ip": "203.0.113.9" }))).toBeNull();
  });
});

describe("clientAddress / clientIp", () => {
  it("ignores a spoofed cf-connecting-ip from a peer outside Cloudflare", () => {
    const spoofed = h({ "x-real-ip": "198.51.100.7", "cf-connecting-ip": "43.1.2.3" });
    expect(clientAddress(spoofed)).toBe("198.51.100.7");
    expect(clientIp(spoofed)).toBe("198.51.100.7");
    // Rotating the claimed address does not rotate the bucket.
    expect(clientIp(h({ "x-real-ip": "198.51.100.7", "cf-connecting-ip": "43.9.9.9" }))).toBe(
      "198.51.100.7",
    );
    // Nor does writing a Cloudflare address first in x-forwarded-for.
    expect(
      clientIp(h({ "x-forwarded-for": "173.245.48.1, 198.51.100.7", "cf-connecting-ip": "43.1.2.3" })),
    ).toBe("198.51.100.7");
  });

  it("honours cf-connecting-ip when the peer is a Cloudflare edge", () => {
    expect(clientIp(h({ "x-real-ip": "173.245.48.1", "cf-connecting-ip": "43.1.2.3" }))).toBe("43.1.2.3");
    expect(clientIp(h({ "x-real-ip": "2400:cb00::1", "cf-connecting-ip": "43.1.2.3" }))).toBe("43.1.2.3");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 162.158.1.1", "cf-connecting-ip": "43.1.2.3" }))).toBe(
      "43.1.2.3",
    );
  });

  it("handles an IPv4-mapped IPv6 peer", () => {
    expect(clientIp(h({ "x-real-ip": "::ffff:173.245.48.1", "cf-connecting-ip": "43.1.2.3" }))).toBe(
      "43.1.2.3",
    );
    expect(clientIp(h({ "x-real-ip": "::ffff:198.51.100.7", "cf-connecting-ip": "43.1.2.3" }))).toBe(
      "198.51.100.7",
    );
    expect(clientIp(h({ "x-forwarded-for": "::ffff:127.0.0.1" }))).toBe("127.0.0.1");
  });

  it("uses the peer when a Cloudflare edge sends no usable cf-connecting-ip", () => {
    expect(clientIp(h({ "x-real-ip": "173.245.48.1" }))).toBe("173.245.48.1");
    expect(clientIp(h({ "x-real-ip": "173.245.48.1", "cf-connecting-ip": "junk" }))).toBe("173.245.48.1");
  });

  it("is null with no peer at all, which the limiter does not limit", () => {
    expect(clientIp(h({}))).toBeNull();
    expect(clientAddress(h({}))).toBeNull();
  });

  it("groups IPv6 clients by /64 for the bucket, keeps the full address otherwise", () => {
    const cf = { "x-real-ip": "2606:4700::6810:1" };
    expect(clientIp(h({ ...cf, "cf-connecting-ip": "2001:db8:abcd:12:1::5" }))).toBe("2001:db8:abcd:12::/64");
    expect(clientIp(h({ ...cf, "cf-connecting-ip": "2001:db8:abcd:12:ffff:1:2:3" }))).toBe(
      "2001:db8:abcd:12::/64",
    );
    expect(clientIp(h({ "x-real-ip": "2001:0db8:0000:0012::9" }))).toBe("2001:db8:0:12::/64");
    expect(clientAddress(h({ ...cf, "cf-connecting-ip": "2001:db8:abcd:12:1::5" }))).toBe(
      "2001:db8:abcd:12:1::5",
    );
  });
});
