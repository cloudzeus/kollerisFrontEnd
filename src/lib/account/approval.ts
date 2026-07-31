import "server-only";
import { prisma } from "@/lib/prisma";
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

/** HDCtool H5 — ΑΦΜ in, SoftOne customer ensured, TRDR out. */
type EnsureCustomerResponse = {
  success: boolean;
  trdr?: number;
  /** Discount percentage the ERP holds for this customer, when it has one. */
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
      // Already known when the ΑΦΜ lookup at registration matched an existing
      // customer — passing it lets HDCtool update rather than create.
      trdr: company.erpTrdr,
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
