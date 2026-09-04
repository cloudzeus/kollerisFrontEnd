import "server-only";
import { prisma } from "@/lib/prisma";
import { sendTemplateMail } from "@/lib/mail/send-template";
import { siteOrigin } from "@/lib/seo/urls";
import { chargeableWeight } from "@/lib/shipping/acs-tariff";

/**
 * «Η παραγγελία σας απεστάλη» — το email που δεν στελνόταν ποτέ.
 *
 * Το κατάστημα έβγαζε voucher ACS, περνούσε την παραγγελία σε SHIPPED, και ο
 * πελάτης δεν μάθαινε τίποτα: το επόμενο μήνυμα μετά την επιβεβαίωση ήταν η
 * ίδια η πόρτα του. Ο αριθμός αποστολής υπήρχε στη βάση και σε καμία οθόνη
 * που να τον στέλνει.
 *
 * ── Ο αριθμός είναι το μήνυμα ──────────────────────────────────────────────
 *
 * Το template τον βάζει σε mono, μεγάλο, πάνω από το fold, με κουμπί
 * παρακολούθησης δίπλα. Είναι το μόνο που θέλει κάποιος που περιμένει δέμα.
 */

/** Ο δημόσιος ιχνηλάτης της ACS — ο ίδιος σύνδεσμος με τη σελίδα παραγγελίας. */
function trackingUrl(voucherNo: string): string {
  return `https://www.acscourier.net/el/track-and-trace/?paramtracknr=${encodeURIComponent(voucherNo)}`;
}

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

export async function sendShippedEmail(orderNumber: string, voucherNo: string) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { lines: true },
  });
  if (!order) return { ok: false as const, error: "Η παραγγελία δεν βρέθηκε." };

  const link = `${siteOrigin()}/checkout/epibebaiosi/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.guestToken)}`;

  /*
   * Το ίδιο βάρος που δηλώθηκε στην ACS και που κοστολογήθηκε στο ταμείο.
   * Τρία διαφορετικά βάρη για ένα δέμα είναι τρεις διαφορετικές αλήθειες.
   */
  const weight = chargeableWeight(
    order.lines.map((line) => ({
      quantity: line.quantity,
      weight: line.weightKg == null ? null : Number(line.weightKg),
      width: null,
      length: null,
      height: null,
    })),
  );

  const quote = order.shippingQuote as { etaDays?: unknown } | null;
  const etaDays = Number(quote?.etaDays);

  return sendTemplateMail({
    to: order.email,
    templateId: "order-shipped",
    subject: `Η παραγγελία ${order.orderNumber} απεστάλη`,
    preheader: `ACS · ${voucherNo}${
      Number.isFinite(etaDays) && etaDays > 0 ? ` · παράδοση σε ${etaDays} εργάσιμες` : ""
    }`,
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
        shipping: {
          name: `${order.firstName} ${order.lastName}`.trim(),
          line1: order.shipLine1 + (order.shipLine2 ? `, ${order.shipLine2}` : ""),
          line2: `${order.shipPostcode} ${order.shipCity}`,
          phone: order.phone,
        },
      },
      shipment: {
        courier: "ACS Courier",
        tracking: voucherNo,
        tracking_url: trackingUrl(voucherNo),
        eta:
          Number.isFinite(etaDays) && etaDays > 0
            ? `${etaDays} ${etaDays === 1 ? "εργάσιμη" : "εργάσιμες"}`
            : "1–3 εργάσιμες",
        /* Ένα voucher ανά παραγγελία — το ίδιο το `createVoucherForOrder` το
           επιβάλλει, γιατί δεύτερο voucher σημαίνει δεύτερο δέμα. */
        packages: "1",
        weight: `${weight.chargeableKg.toFixed(2).replace(".", ",")} kg`,
        /* Το παραστατικό δεν επισυνάπτεται ακόμη — εκδίδεται στο ERP και δεν
           φτάνει εδώ. Λέγεται πού βρίσκεται αντί να υποσχεθεί συνημμένο που
           δεν υπάρχει. */
        document: order.wantsInvoice ? "Τιμολόγιο" : "Απόδειξη",
        /* Τμηματικές παραδόσεις δεν υπάρχουν: ένα δέμα, όλα τα είδη μέσα. */
        backorder: "",
      },
    },
    text: [
      `Η παραγγελία ${order.orderNumber} απεστάλη`,
      "",
      `Courier: ACS · Αριθμός αποστολής: ${voucherNo}`,
      `Παρακολούθηση: ${trackingUrl(voucherNo)}`,
      "",
      ...order.lines.map((l) => `${l.quantity} × ${l.name}`),
      "",
      `Η παραγγελία σας: ${link}`,
    ].join("\n"),
  });
}
