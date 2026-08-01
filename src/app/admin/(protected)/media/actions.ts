"use server";

import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { deleteAsset, listAssets, listBrandLogos } from "@/lib/media/library";
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
