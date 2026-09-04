import "server-only";
import { prisma } from "@/lib/prisma";
import { sendTemplateMail } from "@/lib/mail/send-template";
import { mailUrls } from "@/lib/mail/urls";
import { siteOrigin } from "@/lib/seo/urls";

/**
 * «Η παραγγελία παραδόθηκε».
 *
 * Κλείνει τον ιχνηλάτη — το τέταρτο βήμα που έμενε σβηστό για πάντα — και
 * ζητά έλεγχο των ειδών όσο η προθεσμία αλλαγής τρέχει ακόμη. Ένα δέμα που
 * ανοίγεται τρεις βδομάδες αργότερα με λάθος κωδικό μέσα είναι πρόβλημα που
 * θα μπορούσε να είχε λυθεί την πρώτη μέρα.
 *
 * Δεν υπόσχεται παραστατικό PDF: δεν υπάρχει τέτοιο αρχείο πουθενά στο
 * κατάστημα ούτε στο HDCtool, και ένα κουμπί «κατεβάστε την απόδειξη» που
 * βγάζει σε 404 είναι χειρότερο από την απουσία του. Τα κουμπιά δείχνουν στη
 * σελίδα της παραγγελίας, όπου υπάρχουν όλα όσα κρατάμε.
 */

const money = (value: unknown) => `${Number(value).toFixed(2).replace(".", ",")} €`;

function stamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Athens",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}, ${get("hour")}:${get("minute")}`;
}

export async function sendDeliveredEmail(orderNumber: string) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { lines: true },
  });
  if (!order) return { ok: false as const, error: "Η παραγγελία δεν βρέθηκε." };

  const link = `${siteOrigin()}/checkout/epibebaiosi/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.guestToken)}`;
  const urls = mailUrls();

  return sendTemplateMail({
    to: order.email,
    templateId: "order-delivered",
    subject: `Η παραγγελία ${order.orderNumber} παραδόθηκε`,
    preheader: "Ελέγξτε τα είδη σας. Πρόβλημα; Απαντήστε σε αυτό το email.",
    context: order.orderNumber,
    data: {
      recipient: {
        first_name: order.firstName,
        last_name: order.lastName,
        email: order.email,
      },
      order: {
        number: order.orderNumber,
        date: stamp(order.createdAt),
        url: link,
        items: order.lines.map((line) => ({
          brand: line.brand ?? "",
          sku: line.sku,
          name: line.name,
          qty: String(line.quantity),
          unit_price: money(line.unitNet),
          line_total: money(line.lineNet),
          image: line.imageUrl ?? "",
        })),
      },
      delivery: {
        at: order.deliveredAt ? stamp(order.deliveredAt) : stamp(new Date()),
        /*
         * Πού παραδόθηκε: η διεύθυνση που δηλώθηκε. Η ACS επιστρέφει και
         * `delivery_info` (ποιος παρέλαβε), αλλά δεν το γράφουμε σε email —
         * είναι όνομα τρίτου προσώπου, συχνά γείτονα ή θυρωρού.
         */
        where: `${order.shipLine1}, ${order.shipPostcode} ${order.shipCity}`,
        /* Δεν υπάρχει PDF παραστατικού· ο σύνδεσμος πάει στην παραγγελία. */
        invoice_url: link,
        reorder_url: link,
        returns_url: urls.support,
        warranty_url: urls.support,
      },
    },
    text: [
      `Η παραγγελία ${order.orderNumber} παραδόθηκε`,
      "",
      `Παράδοση: ${order.deliveredAt ? stamp(order.deliveredAt) : stamp(new Date())}`,
      `Διεύθυνση: ${order.shipLine1}, ${order.shipPostcode} ${order.shipCity}`,
      "",
      "Ελέγξτε τα είδη σας. Αν κάτι δεν είναι σωστό, απαντήστε σε αυτό το email",
      "ή καλέστε στο +30 210 411 1355.",
      "",
      `Η παραγγελία σας: ${link}`,
    ].join("\n"),
  });
}
