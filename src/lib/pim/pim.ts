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
 * The consequence is worth stating: a saved change shows on the storefront
 * after the next sync, not immediately. The screen says so rather than leaving
 * somebody to refresh and wonder.
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

async function write(op: string, params: Record<string, unknown>) {
  try {
    const response = await hdctoolRequest<PimResponse>("/api/public/pim", { op, ...params });
    if (!response.success) return { ok: false as const, error: response.error ?? "Απέτυχε" };
    return { ok: true as const };
  } catch (error) {
    console.error("[pim]", op, error);
    return {
      ok: false as const,
      error:
        error instanceof Error && error.message.includes("404")
          ? "Το HDCtool δεν έχει ακόμη αυτή τη μέθοδο — χρειάζεται deploy."
          : "Το HDCtool δεν απαντά.",
    };
  }
}

/**
 * Urls, not ids: the eshop's ProductImage rows carry local ids that mean nothing
 * to HDCtool. The CDN url is the only stable key both sides share.
 */
export async function saveImageOrder(mtrl: number, urls: string[], featureUrl: string | null) {
  return write("images/order", { mtrl, urls, featureUrl });
}

export async function saveSpec(mtrl: number, field: string, value: string, locale: Locale) {
  return value.trim()
    ? write("spec/save", { mtrl, field, value: value.trim(), language: locale })
    : write("spec/clear", { mtrl, field });
}
