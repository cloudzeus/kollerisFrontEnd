import { mailProductImage } from "@/lib/mail/product-image";
import "server-only";
import { prisma } from "@/lib/prisma";
import { paymentPageUrl } from "@/lib/payment/viva";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { renderTemplate } from "@/lib/mail/templates";
import { siteOrigin } from "@/lib/seo/urls";
import { holdHours } from "@/lib/orders/hold";
import { ALL_SHIPPING_METHODS, PAYMENT_METHODS } from "@/lib/cart/options";
import { localityLine } from "@/lib/shipping/countries";
import { euSalesCopy } from "@/lib/eu-sales/copy";
import {
  emailLocale,
  formatMoney,
  formatStamp,
  paymentLabelEn,
  pick,
  shippingLabelEn,
  type EmailLocale,
} from "@/lib/mail/email-locale";
import { REQUEST_ANSWER_HOURS, priceLines, readSnapshot, requestPath } from "@/lib/requests/model";

/**
 * Το email της παραγγελίας, από τα templates του Kolleris Email System.
 *
 * ── Τι άλλαξε και γιατί ────────────────────────────────────────────────────
 *
 * Μέχρι τώρα αυτό το αρχείο έχτιζε μόνο του HTML με το `layout.ts`: λευκή
 * κάρτα, μαύρο κουμπί, τίποτα από το design system. Τα 24 templates υπήρχαν
 * ήδη στο `src/emails/templates/` και τα χρησιμοποιούσε ΜΟΝΟ το newsletter —
 * δηλαδή ο πελάτης έβλεπε τη σχεδίαση της Kolleris στη διαφήμιση και μια
 * γενική φόρμα στο μόνο email που κρατά.
 *
 * ── Ένα γεγονός, ένα email ─────────────────────────────────────────────────
 *
 * Το κατάστημα στέλνει ΕΝΑ email ανά παραγγελία: από το checkout όταν η
 * παραγγελία μπαίνει σε αναμονή κατάθεσης, ή από το webhook όταν επιβεβαιωθεί
 * η πληρωμή. Άρα αυτό το email πρέπει να είναι ταυτόχρονα επιβεβαίωση και
 * απόδειξη — γι' αυτό δεν στέλνεται ποτέ το `payment-success`, που είναι
 * σκέτη απόδειξη χωρίς είδη και χωρίς διευθύνσεις. Είναι ακριβώς ο κανόνας
 * αλληλουχίας της μελέτης (§4): όταν η πληρωμή γίνεται μαζί με την παραγγελία,
 * φεύγει το `order-confirmation` με κατάσταση «Πληρωμένη».
 *
 *   • αναμονή κατάθεσης → `payment-pending-bank`
 *   • οτιδήποτε άλλο    → `order-confirmation` (η «πληρωμένη» εκδοχή του αν
 *                          τα χρήματα έχουν όντως εισπραχθεί)
 *
 * ── Τα ποσά έρχονται έτοιμα ────────────────────────────────────────────────
 *
 * Τα templates δεν κάνουν αριθμητική· δέχονται συμβολοσειρές («537,10 €»).
 * Ό,τι υπολογισμός χρειάζεται γίνεται εδώ, μία φορά, με τα ίδια νούμερα που
 * είδε ο πελάτης στο ταμείο.
 *
 * ── Τα στοιχεία τράπεζας είναι ρύθμιση, ποτέ κυριολεκτικό ──────────────────
 *
 * `BANK_TRANSFER_IBAN` και τα αδέρφια του. Ένα IBAN γραμμένο στον κώδικα
 * απέχει ένα τυπογραφικό λάθος από το να στείλει τα χρήματα κάποιου σε ξένο
 * λογαριασμό, και κανένα test εδώ δεν θα καταλάβαινε τη διαφορά.
 */

const BANK = {
  holder: process.env.BANK_TRANSFER_HOLDER ?? "",
  iban: process.env.BANK_TRANSFER_IBAN ?? "",
  bank: process.env.BANK_TRANSFER_BANK ?? "",
};

function bankConfigured(): boolean {
  return BANK.iban.trim().length > 0;
}


/** «04.09.2026, 10:12» — η μορφή που δείχνουν τα templates στο order-head. */


export type OrderEmailOutcome = { ok: true; id: string } | { ok: false; error: string };

