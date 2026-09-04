import "server-only";
import { prisma } from "@/lib/prisma";
import { sendB2bApprovedEmail } from "@/lib/mail/account-emails";
import { HdctoolError, hdctoolRequest } from "@/lib/hdctool/client";

/**
 * Approving a B2B account.
 *
 * Identity lives in this database, but a company that may be invoiced has to
 * exist in SoftOne — and its discount is an ERP fact, not a number this app
 * invents. So approval is TWO steps, in this order:
 *
 *   1. ensure the customer in SoftOne through HDCtool (it owns the ERP link)
 *      and take back the TRDR
 *   2. only then flip the company and its owner to `active`
 *
 * The order matters. Approving first and syncing second would leave a company
 * with partner prices on the storefront and no customer record to invoice
 * against — the failure that ends in an order nobody can bill.
 *
 * `partnerFactor` is written from what the ERP returns. If it returns nothing,
 * the account is approved WITHOUT a discount rather than with a guessed one:
 * a wrong discount is a wrong invoice.
 */

export type ApprovalResult =
  | { ok: true; trdr: number | null; partnerFactor: number | null }
  | { ok: false; error: "not_found" | "already_active" | "erp_failed"; detail?: string };

/**
 * HDCtool H5 — ΑΦΜ in, SoftOne customer ensured, TRDR out.
 *
 * `outcome` distinguishes a company that was already known to the ERP from one
 * we just created, and `source` says which layer answered: the HDCtool customer
 * table, SoftOne itself, or the AADE registry. Both are recorded rather than
 * used for control flow — when an approval is questioned months later, "found
 * in SoftOne" and "created by us" are very different stories.
 *
 * No `discountPercent`: there is no per-customer discount anywhere in HDCtool
 * or SoftOne today. The field stays in the type because the endpoint is where
 * it will appear if customer price lists are ever exposed, and until then
 * `partnerFactor` stays null rather than guessed.
 */
type EnsureCustomerResponse = {
  success: boolean;
  found?: boolean;
  outcome?: "found" | "created";
  source?: "database" | "softone" | "wwa";
  trdr?: number | null;
  discountPercent?: number;
  error?: string;
};

export async function approveCompany(
  companyId: string,
  approvedBy: string,
): Promise<ApprovalResult> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { ok: false, error: "not_found" };
  if (company.status === "active") return { ok: false, error: "already_active" };

  // ── 1. The ERP, first ──
  let ensured: EnsureCustomerResponse;
  try {
    ensured = await hdctoolRequest<EnsureCustomerResponse>("/api/public/erp/customer", {
      afm: company.afm,
      name: company.name,
      doy: company.doy,
      profession: company.profession,
      address: company.billAddress,
      city: company.billCity,
      zip: company.billPostcode,
      phone: company.phone,
      // Approval is the moment the ERP customer should exist. The endpoint
      // defaults this to false so that a lookup at registration or checkout
      // never leaves a phantom TRDR behind for someone who abandoned a basket —
      // but an approved partner is a real business relationship, and the
      // company cannot be invoiced without a customer record.
      createIfMissing: true,
      orderRef: `eshop-approval:${company.id}`,
    });
  } catch (error) {
    const detail =
      error instanceof HdctoolError
        ? `${error.endpoint} → ${error.status}`
        : "unreachable";
    console.error("[approval] ERP ensure failed", error);
    return { ok: false, error: "erp_failed", detail };
  }

  if (!ensured.success) {
    return { ok: false, error: "erp_failed", detail: ensured.error ?? "rejected" };
  }

  const trdr = ensured.trdr ?? company.erpTrdr ?? null;

  // Kept as a record of HOW this company reached the ERP. When an approval is
  // questioned later, "already existed in SoftOne" and "created by this
  // approval" are the two answers worth being able to give.
  console.info(
    `[approval] ${company.afm} → ${ensured.outcome ?? "?"}` +
      `${ensured.source ? ` (${ensured.source})` : ""} trdr=${trdr ?? "—"}`,
  );

  const partnerFactor =
    typeof ensured.discountPercent === "number" &&
    ensured.discountPercent > 0 &&
    ensured.discountPercent < 100
      ? Number((1 - ensured.discountPercent / 100).toFixed(3))
      : null;

  // ── 2. Only now, the storefront ──
  await prisma.$transaction([
    prisma.company.update({
      where: { id: company.id },
      data: {
        status: "active",
        erpTrdr: trdr,
        partnerFactor,
        approvedBy,
        approvedAt: new Date(),
      },
    }),
    // The owner was held at `pending` so they could not sign in before the
    // account existed. They can now.
    prisma.customer.updateMany({
      where: { companyId: company.id, status: "pending" },
      data: { status: "active" },
    }),
  ]);

  /*
   * Η έγκριση φτάνει στον άνθρωπο που την περίμενε.
   * ───────────────────────────────────────────────────────────────────────────
   * Μέχρι τώρα φαινόταν μόνο σε όποιον τύχαινε να ξαναδοκιμάσει να συνδεθεί.
   * Κάποιος που περίμενε δύο μέρες δεν είχε λόγο να ξαναδοκιμάσει, και οι
   * τιμές συνεργάτη έμεναν ανενεργές επειδή κανείς δεν του είπε ότι ενεργοποιήθηκαν.
   *
   * Στέλνεται στους κατόχους — στην πράξη έναν, τον owner που έκανε την
   * εγγραφή — και μετά την ολοκλήρωση της συναλλαγής: η έγκριση ισχύει ό,τι
   * κι αν κάνει το Mailgun.
   */
  const owners = await prisma.customer.findMany({
    where: { companyId: company.id, role: "owner" },
    select: { firstName: true, lastName: true, email: true },
  });
  for (const owner of owners) {
    await sendB2bApprovedEmail(
      { firstName: owner.firstName ?? "", lastName: owner.lastName ?? "", email: owner.email },
      { name: company.name, erpTrdr: trdr, partnerFactor },
    );
  }

  return { ok: true, trdr, partnerFactor };
}

/**
 * Rejecting an application.
 *
 * Nothing is sent to the ERP: a rejected company must not leave a customer
 * record behind in SoftOne.
 */
export async function rejectCompany(
  companyId: string,
  rejectedBy: string,
  reason: string,
): Promise<{ ok: boolean }> {
  await prisma.$transaction([
    prisma.company.update({
      where: { id: companyId },
      data: { status: "rejected", approvedBy: rejectedBy, approvedAt: new Date(), notes: reason },
    }),
    prisma.customer.updateMany({
      where: { companyId, status: "pending" },
      data: { status: "rejected" },
    }),
    prisma.customerSession.deleteMany({ where: { customer: { companyId } } }),
  ]);
  return { ok: true };
}
