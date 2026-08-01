"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { deleteTemplate, saveTemplate } from "@/lib/banners/banners";
import type { GridCell } from "@/lib/banners/contract";

/**
 * Banner editing.
 *
 * Every action re-checks authorisation. A server action is a public endpoint —
 * the nav item being hidden has never been access control.
 */

async function requireEditor(): Promise<string> {
  const session = await auth();
  assertCan(session?.user.role, "content");
  return session?.user.email ?? "unknown";
}

export async function actionSaveTemplate(input: {
  id?: string;
  name: string;
  columns: number;
  rows: number;
  cells: GridCell[];
  aspect: string | null;
}) {
  const actor = await requireEditor();
  const result = await saveTemplate(input, actor);
  if (result.ok) revalidatePath("/admin/banners/templates");
  return result;
}

export async function actionDeleteTemplate(id: string) {
  await requireEditor();
  const result = await deleteTemplate(id);
  if (result.ok) revalidatePath("/admin/banners/templates");
  return result;
}