/**
 * A split cart, in the order emails (docs/backorder-requests.md §1).
 *
 * The in-stock half is paid and shipped as this order; the rest is a
 * back-order request with `parentOrderNumber` = this order. The receipt says
 * so in its own section — which items, their indicative value, the request
 * number and its page, and that they ship separately with their own postage,
 * confirmed in the offer — so the customer never wonders why the amount
 * charged is smaller than the basket was. An ACCEPTED request, once paid, is
 * an order too: its receipt says it is the second shipment.
 *
 * `customer` links to the request's private page (the token is the
 * credential: the email then goes with Mailgun tracking off); `internal`
 * links to the admin and carries no secret.
 */
export type SplitSection = {
  title: string;
  paragraphs: string[];
  items: Array<{ name: string; sku: string; qty: string; amount: string }>;
  value_label: string;
  value: string;
  url: string;
  link_label: string;
  /** The other half's number, for subjects and plain text. */
  number: string;
  /** The url carries a secret (request token or guest token). */
  secret: boolean;
};

export async function splitSection(
  order: { orderNumber: string; parentOrderNumber: string | null },
  audience: "customer" | "internal",
  /* Only the customer's copy is ever English; the shop's stays Greek. */
  locale: EmailLocale = "el",
): Promise<SplitSection | null> {
  const admin = (n: string) => `${siteOrigin()}/admin/orders/${encodeURIComponent(n)}`;
  const t = pick(audience === "customer" ? locale : "el");
  const money = (value: unknown) => formatMoney(audience === "customer" ? locale : "el", value);
  const origin = audience === "customer" && locale === "en" ? `${siteOrigin()}/en` : siteOrigin();

  const child = await prisma.order.findFirst({
    where: { parentOrderNumber: order.orderNumber, requestStatus: { not: null } },
    select: { orderNumber: true, requestToken: true, requestLines: true },
  });
  if (child) {
    const snapshot = readSnapshot(child.requestLines);
    const lines = snapshot?.lines ?? [];
    const priced = priceLines(lines, 0);
    const value = money(priced.subtotalGross);
    const customerUrl = child.requestToken
      ? `${siteOrigin()}${requestPath(audience === "customer" && locale === "en" ? "en" : (snapshot?.locale ?? "el"), child.requestToken)}`
      : "";
    return {
      title: audience === "customer" ? t("Τα υπολοιπα ειδη του καλαθιου σας", "The rest of your basket") : "Μοιρασμενο καλαθι",
      paragraphs:
        audience === "customer"
          ? [
              t(
                `Τα προϊόντα που δεν υπήρχαν σε απόθεμα στάλθηκαν ως αίτημα ${child.orderNumber}, χωρίς χρέωση. Θα λάβετε πρόταση εντός ${REQUEST_ANSWER_HOURS} ωρών με τελική τιμή και χρόνο παράδοσης, και πληρώνετε μόνο αν την αποδεχτείτε.`,
                `The products that were out of stock were sent as request ${child.orderNumber}, free of charge. You will receive an offer within ${REQUEST_ANSWER_HOURS} hours with a final price and delivery time, and you only pay if you accept it.`,
              ),
              t(
                "Θα σταλούν χωριστά, σε δεύτερη αποστολή, με δικά τους μεταφορικά που θα επιβεβαιωθούν στην πρόταση. Το ποσό αυτής της παραγγελίας δεν τα περιλαμβάνει.",
                "They will ship separately, as a second shipment, with their own shipping cost confirmed in the offer. The amount of this order does not include them.",
              ),
            ]
          : [
              `Τα κατόπιν παραγγελίας του ίδιου καλαθιού έγιναν το αίτημα ${child.orderNumber} (ενδεικτική αξία ${value}). Χωριστή αποστολή· τιμή και μεταφορικά με την πρόταση από το HDCtool.`,
            ],
      items: lines.map((line, i) => ({
        name: line.name,
        sku: line.sku,
        qty: String(line.qty),
        amount: money(priced.lines[i]?.lineGross ?? 0),
      })),
      value_label: t("Ενδεικτικη αξια", "Indicative value"),
      value,
      url: audience === "customer" ? customerUrl : admin(child.orderNumber),
      link_label: audience === "customer" ? t(`Δειτε το αιτημα ${child.orderNumber}`, `View request ${child.orderNumber}`) : "Το αιτημα στη διαχειριση",
      number: child.orderNumber,
      secret: audience === "customer" && customerUrl !== "",
    };
  }

  if (order.parentOrderNumber) {
    const parent = await prisma.order.findUnique({
      where: { orderNumber: order.parentOrderNumber },
      select: { orderNumber: true, guestToken: true, totalGross: true },
    });
    if (!parent) return null;
    const customerUrl = `${origin}/checkout/epibebaiosi/${encodeURIComponent(parent.orderNumber)}?t=${encodeURIComponent(parent.guestToken)}`;
    return {
      title: t("Δευτερη αποστολη", "Second shipment"),
      paragraphs: [
        audience === "customer"
          ? t(
              `Αυτή η παραγγελία είναι η δεύτερη αποστολή του καλαθιού σας, με τα δικά της μεταφορικά. Τα διαθέσιμα προϊόντα προχώρησαν χωριστά με την παραγγελία ${parent.orderNumber} (${money(parent.totalGross)}).`,
              `This order is the second shipment of your basket, with its own shipping cost. The products that were available went ahead separately with order ${parent.orderNumber} (${money(parent.totalGross)}).`,
            )
          : `Αίτημα κατόπιν παραγγελίας που έγινε δεκτό και πληρώθηκε. Τα διαθέσιμα του ίδιου καλαθιού ήταν η παραγγελία ${parent.orderNumber} (${money(parent.totalGross)}) — χωριστή αποστολή.`,
      ],
      items: [],
      value_label: "",
      value: "",
      url: audience === "customer" ? customerUrl : admin(parent.orderNumber),
      link_label: t(`Η παραγγελια ${parent.orderNumber}`, `Order ${parent.orderNumber}`),
      number: parent.orderNumber,
      secret: audience === "customer",
    };
  }
  return null;
}

