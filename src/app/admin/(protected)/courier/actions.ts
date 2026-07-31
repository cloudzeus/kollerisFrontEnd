"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import * as acs from "@/lib/courier/acs";

/**
 * Dispatch desk actions.
 *
 * Authorisation is checked in each one: a server action is a public endpoint.
 *
 * Nothing here throws. Every ACS failure comes back as a message the screen
 * shows next to the parcel it belongs to — a courier API that is down should
 * not replace a dispatch screen with an error page in the middle of someone's
 * morning.
 */

async function requireOps(): Promise<void> {
  const session = await auth();
  assertCan(session?.user.role, "orders");
}

export async function actionPrintVoucher(voucherNo: string, printType: 1 | 2) {
  await requireOps();
  return acs.printVoucher(voucherNo, printType);
}

export async function actionPrintPickupList(massNumber: string, pickupDate: string) {
  await requireOps();
  return acs.printPickupList(massNumber, pickupDate);
}

export async function actionTrack(voucherNo: string) {
  await requireOps();
  return acs.trackVoucher(voucherNo);
}

export async function actionCancelVoucher(voucherNo: string) {
  await requireOps();
  const result = await acs.cancelVoucher(voucherNo);
  revalidatePath("/admin/courier");
  return result;
}

/**
 * Close the day.
 *
 * The only irreversible action on this screen: once issued, the courier expects
 * those parcels and the vouchers on the list can no longer be cancelled. The UI
 * confirms before calling this.
 */
export async function actionIssuePickupList(pickupDate: string) {
  await requireOps();
  const result = await acs.issuePickupList(pickupDate);
  revalidatePath("/admin/courier");
  return result;
}
