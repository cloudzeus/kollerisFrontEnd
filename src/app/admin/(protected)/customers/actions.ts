"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { approveCompany, rejectCompany } from "@/lib/account/approval";

/**
 * B2B approval.
 *
 * Both actions delegate to `approval.ts`, which does the part that matters:
 * approval ensures the customer in SoftOne FIRST and only then flips the
 * company active, so a partner can never end up buying at partner prices with
 * no customer record to invoice against. Rejection touches the ERP not at all.
 *
 * The dashboard counts pending applications, so it revalidates too.
 */

async function requireCustomers(): Promise<string> {
  const session = await auth();
  assertCan(session?.user.role, "customers");
  return session?.user.email ?? "unknown";
}

function refresh() {
  revalidatePath("/admin/customers");
  revalidatePath("/admin");
}

export async function actionApprove(companyId: string) {
  const actor = await requireCustomers();
  const result = await approveCompany(companyId, actor);
  refresh();

  if (result.ok) {
    return {
      ok: true as const,
      trdr: result.trdr,
      partnerFactor: result.partnerFactor,
    };
  }

  // The ERP failure is the one worth naming: it means the company is still
  // pending, not that the click did nothing.
  const message =
    result.error === "erp_failed"
      ? `Το SoftOne απέρριψε τη δημιουργία πελάτη${result.detail ? ` — ${result.detail}` : ""}. Η εταιρεία παραμένει σε αναμονή.`
      : result.error === "already_active"
        ? "Η εταιρεία είναι ήδη ενεργή."
        : "Η εταιρεία δεν βρέθηκε.";

  return { ok: false as const, error: message };
}

export async function actionReject(companyId: string, reason: string) {
  const actor = await requireCustomers();
  await rejectCompany(companyId, actor, reason.trim().slice(0, 1000));
  refresh();
  return { ok: true as const };
}
