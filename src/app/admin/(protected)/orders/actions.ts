"use server";

import { revalidatePath } from "next/cache";
import { sendOrderToErp, type SendToErpResult } from "@/lib/orders/send-to-erp";

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