/** The split section as plain text lines. */
export function splitText(split: SplitSection | null): string[] {
  if (!split) return [];
  return [
    "",
    split.title.toUpperCase(),
    ...split.paragraphs,
    ...split.items.map((i) => `${i.qty} × ${i.name} (${i.sku}) — ${i.amount}`),
    ...(split.value ? [`${split.value_label}: ${split.value}`] : []),
    ...(split.url ? [`${split.link_label}: ${split.url}`] : []),
  ];
}

/**
 * Who the buyer is, for an order placed from another EU country — the shop's
 * copy of the notification only («ΕΕ — εταιρεία, VIES ✓ <n>», «ΕΕ — ιδιώτης»).
 * Empty on a Greek order and on any order from before EU sales.
 */
export function euBuyerLabel(order: {
  billCountry?: string | null;
  customerType?: string | null;
  vatMode?: string | null;
  viesConsultationNumber?: string | null;
}): string {
  if ((order.billCountry ?? "GR") === "GR" || !order.customerType) return "";
  if (order.customerType === "individual") return "ΕΕ — ιδιώτης";
  if (order.vatMode === "intra_eu_exempt") {
    return `ΕΕ — εταιρεία, VIES ✓ ${order.viesConsultationNumber ?? "—"}`;
  }
  // A company VIES would not vouch for: charged VAT like a consumer.
  return "ΕΕ — εταιρεία, χωρίς VIES ✓ (χρεώθηκε ΦΠΑ)";
}

/** What a line cost the customer: without VAT on an exempt order. */
export function lineAmount(
  order: { vatMode?: string | null },
  line: { lineNet: unknown; lineGross: unknown },
  locale: EmailLocale = "el",
): string {
  return formatMoney(locale, order.vatMode === "intra_eu_exempt" ? line.lineNet : line.lineGross);
}

/**
 * Φτιάχνει το μήνυμα χωρίς να το στείλει.
 *
 * Χωρισμένο από το `sendOrderEmail` ώστε αυτό που φτάνει σε πελάτη να μπορεί
 * να ιδωθεί πριν φτάσει. Το email είναι η μόνη επιφάνεια χωρίς staging: δεν
 * ξαναφορτώνεται, και ο τρόπος να μάθεις ότι κάτι σπάει στο Outlook δεν πρέπει
 * να είναι ένας πελάτης που σου το λέει.
 */
