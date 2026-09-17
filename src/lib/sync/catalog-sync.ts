import "server-only";
import { prisma } from "@/lib/prisma";
import { refreshVariantLeads } from "@/lib/catalog/variant-lead";
import {
  changedChildTables,
  pickFreeSlug,
  slugCandidates,
  slugRoot,
  type ChildRows,
  type ChildTable,
  type SpecRow,
} from "./product-children";
import { DEFAULT_VAT_RATE } from "@/lib/format";
import {
  hdctool,
  HDCTOOL_MAX_LIMIT,
  type HdctoolCategory,
  type HdctoolCursor,
  type HdctoolProduct,
} from "@/lib/hdctool/client";

/**
 * Catalogue sync: HDCtool → local projection.
 *
 * Interim implementation. It walks `POST /api/public/products` with keyset
 * pagination rather than a delta feed, because HDCtool methods H1/H2
 * (BACKEND_ALIGNMENT.md §3) do not exist yet. At ~5,300 eshop-listed products
 * that is ~27 requests, which is entirely viable as a full re-sync — but it is
 * a full re-sync every time, so it belongs on a schedule, not a request path.
 *
 * When H1 lands, only `syncProducts` changes: swap the page walk for a cursor
 * delta and keep everything below it.
 */

export type SyncResult = {
  processed: number;
  created: number;
  updated: number;
  failed: number;
  durationMs: number;
  errors: string[];
};

/** Slugs must be unique; disambiguate collisions with the ERP code. */
function uniqueSlug(base: string, fallback: string, taken: Set<string>): string {
  const root = slugRoot(base, fallback);
  let candidate = root;
  let n = 2;
  while (taken.has(candidate)) candidate = `${root}-${n++}`;
  taken.add(candidate);
  return candidate;
}

async function withRun<T extends SyncResult>(
  channel: string,
  work: () => Promise<T>,
): Promise<T> {
  const state = await prisma.syncState.upsert({
    where: { channel },
    update: { lastRunAt: new Date(), lastStatus: "RUNNING" },
    create: { channel, lastRunAt: new Date(), lastStatus: "RUNNING" },
  });
  const run = await prisma.syncRun.create({ data: { stateId: state.id } });

  try {
    const result = await work();
    const status = result.failed > 0 ? "PARTIAL" : "SUCCESS";
    await prisma.$transaction([
      prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status,
          finishedAt: new Date(),
          processed: result.processed,
          created: result.created,
          updated: result.updated,
          // The column has always existed; only the reconcile has ever had a
          // number to put in it.
          removed: "removed" in result ? (result as { removed: number }).removed : 0,
          failed: result.failed,
          errors: result.errors.length ? result.errors.slice(0, 50) : undefined,
        },
      }),
      prisma.syncState.update({
        where: { id: state.id },
        data: { lastStatus: status, lastSuccessAt: new Date() },
      }),
    ]);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.$transaction([
      prisma.syncRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date(), errors: [message] },
      }),
      prisma.syncState.update({
        where: { id: state.id },
        data: { lastStatus: "FAILED" },
      }),
    ]);
    throw error;
  }
}

// ─── Categories ─────────────────────────────────────────────────────────────

