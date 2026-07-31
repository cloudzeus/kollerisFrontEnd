import "server-only";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/greek";
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
  const root = slugify(base) || slugify(fallback) || "item";
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
        const slug =
          existing.get(brand.id) ??
          uniqueSlug(brand.brandNameEnglish || brand.brandNameGreek, brand.id, taken);

        const data = {
          slug,
          nameEl: brand.brandNameGreek || brand.brandNameEnglish,
          nameEn: brand.brandNameEnglish || brand.brandNameGreek,
          nameIt: brand.brandNameItalian || brand.brandNameGreek,
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
function parseNumeric(value: string): number | null {
  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number.parseFloat(match[0]);
  return Number.isFinite(n) ? n : null;
}

/** Greek name wins for display; MTRAN el falls back to the raw MTRL name. */
function displayName(p: HdctoolProduct): string {
  return p.translations.find((t) => t.language === "el")?.name?.trim() || p.name;
}

/**
 * How many product writes run at once. The pg pool defaults to 10 connections;
 * staying at 8 leaves headroom for the count queries that follow.
 */
const WRITE_CONCURRENCY = 8;

function buildSpecRows(p: HdctoolProduct, productId: string) {
  const rows: Array<{
    productId: string;
    locale: "el" | "en" | "it";
    fieldKey: string;
    fieldGroup: string;
    label: string | null;
    value: string;
    valueNumeric: number | null;
    unit: string | null;
    order: number;
  }> = [];

  for (const spec of p.specifications ?? []) {
    const locale = spec.language;
    SPEC_FIELDS.forEach((field, order) => {
      const raw = spec[field.key];
      if (raw == null) return;
      const value = String(raw).trim();
      if (!value || value === "-") return;
      rows.push({
        productId,
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

async function upsertProduct(
  p: HdctoolProduct,
  slug: string,
): Promise<"created" | "updated"> {
  const name = displayName(p);

  const priceNet = p.pricer02 ?? p.priceWeb ?? p.priceRetail ?? null;

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
  const qty = p.quantity ?? 0;

  const base = {
    code: p.code ?? "",
    code1: p.code1 ?? "",
    code2: p.code2 ?? "",
    name,
    slug,
    searchKey: [name, p.code, p.code1, p.code2, p.brand?.name]
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
    create: { ...data, mtrl: p.mtrl },
    select: { id: true, createdAt: true, updatedAt: true },
  });

  // Images and translations are small per product; replace wholesale rather
  // than diffing — the sync is not hot-path and this avoids stale rows.
  await prisma.$transaction([
    prisma.productImage.deleteMany({ where: { productId: product.id } }),
    prisma.productImage.createMany({
      data: p.images.slice(0, 12).map((img, i) => ({
        productId: product.id,
        url: img.url,
        isFeature: img.isFeature || i === 0,
        order: img.order ?? i,
      })),
    }),
    prisma.productTranslation.deleteMany({ where: { productId: product.id } }),
    prisma.productTranslation.createMany({
      data: p.translations
        .filter((t) => t.name)
        .map((t) => ({
          productId: product.id,
          locale: t.language,
          name: t.name!,
          shortDescription: t.shortDescription,
          longDescription: t.longDescription,
          searchKey: normaliseSearchKey(t.name!),
        })),
    }),
    prisma.productSpec.deleteMany({ where: { productId: product.id } }),
    prisma.productSpec.createMany({ data: buildSpecRows(p, product.id) }),
  ]);

  return product.createdAt.getTime() === product.updatedAt.getTime()
    ? "created"
    : "updated";
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

export async function syncProducts(
  { maxPages = 100 }: { maxPages?: number } = {},
): Promise<SyncResult> {
  return withRun("catalog-snapshot", async () => {
    const startedAt = Date.now();

    const taken = new Set(
      (await prisma.product.findMany({ select: { slug: true } })).map((p) => p.slug),
    );
    const existingSlugs = new Map(
      (await prisma.product.findMany({ select: { mtrl: true, slug: true } })).map(
        (p) => [p.mtrl, p.slug],
      ),
    );

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

      /**
       * Each product costs several round trips to a remote Postgres, so a
       * serial loop is latency-bound (~1 product/sec over the VPN). Slugs are
       * allocated up front — `taken` is a shared Set and must not be mutated
       * from concurrent tasks — then the writes run in bounded batches.
       */
      const prepared = response.products.map((p) => ({
        product: p,
        slug:
          existingSlugs.get(p.mtrl) ??
          uniqueSlug(
            `${displayName(p)}-${p.code2 || p.code}`,
            `p-${p.mtrl}`,
            taken,
          ),
      }));

      for (let i = 0; i < prepared.length; i += WRITE_CONCURRENCY) {
        const batch = prepared.slice(i, i + WRITE_CONCURRENCY);
        const outcomes = await Promise.allSettled(
          batch.map(({ product, slug }) => upsertProduct(product, slug)),
        );

        outcomes.forEach((outcome, index) => {
          const { product } = batch[index];
          if (outcome.status === "fulfilled") {
            if (outcome.value === "created") created++;
            else updated++;
            seen.add(product.mtrl);
          } else {
            errors.push(
              `mtrl ${product.mtrl}: ${
                outcome.reason instanceof Error ? outcome.reason.message : outcome.reason
              }`,
            );
          }
          processed++;
        });
      }

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

export async function syncAll() {
  const categories = await syncCategories();
  const brands = await syncBrands();
  const products = await syncProducts();
  const counts = await recomputeCounts();
  return { categories, brands, products, counts };
}
