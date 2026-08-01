import "server-only";
import { prisma } from "@/lib/prisma";
import { hdctoolRequest } from "@/lib/hdctool/client";
import type { Locale } from "@/i18n/routing";
import { EDITABLE_SPECS, type PimProduct } from "@/lib/pim/pim-types";

export * from "@/lib/pim/pim-types";

/**
 * Editing how a product is presented.
 *
 * READS come from the local projection, because it is already here and already
 * what the storefront renders. WRITES go to HDCtool, because the client's rule
 * is that an edit applies everywhere — Magento and Skroutz included — and the
 * only way to mean that is to write where the catalogue actually lives.
 *
 * After a write succeeds, the local projection is brought into line with it.
 * That is not "editing the copy" — it is keeping the copy in agreement ahead of
 * the sync, which is what a cache of a known-changed value should do. Leaving it
 * stale meant an operator deleted a spec, HDCtool accepted it, and the screen
 * kept showing the old value; the change looked like it had failed when it had
 * not.
 *
 * The storefront still catches up on the next sync. Only this projection is
 * touched, and only to match what HDCtool just confirmed.
 */

/** First row wins, which is the one the ordering already put first. */
function dedupeByUrl<T extends { url: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
}

export async function getPimProduct(slug: string, locale: Locale): Promise<PimProduct | null> {
  const p = await prisma.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: [{ isFeature: "desc" }, { order: "asc" }] },
      translations: { where: { locale }, select: { name: true }, take: 1 },
      specs: { where: { locale }, select: { fieldKey: true, value: true }, orderBy: { order: "asc" } },
    },
  });
  if (!p) return null;

  // The projection flattens HDCtool's wide specification table into key/value
  // rows. Only the keys HDCtool will accept a write for are offered — showing a
  // field that cannot be saved is worse than not showing it.
  const byKey = new Map(p.specs.map((s) => [s.fieldKey, s.value]));

  return {
    id: p.id,
    mtrl: p.mtrl,
    slug: p.slug,
    code: p.code,
    name: p.translations[0]?.name ?? p.name,
    // Deduplicated by url. Some products carry the same CDN file on two rows —
    // a sync artefact — and showing it twice lets somebody reorder two things
    // that are one image. It also breaks the write path, which resolves back to
    // HDCtool's files by url precisely because ids do not cross the boundary.
    images: dedupeByUrl(p.images).map((i) => ({
      id: i.id,
      url: i.url,
      isFeature: i.isFeature,
      order: i.order,
      width: i.width,
      height: i.height,
    })),
    specs: EDITABLE_SPECS.map((s) => ({
      field: s.field,
      label: s.label,
      value: byKey.get(s.field) ?? "",
    })),
  };
}

type PimResponse = { success: boolean; error?: string } & Record<string, unknown>;

/**
 * Turns a transport failure into something an operator can act on.
 *
 * A 404 here does not mean "not found", it means the method has not been
 * deployed to HDCtool yet — which is a different instruction to the person
 * reading it than "the server is down", and the two were being reported
 * identically.
 */
function describe(error: unknown, op: string): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("404")) {
    return `Το HDCtool δεν έχει ακόμη τη μέθοδο «${op}» — χρειάζεται deploy.`;
  }
  if (message.includes("401") || message.includes("403")) {
    return "Το HDCtool απέρριψε το κλειδί πρόσβασης.";
  }
  return "Το HDCtool δεν απαντά.";
}

async function write(op: string, params: Record<string, unknown>) {
  try {
    const response = await hdctoolRequest<PimResponse>("/api/public/pim", { op, ...params });
    if (!response.success) return { ok: false as const, error: response.error ?? "Απέτυχε" };
    return { ok: true as const };
  } catch (error) {
    console.error("[pim]", op, error);
    return { ok: false as const, error: describe(error, op) };
  }
}

