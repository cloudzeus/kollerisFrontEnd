import "server-only";
import { prisma } from "@/lib/prisma";
import { paymentPageUrl } from "@/lib/payment/viva";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { renderTemplate } from "@/lib/mail/templates";
import { siteOrigin } from "@/lib/seo/urls";
import { holdHours } from "@/lib/orders/hold";
import { SHIPPING_METHODS, PAYMENT_METHODS } from "@/lib/cart/options";

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

const money = (value: unknown) => `${Number(value).toFixed(2).replace(".", ",")} €`;

/** «04.09.2026, 10:12» — η μορφή που δείχνουν τα templates στο order-head. */
function stamp(date: Date): string {
  const p = new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Athens",
    /*
     * 24ωρο, ρητά.
     * Χωρίς αυτό το el-GR δίνει «03:01 μ.μ.» — και επειδή εδώ κρατάμε μόνο τα
     * μέρη `hour`/`minute` και πετάμε το `dayPeriod`, οι 15:01 γίνονταν 03:01.
     * Δώδεκα ώρες λάθος πάνω σε απόδειξη και σε ειδοποίηση ασφαλείας.
     */
    hourCycle: "h23",
  }).formatToParts(date);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}.${g("month")}.${g("year")}, ${g("hour")}:${g("minute")}`;
}

const label = (list: readonly { id: string; label: string }[], id: string) =>
  list.find((m) => m.id === id)?.label ?? id;

export type OrderEmailOutcome = { ok: true; id: string } | { ok: false; error: string };

/**
 * Φτιάχνει το μήνυμα χωρίς να το στείλει.
 *
 * Χωρισμένο από το `sendOrderEmail` ώστε αυτό που φτάνει σε πελάτη να μπορεί
 * να ιδωθεί πριν φτάσει. Το email είναι η μόνη επιφάνεια χωρίς staging: δεν
 * ξαναφορτώνεται, και ο τρόπος να μάθεις ότι κάτι σπάει στο Outlook δεν πρέπει
 * να είναι ένας πελάτης που σου το λέει.
 */
export async function buildOrderEmail(
  orderNumber: string,
): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { lines: true },
  });
  if (!order) return null;

  const paid = order.paymentStatus === "PAID";
  const awaitingTransfer = !paid && order.paymentMethod === "bank";

  const link = `${siteOrigin()}/checkout/epibebaiosi/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.guestToken)}`;

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
    image: line.imageUrl ?? "",
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
      ? `${label(SHIPPING_METHODS, order.shippingMethod)} + έξοδα πληρωμής`
      : label(SHIPPING_METHODS, order.shippingMethod);

  /*
   * Ο συντελεστής ΦΠΑ γράφεται μόνο όταν είναι ένας.
   * Ο κατάλογος έχει 270 είδη με μειωμένο συντελεστή· ένα «ΦΠΑ 24%» πάνω από
   * μεικτό καλάθι είναι λάθος δήλωση σε κάτι που ο πελάτης κρατά ως απόδειξη.
   */
  const rates = [...new Set(order.lines.map((l) => Number(l.vatRate)))];
  const vatLabel = rates.length === 1 ? `${rates[0]}%` : "";

  const quote = order.shippingQuote as { etaDays?: unknown } | null;
  const etaDays = Number(quote?.etaDays);
  const eta = Number.isFinite(etaDays) && etaDays > 0
    ? `Παράδοση σε ${etaDays} ${etaDays === 1 ? "εργάσιμη" : "εργάσιμες"}`
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
    total: money(order.totalGross),
    eta,
    payment_method: label(PAYMENT_METHODS, order.paymentMethod),
    document_type: order.wantsInvoice ? "Τιμολόγιο" : "Απόδειξη",
    shipping: {
      name: `${order.firstName} ${order.lastName}`.trim(),
      line1: order.shipLine1 + (order.shipLine2 ? `, ${order.shipLine2}` : ""),
      line2: `${order.shipPostcode} ${order.shipCity}`,
      phone: order.phone,
    },
    billing: order.wantsInvoice
      ? {
          name: order.companyName ?? `${order.firstName} ${order.lastName}`.trim(),
          line1: order.billLine1 ?? order.shipLine1,
          line2: `${order.billPostcode ?? order.shipPostcode} ${order.billCity ?? order.shipCity}`,
          vat: order.vatNumber ?? "",
          doy: order.taxOffice ?? "",
        }
      : {
          name: `${order.firstName} ${order.lastName}`.trim(),
          line1: order.shipLine1 + (order.shipLine2 ? `, ${order.shipLine2}` : ""),
          line2: `${order.shipPostcode} ${order.shipCity}`,
          vat: "",
          doy: "",
        },
    notes: order.notes ?? "",
  };

  const recipient = {
    first_name: order.firstName,
    last_name: order.lastName,
    email: order.email,
  };

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
    ? `Ποσό ${money(order.totalGross)} · αιτιολογία ${reference}`
    : paid
      ? `${order.lines.length} είδη · ${money(order.totalGross)} · πληρωμένη`
      : `${order.lines.length} είδη · ${money(order.totalGross)}`;

  const html = await renderTemplate(templateId, {
    preheader,
    recipient,
    order: orderData,
    ...(useBank
      ? {
          banks: [{ name: BANK.bank || BANK.holder || "Δικαιούχος", iban: BANK.iban }],
          payment: {
            reference,
            hold_for: heldHours ? `${heldHours} ώρες` : "3 εργάσιμες ημέρες",
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
  });

  const subject = useBank
    ? `Στοιχεία κατάθεσης για την παραγγελία ${order.orderNumber}`
    : paid
      ? `Η παραγγελία ${order.orderNumber} επιβεβαιώθηκε`
      : `Παραγγελία ${order.orderNumber} — ελήφθη`;

  const text = [
    subject,
    "",
    `Κωδικός παραγγελίας: ${order.orderNumber}`,
    ...(useBank
      ? [
          "",
          "ΣΤΟΙΧΕΙΑ ΚΑΤΑΘΕΣΗΣ",
          BANK.bank ? `Τράπεζα: ${BANK.bank}` : "",
          BANK.holder ? `Δικαιούχος: ${BANK.holder}` : "",
          `IBAN: ${BANK.iban}`,
          `Ποσό: ${money(order.totalGross)}`,
          // Η ίδια αιτιολογία με το HTML. Δύο κανάλια που διαφωνούν για το τι
          // γράφεται στην κατάθεση είναι ο τρόπος να φτάσουν χρήματα αταύτιστα.
          `Αιτιολογία: ${reference}`,
          heldHours ? `Κρατάμε την παραγγελία και το απόθεμα για ${heldHours} ώρες.` : "",
        ].filter(Boolean)
      : []),
    "",
    ...order.lines.map((l) => `${l.quantity} × ${l.name} — ${money(l.lineGross)}`),
    "",
    `Σύνολο: ${money(order.totalGross)}`,
    "",
    `Παρακολούθηση: ${link}`,
  ].join("\n");

  return { to: order.email, subject, html, text };
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
