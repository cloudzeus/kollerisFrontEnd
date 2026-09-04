import "server-only";
import { prisma } from "@/lib/prisma";
import { deleteFromBunny } from "@/lib/media/bunny";
import type { MediaAssetView, MediaKind } from "@/lib/media/library-types";

/**
 * The media library.
 *
 * Uploads used to go straight to the CDN and be forgotten — the URL survived
 * only in whatever field it was pasted into, so "the picture we used last
 * month" was unfindable and the same file got uploaded four times. Every upload
 * now leaves a row, which is the whole difference between a pipe and a library.
 *
 * The CDN still owns the bytes; this table only knows about them. Deleting
 * removes the row first and the object second: a row without its object is a
 * dead thumbnail somebody can clear, while an object without its row is
 * invisible and therefore permanent.
 */

export async function listAssets({
  kind,
  query,
  limit = 60,
}: {
  kind?: MediaKind;
  query?: string;
  limit?: number;
} = {}): Promise<MediaAssetView[]> {
  const q = query?.trim();
  const rows = await prisma.mediaAsset.findMany({
    where: {
      ...(kind ? { kind } : {}),
      ...(q && q.length >= 2 ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    kind: row.kind as MediaKind,
    name: row.name,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    createdAt: row.createdAt,
  }));
}

/**
 * Note a file that is already on the CDN.
 *
 * Called by the upload route once the bytes have landed. Kept here rather than
 * in the route so the library owns its own table, and so nothing can write a
 * row for an object that was never uploaded.
 */
export async function recordAsset(input: {
  url: string;
  kind: MediaKind;
  name: string;
  folder: string;
  width: number | null;
  height: number | null;
  bytes: number;
  actor: string;
}): Promise<MediaAssetView> {
  const row = await prisma.mediaAsset.create({
    data: {
      url: input.url,
      kind: input.kind,
      name: input.name.slice(0, 160),
      folder: input.folder.slice(0, 40),
      width: input.width,
      height: input.height,
      bytes: input.bytes,
      uploadedBy: input.actor.slice(0, 120),
    },
  });
  return {
    id: row.id,
    url: row.url,
    kind: row.kind as MediaKind,
    name: row.name,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    createdAt: row.createdAt,
  };
}

/**
 * Remove a file from the library and from the CDN.
 *
 * The row goes first. If the CDN call then fails the object is orphaned, which
 * costs storage and nothing else; the other order risks a row pointing at bytes
 * that are already gone, which is a broken image on a live page.
 */
export async function deleteAsset(
  id: string,
  /** Διαγραφή παρά τη χρήση — μόνο μετά από ρητή επιβεβαίωση του χρήστη. */
  { force = false }: { force?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string; usage?: AssetUsage[] }> {
  const row = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Το αρχείο δεν βρέθηκε." };

  if (!force) {
    // Η διαγραφή είναι μη αναστρέψιμη και το αποτέλεσμα μιας λάθος διαγραφής
    // δεν φαίνεται εδώ αλλά στην αρχική, ώρες αργότερα.
    const used = (await assetUsage([row.url]))[row.url] ?? [];
    if (used.length > 0) {
      return {
        ok: false,
        error: `Χρησιμοποιείται σε ${used.length} ${used.length === 1 ? "σημείο" : "σημεία"}.`,
        usage: used,
      };
    }
  }

  await prisma.mediaAsset.delete({ where: { id } });
  await deleteFromBunny(row.url);
  return { ok: true };
}

/**
 * Brand logos, for dropping straight into a banner.
 *
 * Every one is already on the CDN and already correct — a marketing team should
 * never be hunting for the FACOM logo in a folder, and a wrong or outdated one
 * on a banner is a supplier relations problem rather than a design one.
 */
export async function listBrandLogos(): Promise<Array<{ slug: string; name: string; logo: string }>> {
  const rows = await prisma.brand.findMany({
    where: { logo: { not: null }, isEshop: true },
    select: { slug: true, nameEl: true, logo: true },
    orderBy: { productCount: "desc" },
  });
  return rows
    .filter((r): r is typeof r & { logo: string } => Boolean(r.logo))
    .map((r) => ({ slug: r.slug, name: r.nameEl, logo: r.logo }));
}

/**
 * Πού χρησιμοποιείται ένα αρχείο.
 *
 * Χωρίς αυτό, η διαγραφή είναι τυφλή: το αρχείο φεύγει από το CDN και το
 * banner που το έδειχνε μένει με σπασμένη εικόνα, χωρίς κανένα σφάλμα πουθενά
 * — απλώς ένα κενό ορθογώνιο στην αρχική. Η λίστα διαβάζεται πριν από κάθε
 * διαγραφή και συνοδεύει κάθε πλακίδιο στη βιβλιοθήκη.
 *
 * Η αναζήτηση γίνεται στο κείμενο του JSON και όχι με ερώτημα στα πεδία του:
 * ένα URL μπορεί να κάθεται σε φόντο, σε αφίσα βίντεο ή σε στρώμα εικόνας,
 * και τα banners είναι δεκάδες — μια πλήρης σάρωση κοστίζει λιγότερο από τη
 * συντήρηση τριών χειρόγραφων μονοπατιών που θα ξεχαστούν στην πρώτη αλλαγή
 * σχήματος.
 */
export type AssetUsage = { kind: "banner" | "widget"; id: string; name: string };

export async function assetUsage(urls: string[]): Promise<Record<string, AssetUsage[]>> {
  const wanted = urls.filter(Boolean);
  if (wanted.length === 0) return {};

  const [banners, widgets] = await Promise.all([
    prisma.banner.findMany({ select: { id: true, name: true, draft: true, published: true } }),
    prisma.zoneWidget.findMany({ select: { id: true, zone: true, type: true, props: true } }),
  ]);

  const haystacks: Array<{ text: string; use: AssetUsage }> = [
    ...banners.map((b) => ({
      text: JSON.stringify(b.draft ?? {}) + JSON.stringify(b.published ?? {}),
      use: { kind: "banner" as const, id: b.id, name: b.name },
    })),
    ...widgets.map((w) => ({
      text: JSON.stringify(w.props ?? {}),
      use: { kind: "widget" as const, id: w.id, name: `${w.zone} · ${w.type}` },
    })),
  ];

  const out: Record<string, AssetUsage[]> = {};
  for (const url of wanted) {
    const hits = haystacks.filter((h) => h.text.includes(url)).map((h) => h.use);
    if (hits.length) out[url] = hits;
  }
  return out;
}
