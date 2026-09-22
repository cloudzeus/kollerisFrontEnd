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
    /*
     * No on-server optimisation: the browser loads the file from Bunny directly.
     *
     * Every product card went through `/_next/image`, which decodes the source
     * and re-encodes it with sharp INSIDE this container — on the libuv thread
     * pool that also compresses every HTML response and resolves every host
     * name. The source files are already WebP, 1280x1280 and about 43 KB, so
     * the optimiser was buying a few kilobytes per card at the price of the
     * server's CPU.
     *
     * The price came due on 22/9/2026. After a restart the image cache is
     * empty, each listing page asks for dozens of re-encodes, and the process
     * stalled for 12-40s at a time while the database sat idle and HDCtool on
     * the same host answered in 0.2s. The health check timed out, the platform
     * pulled the container, traffic stopped, it recovered, traffic returned.
     *
     * Bunny's own resizing (`?width=`) is not enabled on the pull zone —
     * checked: it returns the same 1280px file — so there is no cheaper
     * resize to point a loader at. Serving the 43 KB WebP from the CDN edge
     * is the trade.
     */
    unoptimized: true,
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
