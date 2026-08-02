"use server";

import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { deleteAsset, listAssets, listBrandLogos, recordAsset } from "@/lib/media/library";
import { removeBackground } from "@/lib/media/claid";
import { uploadImage } from "@/lib/media/bunny";
import type { MediaKind } from "@/lib/media/library-types";

/**
 * The media library's read side.
 *
 * Uploading is NOT here: a server action caps its request body at 1MB, which
 * makes every size allowance a lie and is not something raising the limit
 * fixes for a 60MB video. That path is a route handler —
 * `/api/admin/media/upload` — which streams instead.
 */

async function requireEditor(): Promise<string> {
  const session = await auth();
  assertCan(session?.user.role, "content");
  return session?.user.email ?? "unknown";
}

export async function actionListAssets(input: { kind?: MediaKind; query?: string } = {}) {
  await requireEditor();
  return listAssets(input);
}

export async function actionListLogos() {
  await requireEditor();
  return listBrandLogos();
}

export async function actionDeleteAsset(id: string) {
  await requireEditor();
  return deleteAsset(id);
}

/**
 * Cut the subject out of a picture and file the result.
 *
 * A server action rather than the upload route: what crosses the wire is a URL,
 * and the bytes never touch the browser — Claid fetches the source itself and
 * the cutout goes straight to our CDN.
 *
 * The result is a NEW asset. Replacing the original would silently change every
 * banner already using it, and the version with its background is often still
 * the right one somewhere else.
 */
export async function actionRemoveBackground(url: string, name = "cutout") {
  const actor = await requireEditor();

  const cut = await removeBackground(url);
  if (!cut.ok) return cut;

  try {
    // Through the ordinary image pipeline: WebP carries alpha, so the cutout
    // stays a cutout while getting the same size treatment as everything else.
    const stored = await uploadImage(cut.buffer, {
      folder: "cutouts",
      name: `${name.replace(/\.[a-z0-9]+$/i, "")}-cutout.png`,
    });
    const asset = await recordAsset({
      url: stored.url,
      kind: "image",
      name: `${name.replace(/\.[a-z0-9]+$/i, "")} — χωρίς φόντο`,
      folder: "cutouts",
      width: stored.width,
      height: stored.height,
      bytes: stored.bytes,
      actor,
    });

    return {
      ok: true as const,
      asset,
      note: `${cut.transparent}% του κάδρου αφαιρέθηκε`,
    };
  } catch (error) {
    console.error("[media] cutout upload failed", error);
    return { ok: false as const, error: "Το κόψιμο έγινε αλλά δεν αποθηκεύτηκε." };
  }
}
