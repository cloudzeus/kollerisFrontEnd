import "server-only";
import { prisma } from "@/lib/prisma";
import { createVoucher } from "@/lib/courier/acs";
import { chargeableWeight } from "@/lib/shipping/acs-tariff";
import { sendShippedEmail } from "@/lib/mail/order-shipped-email";

/**
 * Turning a paid order into an ACS voucher.
 *
 * The dispatch screen at `/admin/courier` could already list vouchers, print
 * them, track them and cancel them. What it could not do was produce one:
 * `createVoucher` existed in the library and nothing in the codebase called it.
 * Four orders, zero vouchers — the board was empty because nothing had ever
 * been put on it, which reads exactly like a broken page.
 *
 * ── The address has to be split ─────────────────────────────────────────────
 *
 * ACS wants the street and the number in separate fields, as a string and an
 * integer. Customers type one line. So the number is taken from the end of the
 * address, which is where Greek addresses put it, and when there is none the
 * field gets 0 — ACS accepts that and a courier reads the street, whereas
 * refusing the parcel over a missing house number would be this software
 * deciding a real delivery cannot happen.
 *
 * ── Weight ──────────────────────────────────────────────────────────────────
 *
 * The same `chargeableWeight` the checkout quoted from, including the packing
 * headroom. Quoting one weight to the customer and declaring another to the
 * courier is how a shop discovers at the end of the month that it has been
 * paying the difference.
 */

export type VoucherResult =
  | { ok: true; voucherNo: string; alreadyIssued: boolean }
  | { ok: false; error: string };

/** ACS refuses anything lighter; a 200 g disc still travels in a real box. */
const MIN_WEIGHT_KG = 0.5;

/** `Λεωφ. Κηφισίας 124` → `{ street: "Λεωφ. Κηφισίας", number: 124 }`. */
export function splitAddress(line: string): { street: string; number: number } {
  const match = line.trim().match(/^(.*?)[\s,]+(\d+)\s*[Α-Ωα-ωA-Za-z]?$/);
  if (!match) return { street: line.trim(), number: 0 };
  return { street: match[1].trim(), number: Number(match[2]) };
}

/** Digits only; ACS types phones as integers and rejects `+30 694 …`. */
function phoneDigits(value: string | null | undefined): number {
  const digits = (value ?? "").replace(/\D/g, "").replace(/^0030/, "").replace(/^30(?=\d{10}$)/, "");
  const n = Number(digits.slice(-10));
  return Number.isFinite(n) ? n : 0;
}

