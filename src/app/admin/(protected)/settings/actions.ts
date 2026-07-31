"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { SETTINGS } from "@/lib/settings/registry";
import { setSetting } from "@/lib/settings/settings";

export type SaveResult = { ok: boolean; saved: number; errors: string[] };

/**
 * Save the settings form.
 *
 * Authorisation is checked here, not only on the page: a server action is a
 * public endpoint, and a hidden nav item has never been an access control.
 *
 * Only keys present in the form are considered, and only ones whose value
 * actually changed are written — so an audit entry means something happened,
 * rather than recording that somebody opened the page and pressed save.
 *
 * The audit trail records WHICH setting changed and never the value: writing
 * the new Viva secret into a log table would undo the encryption it was just
 * given.
 */
export async function saveSettings(formData: FormData): Promise<SaveResult> {
  const session = await auth();
  assertCan(session?.user.role, "settings");
  const actor = session?.user.email ?? "unknown";

  const errors: string[] = [];
  const changed: string[] = [];

  for (const def of SETTINGS) {
    const raw = formData.get(def.key);
    if (typeof raw !== "string") continue;

    // Blank secret means "unchanged" — see setSetting. Skipping it here too
    // keeps it out of the audit trail, which would otherwise claim a change on
    // every save.
    if (def.secret && raw.trim() === "") continue;

    const result = await setSetting(def.key, raw, actor);
    if (result.ok) changed.push(def.key);
    else errors.push(result.error);
  }

  if (changed.length > 0) {
    await prisma.adminAuditLog.create({
      data: {
        userId: session!.user.id,
        action: "settings.update",
        entity: "Setting",
        entityId: changed.join(",").slice(0, 255),
        // Keys only, never values — writing the new Viva secret into an audit
        // table would undo the encryption it was just given.
        diff: { keys: changed },
      },
    });
  }

  revalidatePath("/admin/settings");
  return { ok: errors.length === 0, saved: changed.length, errors };
}
