import "server-only";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { renderTemplate } from "@/lib/mail/templates";
import { buildOrderContext } from "@/lib/mail/order-email";
import { siteOrigin } from "@/lib/seo/urls";

/**
 * Η ειδοποίηση παραγγελίας προς το κατάστημα.
 *
 * ── Τι έλειπε ──────────────────────────────────────────────────────────────
 *
 * Τίποτα δεν έφτανε ποτέ στο κατάστημα. Επαληθευμένο στο Mailgun για την
 * KOL-20260907-0001: δύο μηνύματα συνολικά, «επιβεβαιώθηκε» και «απεστάλη»,
 * και τα δύο ΜΟΝΟ στον πελάτη. Το `MAIL_BCC` υπήρχε ως δυνατότητα και δεν ήταν
 * ορισμένο πουθενά — δηλαδή οι παραγγελίες έφταναν και κανείς δεν το μάθαινε
 * παρά μόνο αν άνοιγε τη διαχείριση.
 *
 * Και δεν θα το έλυνε: το BCC είναι αντίγραφο του email ΤΟΥ ΠΕΛΑΤΗ. Γράφτηκε
 * για τον πελάτη — ευχαριστώ, σύνδεσμος παρακολούθησης — και του λείπουν όσα
 * χρειάζεται κάποιος για να ΕΚΤΕΛΕΣΕΙ: το email και το τηλέφωνο του αγοραστή,
 * αν η πληρωμή έχει όντως εισπραχθεί, και ο σύνδεσμος στη διαχείριση.
 *
 * ── Ίδια νούμερα με του πελάτη ─────────────────────────────────────────────
 *
 * Το περιεχόμενο έρχεται από το `buildOrderContext`, το ίδιο που φτιάχνει την
 * επιβεβαίωση. Δεύτερος υπολογισμός θα σήμαινε δύο email που διαφωνούν για το
 * ίδιο ποσό — και το κατάστημα να εκτελεί με νούμερα που ο πελάτης δεν είδε.
 *
 * ── Γιατί οι δύο παραλήπτες είναι στον κώδικα ──────────────────────────────
 *
 * `accounts@` και `info@`, πάντα. Όχι μεταβλητή περιβάλλοντος που μπορεί να
 * μείνει κενή σε έναν διακομιστή — ακριβώς όπως έμεινε το `MAIL_BCC`. Το
 * `MAIL_ORDER_NOTIFY` μπορεί να τους αλλάξει· δεν μπορεί να τους σβήσει κατά
 * λάθος.
 */

const money = (value: unknown) => `${Number(value).toFixed(2).replace(".", ",")} €`;

/** Οι δύο διευθύνσεις του καταστήματος. Το env τις αλλάζει, δεν τις σβήνει. */
export function internalOrderRecipients(): string {
  return process.env.MAIL_ORDER_NOTIFY?.trim() || "accounts@kolleris.com, info@kolleris.com";
}

export type InternalOrderMailOutcome = { ok: true; id: string } | { ok: false; error: string };

export async function sendInternalOrderEmail(
  orderNumber: string,
): Promise<InternalOrderMailOutcome> {
  if (!mailConfigured()) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };

  const context = await buildOrderContext(orderNumber);
  if (!context) return { ok: false, error: "Η παραγγελία δεν βρέθηκε." };

  const { order, orderData, recipient, paid } = context;

  const html = await renderTemplate("order-internal", {
    preheader: `${order.lines.length} είδη · ${money(order.totalGross)} · ${
      paid ? "πληρωμένη" : "ΕΚΚΡΕΜΕΙ ΠΛΗΡΩΜΗ"
    }`,
    recipient: {
      ...recipient,
      /* Το template του πελάτη χαιρετά με το μικρό όνομα· εδώ χρειάζεται
         ολόκληρο, γιατί είναι το όνομα που θα γραφτεί στο δελτίο. */
      full_name: `${order.firstName} ${order.lastName}`.trim() || order.companyName || "—",
    },
    order: {
      ...orderData,
      admin_url: `${siteOrigin()}/admin/orders/${encodeURIComponent(order.orderNumber)}`,
    },
  });

  const text = [
    `ΠΑΡΑΓΓΕΛΙΑ ${order.orderNumber} — ${paid ? "ΠΛΗΡΩΜΕΝΗ" : "ΕΚΚΡΕΜΕΙ ΠΛΗΡΩΜΗ"}`,
    "",
    `Ημερομηνία: ${orderData.date}`,
    `Πελάτης: ${orderData.shipping.name}`,
    `Email: ${order.email}`,
    `Τηλέφωνο: ${order.phone}`,
    `Διεύθυνση: ${orderData.shipping.line1}, ${orderData.shipping.line2}`,
    `Πληρωμή: ${orderData.payment_method}`,
    `Αποστολή: ${orderData.shipping_method}`,
    `Παραστατικό: ${orderData.document_type}`,
    ...(order.wantsInvoice
      ? [
          `Επωνυμία: ${order.companyName ?? "—"}`,
          `ΑΦΜ: ${order.vatNumber ?? "—"} · ΔΟΥ: ${order.taxOffice ?? "—"}`,
        ]
      : []),
    ...(order.notes?.trim() ? ["", `Σημειώσεις: ${order.notes.trim()}`] : []),
    "",
    "ΕΙΔΗ",
    ...order.lines.map(
      (l) => `${l.quantity} × ${l.sku} — ${l.name}${l.brand ? ` (${l.brand})` : ""} — ${money(l.lineGross)}`,
    ),
    "",
    `Μεταφορικά: ${orderData.shipping_cost}`,
    `ΣΥΝΟΛΟ: ${orderData.total}`,
    "",
    `Διαχείριση: ${siteOrigin()}/admin/orders/${encodeURIComponent(order.orderNumber)}`,
  ].join("\n");

  return sendMail({
    to: internalOrderRecipients(),
    subject: `Νέα παραγγελία ${order.orderNumber} — ${money(order.totalGross)}${
      paid ? "" : " (ΕΚΚΡΕΜΕΙ ΠΛΗΡΩΜΗ)"
    }`,
    html,
    text,
    /* Απάντηση στον πελάτη: η πρώτη κίνηση για παραγγελία που θέλει
       διευκρίνιση είναι να του απαντήσεις, όχι να ψάξεις τη διεύθυνση. */
    replyTo: order.email,
  });
}
