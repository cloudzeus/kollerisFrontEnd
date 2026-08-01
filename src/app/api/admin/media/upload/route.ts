import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import { recordAsset } from "@/lib/media/library";
import { fileSize } from "@/lib/media/library-types";
import {
  VIDEO_CONTENT_TYPES,
  processImage,
  uploadStreamToBunny,
  uploadToBunny,
} from "@/lib/media/bunny";

/**
 * Uploading one file.
 *
 * A route handler rather than a server action, because server actions cap the
 * request body at 1MB — a limit that makes every stated size allowance a lie
 * and that no amount of raising is the right answer for a 60MB video.
 *
 * The body is the file itself, not multipart: there is exactly one file per
 * request, so the envelope would only add a parser and a second copy of the
 * bytes. The name arrives as a query parameter.
 *
 * Video streams straight through to the CDN and is never held in the process.
 * Images are buffered because converting them requires the whole picture, which
 * is affordable at a fraction of the size.
 */

const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const fail = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status });

const slugify = (name: string, fallback: string): string =>
  name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || fallback;

export async function POST(request: Request) {
  const session = await auth();
  if (!can(session?.user.role, "content")) return fail(403, "Χωρίς δικαίωμα.");

  const url = new URL(request.url);
  const name = (url.searchParams.get("name") ?? "").slice(0, 160);
  const folder = (url.searchParams.get("folder") ?? "library").slice(0, 40);
  if (!name) return fail(400, "Λείπει το όνομα αρχείου.");

  const length = Number(request.headers.get("content-length") ?? 0);
  if (!length) return fail(411, "Άγνωστο μέγεθος αρχείου.");
  if (!request.body) return fail(400, "Άδειο αίτημα.");

  const actor = session?.user.email ?? "unknown";
  const extension = (name.split(".").pop() ?? "").toLowerCase();
  const videoType = VIDEO_CONTENT_TYPES[extension];

  try {
    /* ── Βίντεο: περνάει, δεν αποθηκεύεται ── */
    if (videoType) {
      if (length > MAX_VIDEO_BYTES) {
        return fail(
          413,
          `Το αρχείο είναι ${Math.round(length / 1024 / 1024)}MB — το όριο είναι ${MAX_VIDEO_BYTES / 1024 / 1024}MB.`,
        );
      }

      const cdn = await uploadStreamToBunny(
        request.body,
        `eshop/${folder}/${slugify(name, "video")}-${Date.now()}.${extension}`,
        videoType,
        length,
      );

      const asset = await recordAsset({
        url: cdn,
        kind: "video",
        name,
        folder,
        width: null,
        height: null,
        bytes: length,
        actor,
      });
      // `fileSize` rather than a hardcoded MB: rounding a 9KB clip to "0MB" is
      // a message that tells the operator nothing.
      return Response.json({ ok: true, asset, note: fileSize(length) });
    }

    /* ── Εικόνες: μετατροπή, άρα χρειάζεται ολόκληρη ── */
    if (length > MAX_IMAGE_BYTES) {
      return fail(
        413,
        `Το αρχείο είναι ${Math.round(length / 1024 / 1024)}MB — το όριο για εικόνα είναι ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`,
      );
    }

    const input = Buffer.from(await request.arrayBuffer());
    const processed = await processImage(input);
    const cdn = await uploadToBunny(
      processed.buffer,
      `eshop/${folder}/${slugify(name, "image")}-${Date.now()}.webp`,
    );

    const asset = await recordAsset({
      url: cdn,
      kind: "image",
      name,
      folder,
      width: processed.width,
      height: processed.height,
      bytes: processed.bytes,
      actor,
    });
    return Response.json({
      ok: true,
      asset,
      // The point of the conversion is invisible unless somebody says it.
      note: `${Math.round(processed.originalBytes / 1024)} KB → ${Math.round(processed.bytes / 1024)} KB · ${processed.width}×${processed.height}`,
    });
  } catch (error) {
    console.error("[media] upload failed", error);
    return fail(500, error instanceof Error ? error.message : "Το ανέβασμα απέτυχε.");
  }
}
