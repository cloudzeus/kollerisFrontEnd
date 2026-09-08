import "server-only";
import { prisma } from "@/lib/prisma";
import { athensDayOf } from "@/lib/courier/pickup-date";
import type { AcsVoucher } from "@/lib/courier/acs";

/**
 * Τα αποστολικά που εκδώσαμε εμείς, από τη δική μας βάση.
 *
 * ── Γιατί δεν αρκεί η ACS ──────────────────────────────────────────────────
 *
 * Η σανίδα ρωτούσε την ACS «τι έφυγε αυτή τη μέρα» και έπαιρνε πάντα κενό.
 * Ο λόγος δεν ήταν δικός μας: η μέθοδος που απαριθμεί τα αποστολικά μιας
 * ημέρας **δεν είναι ενεργοποιημένη στον λογαριασμό**. Δοκιμάστηκαν και οι έξι
 * ονομασίες που ξέρει το HDCtool — `ACS_Display_Voucher`,
 * `ACS_Display_Vouchers_On_Mass`, `ACS_Mass_Display_Voucher` και οι υπόλοιπες —
 * και όλες απαντούν «Definition not found or you dont have access to it».
 *
 * Μετρημένο ζωντανά: το αποστολικό 9805563515 της KOL-20260907-0001 εκδόθηκε
 * στις 17:10, τυπώνεται κανονικά (PDF 177 KB), και η λίστα της ίδιας μέρας
 * επέστρεφε μηδέν. Το δέμα υπήρχε· η οθόνη έλεγε ότι δεν υπάρχει.
 *
 * ── Γιατί αυτό είναι η σωστή πηγή ──────────────────────────────────────────
 *
 * Κάθε αποστολικό αυτού του καταστήματος γεννιέται εδώ, και ο αριθμός του
 * γράφεται στην παραγγελία την ίδια στιγμή. Δεν χρειάζεται να ρωτήσουμε την
 * ACS τι στείλαμε — το ξέρουμε. Η ACS μένει αρμόδια για ό,τι ΜΟΝΟ αυτή ξέρει:
 * πού βρίσκεται το δέμα, και σε ποια λίστα παραλαβής μπήκε.
 *
 * Έτσι η σανίδα δουλεύει και όταν η ACS δεν απαντά — που είναι ακριβώς η μέρα
 * που κάποιος θέλει να δει τι έχει φύγει.
 */

/**
 * Παλιά αποστολικά δεν έχουν αποθηκευμένη ημερομηνία παραλαβής.
 *
 * Το `acsPickupDate` προστέθηκε μαζί με τον κανόνα των 15:30· πριν από αυτό, η
 * ημερομηνία που στελνόταν στην ACS ήταν η μέρα της έκδοσης. Άρα το `shippedAt`
 * είναι η σωστή απάντηση για εκείνες τις γραμμές — όχι εικασία, ό,τι ακριβώς
 * έστελνε ο τότε κώδικας.
 */
function pickupDayOf(row: { acsPickupDate: string | null; shippedAt: Date | null }): string | null {
  if (row.acsPickupDate?.trim()) return row.acsPickupDate.trim();
  return row.shippedAt ? athensDayOf(row.shippedAt) : null;
}

export type OwnVoucher = AcsVoucher & { orderNumber: string };

export async function listOwnVouchersForDate(date: string): Promise<OwnVoucher[]> {
  /*
   * Το παράθυρο είναι φαρδύ επίτηδες. Το `shippedAt` είναι στιγμή σε UTC και η
   * ημέρα ζητείται σε ώρα Ελλάδας· ένα ακριβές `between` θα έκοβε τις πρώτες
   * ώρες κάθε μέρας. Το κόψιμο γίνεται μετά, με το ημερολόγιο της Αθήνας.
   */
  const from = new Date(`${date}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${date}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 2);

  const orders = await prisma.order.findMany({
    where: {
      acsVoucherNo: { not: null },
      OR: [{ acsPickupDate: date }, { shippedAt: { gte: from, lt: to } }],
    },
    select: {
      orderNumber: true,
      acsVoucherNo: true,
      acsPickupDate: true,
      shippedAt: true,
      firstName: true,
      lastName: true,
      companyName: true,
      shipLine1: true,
      shipCity: true,
      shipPostcode: true,
      deliveredAt: true,
    },
    orderBy: { shippedAt: "desc" },
  });

  const result: OwnVoucher[] = [];
  for (const o of orders) {
    if (pickupDayOf(o) !== date) continue;
    result.push({
      voucherNo: o.acsVoucherNo!,
      orderNumber: o.orderNumber,
      recipient:
        `${o.firstName} ${o.lastName}`.trim() || o.companyName || o.orderNumber,
      address: o.shipLine1,
      area: o.shipCity,
      zipCode: o.shipPostcode,
      delivered: o.deliveredAt != null,
      /* Κατάσταση και λίστα παραλαβής τα ξέρει μόνο η ACS· μένουν κενά μέχρι
         να τα συμπληρώσει εκείνη. Κενό δεν σημαίνει «δεν υπάρχει». */
      status: null,
      pickupListNo: null,
    });
  }
  return result;
}