/**
 * Τα δεδομένα της παραγγελίας, έτοιμα για τα templates.
 *
 * Χωρίστηκε από το `buildOrderEmail` όταν χρειάστηκε δεύτερος παραλήπτης: η
 * ειδοποίηση προς το κατάστημα θέλει ΤΑ ΙΔΙΑ νούμερα με του πελάτη — τιμές
 * πριν την έκπτωση, μεταφορικά μαζί με τα έξοδα πληρωμής, συντελεστή ΦΠΑ μόνο
 * όταν είναι ένας. Αντιγραμμένος υπολογισμός σημαίνει δύο email που διαφωνούν
 * για το ίδιο ποσό, και το κατάστημα να εκτελεί με νούμερα που ο πελάτης δεν
 * είδε ποτέ.
 */
export async function buildOrderContext(orderNumber: string, options: { locale?: EmailLocale } = {}) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { lines: true },
  });
  if (!order) return null;

  /*
   * The customer's language (R-EMAIL-EN): English for an order shipped abroad
   * except Cyprus, Greek otherwise, an explicit choice winning. The shop's
   * notification reads the same context and ignores every string below that
   * depends on it — it is Greek, built from `orderData` only for its numbers.
   */
  const locale = emailLocale(order, options.locale);
  const t = pick(locale);
  const money = (value: unknown) => formatMoney(locale, value);
  const stamp = (date: Date) => formatStamp(locale, date);
  const label = (list: readonly { id: string; label: string }[], id: string) =>
    locale === "en"
      ? list === PAYMENT_METHODS
        ? paymentLabelEn(id)
        : shippingLabelEn(id)
      : (list.find((m) => m.id === id)?.label ?? id);

  const paid = order.paymentStatus === "PAID";
  const awaitingTransfer = !paid && order.paymentMethod === "bank";

  const link = `${siteOrigin()}${locale === "en" ? "/en" : ""}/checkout/epibebaiosi/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.guestToken)}`;

  /*
   * Οι γραμμές είναι ΚΑΘΑΡΕΣ, όπως και τα σύνολα.
   * ───────────────────────────────────────────────────────────────────────────
   * Το template διαβάζεται σαν παραστατικό: Υποσύνολο → Έκπτωση → Μεταφορικά →
   * ΦΠΑ → Σύνολο. Αν οι γραμμές είναι μεικτές και τα σύνολα καθαρά, ο πελάτης
   * βλέπει «1 × 3,00 €» και από κάτω «Υποσύνολο 2,42 €» — δύο νούμερα για το
   * ίδιο πράγμα, και το πρώτο συμπέρασμα είναι ότι κάπου υπάρχει λάθος.
   *
   * Η ίδια γλώσσα με το ταμείο, που δείχνει «Καθαρή αξία» πρώτη γραμμή.
   */
  const round2 = (n: number) => Math.round(n * 100) / 100;

  /*
   * Η έκπτωση γράφεται όπως σε τιμολόγιο: τιμή καταλόγου στη γραμμή, και μία
   * ρητή αφαίρεση στα σύνολα.
   *
   * Το `savingsGross` της παραγγελίας ΔΕΝ κάνει γι' αυτό — είναι το κέρδος
   * έναντι καταλόγου και είναι ΗΔΗ ενσωματωμένο στις τιμές των γραμμών, οπότε
   * ως αφαίρεση θα μετριόταν δύο φορές. Εδώ οι γραμμές δείχνουν την τιμή ΠΡΙΝ
   * και η έκπτωση αφαιρείται μία φορά, ώστε να ισχύει:
   *
   *     υποσύνολο − έκπτωση + μεταφορικά + ΦΠΑ = σύνολο
   *
   * και ταυτόχρονα:  άθροισμα γραμμών = υποσύνολο.
   */
  const priced = order.lines.map((line) => {
    const d = Number(line.discountPercent) || 0;
    const unitNet = Number(line.unitNet);
    const unitBefore = d > 0 ? round2(unitNet / (1 - d / 100)) : unitNet;
    return { line, unitBefore, lineBefore: round2(unitBefore * line.quantity) };
  });

  const items = priced.map(({ line, unitBefore, lineBefore }) => ({
    brand: line.brand ?? "",
    sku: line.sku,
    name: line.name,
    qty: String(line.quantity),
    unit_price: money(unitBefore),
    line_total: money(lineBefore),
    image: mailProductImage(line.imageUrl),
  }));

  const sumLineNet = round2(priced.reduce((t, p) => t + Number(p.line.lineNet), 0));
  const sumLineBefore = round2(priced.reduce((t, p) => t + p.lineBefore, 0));
  const discountNet = round2(sumLineBefore - sumLineNet);
  const discounted = discountNet > 0.004;

  const offerTitles = [...new Set(order.lines.map((l) => l.offerTitle).filter(Boolean))];

  /*
   * Τα έξοδα πληρωμής δεν έχουν δική τους γραμμή στο template.
   * Καμία μέθοδος δεν χρεώνει σήμερα (η αντικαταβολή, η μόνη που χρέωνε ποτέ,
   * δεν γίνεται δεκτή), αλλά αν κάποτε χρεώσει, το ποσό μπαίνει στη γραμμή των
   * μεταφορικών ΚΑΙ η ετικέτα το λέει — να το κρύψουμε σιωπηλά μέσα στα
   * μεταφορικά θα ήταν να χρεώσουμε κάτι που δεν γράφτηκε πουθενά.
   */
  const feeNet = Number(order.paymentFeeNet);
  const shippingLabel =
    feeNet > 0
      ? `${label(ALL_SHIPPING_METHODS, order.shippingMethod)} + ${t("έξοδα πληρωμής", "payment fee")}`
      : label(ALL_SHIPPING_METHODS, order.shippingMethod);

  /*
   * Ο συντελεστής ΦΠΑ γράφεται μόνο όταν είναι ένας.
   * Ο κατάλογος έχει 270 είδη με μειωμένο συντελεστή· ένα «ΦΠΑ 24%» πάνω από
   * μεικτό καλάθι είναι λάθος δήλωση σε κάτι που ο πελάτης κρατά ως απόδειξη.
   */
  const rates = [...new Set(order.lines.map((l) => Number(l.vatRate)))];
  /*
   * An exempt (intra-community) order has no rate to print: the lines are
   * stored at the 24% they were priced at, and the receipt says why there is
   * no VAT in the note instead (intra-EU sales design §3).
   */
  const exempt = order.vatMode === "intra_eu_exempt";
  const vatLabel = !exempt && rates.length === 1 ? `${rates[0]}%` : "";

  const quote = order.shippingQuote as { etaDays?: unknown; carrier?: unknown } | null;
  const etaDays = Number(quote?.etaDays);
  const eta =
    quote?.carrier === "DHL" && typeof quote.etaDays === "string"
      ? t(`DHL Express · παράδοση σε ${quote.etaDays} εργάσιμες`, `DHL Express · delivery in ${quote.etaDays} working days`)
      : Number.isFinite(etaDays) && etaDays > 0
        ? t(
            `Παράδοση σε ${etaDays} ${etaDays === 1 ? "εργάσιμη" : "εργάσιμες"}`,
            `Delivery in ${etaDays} working ${etaDays === 1 ? "day" : "days"}`,
          )
        : "";

  const orderData = {
    number: order.orderNumber,
    date: stamp(order.createdAt),
    url: link,
    paid,
    items,
    items_count: String(order.lines.length),
    subtotal: money(discounted ? sumLineBefore : sumLineNet),
    discount: discounted ? money(discountNet) : "",
    discount_label: offerTitles.length === 1 ? `· ${offerTitles[0]}` : "",
    shipping_method: shippingLabel,
    shipping_cost: money(Number(order.shippingNet) + feeNet),
    vat: money(order.vatAmount),
    vat_label: vatLabel,
    exempt,
    exempt_note: exempt ? euSalesCopy(locale).exemptNote : "",
    eu_buyer: euBuyerLabel(order),
    total: money(order.totalGross),
    eta,
    payment_method: label(PAYMENT_METHODS, order.paymentMethod),
    document_type: order.wantsInvoice ? t("Τιμολόγιο", "Invoice") : t("Απόδειξη", "Receipt"),
    shipping: {
      name: `${order.firstName} ${order.lastName}`.trim(),
      line1: order.shipLine1 + (order.shipLine2 ? `, ${order.shipLine2}` : ""),
      line2: localityLine(order.shipPostcode, order.shipCity, order.shipCountry, locale),
      phone: order.phone,
    },
    billing: order.wantsInvoice
      ? {
          name: order.companyName ?? `${order.firstName} ${order.lastName}`.trim(),
          line1: order.billLine1 ?? order.shipLine1,
          line2: `${order.billPostcode ?? order.shipPostcode} ${order.billCity ?? order.shipCity}`,
          vat: order.vatNumber ?? "",
          doy: order.taxOffice ?? "",
          /* The VIES consultation number: the proof of the zero-VAT invoice. */
          vies: order.viesConsultationNumber ?? "",
        }
      : {
          name: `${order.firstName} ${order.lastName}`.trim(),
          line1: order.shipLine1 + (order.shipLine2 ? `, ${order.shipLine2}` : ""),
          line2: localityLine(order.shipPostcode, order.shipCity, order.shipCountry, locale),
          vat: "",
          doy: "",
          vies: "",
        },
    notes: order.notes ?? "",
    split: await splitSection(order, "customer", locale),
  };

  const recipient = {
    first_name: order.firstName,
    last_name: order.lastName,
    email: order.email,
  };

  return { order, orderData, recipient, paid, awaitingTransfer, link, locale };
}

