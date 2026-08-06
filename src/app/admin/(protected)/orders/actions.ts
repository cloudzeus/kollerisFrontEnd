"use server";

import { revalidatePath } from "next/cache";
import { sendOrderToErp, type SendToErpResult } from "@/lib/orders/send-to-erp";
import { createVoucherForOrder, type VoucherResult } from "@/lib/courier/create-for-order";

/**
 * The action behind "Αποστολή στο SoftOne", which until now had none.
 *
 * Thin on purpose: the decision about what may be sent, and the record of what
 * happened, both belong to `sendOrderToErp`. This exists to give the admin
 * table something it can call and to refresh the rows afterwards, so the ERP
 * column stops saying "δεν έχει σταλεί" the moment it stops being true.
 */
export async function pushOrderToErp(orderNumber: string): Promise<SendToErpResult> {
  const result = await sendOrderToErp(orderNumber);

  // Refreshed on failure too: `erpError` is now on the order and the row shows
  // it, which is the difference between a lost click and a legible problem.
  revalidatePath("/admin/orders");
  revalidatePath("/admin");

  return result;
}

/**
 * Issue the ACS voucher for one order.
 *
 * Lives beside the ERP push because they are the two things an order needs
 * after it is paid, and both were missing their wire. The dispatch board at
 * `/admin/courier` reads what this produces.
 */
export async function createOrderVoucher(orderNumber: string): Promise<VoucherResult> {
  const result = await createVoucherForOrder(orderNumber);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/courier");
  revalidatePath("/admin");
  return result;
}
