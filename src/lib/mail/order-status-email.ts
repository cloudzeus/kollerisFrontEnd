import "server-only";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { renderTemplate } from "@/lib/mail/templates";
import { buildOrderContext } from "@/lib/mail/order-email";


/**
 * «Η παραγγελία σας προχώρησε.»
 *
 * ── Ποιος το ενεργοποιεί ───────────────────────────────────────────────────
 *
 * Το HDCtool, όταν αλλάξει η «Κατάσταση» του παραστατικού στο SoftOne
 * (`SALDOC.FINSTATES`) — από τη λίστα παραγγελιών ή από το ίδιο το ERP. Δεν
 * υπολογίζεται εδώ τίποτα: η κατάσταση είναι του ERP, και το κείμενο που
 * φτάνει στον πελάτη είναι η ονομασία που έχει δώσει το κατάστημα στη δική του
 * λίστα καταστάσεων. Δύο διαφορετικές διατυπώσεις για την ίδια κατάσταση είναι
 * ο τρόπος να τηλεφωνήσει ο πελάτης ρωτώντας ποια ισχύει.
 *
 * ── Γιατί εδώ και όχι στο HDCtool ──────────────────────────────────────────
 *
 * Τα templates, οι γραμματοσειρές, το λογότυπο και ο τρόπος που γράφονται τα
 * ποσά ζουν σε αυτό το αποθετήριο. Ένα δεύτερο αντίγραφο στο HDCtool θα ήταν
 * δεύτερη σχεδίαση να συντηρείται, και θα απέκλινε στην πρώτη αλλαγή — όπως
 * απέκλιναν οι τέσσερις αντιγραμμένες συναρτήσεις κωδικού πελάτη.
 *
 * ── Δύο παραλήπτες ─────────────────────────────────────────────────────────
 *
 * Ο πελάτης, και το κατάστημα σε κοινοποίηση. Το κατάστημα θέλει να ξέρει τι
 * είδε ο πελάτης και πότε — όταν τηλεφωνήσει, η απάντηση δεν πρέπει να αρχίζει
 * με «τι σας γράψαμε;».
 */

/** Το κατάστημα σε κάθε ενημέρωση κατάστασης. Το env την αλλάζει, δεν τη σβήνει. */
function statusNoticeCopy(): string {
  return process.env.MAIL_STATUS_NOTIFY?.trim() || "info@kolleris.com";
}

export type OrderStatusMailOutcome = { ok: true; id: string } | { ok: false; error: string };

export async function sendOrderStatusEmail(
  orderNumber: string,
  statusName: string,
): Promise<OrderStatusMailOutcome> {
  if (!mailConfigured()) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };

  const name = statusName.trim();
  if (!name) return { ok: false, error: "Λείπει η ονομασία της κατάστασης." };

  const context = await buildOrderContext(orderNumber);
  if (!context) return { ok: false, error: "Η παραγγελία δεν βρέθηκε." };

  const { order, orderData, recipient } = context;

  const html = await renderTemplate("order-status", {
    preheader: `${order.orderNumber} · ${name}`,
    recipient,
    order: orderData,
    status: { name },
  });

  const text = [
    `Η παραγγελία ${order.orderNumber} είναι τώρα: ${name}`,
    "",
    `Σύνολο: ${orderData.total}`,
    `Παρακολούθηση: ${orderData.url}`,
    ...(order.acsVoucherNo
      ? ["", `Αριθμός αποστολής ACS: ${order.acsVoucherNo}`]
      : []),
  ].join("\n");

  return sendMail({
    to: order.email,
    /* Το κατάστημα σε ΟΡΑΤΗ κοινοποίηση: ο πελάτης βλέπει σε ποιον απαντά, και
       η απάντησή του φτάνει εκεί που τη διαβάζει κάποιος. Κρυφή κοινοποίηση θα
       έστελνε τις απαντήσεις στο κενό. */
    cc: statusNoticeCopy(),
    subject: `Παραγγελία ${order.orderNumber} — ${name}`,
    html,
    text,
    replyTo: process.env.MAIL_REPLY_TO,
  });
}
