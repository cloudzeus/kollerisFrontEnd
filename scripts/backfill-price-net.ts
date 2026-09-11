import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

/**
 * Βγάζει τον ΦΠΑ από τις αποθηκευμένες τιμές, μία φορά.
 *
 * ΓΙΑΤΙ ΔΕΝ ΕΙΝΑΙ ΑΠΛΗ ΔΙΑΙΡΕΣΗ
 *
 * Η πρώτη εκδοχή έκανε μία ενημέρωση ανά προϊόν — 9.727 διαδρομές στη βάση —
 * και ο κοινός Postgres την έκοψε στη μέση. Μισός κατάλογος έμεινε μετατραπείς
 * και μισός όχι, οπότε η επανεκτέλεση έπρεπε να ξέρει ΠΟΙΑ έχουν ήδη γίνει.
 *
 * Το «έχει πάνω από δύο δεκαδικά» δεν είναι αξιόπιστο κριτήριο: περίπου ένα
 * στα τριάντα πηλίκα πέφτει ακριβώς σε λεπτό, και αυτά θα διαιρούνταν δεύτερη
 * φορά. Το κριτήριο είναι το `PRICER02` του HDCtool, που είναι η αυθεντική
 * μεικτή τιμή: αν η αποθηκευμένη ισούται με αυτό, δεν έχει μετατραπεί· αν
 * ισούται με το πηλίκο, έχει· οτιδήποτε άλλο αναφέρεται και δεν αγγίζεται.
 *
 * Οι εγγραφές γίνονται σε παρτίδες των 500 με ΕΝΑ ερώτημα η καθεμία.
 *
 * Απαιτεί `/tmp/pricer02.json` από το HDCtool:
 *   SELECT MTRL, PRICER02 FROM mtrl WHERE PRICER02 IS NOT NULL
 */

const DEFAULT_VAT = 24;
const BATCH = 500;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

async function main() {
  const dry = process.argv.includes("--dry");
  const gross: Record<string, number> = JSON.parse(
    readFileSync("/tmp/pricer02.json", "utf8"),
  );
  console.log(`ΜΕΙΚΤΕΣ ΑΠΟ HDCTOOL ${Object.keys(gross).length}`);

  const rows = await prisma.product.findMany({
    where: { priceNet: { not: null } },
    select: { mtrl: true, code: true, priceNet: true, vatRate: true },
  });

  const todo: Array<{ mtrl: number; net: number }> = [];
  let done = 0;
  let noSource = 0;
  const odd: string[] = [];

  for (const r of rows) {
    const stored = Number(r.priceNet);
    const vat = Number(r.vatRate ?? 0) || DEFAULT_VAT;
    const erp = gross[String(r.mtrl)];
    if (erp == null) {
      noSource += 1;
      continue;
    }
    const net = round4(erp / (1 + vat / 100));
    if (Math.abs(stored - net) < 0.005) {
      done += 1;
      continue;
    }
    /* Είτε είναι ακόμα η μεικτή, είτε είναι παλιά τιμή που άλλαξε στο ενδιάμεσο:
       και στις δύο περιπτώσεις η σωστή είναι το πηλίκο της ΤΩΡΙΝΗΣ τιμής του
       ERP. Το ERP είναι η πηγή· η αποθηκευμένη είναι αντίγραφο. */
    if (Math.abs(stored - erp) >= 0.005 && odd.length < 8) {
      odd.push(`${r.code}: αποθηκευμένο ${stored}, ERP ${erp} → ${net}`);
    }
    todo.push({ mtrl: r.mtrl, net });
  }

  console.log(
    `ΠΡΟΪΟΝΤΑ ${rows.length} · προς μετατροπή ${todo.length} · ήδη καθαρά ${done} · ` +
      `χωρίς τιμή στο ERP ${noSource} · άλλαξαν στο ενδιάμεσο ${odd.length}`,
  );
  for (const o of odd) console.log("  " + o);
  if (dry || todo.length === 0) return;

  let written = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    /* Ένα ερώτημα ανά παρτίδα. Παραμετροποιημένο: οι τιμές δεν μπαίνουν στο
       κείμενο του SQL. */
    const values = slice.map((_, k) => `($${k * 2 + 1}::int, $${k * 2 + 2}::numeric)`).join(",");
    const params = slice.flatMap((s) => [s.mtrl, s.net]);
    const affected = await prisma.$executeRawUnsafe(
      `UPDATE products SET "priceNet" = v.net FROM (VALUES ${values}) AS v(mtrl, net) WHERE products.mtrl = v.mtrl`,
      ...params,
    );
    written += affected;
    console.log(`  παρτίδα ${Math.floor(i / BATCH) + 1}: ${affected}`);
  }
  console.log(`ΓΡΑΦΤΗΚΑΝ ${written}`);
}

main()
  .catch((e) => console.log("ΣΦΑΛΜΑ " + (e?.message ?? e)))
  .finally(() => process.exit(0));
