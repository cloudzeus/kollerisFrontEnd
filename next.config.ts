import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /*
   * Ship the server, not the toolchain.
   *
   * `standalone` traces the modules the server actually reaches and writes a
   * self-contained folder, so the runtime image carries neither the 848
   * installed packages nor the build tools. It is also what lets the final
   * stage run as an unprivileged user with no package manager present.
   */
  output: "standalone",
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
