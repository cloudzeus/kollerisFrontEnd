import "server-only";
import { prisma } from "@/lib/prisma";
import { sendTemplateMail } from "@/lib/mail/send-template";
import { paymentPageUrl } from "@/lib/payment/viva";
import { PAYMENT_METHODS } from "@/lib/cart/options";

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

export async function sendPaymentFailedEmail(
  orderNumber: string,
  detail: { statusId?: string | null },
) {
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) return { ok: false as const, error: "Η παραγγελία δεν βρέθηκε." };

  const retryUrl = order.vivaOrderCode ? paymentPageUrl(order.vivaOrderCode) : "";

  return sendTemplateMail({
    to: order.email,
    templateId: "payment-failed",
    subject: `Η πληρωμή δεν ολοκληρώθηκε — παραγγελία ${order.orderNumber}`,
    preheader: "Δεν έγινε καμία χρέωση. Δοκιμάστε ξανά ή επιλέξτε κατάθεση.",
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
          PAYMENT_METHODS.find((m) => m.id === order.paymentMethod)?.label ?? order.paymentMethod,
        card: "",
        reason: "Η συναλλαγή δεν εγκρίθηκε από την τράπεζα",
        error_code: detail.statusId ? `Viva ${detail.statusId}` : "—",
        retry_url: retryUrl,
      },
      /* Ο λογαριασμός κατάθεσης ως εναλλακτική — με αιτιολογία τον αριθμό
         παραγγελίας, γιατί εδώ η ταυτοποίηση γίνεται με το χέρι. */
      banks: BANK.iban.trim()
        ? [{ name: BANK.bank || BANK.holder || "Δικαιούχος", iban: BANK.iban }]
        : [],
    },
    text: [
      `Η πληρωμή για την παραγγελία ${order.orderNumber} δεν ολοκληρώθηκε`,
      "",
      "Δεν έγινε καμία χρέωση.",
      `Ποσό: ${money(order.totalGross)}`,
      ...(retryUrl ? ["", `Δοκιμάστε ξανά: ${retryUrl}`] : []),
      ...(BANK.iban.trim()
        ? [
            "",
            "Εναλλακτικά, κατάθεση σε τράπεζα:",
            BANK.bank ? `Τράπεζα: ${BANK.bank}` : "",
            `IBAN: ${BANK.iban}`,
            `Αιτιολογία: ${order.orderNumber}`,
          ].filter(Boolean)
        : []),
      "",
      "Χρειάζεστε βοήθεια; +30 210 411 1355 (Δευ–Παρ 08:00–17:00).",
    ].join("\n"),
  });
}
