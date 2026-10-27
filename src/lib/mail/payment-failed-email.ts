import "server-only";
import { prisma } from "@/lib/prisma";
import { sendTemplateMail } from "@/lib/mail/send-template";
import { paymentPageUrl } from "@/lib/payment/viva";
import { PAYMENT_METHODS } from "@/lib/cart/options";
import { emailLocale, formatMoney, formatStamp, paymentLabelEn, pick, type EmailLocale } from "@/lib/mail/email-locale";

/**
 * «Η πληρωμή δεν ολοκληρώθηκε».
 *
 * Μια απορριφθείσα κάρτα άφηνε την παραγγελία σε FAILED και τον πελάτη χωρίς
 * τίποτα: ούτε ότι δεν χρεώθηκε, ούτε τι να κάνει. Όποιος έκλεινε την καρτέλα
 * της Viva νομίζοντας ότι πέρασε, το μάθαινε όταν δεν ερχόταν το δέμα.
 *
 * ── Καμία υπόσχεση κράτησης ────────────────────────────────────────────────
 *
 * Το κατάστημα ΔΕΝ κρατά απόθεμα μετά από απορριφθείσα κάρτα — το
 * `reservedUntil` γράφεται μόνο για τραπεζική κατάθεση, και καμία σάρωση δεν
 * ελευθερώνει τίποτα ούτως ή άλλως. Η πρόταση της κράτησης αφαιρέθηκε από το
 * template: μια προθεσμία που δεν την τηρεί κανένας μηχανισμός κάνει τον
 * πελάτη να καθυστερήσει νομίζοντας ότι έχει χρόνο.
 *
 * ── Τι μένει, και είναι αληθές ─────────────────────────────────────────────
 *
 * Δεν έγινε χρέωση. Ο σύνδεσμος πληρωμής της Viva (το email φεύγει δευτερόλεπτα
 * μετά, μέσα στο παράθυρο ισχύος του — και μια επιτυχής επανάληψη γυρίζει την
 * παραγγελία σε CONFIRMED από το ίδιο webhook). Ο λογαριασμός για κατάθεση με
 * αιτιολογία τον αριθμό παραγγελίας. Και το τηλέφωνο.
 */

const BANK = {
  holder: process.env.BANK_TRANSFER_HOLDER ?? "",
  iban: process.env.BANK_TRANSFER_IBAN ?? "",
  bank: process.env.BANK_TRANSFER_BANK ?? "",
};



export async function sendPaymentFailedEmail(
  orderNumber: string,
  detail: { statusId?: string | null },
  options: { locale?: EmailLocale } = {},
) {
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) return { ok: false as const, error: "Η παραγγελία δεν βρέθηκε." };

  const locale = emailLocale(order, options.locale);
  const t = pick(locale);
  const money = (value: unknown) => formatMoney(locale, value);
  const stamp = (date: Date) => formatStamp(locale, date);

  const retryUrl = order.vivaOrderCode ? paymentPageUrl(order.vivaOrderCode) : "";

  return sendTemplateMail({
    to: order.email,
    templateId: "payment-failed",
    locale,
    subject: t(
      `Η πληρωμή δεν ολοκληρώθηκε — παραγγελία ${order.orderNumber}`,
      `Payment not completed — order ${order.orderNumber}`,
    ),
    preheader: t(
      "Δεν έγινε καμία χρέωση. Δοκιμάστε ξανά ή επιλέξτε κατάθεση.",
      "You have not been charged. Try again or choose a bank transfer.",
    ),
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
      },
      payment: {
        amount: money(order.totalGross),
        /*
         * Τι επέλεξε ο πελάτης στο ΔΙΚΟ ΜΑΣ ταμείο. Ποια κάρτα δοκιμάστηκε
         * δεν το ξέρουμε — η Viva δεν στέλνει μασκαρισμένο αριθμό σε
         * αποτυχημένη συναλλαγή, και ένα επινοημένο «****1234» σε μήνυμα για
         * χρήματα είναι το χειρότερο είδος συμπλήρωσης κενού.
         */
        method:
          locale === "en"
            ? paymentLabelEn(order.paymentMethod)
            : (PAYMENT_METHODS.find((m) => m.id === order.paymentMethod)?.label ?? order.paymentMethod),
        card: "",
        reason: t("Η συναλλαγή δεν εγκρίθηκε από την τράπεζα", "The transaction was not approved by the bank"),
        error_code: detail.statusId ? `Viva ${detail.statusId}` : "—",
        retry_url: retryUrl,
      },
      /* Ο λογαριασμός κατάθεσης ως εναλλακτική — με αιτιολογία τον αριθμό
         παραγγελίας, γιατί εδώ η ταυτοποίηση γίνεται με το χέρι. */
      banks: BANK.iban.trim()
        ? [{ name: BANK.bank || BANK.holder || t("Δικαιούχος", "Beneficiary"), iban: BANK.iban }]
        : [],
    },
    text: [
      t(
        `Η πληρωμή για την παραγγελία ${order.orderNumber} δεν ολοκληρώθηκε`,
        `The payment for order ${order.orderNumber} was not completed`,
      ),
      "",
      t("Δεν έγινε καμία χρέωση.", "You have not been charged."),
      `${t("Ποσό", "Amount")}: ${money(order.totalGross)}`,
      ...(retryUrl ? ["", `${t("Δοκιμάστε ξανά", "Try again")}: ${retryUrl}`] : []),
      ...(BANK.iban.trim()
        ? [
            "",
            t("Εναλλακτικά, κατάθεση σε τράπεζα:", "Alternatively, a bank transfer:"),
            BANK.bank ? `${t("Τράπεζα", "Bank")}: ${BANK.bank}` : "",
            `IBAN: ${BANK.iban}`,
            `${t("Αιτιολογία", "Reference")}: ${order.orderNumber}`,
          ].filter(Boolean)
        : []),
      "",
      t(
        "Χρειάζεστε βοήθεια; +30 210 411 1355 (Δευ–Παρ 08:00–17:00).",
        "Need help? +30 210 411 1355 (Mon–Fri 08:00–17:00).",
      ),
    ].join("\n"),
  });
}
