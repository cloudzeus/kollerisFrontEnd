"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { setNotes, setStatus } from "@/lib/admin/inbox";

/**
 * Inbox actions.
 *
 * Authorisation in each one: a server action is a public endpoint.
 *
 * The dashboard's "new messages" card counts the same rows, so it is
 * revalidated too — an operator who clears the inbox should not go back to a
 * home page still telling them there is work.
 */

async function requireEngagement(): Promise<string> {
  const session = await auth();
  assertCan(session?.user.role, "engagement");
  return session?.user.email ?? "unknown";
}

function refresh() {
  revalidatePath("/admin/engagement");
  revalidatePath("/admin");
}

export async function actionSetStatus(
  id: string,
  status: "new" | "inProgress" | "answered" | "closed",
) {
  const actor = await requireEngagement();
  await setStatus(id, status, actor);
  refresh();
  return { ok: true as const };
}

export async function actionSetNotes(id: string, notes: string) {
  const actor = await requireEngagement();
  await setNotes(id, notes, actor);
  refresh();
  return { ok: true as const };
}
