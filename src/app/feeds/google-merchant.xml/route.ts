import { buildMerchantFeed } from "@/lib/feeds/google-merchant";

/**
 * The product feed Merchant Center fetches.
 *
 * A route rather than a generated file: the catalogue moves about 45 products a
 * day and Google refetches on its own schedule, so a build-time artefact would
 * be stale between deploys and there is nothing to gain from writing it to disk.
 *
 * Cached for an hour. Merchant Center fetches once a day at most; the cache is
 * there so a crawler, a curious browser and a scheduled fetch landing together
 * cost one query rather than three.
 */
export const runtime = "nodejs";

/*
 * Rendered per request, never at build.
 *
 * `revalidate` here made Next treat this as a static route and run it during
 * `next build` - where there is no database, because the build runs in a
 * container that cannot reach one and should not be able to. The build failed
 * exactly where the Dockerfile said it would: something querying the database
 * at build time.
 *
 * The caching that matters is on the response instead. Merchant Center fetches
 * once a day and the header holds the answer at the edge for an hour, which is
 * what the `revalidate` was for anyway.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const xml = await buildMerchantFeed("el");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