export async function buildOrderEmail(
  orderNumber: string,
  options: { locale?: EmailLocale } = {},
): Promise<{ to: string; subject: string; html: string; text: string; tracking?: false } | null> {
  const context = await buildOrderContext(orderNumber, options);
  if (!context) return null;
  const { order, orderData, recipient, paid, awaitingTransfer, link, locale } = context;
  const t = pick(locale);
  const money = (value: unknown) => formatMoney(locale, value);
  const stamp = (date: Date) => formatStamp(locale, date);

  /*
   * ΠΟΙΑ αιτιολογία γράφει ο πελάτης στην κατάθεση.
   *
   * Ο κωδικός της Viva όπου υπάρχει, και δεν είναι επιλογή παρουσίασης: μια
   * κατάθεση που αναγράφει τον κωδικό Viva ταυτοποιείται από την ίδια τη Viva
   * και το webhook σημειώνει την παραγγελία πληρωμένη μέσα σε λεπτά· μια
   * κατάθεση που αναγράφει KOL-… φτάνει στην τράπεζα χωρίς αντιστοίχιση και
   * περιμένει άνθρωπο. Η σελίδα επιβεβαίωσης έδειχνε πάντα τον κωδικό Viva —
   * δύο κανάλια με διαφορετική αιτιολογία για την ίδια κατάθεση είναι ο τρόπος
   * να μπουν χρήματα στον λογαριασμό που δεν ανήκουν σε κανέναν.
   */
  const reference = order.vivaOrderCode || order.orderNumber;

  /*
   * Χωρίς IBAN δεν υπάρχει email κατάθεσης.
   * Το template θα τύπωνε άδειο πίνακα λογαριασμών — δηλαδή θα ζητούσε από τον
   * πελάτη να καταθέσει κάπου. Πέφτουμε στην επιβεβαίωση παραγγελίας, που είναι
   * αληθής, και η έλλειψη ρύθμισης φωνάζει στα logs αντί να φτάσει σε πελάτη.
   */
  const useBank = awaitingTransfer && bankConfigured();
  if (awaitingTransfer && !useBank) {
    console.error(
      `[order-email] ${order.orderNumber}: αναμονή κατάθεσης χωρίς BANK_TRANSFER_IBAN — στάλθηκε επιβεβαίωση χωρίς στοιχεία κατάθεσης.`,
    );
  }

  const templateId = useBank ? "payment-pending-bank" : "order-confirmation";

  const heldHours = order.reservedUntil
    ? holdHours(order.createdAt, order.reservedUntil)
    : null;

  const preheader = useBank
    ? t(`Ποσό ${money(order.totalGross)} · αιτιολογία ${reference}`, `Amount ${money(order.totalGross)} · reference ${reference}`)
    : paid
      ? t(
          `${order.lines.length} είδη · ${money(order.totalGross)} · πληρωμένη`,
          `${order.lines.length} items · ${money(order.totalGross)} · paid`,
        )
      : t(`${order.lines.length} είδη · ${money(order.totalGross)}`, `${order.lines.length} items · ${money(order.totalGross)}`);

  const html = await renderTemplate(
    templateId,
    {
    preheader,
    recipient,
    order: orderData,
    ...(useBank
      ? {
          banks: [{ name: BANK.bank || BANK.holder || t("Δικαιούχος", "Beneficiary"), iban: BANK.iban }],
          payment: {
            reference,
            hold_for: heldHours ? t(`${heldHours} ώρες`, `${heldHours} hours`) : t("3 εργάσιμες ημέρες", "3 working days"),
            deadline: order.reservedUntil ? stamp(order.reservedUntil) : "",
            /* Η πιο χρήσιμη ενέργεια όταν υπάρχει: η ίδια παραγγελία,
               πληρωμένη αμέσως, χωρίς να χρειαστεί κατάθεση. */
            card_url: order.vivaOrderCode ? paymentPageUrl(order.vivaOrderCode) : "",
            /* Δεν υπάρχει σελίδα ανεβάσματος αποδεικτικού — το template
               παραλείπει το κουμπί αντί να δείξει κενό σύνδεσμο. */
            upload_url: "",
          },
        }
      : {}),
    },
    { locale },
  );

  const subject = useBank
    ? t(`Στοιχεία κατάθεσης για την παραγγελία ${order.orderNumber}`, `Bank transfer details for order ${order.orderNumber}`)
    : paid
      ? t(`Η παραγγελία ${order.orderNumber} επιβεβαιώθηκε`, `Your order ${order.orderNumber} is confirmed`)
      : t(`Παραγγελία ${order.orderNumber} — ελήφθη`, `Order ${order.orderNumber} — received`);

  const text = [
    subject,
    "",
    `${t("Κωδικός παραγγελίας", "Order number")}: ${order.orderNumber}`,
    ...(useBank
      ? [
          "",
          t("ΣΤΟΙΧΕΙΑ ΚΑΤΑΘΕΣΗΣ", "BANK TRANSFER DETAILS"),
          BANK.bank ? `${t("Τράπεζα", "Bank")}: ${BANK.bank}` : "",
          BANK.holder ? `${t("Δικαιούχος", "Beneficiary")}: ${BANK.holder}` : "",
          `IBAN: ${BANK.iban}`,
          `${t("Ποσό", "Amount")}: ${money(order.totalGross)}`,
          // Η ίδια αιτιολογία με το HTML. Δύο κανάλια που διαφωνούν για το τι
          // γράφεται στην κατάθεση είναι ο τρόπος να φτάσουν χρήματα αταύτιστα.
          `${t("Αιτιολογία", "Reference")}: ${reference}`,
          heldHours
            ? t(
                `Κρατάμε την παραγγελία και το απόθεμα για ${heldHours} ώρες.`,
                `We hold the order and the stock for ${heldHours} hours.`,
              )
            : "",
        ].filter(Boolean)
      : []),
    "",
    ...order.lines.map((l) => `${l.quantity} × ${l.name} — ${lineAmount(order, l, locale)}`),
    "",
    `${t("Σύνολο", "Total")}: ${money(order.totalGross)}`,
    ...(orderData.exempt
      ? [
          orderData.exempt_note,
          ...(order.vatNumber ? [`${t("ΑΦΜ", "VAT no.")}: ${order.vatNumber}`] : []),
          ...(order.viesConsultationNumber ? [`VIES: ${order.viesConsultationNumber}`] : []),
        ]
      : []),
    ...splitText(orderData.split),
    "",
    `${t("Παρακολούθηση", "Track your order")}: ${link}`,
  ].join("\n");

  /* A request's private page is in it: Mailgun must not rewrite (and log) that link. */
  return { to: order.email, subject, html, text, ...(orderData.split?.secret ? { tracking: false as const } : {}) };
}

/**
 * Στέλνει την επιβεβαίωση μιας παραγγελίας.
 *
 * Διαβάζει την παραγγελία από την αρχή αντί να την πάρει από τον καλούντα:
 * τρέχει από webhook και από ενέργεια checkout, και οι δύο έχουν διαφορετική
 * εικόνα του πόσο συμπληρωμένη είναι η εγγραφή.
 */
export async function sendOrderEmail(orderNumber: string): Promise<OrderEmailOutcome> {
  if (!mailConfigured()) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };

  const message = await buildOrderEmail(orderNumber);
  if (!message) return { ok: false, error: "Η παραγγελία δεν βρέθηκε." };

  const result = await sendMail({
    ...message,
    replyTo: process.env.MAIL_REPLY_TO,
    bcc: process.env.MAIL_BCC,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: result.id };
}
