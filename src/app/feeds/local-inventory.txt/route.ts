import { buildLocalInventoryFeed } from "@/lib/feeds/local-inventory";

/**
 * The local inventory data source Merchant Center fetches.
 *
 * A tab-separated file, not XML — see `local-inventory.ts` for why this is a
 * different shape from the product feed rather than an extension of it.
 *
 * Same reasoning as `google-merchant.xml` on the two route-config lines below:
 * rendered per request against the live database, never at build, because the
 * build container cannot reach the database and stock changes hourly, not
 * once a deploy.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tsv = await buildLocalInventoryFeed();

  return new Response(tsv, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
