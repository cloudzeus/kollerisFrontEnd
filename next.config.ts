import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    // Product imagery is served from HDCtool's BunnyCDN pull zones.
    remotePatterns: [
      { protocol: "https", hostname: "kolleris.b-cdn.net" },
      { protocol: "https", hostname: "cdn.kolleris.com" },
      { protocol: "https", hostname: "hdctool.wwa.gr" },
    ],
  },
  serverExternalPackages: ["@node-rs/argon2"],
};

export default withNextIntl(nextConfig);
