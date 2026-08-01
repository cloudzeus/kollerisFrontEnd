import "server-only";
import { prisma } from "@/lib/prisma";
import { deleteFromBunny, uploadImage, uploadVideo } from "@/lib/media/bunny";
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

/** Videos are big and this is a synchronous request, not a queue. */
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

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

export type UploadResult =
  | { ok: true; asset: MediaAssetView; note: string }
  | { ok: false; error: string };

/**
 * Take one file into the library.
 *
 * Images are converted to WebP at a sane maximum edge, which is where the size
 * saving reported back to the operator comes from — the point of the conversion
 * is invisible otherwise, and a marketing team that cannot see it will keep
 * asking why their 8MB export "got worse".
 */
export async function ingest(
  file: File,
  { folder, actor }: { folder: string; actor: string },
): Promise<UploadResult> {
  const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(file.name);
  const cap = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

  if (file.size > cap) {
    return {
      ok: false,
      error: `Το «${file.name}» είναι ${Math.round(file.size / 1024 / 1024)}MB — το όριο είναι ${cap / 1024 / 1024}MB.`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (isVideo) {
      const result = await uploadVideo(buffer, { folder, name: file.name });
      const asset = await record({
        url: result.url,
        kind: "video",
        name: file.name,
        folder,
        width: null,
        height: null,
        bytes: result.bytes,
        actor,
      });
      return { ok: true, asset, note: `${Math.round(result.bytes / 1024 / 1024)}MB` };
    }

    const result = await uploadImage(buffer, { folder, name: file.name });
    const asset = await record({
      url: result.url,
      kind: "image",
      name: file.name,
      folder,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      actor,
    });
    return {
      ok: true,
      asset,
      note: `${Math.round(result.originalBytes / 1024)} KB → ${Math.round(result.bytes / 1024)} KB · ${result.width}×${result.height}`,
    };
  } catch (error) {
    console.error("[media] upload failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : `Το «${file.name}» δεν ανέβηκε.`,
    };
  }
}

async function record(input: {
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
export async function deleteAsset(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Το αρχείο δεν βρέθηκε." };

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