/** Like `write`, but keeps the counts a bulk operation returns. */
async function writeCounted(op: string, params: Record<string, unknown>) {
  try {
    const response = await hdctoolRequest<PimResponse>("/api/public/pim", { op, ...params });
    if (!response.success) return { ok: false as const, error: response.error ?? "Απέτυχε" };
    return {
      ok: true as const,
      products: Number(response.products ?? 0),
      cleared: Number(response.cleared ?? 0),
    };
  } catch (error) {
    console.error("[pim]", op, error);
    return { ok: false as const, error: describe(error, op) };
  }
}

/**
 * Urls, not ids: the eshop's ProductImage rows carry local ids that mean nothing
 * to HDCtool. The CDN url is the only stable key both sides share.
 */
export async function saveImageOrder(mtrl: number, urls: string[], featureUrl: string | null) {
  const result = await write("images/order", { mtrl, urls, featureUrl });
  if (result.ok) {
    const product = await prisma.product.findFirst({ where: { mtrl }, select: { id: true } });
    if (product) {
      await prisma.$transaction([
        ...urls.map((url, index) =>
          prisma.productImage.updateMany({
            where: { productId: product.id, url },
            data: { order: index, isFeature: url === featureUrl },
          }),
        ),
      ]);
    }
  }
  return result;
}

export async function saveSpec(mtrl: number, field: string, value: string, locale: Locale) {
  const trimmed = value.trim();
  if (!trimmed) return clearSpec(mtrl, field);

  const result = await write("spec/save", { mtrl, field, value: trimmed, language: locale });
  if (result.ok) {
    const product = await prisma.product.findFirst({ where: { mtrl }, select: { id: true } });
    if (product) {
      await prisma.productSpec.updateMany({
        where: { productId: product.id, fieldKey: field, locale },
        data: { value: trimmed },
      });
    }
  }
  return result;
}

/**
 * Remove one image from the product.
 *
 * HDCtool deletes the row and only removes the CDN object when nothing else
 * points at it — 183 files in this catalogue are shared between products, and
 * deleting one for a single product would blank the photo on the others.
 */
export async function deleteImage(mtrl: number, url: string) {
  const result = await writeCounted("images/delete", { mtrl, url });
  if (result.ok) {
    const product = await prisma.product.findFirst({ where: { mtrl }, select: { id: true } });
    if (product) {
      await prisma.productImage.deleteMany({ where: { productId: product.id, url } });
    }
  }
  return result;
}

/**
 * Mirror a cleared field into the local projection.
 *
 * Deletes the rows rather than blanking them: the projection stores specs as
 * present key/value rows, and a row with an empty value would render as a spec
 * with no value rather than as no spec.
 */
async function mirrorClear(mtrls: number[], field: string): Promise<void> {
  if (mtrls.length === 0) return;
  const products = await prisma.product.findMany({
    where: { mtrl: { in: mtrls } },
    select: { id: true },
  });
  if (products.length === 0) return;
  await prisma.productSpec.deleteMany({
    where: { productId: { in: products.map((p) => p.id) }, fieldKey: field },
  });
}

/** Remove the field from this product, in every language. */
export async function clearSpec(mtrl: number, field: string) {
  const result = await write("spec/clear", { mtrl, field });
  if (result.ok) await mirrorClear([mtrl], field);
  return result;
}

/**
 * Remove the field from every product in the same final subgroup.
 *
 * The subgroup is resolved on the HDCtool side from this product, not passed
 * in: a subgroup id sent from here is one that can be wrong, and this writes to
 * every product in it.
 */
export async function clearSpecForSubgroup(mtrl: number, field: string) {
  const result = await writeCounted("spec/clearSubgroup", { mtrl, field });
  if (!result.ok) return result;

  // Mirror across the same subgroup locally. The projection carries the
  // subgroup on each product, so this does not need HDCtool to tell it which
  // products were touched.
  const source = await prisma.product.findFirst({
    where: { mtrl },
    select: { cccSubgroup2: true },
  });
  if (source?.cccSubgroup2 != null) {
    const siblings = await prisma.product.findMany({
      where: { cccSubgroup2: source.cccSubgroup2 },
      select: { id: true },
    });
    await prisma.productSpec.deleteMany({
      where: { productId: { in: siblings.map((s) => s.id) }, fieldKey: field },
    });
  }
  return result;
}
