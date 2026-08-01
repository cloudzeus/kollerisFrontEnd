"use server";

import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { deleteAsset, ingest, listAssets, listBrandLogos } from "@/lib/media/library";
import type { MediaKind } from "@/lib/media/library-types";

/**
 * The media library's endpoints.
 *
 * Uploads take FormData rather than a base64 string: a 6MB press JPEG becomes
 * an 8MB string through base64, and a 40MB video becomes 54MB — a server action
 * body limit that a marketing upload will find on its first attempt.
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

/**
 * Several files at once, each reported separately.
 *
 * A batch that stops at the first failure loses the other nine uploads; each
 * file gets its own result so the picker can say "seven added, this one is too
 * big" rather than "upload failed".
 */
export async function actionUploadFiles(form: FormData) {
  const actor = await requireEditor();
  const folder = String(form.get("folder") ?? "library").slice(0, 40);
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) return { ok: false as const, error: "Δεν βρέθηκε αρχείο." };

  const results = await Promise.all(files.map((file) => ingest(file, { folder, actor })));
  return {
    ok: true as const,
    added: results.flatMap((r) => (r.ok ? [{ asset: r.asset, note: r.note }] : [])),
    failed: results.flatMap((r) => (r.ok ? [] : [r.error])),
  };
}

export async function actionDeleteAsset(id: string) {
  await requireEditor();
  return deleteAsset(id);
}
