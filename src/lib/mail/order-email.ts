import "server-only";
import { prisma } from "@/lib/prisma";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { siteOrigin } from "@/lib/seo/urls";

/**
 * The order email the checkout has been promising and never sending.
 *
 * "Θα λάβετε τα στοιχεία κατάθεσης με email" is on the payment step today, and
 * until now there was no mail system at all — the sentence was true of the
 * intention and false of the software. A customer who paid by bank transfer was
 * told to expect the account details and got nothing.
 *
 * Two moments, one message:
 *
 *   • Placed and awaiting a bank transfer — the deposit details, and the
 *     reference to write on it, are the entire point of the mail.
 *   • Paid — a receipt, sent from the webhook once the money is confirmed
 *     rather than when the browser came back, because a browser landing on a
 *     URL proves only that a browser landed on a URL.
 *
 * ── The bank details are configuration, never a literal ──────────────────────
 *
 * `BANK_TRANSFER_IBAN` and its siblings. An IBAN written into source is one
 * typo away from sending a customer's money to a stranger, and no test in this
 * repository could tell the difference. When they are unset the email is still
 * sent — the order summary is worth having — and the deposit block is replaced
 * by a line telling the customer to contact the shop, which is true and
 * actionable, rather than by an invented number.
 */

const BANK = {
  holder: process.env.BANK_TRANSFER_HOLDER ?? "",
  iban: process.env.BANK_TRANSFER_IBAN ?? "",
  bank: process.env.BANK_TRANSFER_BANK ?? "",
};

function bankConfigured(): boolean {
  return BANK.iban.trim().length > 0;
}

const money = (value: unknown) =>
  `${Number(value).toFixed(2).replace(".", ",")} €`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type OrderEmailOutcome =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Send the confirmation for one order.
 *
 * Reads the order fresh rather than taking it from the caller: this runs from a
 * webhook and from a checkout action, and the two have different ideas of how
 * complete the row is.
 */
