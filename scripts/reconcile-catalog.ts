/**
 * Catalogue reconcile: does the projection still match HDCtool?
 *
 *   npm run reconcile:catalog
 *
 * The backstop under the change feed. HDCtool pushes what changes, which is
 * fast and, alone, lossy — a delivery that lands mid-deploy is a change nobody
 * hears about again, and a product that stops being eshop-listed produces no
 * event at all, because the collector only scans listed products.
 *
 * So something has to ask the whole question. This does, by comparing id lists
 * rather than walking products: HDCtool answers with ~5.300 integers in one
 * query, the comparison is set arithmetic, and only the differences are fetched
 * in full. Seconds, against the nine minutes the full walk it replaces spends
 * to conclude that nothing has changed.
 *
 * Nightly is the right cadence. Run it after any deploy of either side too —
 * that is exactly when a delivery is most likely to have gone missing.
 */
import { reconcileCatalog, recomputeCounts } from "../src/lib/sync/catalog-sync";
import { prisma } from "../src/lib/prisma";

try {
  process.loadEnvFile(".env");
} catch {
  // rely on real environment variables
}

async function main() {
  console.log("Reconciling the catalogue against HDCtool…\n");

  const result = await reconcileCatalog();

  console.log(
    `  synced=${result.processed}  created=${result.created}  updated=${result.updated}  ` +
      `de-listed=${result.removed}  failed=${result.failed}  ` +
      `${(result.durationMs / 1000).toFixed(1)}s`,
  );
  for (const e of result.errors.slice(0, 10)) console.log(`      ! ${e}`);

  // Only worth recomputing when something moved: these are full-table
  // aggregates, and the numbers they feed are counts on category tiles.
  if (result.processed > 0 || result.removed > 0) {
    const counts = await recomputeCounts();
    console.log(
      `  counts       ${counts.categories} categories, ${counts.brands} brands recomputed`,
    );
  }

  if (result.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("\nReconcile failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
