"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, ROLES, type Capability } from "@/lib/rbac";
import { saveRoleCapabilities } from "@/lib/admin/roles";
import {
  createAdminUser,
  resetAdminPassword,
  setAdminUserActive,
  unlockAdminUser,
  updateAdminUser,
  type ActionResult,
} from "@/lib/admin/users";

/**
 * Users and roles.
 *
 * Every action re-checks `users` against the live role (see `auth()`), so an
 * operator demoted a minute ago cannot finish the dialog they had open. The
 * rules about who may change whom live in `lib/admin/users.ts`.
 */

async function requireUsers() {
  const session = await auth();
  assertCan(session?.user.role, "users");
  return { id: session!.user.id, email: session!.user.email ?? "unknown" };
}

function refresh() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/users/roles");
}

export async function actionCreateUser(input: {
  email: string;
  name: string;
  role: string;
  password: string;
}): Promise<ActionResult> {
  const actor = await requireUsers();
  const result = await createAdminUser(input, actor);
  refresh();
  return result;
}

export async function actionUpdateUser(id: string, input: { name: string; role: string }): Promise<ActionResult> {
  const actor = await requireUsers();
  const result = await updateAdminUser(id, input, actor);
  refresh();
  return result;
}

export async function actionSetActive(id: string, active: boolean): Promise<ActionResult> {
  const actor = await requireUsers();
  const result = await setAdminUserActive(id, active, actor);
  refresh();
  return result;
}

export async function actionResetPassword(id: string, password: string): Promise<ActionResult> {
  const actor = await requireUsers();
  const result = await resetAdminPassword(id, password, actor);
  refresh();
  return result;
}

export async function actionUnlock(id: string): Promise<ActionResult> {
  const actor = await requireUsers();
  const result = await unlockAdminUser(id, actor);
  refresh();
  return result;
}

export async function actionSaveRoles(matrix: Record<string, string[]>): Promise<ActionResult> {
  const actor = await requireUsers();

  let changedRoles = 0;
  for (const role of ROLES) {
    if (role === "ADMIN" || !matrix[role]) continue;
    const { before, after } = await saveRoleCapabilities(role, matrix[role], actor.id);
    const added = after.filter((c) => !before.includes(c));
    const removed = before.filter((c: Capability) => !after.includes(c));
    if (added.length === 0 && removed.length === 0) continue;
    changedRoles += 1;
    await prisma.adminAuditLog.create({
      data: { userId: actor.id, action: "role.update", entity: "AdminRole", entityId: role, diff: { role, added, removed } },
    });
  }

  refresh();
  // Nav visibility depends on the matrix, so every admin page is stale.
  revalidatePath("/admin", "layout");
  return {
    ok: true,
    message: changedRoles === 0 ? "Καμία αλλαγή." : "Τα δικαιώματα ενημερώθηκαν — ισχύουν από το επόμενο κλικ.",
  };
}
