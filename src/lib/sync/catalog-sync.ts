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
  if (data.isActive) {
    await prisma.$executeRaw`
      UPDATE products SET "firstListedAt" = now()
       WHERE mtrl = ${p.mtrl} AND "firstListedAt" IS NULL
    `;
  }

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
    /*
     * Colours and sizes, replaced wholesale like everything else here.
     *
     * `?? []` on both: HDCtool only started returning these fields today, and a
     * deploy where the eshop is ahead of it would otherwise throw on every
     * product rather than simply having nothing to write.
     */
    prisma.productColor.deleteMany({ where: { productId: product.id } }),
    prisma.productColor.createMany({
      data: (p.colors ?? []).map((c, i) => ({
        productId: product.id,
        externalId: c.id,
        name: c.name,
        order: i,
      })),
    }),
    prisma.productSize.deleteMany({ where: { productId: product.id } }),
    prisma.productSize.createMany({
      data: (p.sizes ?? []).map((s, i) => ({
        productId: product.id,
        externalId: s.id,
        label: s.label,
        family: s.category ?? null,
        order: i,
      })),
    }),
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

// ─── Targeted sync (webhook + reconcile) ────────────────────────────────────

export type TargetedSyncResult = SyncResult & { removed: number };

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
    processed: 0, created: 0, updated: 0, removed: 0, failed: 0,
    durationMs: 0, errors: [],
  };
  if (wanted.length === 0) return empty;

  // Slugs are allocated before any concurrent write, because `taken` is shared
  // state and two tasks racing on it would hand out the same slug twice.
  const [allSlugs, mine] = await Promise.all([
    prisma.product.findMany({ select: { slug: true } }),
    prisma.product.findMany({
      where: { mtrl: { in: wanted } },
      select: { mtrl: true, slug: true },
    }),
  ]);
  const taken = new Set(allSlugs.map((p) => p.slug));
  const existingSlugs = new Map(mine.map((p) => [p.mtrl, p.slug]));

  let created = 0;
  let updated = 0;
  let processed = 0;
  const errors: string[] = [];
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

    const prepared = response.products.map((p) => ({
      product: p,
      slug:
        existingSlugs.get(p.mtrl) ??
        uniqueSlug(`${displayName(p)}-${p.code2 || p.code}`, `p-${p.mtrl}`, taken),
    }));

    for (let j = 0; j < prepared.length; j += WRITE_CONCURRENCY) {
      const batch = prepared.slice(j, j + WRITE_CONCURRENCY);
      const outcomes = await Promise.allSettled(
        batch.map(({ product, slug }) => upsertProduct(product, slug)),
      );
      outcomes.forEach((outcome, index) => {
        const { product } = batch[index];
        processed++;
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
      });
    }
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
      processed: 0, created: 0, updated: 0, removed: 0, failed: 0,
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

    return { ...result, removed, durationMs: Date.now() - startedAt };
  });
}

export async function syncAll() {
  const categories = await syncCategories();
  const brands = await syncBrands();
  const products = await syncProducts();
  const counts = await recomputeCounts();
  return { categories, brands, products, counts };
}