export async function createVoucherForOrder(orderNumber: string): Promise<VoucherResult> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { lines: true },
  });
  if (!order) return { ok: false, error: "Η παραγγελία δεν βρέθηκε." };

  /*
   * One parcel per order. A second voucher for the same sale is a second
   * parcel ACS will collect, invoice and try to deliver.
   */
  if (order.acsVoucherNo) {
    return { ok: true, voucherNo: order.acsVoucherNo, alreadyIssued: true };
  }

  if (order.paymentStatus !== "PAID") {
    return { ok: false, error: "Η παραγγελία δεν είναι πληρωμένη." };
  }

  const { street, number } = splitAddress(order.shipLine1);

  const weight = chargeableWeight(
    order.lines.map((line) => ({
      quantity: line.quantity,
      weight: line.weightKg == null ? null : Number(line.weightKg),
      width: null,
      length: null,
      height: null,
    })),
  );

  const zip = Number(order.shipPostcode.replace(/\D/g, ""));

  const result = await createVoucher({
    pickupDate: new Date().toISOString().slice(0, 10),
    sender: process.env.ACS_SENDER_NAME ?? "KOLLERIS",
    recipientName: `${order.firstName} ${order.lastName}`.trim(),
    recipientAddress: street,
    recipientAddressNumber: number,
    recipientZipcode: Number.isFinite(zip) ? zip : 0,
    recipientRegion: order.shipCity,
    recipientPhone: phoneDigits(order.phone),
    recipientCellPhone: phoneDigits(order.phone) || null,
    recipientCountry: "GR",
    recipientCompanyName: order.companyName,
    recipientEmail: order.email,
    itemQuantity: 1,
    weight: Math.max(MIN_WEIGHT_KG, Number(weight.chargeableKg.toFixed(2))),
    deliveryNotes: order.notes?.slice(0, 200) ?? null,
    /*
     * The order number travels with the parcel. It is what ties an ACS
     * checkpoint, a customer asking "where is it", and a row in this database
     * to one another without anybody matching on a name and a city.
     */
    referenceKey1: order.orderNumber,
    language: "GR",
    /*
     * No COD. Cash on delivery is not offered by this shop — the order is paid
     * before a voucher exists, and sending an amount here would ask the courier
     * to collect money that has already been taken.
     */
    codAmount: null,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const voucherNo = (result.data as { result?: { voucherNo?: string; errorMessage?: string } })
    ?.result?.voucherNo;
  const acsError = (result.data as { result?: { errorMessage?: string } })?.result?.errorMessage;

  if (!voucherNo) {
    return { ok: false, error: acsError?.trim() || "Η ACS δεν επέστρεψε αριθμό αποστολής." };
  }

  /*
   * Το voucher ΕΙΝΑΙ η αποστολή.
   * ───────────────────────────────────────────────────────────────────────────
   * Η κατάσταση έμενε για πάντα στο CONFIRMED: τίποτα σε όλο το κατάστημα δεν
   * έγραφε ποτέ SHIPPED ή DELIVERED. Ο πελάτης έβλεπε «Επιβεβαιώθηκε» ενώ το
   * δέμα ήταν στην ACS, ο ιχνηλάτης της παραγγελίας κρατούσε το βήμα «Έφυγε από
   * την αποθήκη» σβηστό — αν και η ετικέτα υπήρχε ήδη γραμμένη — και οι
   * αξιολογήσεις, που ζητούν παραληφθέν προϊόν, δεν θα ενεργοποιούνταν ποτέ.
   *
   * Η δημιουργία voucher είναι η στιγμή που το δέμα φεύγει· δεν χρειάζεται
   * δεύτερο κουμπί για να το πει κάποιος ξανά με το χέρι.
   *
   * ΜΟΝΟ προς τα εμπρός: μια ακυρωμένη ή αποτυχημένη παραγγελία δεν γίνεται
   * απεσταλμένη επειδή κάποιος τύπωσε ετικέτα κατά λάθος.
   */
  const advances = order.status === "CONFIRMED" || order.status === "PENDING_PAYMENT";
  const nextStatus = advances ? "SHIPPED" : order.status;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      acsVoucherNo: voucherNo,
      status: nextStatus,
      shippedAt: advances ? new Date() : undefined,
      history: {
        create: {
          status: nextStatus,
          actor: "admin",
          note: `ACS voucher ${voucherNo}`,
        },
      },
    },
  });

  /*
   * Η ειδοποίηση αποστολής φεύγει εδώ, και μόνο εδώ.
   * ───────────────────────────────────────────────────────────────────────────
   * Είναι η στιγμή που ο αριθμός αποστολής αποκτά νόημα: πριν από αυτήν δεν
   * υπάρχει τι να παρακολουθήσει ο πελάτης. Στέλνεται μόνο όταν η κατάσταση
   * όντως προχώρησε — ένα δεύτερο πάτημα σε παραγγελία που είχε ήδη voucher
   * επιστρέφει νωρίτερα, οπότε κανείς δεν λαμβάνει το ίδιο email δύο φορές.
   *
   * Η αποτυχία του email δεν αναιρεί την αποστολή: το δέμα έχει φύγει και η
   * ετικέτα έχει τυπωθεί, ό,τι κι αν πει το Mailgun.
   */
  if (advances) {
    await sendShippedEmail(order.orderNumber, voucherNo);
  }

  return { ok: true, voucherNo, alreadyIssued: false };
}