export async function sendOrderEmail(orderNumber: string): Promise<OrderEmailOutcome> {
  if (!mailConfigured()) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { lines: true },
  });
  if (!order) return { ok: false, error: "Η παραγγελία δεν βρέθηκε." };

  const paid = order.paymentStatus === "PAID";
  const awaitingTransfer = !paid && order.paymentMethod === "bank";

  const link = `${siteOrigin()}/checkout/epibebaiosi/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.guestToken)}`;

  const lines = order.lines
    .map(
      (line) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee">
            <div style="font-size:14px">${escapeHtml(line.name)}</div>
            <div style="font-size:12px;color:#777">${escapeHtml(line.sku)}</div>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;font-size:14px">${line.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-size:14px">${money(line.lineGross)}</td>
        </tr>`,
    )
    .join("");

  /*
   * The deposit block, or an honest substitute.
   *
   * `orderNumber` is the reference the customer writes on the transfer — it is
   * what the shop matches the money against, and it is why this email exists
   * for bank transfers at all.
   */
  const deposit = awaitingTransfer
    ? bankConfigured()
      ? `<div style="margin:24px 0;padding:16px;background:#f7f7f5;border-left:3px solid #111">
           <div style="font-weight:600;margin-bottom:8px">Στοιχεία κατάθεσης</div>
           ${BANK.bank ? `<div style="font-size:14px">Τράπεζα: ${escapeHtml(BANK.bank)}</div>` : ""}
           ${BANK.holder ? `<div style="font-size:14px">Δικαιούχος: ${escapeHtml(BANK.holder)}</div>` : ""}
           <div style="font-size:14px">IBAN: <strong>${escapeHtml(BANK.iban)}</strong></div>
           <div style="font-size:14px;margin-top:8px">
             Ποσό: <strong>${money(order.totalGross)}</strong>
           </div>
           <div style="font-size:14px;margin-top:8px">
             Αιτιολογία: <strong>${escapeHtml(order.orderNumber)}</strong>
           </div>
           <div style="font-size:12px;color:#777;margin-top:10px">
             Γράψτε τον κωδικό στην αιτιολογία, αλλιώς δεν μπορούμε να αντιστοιχίσουμε
             την κατάθεση με την παραγγελία σας. Η παραγγελία δεσμεύεται για 3 εργάσιμες.
           </div>
         </div>`
      : `<div style="margin:24px 0;padding:16px;background:#fff4f4;border-left:3px solid #c00">
           <div style="font-weight:600;margin-bottom:6px">Στοιχεία κατάθεσης</div>
           <div style="font-size:14px">
             Θα σας τα στείλουμε αμέσως — επικοινωνήστε μαζί μας αναφέροντας τον κωδικό
             <strong>${escapeHtml(order.orderNumber)}</strong>.
           </div>
         </div>`
    : "";

  const heading = paid
    ? "Η παραγγελία σας επιβεβαιώθηκε"
    : awaitingTransfer
      ? "Λάβαμε την παραγγελία σας"
      : "Η παραγγελία σας καταχωρήθηκε";

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111">
  <div style="padding:24px 0;border-bottom:2px solid #111">
    <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em">KOLLERIS</div>
  </div>

  <h1 style="font-size:22px;margin:24px 0 4px">${heading}</h1>
  <div style="font-size:14px;color:#777">Κωδικός παραγγελίας <strong style="color:#111">${escapeHtml(order.orderNumber)}</strong></div>

  ${deposit}

  <table style="width:100%;border-collapse:collapse;margin-top:24px">
    <thead>
      <tr>
        <th style="text-align:left;font-size:12px;color:#777;padding-bottom:8px;border-bottom:1px solid #111">ΠΡΟΪΟΝ</th>
        <th style="text-align:center;font-size:12px;color:#777;padding-bottom:8px;border-bottom:1px solid #111">ΤΕΜ.</th>
        <th style="text-align:right;font-size:12px;color:#777;padding-bottom:8px;border-bottom:1px solid #111">ΑΞΙΑ</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>

  <table style="width:100%;margin-top:16px;font-size:14px">
    <tr><td style="padding:3px 0;color:#555">Μερικό σύνολο</td><td style="text-align:right">${money(order.subtotalGross)}</td></tr>
    <tr><td style="padding:3px 0;color:#555">Μεταφορικά</td><td style="text-align:right">${money(order.shippingGross)}</td></tr>
    ${Number(order.paymentFeeGross) > 0 ? `<tr><td style="padding:3px 0;color:#555">Έξοδα πληρωμής</td><td style="text-align:right">${money(order.paymentFeeGross)}</td></tr>` : ""}
    <tr><td style="padding:10px 0 0;font-weight:700;border-top:1px solid #111">Σύνολο</td><td style="text-align:right;padding:10px 0 0;font-weight:700;border-top:1px solid #111">${money(order.totalGross)}</td></tr>
  </table>

  <div style="margin-top:24px;font-size:14px">
    <div style="color:#777;font-size:12px;margin-bottom:4px">ΑΠΟΣΤΟΛΗ</div>
    ${escapeHtml(order.firstName)} ${escapeHtml(order.lastName)}<br>
    ${escapeHtml(order.shipLine1)}${order.shipLine2 ? `, ${escapeHtml(order.shipLine2)}` : ""}<br>
    ${escapeHtml(order.shipPostcode)} ${escapeHtml(order.shipCity)}<br>
    ${escapeHtml(order.phone)}
  </div>

  <div style="margin-top:28px">
    <a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;text-decoration:none;font-size:14px">
      Παρακολούθηση παραγγελίας
    </a>
  </div>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#777">
    Κολλέρης — εργαλεία και εξοπλισμός<br>
    Για οτιδήποτε, απαντήστε σε αυτό το email.
  </div>
</div>`;

  const text = [
    heading,
    `Κωδικός παραγγελίας: ${order.orderNumber}`,
    "",
    ...(awaitingTransfer && bankConfigured()
      ? [
          "ΣΤΟΙΧΕΙΑ ΚΑΤΑΘΕΣΗΣ",
          BANK.bank ? `Τράπεζα: ${BANK.bank}` : "",
          BANK.holder ? `Δικαιούχος: ${BANK.holder}` : "",
          `IBAN: ${BANK.iban}`,
          `Ποσό: ${money(order.totalGross)}`,
          `Αιτιολογία: ${order.orderNumber}`,
          "",
        ].filter(Boolean)
      : []),
    ...order.lines.map((l) => `${l.quantity} × ${l.name} — ${money(l.lineGross)}`),
    "",
    `Σύνολο: ${money(order.totalGross)}`,
    "",
    `Παρακολούθηση: ${link}`,
  ].join("\n");

  const result = await sendMail({
    to: order.email,
    subject: `${heading} — ${order.orderNumber}`,
    html,
    text,
    replyTo: process.env.MAIL_REPLY_TO,
    bcc: process.env.MAIL_BCC,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: result.id };
}