export async function syncCategories(): Promise<SyncResult> {
  return withRun("categories", async () => {
    const startedAt = Date.now();
    const { categories } = await hdctool.categories();

    const taken = new Set(
      (await prisma.category.findMany({ select: { slug: true } })).map((c) => c.slug),
    );
    const existing = new Map(
      (await prisma.category.findMany({ select: { hdcId: true, slug: true } })).map(
        (c) => [c.hdcId, c.slug],
      ),
    );

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    // Pass 1: upsert every node without parents — the parent may not exist yet.
    for (const node of categories as HdctoolCategory[]) {
      try {
        const slug =
          existing.get(node.id) ??
          uniqueSlug(node.nameGreek, `${node.erpType}-${node.erpCode}`, taken);

        const data = {
          erpCode: node.erpCode,
          erpType: node.erpType,
          slug,
          nameEl: node.nameGreek || node.nameEnglish || node.erpCode,
          nameEn: node.nameEnglish || node.nameGreek || node.erpCode,
          nameIt: node.nameItalian || node.nameGreek || node.erpCode,
          mainImage: node.mainImage || null,
          heroImage: node.heroImage || null,
          order: node.order ?? 0,
          syncedAt: new Date(),
        };

        if (existing.has(node.id)) {
          await prisma.category.update({ where: { hdcId: node.id }, data });
          updated++;
        } else {
          await prisma.category.create({ data: { ...data, hdcId: node.id } });
          created++;
        }
      } catch (error) {
        errors.push(
          `category ${node.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // Pass 2: wire parents now that every node has a local row.
    const localIds = new Map(
      (await prisma.category.findMany({ select: { id: true, hdcId: true } })).map(
        (c) => [c.hdcId, c.id],
      ),
    );
    for (const node of categories as HdctoolCategory[]) {
      const self = localIds.get(node.id);
      const parent = node.parentId ? localIds.get(node.parentId) : null;
      if (!self) continue;
      await prisma.category.update({
        where: { id: self },
        data: { parentId: parent ?? null },
      });
    }

    return {
      processed: categories.length,
      created,
      updated,
      failed: errors.length,
      durationMs: Date.now() - startedAt,
      errors,
    };
  });
}

// ─── Brands ─────────────────────────────────────────────────────────────────

export async function syncBrands(): Promise<SyncResult> {
  return withRun("brands", async () => {
    const startedAt = Date.now();
    const { brands } = await hdctool.brands();

    const taken = new Set(
      (await prisma.brand.findMany({ select: { slug: true } })).map((b) => b.slug),
    );
    const existing = new Map(
      (await prisma.brand.findMany({ select: { hdcId: true, slug: true } })).map(
        (b) => [b.hdcId, b.slug],
      ),
    );

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const brand of brands) {
      try {
        /*
         * Keep the slug a brand already has — it is in URLs — with one
         * exception: slugs of the form `mtrmark-1029`.
         *
         * Those were minted when the sync knew a number and no name, and they
         * are what the storefront ends up showing: "mtrmark-1029" where BOSCH
         * belongs. The name is known now, so the slug is rewritten once. Safe
         * because nothing links to a URL that reads like an internal id, and
         * the alternative is carrying it forever.
         */
        const current = existing.get(brand.id);
        /*
         * A name that is really an ERP code wearing a name's clothes.
         *
         * BOSCH arrives with `brandNameEnglish: "MTRMARK 1029"` — a placeholder
         * left by some earlier import upstream. Slugging from it produced
         * `mtrmark-1029`, which is precisely the string the storefront was
         * showing where the brand belongs. The Greek name was "BOSCH" all
         * along; the English one just sorted first.
         *
         * Space or hyphen: the first version of this checked only the hyphen,
         * matched nothing, and made the slug worse.
         */
        const isCode = (value: string) => /^\s*mtrmark[\s-]*\d+\s*$/i.test(value);
        const english = brand.brandNameEnglish?.trim() ?? "";
        const greek = brand.brandNameGreek?.trim() ?? "";
        const name =
          (!isCode(english) && english) || (!isCode(greek) && greek) || english || greek;
        const placeholder = current != null && /^mtrmark-[\d-]+$/.test(current);
        const slug =
          current && !placeholder
            ? current
            : uniqueSlug(name, brand.id, taken);

        const data = {
          slug,
          /*
           * The ERP code, now that the API supplies it.
           *
           * This is what joins a brand to its products. It used to arrive only
           * as a by-product of the product walk, and only for brands that had
           * already been created — so a brand synced today and its products
           * synced tomorrow never met, and the storefront fell back to a
           * placeholder named after the number.
           */
          mtrmark: brand.mtrmark ?? undefined,
          /*
           * The same guard on the names themselves, not just the slug.
           *
           * An English visitor was going to be shown "MTRMARK 1029" as the
           * brand. A code is not a translation, so a field holding one is
           * treated as empty and the other language fills in.
           */
          nameEl: (!isCode(greek) && greek) || name,
          nameEn: (!isCode(english) && english) || name,
          nameIt:
            (brand.brandNameItalian && !isCode(brand.brandNameItalian)
              ? brand.brandNameItalian.trim()
              : "") || name,
          logo: brand.brandLogo || null,
          image: brand.brandImage || null,
          isEshop: Boolean(brand.eshop),
          syncedAt: new Date(),
        };

        if (existing.has(brand.id)) {
          await prisma.brand.update({ where: { hdcId: brand.id }, data });
          updated++;
        } else {
          await prisma.brand.create({ data: { ...data, hdcId: brand.id } });
          created++;
        }
      } catch (error) {
        errors.push(
          `brand ${brand.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return {
      processed: brands.length,
      created,
      updated,
      failed: errors.length,
      durationMs: Date.now() - startedAt,
      errors,
    };
  });
}

// ─── Products ───────────────────────────────────────────────────────────────

/**
 * HDCtool's `ProductSpecifications` is a fixed wide table. Flattening it into
 * key/value rows is what makes the PDP spec table and the PLP spec facets
 * possible at all — you cannot aggregate over columns you have to name.
 *
 * Order and grouping mirror `CategorySpecField.fieldGroup` in HDCtool.
 */
const SPEC_FIELDS: Array<{ key: string; group: string; label: string; unit?: string }> = [
  { key: "brand", group: "identification", label: "Κατασκευαστής" },
  { key: "model", group: "identification", label: "Μοντέλο" },
  { key: "category", group: "identification", label: "Κατηγορία" },
  { key: "subcategory", group: "identification", label: "Υποκατηγορία" },
  { key: "material", group: "physical", label: "Υλικό" },
  { key: "color", group: "physical", label: "Χρώμα" },
  { key: "finish", group: "physical", label: "Φινίρισμα" },
  { key: "powerSource", group: "technical", label: "Τροφοδοσία" },
  { key: "voltage", group: "technical", label: "Τάση", unit: "V" },
  { key: "amperage", group: "technical", label: "Ένταση", unit: "A" },
  { key: "wattage", group: "technical", label: "Ισχύς", unit: "W" },
  { key: "speedSettings", group: "technical", label: "Ταχύτητες" },
  { key: "torque", group: "performance", label: "Ροπή", unit: "Nm" },
  { key: "chuckSize", group: "technical", label: "Τσοκ" },
  { key: "bladeDiameter", group: "physical", label: "Διάμετρος δίσκου", unit: "mm" },
  { key: "cuttingCapacity", group: "performance", label: "Ικανότητα κοπής" },
  { key: "precision", group: "performance", label: "Ακρίβεια" },
  { key: "operatingTempRange", group: "technical", label: "Θερμοκρασία λειτουργίας" },
  { key: "noiseLevel", group: "technical", label: "Στάθμη θορύβου", unit: "dB" },
  { key: "maxSpeed", group: "performance", label: "Μέγιστη ταχύτητα", unit: "rpm" },
  { key: "maxTorque", group: "performance", label: "Μέγιστη ροπή", unit: "Nm" },
  { key: "batteryLife", group: "performance", label: "Διάρκεια μπαταρίας" },
  { key: "chargingTime", group: "performance", label: "Χρόνος φόρτισης" },
  { key: "dutyCycle", group: "performance", label: "Κύκλος λειτουργίας" },
  { key: "accuracy", group: "performance", label: "Ακρίβεια μέτρησης" },
  { key: "repeatability", group: "performance", label: "Επαναληψιμότητα" },
];

/** Leading number in a spec value, so range facets and compare can sort on it. */
/**
 * `valueNumeric` is `Decimal(14, 4)` — ten digits before the point, no more.
 *
 * A spec value is free text and the number pulled out of it is whatever the
 * supplier typed. An EAN, an order number or a date written without separators
 * all parse as perfectly good numbers and all exceed ten digits, and Postgres
 * answers that with `numeric field overflow` — which aborts the transaction, so
 * ONE such value stops the whole catalogue sync. That is what happened on
 * 6 Aug 2026: 1.478 newly-published products could not reach the storefront
 * because of a single spec row.
 *
 * Out-of-range values become null rather than being clamped. `valueNumeric`
 * exists to sort and filter by ("torque over 50 Nm"); a 13-digit number that is
 * really a barcode has no place in that ordering, and storing 9.999.999.999,9999
 * instead would put it confidently at the top of every such list. The text value
 * is kept in `value` either way, so nothing is lost from the page itself.
 */
const NUMERIC_LIMIT = 10_000_000_000; // Decimal(14, 4) → |value| < 10^10

function parseNumeric(value: string): number | null {
  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number.parseFloat(match[0]);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) < NUMERIC_LIMIT ? n : null;
}

/** Greek name wins for display; MTRAN el falls back to the raw MTRL name. */
function displayName(p: HdctoolProduct): string {
  return p.translations.find((t) => t.language === "el")?.name?.trim() || p.name;
}

/**
 * How many product writes run at once.
 *
 * The pool is 20 connections per process (`DATABASE_POOL_MAX`) and the same
 * Postgres serves three other databases, so a sync must leave most of it to
 * the shop. Four is plenty now that an unchanged product costs one statement
 * instead of fourteen: the round trips, not the parallelism, were the cost.
 */
const WRITE_CONCURRENCY = 4;

function buildSpecRows(p: HdctoolProduct): SpecRow[] {
  const rows: SpecRow[] = [];

  for (const spec of p.specifications ?? []) {
    const locale = spec.language;
    SPEC_FIELDS.forEach((field, order) => {
      const raw = spec[field.key];
      if (raw == null) return;
      const value = String(raw).trim();
      if (!value || value === "-") return;
      rows.push({
        locale,
        fieldKey: field.key,
        fieldGroup: field.group,
        label: field.label,
        value,
        valueNumeric: parseNumeric(value),
        unit: field.unit ?? null,
        order,
      });
    });
  }

  return rows;
}

/**
 * Every child row a product should have, without `productId` — the shape the
 * comparison in `product-children.ts` works on, and the shape written.
 */
function desiredChildRows(p: HdctoolProduct): ChildRows {
  return {
    images: p.images.slice(0, 12).map((img, i) => ({
      url: img.url,
      isFeature: img.isFeature || i === 0,
      order: img.order ?? i,
    })),
    /*
     * A translation is worth keeping for its DESCRIPTION, not only its name.
     *
     * This used to filter on `t.name`, and the Greek name is empty by
     * design: HDCtool never writes one, because the Greek name is
     * `MTRL.NAME` from the ERP and `displayName()` falls back to exactly
     * that. So every Greek row arrived with an empty name, was dropped whole,
     * and took its description with it.
     *
     * 1.538 live products reached the storefront with no text at all while
     * HDCtool held a full description for each — including every product
     * written by the AI passes, whose entire output is description.
     *
     * The name now falls back to the product's own, which is what the page
     * renders anyway, so nothing displays differently and the description
     * survives.
     */
    translations: p.translations
      .filter((t) => t.name || t.shortDescription || t.longDescription)
      .map((t) => {
        const name = t.name?.trim() || p.name;
        return {
          locale: t.language,
          name,
          shortDescription: t.shortDescription ?? null,
          longDescription: t.longDescription ?? null,
          searchKey: normaliseSearchKey(name),
        };
      }),
    specs: buildSpecRows(p),
    /*
     * `?? []` on colours and sizes: HDCtool only started returning these
     * fields recently, and a deploy where the eshop is ahead of it would
     * otherwise throw on every product rather than simply having nothing to
     * write.
     */
    colors: (p.colors ?? []).map((c, i) => ({ externalId: c.id, name: c.name, order: i })),
    sizes: (p.sizes ?? []).map((s, i) => ({
      externalId: s.id,
      label: s.label,
      family: s.category ?? null,
      order: i,
    })),
  };
}

/** What is already stored for a product, read in one batch per chunk. */
type StoredProduct = {
  slug: string;
  firstListedAt: Date | null;
  children: ChildRows;
};

/**
 * The stored side of the comparison, for a whole chunk at once.
 *
 * One query per table for the chunk — six in all — instead of a delete and an
 * insert per table per product. A product missing from the map does not exist
 * yet.
 */
async function loadStoredProducts(mtrls: number[]): Promise<Map<number, StoredProduct>> {
  if (mtrls.length === 0) return new Map();
  const rows = await prisma.product.findMany({
    where: { mtrl: { in: mtrls } },
    select: {
      mtrl: true,
      slug: true,
      firstListedAt: true,
      images: { select: { url: true, isFeature: true, order: true } },
      translations: {
        select: {
          locale: true,
          name: true,
          shortDescription: true,
          longDescription: true,
          searchKey: true,
        },
      },
      specs: {
        select: {
          locale: true,
          fieldKey: true,
          fieldGroup: true,
          label: true,
          value: true,
          valueNumeric: true,
          unit: true,
          order: true,
        },
      },
      colors: { select: { externalId: true, name: true, order: true } },
      sizes: { select: { externalId: true, label: true, family: true, order: true } },
    },
  });
  return new Map(
    rows.map((r) => [
      r.mtrl,
      {
        slug: r.slug,
        firstListedAt: r.firstListedAt,
        children: {
          images: r.images,
          translations: r.translations,
          specs: r.specs,
          colors: r.colors,
          sizes: r.sizes,
        },
      },
    ]),
  );
}

/**
 * Slugs for products that do not have one yet, without loading every slug in
 * the table.
 *
 * The old way read all ~9.000 slugs on every delivery to hand out, usually,
 * none. This asks only about the candidates it might use — `root`, `root-2` …
 * — for the products that are actually new, widening the window only for the
 * rare root that is taken that many times over.
 *
 * `taken` is shared across chunks of one run, so two new products with the
 * same name in the same run still get different slugs. Allocation happens
 * before any concurrent write for the same reason it always did.
 */
const SLUG_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [1, 25],
  [26, 500],
  [501, 5_000],
];

const SLUG_LOOKUP_BATCH = 5_000;

async function allocateSlugs(
  requests: Array<{ mtrl: number; root: string }>,
  taken: Set<string>,
): Promise<Map<number, string>> {
  const allocated = new Map<number, string>();
  let open = requests;

  for (const [from, to] of SLUG_WINDOWS) {
    if (open.length === 0) break;
    const candidates = [
      ...new Set(open.flatMap(({ root }) => slugCandidates(root, from, to))),
    ].filter((c) => !taken.has(c));
    // Bounded IN lists: a wide window times many roots must not become one
    // statement with more bind parameters than Postgres accepts.
    for (let i = 0; i < candidates.length; i += SLUG_LOOKUP_BATCH) {
      const found = await prisma.product.findMany({
        where: { slug: { in: candidates.slice(i, i + SLUG_LOOKUP_BATCH) } },
        select: { slug: true },
      });
      for (const { slug } of found) taken.add(slug);
    }

    const stillOpen: typeof open = [];
    for (const request of open) {
      const slug = pickFreeSlug(request.root, taken, to);
      if (slug) {
        taken.add(slug);
        allocated.set(request.mtrl, slug);
      } else {
        stillOpen.push(request);
      }
    }
    open = stillOpen;
  }

  // Five thousand products with one name. Not expected to happen; if it does,
  // the ERP id makes it unique, and a collision still fails loudly on the
  // unique index rather than overwriting anything.
  for (const { mtrl, root } of open) allocated.set(mtrl, `${root}-${mtrl}`);
  return allocated;
}

/**
 * Τέσσερα δεκαδικά, γιατί η καθαρή τιμή είναι πηλίκο.
 *
 * `63,92 / 1,24 = 51,5484…`. Στρογγυλεμένη στα δύο, η μεικτή που ξαναβγαίνει
 * από αυτήν έπεφτε ένα λεπτό έξω σε 1.316 από τα 9.182 προϊόντα. Με τέσσερα,
 * και τα 9.182 δίνουν πίσω ακριβώς την τιμή του ERP.
 */
function roundTo4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

async function upsertProduct(
  p: HdctoolProduct,
  slug: string,
  /** What is stored now; undefined when the product does not exist yet. */
  stored: StoredProduct | undefined,
): Promise<"created" | "updated"> {
  const name = displayName(p);

  /*
   * ΤΟ `PRICER02` ΕΧΕΙ ΦΠΑ ΜΕΣΑ. Εδώ βγαίνει έξω.
   *
   * Ο κανόνας τιμολόγησης στο HDCtool υπολογίζει `κόστος × περιθώριο × 1,24`,
   * και όσα προϊόντα δεν έχουν κανόνα παίρνουν `χονδρική × 1,24`. Αυτό που
   * φτάνει εδώ είναι επομένως η ΤΕΛΙΚΗ τιμή του πελάτη.
   *
   * Γραφόταν αυτούσιο σε στήλη που λέγεται `priceNet`, και κάθε εμφάνιση —
   * σελίδα, κάρτα, καλάθι, παραστατικό — πρόσθετε ΦΠΑ από πάνω. Το FACOM
   * SL.171 με κανόνα −25% έβγαινε 63,92 € από τον κανόνα, 68,18 € στο Skroutz,
   * και 79,26 € στη βιτρίνα μας: ακριβότερο στο δικό μας μαγαζί απ' ό,τι στη
   * δική μας καταχώρηση στο Skroutz.
   *
   * Ο συντελεστής πέφτει πίσω στο 24 όταν λείπει: 5.330 προϊόντα έχουν κενό
   * `VAT` στο HDCtool επειδή ο συγχρονισμός καταλόγου δεν το κουβαλά, και ένα
   * κενό δεν σημαίνει «απαλλαγή» — σημαίνει «δεν το ξέρουμε ακόμα». Με μηδέν,
   * η τιμή θα έμενε μεικτή σε στήλη καθαρής.
   */
  const grossFromErp = p.pricer02 ?? p.priceWeb ?? p.priceRetail ?? null;
  const vatPercent = Number(p.vat?.percentage ?? 0) || DEFAULT_VAT_RATE;
  const priceNet =
    grossFromErp == null ? null : roundTo4(Number(grossFromErp) / (1 + vatPercent / 100));

  /*
   * NO derived discount.
   *
   * There is no promotional price in the API. This used to set
   * `priceList = priceRetail` whenever retail exceeded the web price, which
   * produced a struck-through "was" price on 3.600 of 5.305 products — 68% of
   * the catalogue permanently "on sale", 2.192 of them at exactly −6%. That is
   * not a reduction, it is the standing gap between two SoftOne price lists,
   * and presenting it as a saving is both misleading and the exact thing the
   * Omnibus directive (announced reductions must show the 30-day low) exists
   * to stop.
   *
   * Client's call: show PRICER02 and nothing else for now. When HDCtool grows a
   * real promotional price plus price history, populate `priceList` from THAT
   * and `onSale` follows — every display path downstream already handles it.
   */
  const priceList = null;
  /*
   * `quantity` από το HDCtool είναι ήδη το ΠΩΛΗΣΙΜΟ (AVAILABLE − RESERVED).
   * Ο υπολογισμός δεν επαναλαμβάνεται εδώ: αν γινόταν και στις δύο πλευρές,
   * αργά ή γρήγορα θα διαφωνούσαν, και η διαφωνία θα φαινόταν μόνο ως πελάτης
   * που παρήγγειλε κάτι ανύπαρκτο.
   *
   * Τα ωμά νούμερα κρατιούνται ξεχωριστά — όχι για τη διαθεσιμότητα, αλλά για
   * να μπορεί μια σελίδα να πει «εξαντλήθηκε, αναμένεται» αντί για σκέτο
   * «εξαντλήθηκε». Μένουν NULL όσο δεν τα στέλνει το HDCtool: το μηδέν σε
   * στήλη αποθέματος διαβάζεται ως «τίποτα», και ακριβώς αυτό εξαφάνισε 98
   * προϊόντα από τα feed του HDCtool.
   */
  const qty = p.quantity ?? 0;
  const qtyOnHand = p.quantityOnHand ?? null;
  const qtyReserved = p.quantityReserved ?? null;
  const qtyIncoming = p.quantityIncoming ?? null;

  const base = {
    code: p.code ?? "",
    code1: p.code1 ?? "",
    code2: p.code2 ?? "",
    /* Αντιγράφεται, δεν παράγεται: δύο συστήματα που ομαδοποιούν με δικό του
       κανόνα το καθένα είναι δύο διαφορετικές λίστες προϊόντων. */
    variantGroup: p.variantGroup?.trim() || null,
    impaCode: p.impaCode?.trim() || null,
    name,
    slug,
    /* Ο IMPA μέσα στο κλειδί αναζήτησης: είναι ο ΜΟΝΟΣ κωδικός με τον οποίο
       ψάχνει ένας αγοραστής πλοίου, και χωρίς αυτόν η αναζήτηση δεν βρίσκει
       τίποτα για ό,τι ζητά. */
    searchKey: [name, p.code, p.code1, p.code2, p.impaCode, p.brand?.name]
      .filter(Boolean)
      .join(" "),
    mtrmark: p.brand?.mtrmark ?? null,
    mtrcategory: p.mtrcategory ?? null,
    mtrgroup: p.mtrgroup ?? null,
    cccSubgroup2: p.cccSubgroup2 ?? null,
    priceNet,
    priceList,
    vatRate: p.vat?.percentage ?? null,
    qty,
    qtyOnHand,
    qtyReserved,
    qtyIncoming,
    priceSyncedAt: new Date(),
    width: p.width ?? null,
    length: p.length ?? null,
    height: p.height ?? null,
    weight: p.weight ?? null,
    guaranteeMonths: p.guaranteeTime ?? null,
    isActive: true,
    inStock: qty > 0,
    onSale: priceList != null,
    erpInsertedAt: p.insDate ? new Date(p.insDate) : null,
    erpUpdatedAt: p.updDate ? new Date(p.updDate) : null,
    syncedAt: new Date(),
  };

  // `searchKey` is stored normalised so query-time matching is a plain equality
  // / prefix test rather than a per-row transform.
  const { searchKey: raw, ...rest } = base;
  const data = { ...rest, searchKey: normaliseSearchKey(raw) };

  const product = await prisma.product.upsert({
    where: { mtrl: p.mtrl },
    update: data,
    create: { ...data, mtrl: p.mtrl, firstListedAt: new Date() },
    select: { id: true, createdAt: true, updatedAt: true },
  });

  /*
   * Stamp `firstListedAt` the first time a product is actually listed.
   *
   * `create` alone is not enough, and that is not a hypothetical: the
   * projection keeps a row for a product after it is de-listed, so the 1.371
   * products published on 5 Aug 2026 already had rows here and came through
   * `update` — only 231 of them were genuine creates. Stamping on create only
   * would have left the other 1.140 dated 2019 and 2022 on the arrivals page.
   *
   * `IS NULL` is what makes it safe to run on every sync: the nightly job
   * touches all 9.000 rows, and an unconditional write would date the whole
   * catalogue today, every night. A row that has been listed once keeps its
   * date forever; a row that has never been listed is NULL until the day it is.
   */
  /*
   * Skipped when the batched read already showed a date: the statement would
   * match no row. A product that did not exist got the date from `create`.
   */
  if (data.isActive && stored && stored.firstListedAt == null) {
    await prisma.$executeRaw`
      UPDATE products SET "firstListedAt" = now()
       WHERE mtrl = ${p.mtrl} AND "firstListedAt" IS NULL
    `;
  }

  /*
   * Child rows are replaced wholesale — but only the tables whose content
   * actually changed.
   *
   * Replacing everything on every sync was ten statements per product and a
   * steady stream of dead tuples in `product_specs` and `product_images`, to
   * express, nearly always, no change. The comparison is against the rows
   * read for the whole chunk (`loadStoredProducts`), so an unchanged product
   * costs nothing here at all. Anything uncertain reads as changed: see
   * `product-children.ts`.
   */
  const desired = desiredChildRows(p);
  const changed = changedChildTables(desired, stored?.children);
  if (changed.length > 0) {
    await prisma.$transaction(
      changed.flatMap((table) => replaceChildren(table, product.id, desired)),
    );
  }

  return product.createdAt.getTime() === product.updatedAt.getTime()
    ? "created"
    : "updated";
}

/** The delete + insert pair for one child table of one product. */
function replaceChildren(table: ChildTable, productId: string, rows: ChildRows) {
  switch (table) {
    case "images":
      return [
        prisma.productImage.deleteMany({ where: { productId } }),
        prisma.productImage.createMany({
          data: rows.images.map((r) => ({ ...r, productId })),
        }),
      ];
    case "translations":
      return [
        prisma.productTranslation.deleteMany({ where: { productId } }),
        prisma.productTranslation.createMany({
          data: rows.translations.map((r) => ({
            ...r,
            locale: r.locale as "el" | "en" | "it",
            productId,
          })),
        }),
      ];
    case "specs":
      return [
        prisma.productSpec.deleteMany({ where: { productId } }),
        prisma.productSpec.createMany({
          data: rows.specs.map((r) => ({
            ...r,
            locale: r.locale as "el" | "en" | "it",
            valueNumeric: r.valueNumeric == null ? null : Number(r.valueNumeric.toString()),
            productId,
          })),
        }),
      ];
    case "colors":
      return [
        prisma.productColor.deleteMany({ where: { productId } }),
        prisma.productColor.createMany({
          data: rows.colors.map((r) => ({ ...r, productId })),
        }),
      ];
    case "sizes":
      return [
        prisma.productSize.deleteMany({ where: { productId } }),
        prisma.productSize.createMany({
          data: rows.sizes.map((r) => ({ ...r, productId })),
        }),
      ];
  }
}

function normaliseSearchKey(raw: string): string {
  // Imported lazily to keep this module's top-level imports server-safe.
  // (searchKey is pure, so a direct call is fine.)
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀́̈]/g, "")
    .normalize("NFC")
    .replace(/ς/g, "σ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Write one chunk of products fetched from HDCtool.
 *
 * Per chunk: one batched read of what is stored (six queries), one slug
 * lookup for the products that are new, then the writes in bounded batches.
 * Per product: the upsert, plus only whatever actually changed.
 */
async function writeProductChunk(
  products: HdctoolProduct[],
  taken: Set<string>,
): Promise<{
  processed: number;
  created: number;
  updated: number;
  errors: string[];
  written: number[];
  failedMtrl: number[];
}> {
  const stored = await loadStoredProducts(products.map((p) => p.mtrl));

  // Slugs are allocated before any concurrent write, because `taken` is shared
  // state and two tasks racing on it would hand out the same slug twice.
  const fresh = await allocateSlugs(
    products
      .filter((p) => !stored.has(p.mtrl))
      .map((p) => ({
        mtrl: p.mtrl,
        root: slugRoot(`${displayName(p)}-${p.code2 || p.code}`, `p-${p.mtrl}`),
      })),
    taken,
  );

  const prepared = products.map((p) => ({
    product: p,
    stored: stored.get(p.mtrl),
    slug: stored.get(p.mtrl)?.slug ?? fresh.get(p.mtrl)!,
  }));

  let processed = 0;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  const written: number[] = [];
  const failedMtrl: number[] = [];

  for (let j = 0; j < prepared.length; j += WRITE_CONCURRENCY) {
    const batch = prepared.slice(j, j + WRITE_CONCURRENCY);
    const outcomes = await Promise.allSettled(
      batch.map(({ product, slug, stored: row }) => upsertProduct(product, slug, row)),
    );
    outcomes.forEach((outcome, index) => {
      const { product } = batch[index];
      processed++;
      if (outcome.status === "fulfilled") {
        if (outcome.value === "created") created++;
        else updated++;
        written.push(product.mtrl);
      } else {
        failedMtrl.push(product.mtrl);
        errors.push(
          `mtrl ${product.mtrl}: ${
            outcome.reason instanceof Error ? outcome.reason.message : outcome.reason
          }`,
        );
      }
    });
  }

  return { processed, created, updated, errors, written, failedMtrl };
}

export async function syncProducts(
  { maxPages = 100 }: { maxPages?: number } = {},
): Promise<SyncResult> {
  return withRun("catalog-snapshot", async () => {
    const startedAt = Date.now();

    // Slugs handed out during this run; the database is asked per chunk.
    const taken = new Set<string>();

    let cursor: HdctoolCursor | null = null;
    let processed = 0;
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    const seen = new Set<number>();
    /**
     * `POST /api/public/brands` returns no MTRMARK, but every product carries
     * both its super-brand id and its MTRMARK. Learn the mapping here — it is
     * what lets `recomputeCounts` attribute products to brands at all.
     */
    const brandMtrmark = new Map<string, number>();

    for (let page = 0; page < maxPages; page++) {
      const response = await hdctool.products({
        limit: HDCTOOL_MAX_LIMIT,
        cursor,
        page: 1,
      });

      for (const p of response.products) {
        if (p.brand?.id && p.brand.mtrmark != null) {
          brandMtrmark.set(p.brand.id, p.brand.mtrmark);
        }
      }

      const chunk = await writeProductChunk(response.products, taken);
      processed += chunk.processed;
      created += chunk.created;
      updated += chunk.updated;
      errors.push(...chunk.errors);
      for (const mtrl of chunk.written) seen.add(mtrl);

      cursor = response.pagination.nextCursor;
      if (!cursor || response.products.length === 0) break;
    }

    // Persist the brand → MTRMARK links discovered above.
    for (const [hdcId, mtrmark] of brandMtrmark) {
      await prisma.brand
        .update({ where: { hdcId }, data: { mtrmark } })
        .catch(() => undefined); // brand not synced yet — next run picks it up
    }

    // Anything not seen in a full walk is no longer eshop-listed. Deactivate
    // rather than delete: orders, wishlists and reviews still reference it.
    if (errors.length === 0 && seen.size > 0) {
      await prisma.product.updateMany({
        where: { mtrl: { notIn: [...seen] }, isActive: true },
        data: { isActive: false, inStock: false },
      });
    }

    return {
      processed,
      created,
      updated,
      failed: errors.length,
      durationMs: Date.now() - startedAt,
      errors,
    };
  });
}

// ─── Denormalised counts ────────────────────────────────────────────────────

/**
 * Recompute `Category.productCount` / `childCount` and `Brand.productCount`.
 *
 * Category counts are SUBTREE counts: a CATEGORY row counts every active
 * product under its groups and subgroups, which is what the homepage tile and
 * the catalogue rail both show.
 */
export async function recomputeCounts(): Promise<{
  categories: number;
  brands: number;
}> {
  /**
   * Done as three set-based statements rather than a row-per-entity loop.
   *
   * The first version issued 714 `category.update` calls inside one
   * `$transaction` and blew Prisma's 5s interactive-transaction limit. Each
   * statement below is a single round trip and finishes in well under a second.
   */

  // Category subtree counts. A CATEGORY row counts every product under its
  // groups and subgroups, which is what the homepage tile and rail both show —
  // matching on the ERP code at the level that owns it does exactly that,
  // because every product carries all three codes.
  const categories = await prisma.$executeRaw`
    UPDATE categories c
    SET "productCount" = COALESCE(x.n, 0)
    FROM (
      SELECT c2.id,
             COUNT(p.id) AS n
      FROM categories c2
      LEFT JOIN products p
        ON p."isActive"
       AND (
            (c2."erpType" = 'CATEGORY' AND p.mtrcategory::text    = c2."erpCode")
         OR (c2."erpType" = 'GROUP'    AND p.mtrgroup::text       = c2."erpCode")
         OR (c2."erpType" = 'SUBGROUP' AND p."cccSubgroup2"::text = c2."erpCode")
       )
      GROUP BY c2.id
    ) x
    WHERE c.id = x.id
  `;

  await prisma.$executeRaw`
    UPDATE categories c
    SET "childCount" = COALESCE(x.n, 0)
    FROM (
      SELECT parent.id, COUNT(child.id) AS n
      FROM categories parent
      LEFT JOIN categories child ON child."parentId" = parent.id
      GROUP BY parent.id
    ) x
    WHERE c.id = x.id
  `;

  const brands = await prisma.$executeRaw`
    UPDATE brands b
    SET "productCount" = COALESCE(x.n, 0),
        "inStockCount" = COALESCE(x.s, 0)
    FROM (
      SELECT b2.id,
             COUNT(p.id) AS n,
             COUNT(p.id) FILTER (WHERE p."inStock") AS s
      FROM brands b2
      LEFT JOIN products p ON p."isActive" AND p.mtrmark = b2.mtrmark
      GROUP BY b2.id
    ) x
    WHERE b.id = x.id
  `;

  return { categories, brands };
}

// ─── Targeted sync (webhook + reconcile) ────────────────────────────────────

export type TargetedSyncResult = SyncResult & {
  removed: number;
  /**
   * Ids that came back from HDCtool but could not be written. Carried by the
   * webhook as pending so a one-off write failure is retried rather than left
   * stale until the product next changes upstream.
   */
  failedMtrl: number[];
};

/**
 * Bring a named set of products up to date.
 *
 * The hot path now: HDCtool says which ERP ids moved and this fetches exactly
 * those. A typical delivery is a handful of products and a few hundred
 * milliseconds, against the ~9 minutes and 5.301 UPDATE statements the full
 * walk cost to express, on most runs, no change at all.
 *
 * De-listing needs no flag on the wire. HDCtool only returns products that are
 * still eshop-listed, so an id that was asked for and did not come back is one
 * the storefront should stop showing — absence IS the signal. Deactivated
 * rather than deleted, because orders, wishlists and reviews still point at it.
 */
export async function syncProductsByMtrl(mtrls: number[]): Promise<TargetedSyncResult> {
  const startedAt = Date.now();
  const wanted = [...new Set(mtrls.filter((m) => Number.isInteger(m) && m > 0))];

  const empty: TargetedSyncResult = {
    processed: 0, created: 0, updated: 0, removed: 0, failed: 0, failedMtrl: [],
    durationMs: 0, errors: [],
  };
  if (wanted.length === 0) return empty;

  // Slugs handed out during this run. The database is asked per chunk, and
  // only about candidates for products that are new (`allocateSlugs`).
  const taken = new Set<string>();

  let created = 0;
  let updated = 0;
  let processed = 0;
  const errors: string[] = [];
  const failedMtrl: number[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < wanted.length; i += HDCTOOL_MAX_LIMIT) {
    const chunk = wanted.slice(i, i + HDCTOOL_MAX_LIMIT);
    const response = await hdctool.products({ mtrl: chunk, limit: HDCTOOL_MAX_LIMIT });

    /*
     * Did HDCtool actually honour the filter?
     *
     * An older build ignores an unknown `mtrl` parameter and answers with the
     * first page of the catalogue instead. Every id we asked for would then be
     * "missing", and the de-listing step below would switch off exactly the
     * products this call was meant to refresh — from a deploy landing in the
     * wrong order. A stranger in the response is the tell, and it is cheap to
     * look for.
     */
    const asked = new Set(chunk);
    const stranger = response.products.find((p) => !asked.has(p.mtrl));
    if (stranger) {
      throw new Error(
        `HDCtool ignored the mtrl filter (asked for ${chunk.length}, got mtrl ${stranger.mtrl} back). ` +
          `Refusing to de-list — deploy the catalog/delta build on HDCtool first.`,
      );
    }

    const written = await writeProductChunk(response.products, taken);
    processed += written.processed;
    created += written.created;
    updated += written.updated;
    errors.push(...written.errors);
    failedMtrl.push(...written.failedMtrl);
    for (const mtrl of written.written) seen.add(mtrl);
  }

  /*
   * Only ids we asked about and did not get back — never a blanket "anything
   * not seen", which is what the full walk did and what would empty the
   * catalogue the first time a delivery covered three products.
   *
   * Skipped when a fetch failed, because a timeout looks exactly like an empty
   * answer from here and must not be read as "these products are gone".
   */
  let removed = 0;
  if (errors.length === 0) {
    const missing = wanted.filter((m) => !seen.has(m));
    if (missing.length > 0) {
      const result = await prisma.product.updateMany({
        where: { mtrl: { in: missing }, isActive: true },
        data: { isActive: false, inStock: false },
      });
      removed = result.count;
    }
  }

  return {
    processed, created, updated, removed,
    failed: errors.length,
    failedMtrl,
    durationMs: Date.now() - startedAt,
    errors: errors.slice(0, 50),
  };
}

/**
 * The backstop.
 *
 * A push feed is fast and, on its own, lossy: a delivery that lands while this
 * app is redeploying is a change nobody ever hears about again. The sequence
 * check catches most of that, but it cannot catch what was never queued —
 * HDCtool's collector scans for listed products, so a product that stops being
 * listed produces no event at all. Something has to ask the whole question
 * periodically, and this is it.
 *
 * It asks for ids, not products. HDCtool answers with about 5.300 integers in
 * one query; the comparison is set arithmetic here. Only the differences are
 * fetched in full. That is the difference between a nightly reconcile that
 * costs seconds and the one it replaces, which walked every product and spent
 * nine minutes to conclude nothing had changed.
 */
export async function reconcileCatalog(): Promise<TargetedSyncResult> {
  return withRun("catalog-reconcile", async () => {
    const startedAt = Date.now();

    const remote = new Set<number>();
    let afterMtrl: number | undefined;
    // Bounded: at 5.000 ids a page this is one or two requests today, and the
    // guard is there so a malformed cursor cannot spin forever.
    for (let page = 0; page < 50; page++) {
      const response = await hdctool.catalogDelta({ op: "ids", afterMtrl });
      for (const id of response.mtrl) remote.add(id);
      if (response.nextAfterMtrl == null) break;
      afterMtrl = response.nextAfterMtrl;
    }

    /*
     * An empty answer is refused rather than obeyed.
     *
     * "HDCtool listed nothing" and "the query failed in a way that returned an
     * empty array" are indistinguishable from here, and acting on the first
     * would deactivate the entire catalogue. A real catalogue emptying is a
     * decision somebody makes deliberately, not something a reconcile discovers.
     */
    if (remote.size === 0) {
      throw new Error("Reconcile refused: HDCtool returned no eshop-listed products");
    }

    const local = await prisma.product.findMany({
      select: { mtrl: true, isActive: true },
    });
    const localActive = new Set(local.filter((p) => p.isActive).map((p) => p.mtrl));
    const localAll = new Set(local.map((p) => p.mtrl));

    // Listed there, missing or switched off here.
    const toSync = [...remote].filter((m) => !localActive.has(m));
    // Live here, not listed there.
    const toRemove = [...localActive].filter((m) => !remote.has(m));

    let result: TargetedSyncResult = {
      processed: 0, created: 0, updated: 0, removed: 0, failed: 0, failedMtrl: [],
      durationMs: 0, errors: [],
    };
    if (toSync.length > 0) result = await syncProductsByMtrl(toSync);

    /*
     * A big de-listing is refused, the same way an empty answer is.
     *
     * On 5 Aug 2026 this ran while HDCtool's `eshopListed` flags had briefly
     * reverted to an older rule, and it did exactly what it was told: it
     * switched off 237 products, silently, and reported success. The next run
     * put them back. Nobody would have noticed either.
     *
     * The empty-answer guard above already encodes the principle — a catalogue
     * shrinking is a decision, not a discovery — it just drew the line at zero.
     * A tenth of the shop disappearing in one pass is the same kind of event and
     * deserves the same refusal, because the cause is far more often a stale or
     * half-computed flag upstream than 900 products genuinely going away.
     *
     * Below the threshold it proceeds, but the count is stated rather than
     * folded into a total, so a run that removes 237 products reads as a run
     * that removed 237 products.
     */
    const DELIST_LIMIT = 0.1;
    if (toRemove.length > localActive.size * DELIST_LIMIT && localActive.size > 0) {
      throw new Error(
        `Reconcile refused: would de-list ${toRemove.length} of ${localActive.size} ` +
          `active products (over ${DELIST_LIMIT * 100}%). HDCtool listed ${remote.size}. ` +
          `Check eshopListed upstream before re-running.`,
      );
    }

    let removed = result.removed;
    if (toRemove.length > 0) {
      console.warn(
        `[catalog-reconcile] de-listing ${toRemove.length} products no longer listed by HDCtool`,
      );
      const off = await prisma.product.updateMany({
        where: { mtrl: { in: toRemove } },
        data: { isActive: false, inStock: false },
      });
      removed += off.count;
    }

    console.log(
      `[catalog-reconcile] HDCtool ${remote.size} listed, here ${localAll.size} known / ` +
        `${localActive.size} active → synced ${result.processed}, de-listed ${removed}`,
    );

    /* Οι εκπρόσωποι ξαναδιαλέγονται μετά τη διαγραφή: ένα προϊόν που βγήκε
       από τον κατάλογο μπορεί να ήταν ο εκπρόσωπος της ομάδας του, και τότε
       ολόκληρη η ομάδα θα εξαφανιζόταν από τις λίστες. */
    await refreshVariantLeads();

    return { ...result, removed, durationMs: Date.now() - startedAt };
  });
}

export async function syncAll() {
  const categories = await syncCategories();
  const brands = await syncBrands();
  const products = await syncProducts();
  await refreshVariantLeads();
  const counts = await recomputeCounts();
  return { categories, brands, products, counts };
}
