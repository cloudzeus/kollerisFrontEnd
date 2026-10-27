import { mailProductImage } from "@/lib/mail/product-image";
import "server-only";
import { prisma } from "@/lib/prisma";
import { sendTemplateMail } from "@/lib/mail/send-template";
import { siteOrigin } from "@/lib/seo/urls";
import { chargeableWeight } from "@/lib/shipping/acs-tariff";
import { localityLine } from "@/lib/shipping/countries";
import { trackingFor } from "@/lib/shipping/tracking";
import { emailLocale, formatMoney, formatStamp, pick, type EmailLocale } from "@/lib/mail/email-locale";

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



export async function sendShippedEmail(
  orderNumber: string,
  voucherNo: string,
  options: { locale?: EmailLocale } = {},
) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { lines: true },
  });
  if (!order) return { ok: false as const, error: "Η παραγγελία δεν βρέθηκε." };

  const locale = emailLocale(order, options.locale);
  const t = pick(locale);
  const money = (value: unknown) => formatMoney(locale, value);
  const stamp = (date: Date) => formatStamp(locale, date);

  const link = `${siteOrigin()}${locale === "en" ? "/en" : ""}/checkout/epibebaiosi/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.guestToken)}`;

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
  /* ACS, or DHL Express abroad with HDCtool's tracking link (docs/dhl-express.md §3). */
  const tracking = trackingFor(order, voucherNo);
  const dhlEta = tracking.carrier === "DHL" && typeof quote?.etaDays === "string" ? quote.etaDays : null;

  return sendTemplateMail({
    to: order.email,
    templateId: "order-shipped",
    locale,
    subject: t(`Η παραγγελία ${order.orderNumber} απεστάλη`, `Your order ${order.orderNumber} has shipped`),
    preheader: `${tracking.carrier === "DHL" ? "DHL Express" : "ACS"} · ${voucherNo}${
      dhlEta
        ? t(` · παράδοση σε ${dhlEta} εργάσιμες`, ` · delivery in ${dhlEta} working days`)
        : Number.isFinite(etaDays) && etaDays > 0
          ? t(` · παράδοση σε ${etaDays} εργάσιμες`, ` · delivery in ${etaDays} working days`)
          : ""
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
          image: mailProductImage(line.imageUrl),
        })),
        shipping: {
          name: `${order.firstName} ${order.lastName}`.trim(),
          line1: order.shipLine1 + (order.shipLine2 ? `, ${order.shipLine2}` : ""),
          line2: localityLine(order.shipPostcode, order.shipCity, order.shipCountry, locale),
          phone: order.phone,
        },
      },
      shipment: {
        courier: tracking.courier,
        tracking: voucherNo,
        tracking_url: tracking.url,
        eta: dhlEta
          ? t(`${dhlEta} εργάσιμες`, `${dhlEta} working days`)
          : Number.isFinite(etaDays) && etaDays > 0
            ? t(
                `${etaDays} ${etaDays === 1 ? "εργάσιμη" : "εργάσιμες"}`,
                `${etaDays} working ${etaDays === 1 ? "day" : "days"}`,
              )
            : t("1–3 εργάσιμες", "1–3 working days"),
        /* Ένα voucher ανά παραγγελία — το ίδιο το `createVoucherForOrder` το
           επιβάλλει, γιατί δεύτερο voucher σημαίνει δεύτερο δέμα. */
        packages: "1",
        weight: `${locale === "en" ? weight.chargeableKg.toFixed(2) : weight.chargeableKg.toFixed(2).replace(".", ",")} kg`,
        /* Το παραστατικό δεν επισυνάπτεται ακόμη — εκδίδεται στο ERP και δεν
           φτάνει εδώ. Λέγεται πού βρίσκεται αντί να υποσχεθεί συνημμένο που
           δεν υπάρχει. */
        document: order.wantsInvoice ? t("Τιμολόγιο", "Invoice") : t("Απόδειξη", "Receipt"),
        /* Τμηματικές παραδόσεις δεν υπάρχουν: ένα δέμα, όλα τα είδη μέσα. */
        backorder: "",
      },
    },
    text: [
      t(`Η παραγγελία ${order.orderNumber} απεστάλη`, `Your order ${order.orderNumber} has shipped`),
      "",
      `Courier: ${tracking.courier} · ${t("Αριθμός αποστολής", "Tracking number")}: ${voucherNo}`,
      `${t("Παρακολούθηση", "Track the parcel")}: ${tracking.url}`,
      "",
      ...order.lines.map((l) => `${l.quantity} × ${l.name}`),
      "",
      `${t("Η παραγγελία σας", "Your order")}: ${link}`,
    ].join("\n"),
  });
}
