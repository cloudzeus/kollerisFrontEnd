/**
 * Full catalogue sync: HDCtool → local projection.
 *
 *   npx tsx scripts/sync-catalog.ts
 *
 * Belongs on a schedule (every 15 min once H1's delta feed exists; hourly full
 * walk until then). Never call it from a request path.
 */
import { syncAll } from "../src/lib/sync/catalog-sync";
import { prisma } from "../src/lib/prisma";

try {
  process.loadEnvFile(".env");
} catch {
  // rely on real environment variables
}

function line(label: string, r: { processed: number; created: number; updated: number; failed: number; durationMs: number; errors: string[] }) {
  console.log(
    `  ${label.padEnd(12)} processed=${String(r.processed).padStart(5)}  ` +
      `created=${String(r.created).padStart(5)}  updated=${String(r.updated).padStart(5)}  ` +
      `failed=${r.failed}  ${(r.durationMs / 1000).toFixed(1)}s`,
  );
  for (const e of r.errors.slice(0, 5)) console.log(`      ! ${e}`);
}

async function main() {
  console.log("Syncing catalogue from HDCtool…\n");
  const started = Date.now();

  const { categories, brands, products, counts } = await syncAll();

  line("categories", categories);
  line("brands", brands);
  line("products", products);
  console.log(
    `  counts       ${counts.categories} categories, ${counts.brands} brands recomputed`,
  );
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((error) => {
    console.error("\nSync failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
