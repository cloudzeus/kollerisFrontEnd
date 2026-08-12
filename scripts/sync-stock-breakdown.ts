/**
 * Γεμίζει τις νέες στήλες αποθέματος από το HDCtool.
 *
 * Περνά από την ΚΑΝΟΝΙΚΗ διαδρομή συγχρονισμού και όχι από χειροκίνητο UPDATE:
 * αν το mapping είναι λάθος, θέλουμε να το δούμε εδώ, όχι αργότερα στο πρώτο
 * webhook.
 */
import { syncProducts } from "../src/lib/sync/catalog-sync";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("HDCTOOL_BASE_URL =", process.env.HDCTOOL_BASE_URL);
  const t0 = Date.now();
  const r = await syncProducts({ maxPages: 500 });
  console.log("ΑΠΟΤΕΛΕΣΜΑ", r, `σε ${Date.now() - t0}ms`);
  const filled = await prisma.product.count({ where: { qtyOnHand: { not: null } } });
  const total = await prisma.product.count();
  const reserved = await prisma.product.count({ where: { qtyReserved: { gt: 0 } } });
  const incoming = await prisma.product.count({ where: { qtyIncoming: { gt: 0 } } });
  const blocked = await prisma.product.count({ where: { qtyOnHand: { gt: 0 }, qty: { lte: 0 } } });
  console.log({ total, withBreakdown: filled, withReservations: reserved, withIncoming: incoming, onShelfButNotSellable: blocked });
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
