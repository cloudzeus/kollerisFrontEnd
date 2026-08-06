import "server-only";
import { prisma } from "@/lib/prisma";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { siteOrigin } from "@/lib/seo/urls";
import { block, esc, renderEmail } from "@/lib/mail/layout";

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
          <td style="padding:9px 0;border-bottom:1px solid #e6e6e3;">
            <div style="font-size:14px;color:#111111;">${esc(line.name)}</div>
            <div style="font-size:11px;color:#767672;">${esc(line.sku)}</div>
          </td>
          <td align="center" style="padding:9px 8px;border-bottom:1px solid #e6e6e3;font-size:14px;color:#333333;">${line.quantity}</td>
          <td align="right" style="padding:9px 0;border-bottom:1px solid #e6e6e3;font-size:14px;color:#111111;">${money(line.lineGross)}</td>
        </tr>`,
    )
    .join("");

  const heading = paid
    ? "Η παραγγελία σας επιβεβαιώθηκε"
    : awaitingTransfer
      ? "Λάβαμε την παραγγελία σας"
      : "Η παραγγελία σας καταχωρήθηκε";

  /*
   * The deposit block, or an honest substitute.
   *
   * `orderNumber` is the reference the customer writes on the transfer — it is
   * what the shop matches the money against, and it is why this email exists
   * for bank transfers at all.
   */
  const deposit = !awaitingTransfer
    ? ""
    : bankConfigured()
      ? block.panel(
          "Στοιχεία κατάθεσης",
          [
            BANK.bank ? `<div style="font-size:14px;color:#333;">Τράπεζα: ${esc(BANK.bank)}</div>` : "",
            BANK.holder ? `<div style="font-size:14px;color:#333;">Δικαιούχος: ${esc(BANK.holder)}</div>` : "",
            `<div style="font-size:14px;color:#111;">IBAN: <strong>${esc(BANK.iban)}</strong></div>`,
            `<div style="font-size:14px;color:#111;margin-top:8px;">Ποσό: <strong>${money(order.totalGross)}</strong></div>`,
            `<div style="font-size:14px;color:#111;">Αιτιολογία: <strong>${esc(order.orderNumber)}</strong></div>`,
            `<div style="font-size:12px;color:#767672;margin-top:10px;line-height:1.6;">Γράψτε τον κωδικό στην αιτιολογία, αλλιώς δεν μπορούμε να αντιστοιχίσουμε την κατάθεση με την παραγγελία σας. Η παραγγελία δεσμεύεται για 3 εργάσιμες.</div>`,
          ]
            .filter(Boolean)
            .join(""),
        )
      : block.panel(
          "Στοιχεία κατάθεσης",
          `<div style="font-size:14px;color:#333;line-height:1.6;">Θα σας τα στείλουμε αμέσως — επικοινωνήστε μαζί μας αναφέροντας τον κωδικό <strong>${esc(order.orderNumber)}</strong>.</div>`,
          "#c0392b",
        );

  const html = renderEmail({
    preheader: paid
      ? `Παραγγελία ${order.orderNumber} · ${money(order.totalGross)}`
      : awaitingTransfer
        ? `Στοιχεία κατάθεσης για την παραγγελία ${order.orderNumber}`
        : `Παραγγελία ${order.orderNumber}`,
    body: [
      block.heading(heading),
      block.sub(`Κωδικός παραγγελίας ${esc(order.orderNumber)}`),
      deposit,
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px;">
        <tr>
          <th align="left" style="padding-bottom:8px;border-bottom:1px solid #111111;font-size:11px;letter-spacing:0.08em;color:#767672;font-weight:600;">ΠΡΟΪΟΝ</th>
          <th align="center" style="padding-bottom:8px;border-bottom:1px solid #111111;font-size:11px;letter-spacing:0.08em;color:#767672;font-weight:600;">ΤΕΜ.</th>
          <th align="right" style="padding-bottom:8px;border-bottom:1px solid #111111;font-size:11px;letter-spacing:0.08em;color:#767672;font-weight:600;">ΑΞΙΑ</th>
        </tr>
        ${lines}
      </table>`,
      block.row("Μερικό σύνολο", money(order.subtotalGross)),
      block.row("Μεταφορικά", money(order.shippingGross)),
      Number(order.paymentFeeGross) > 0 ? block.row("Έξοδα πληρωμής", money(order.paymentFeeGross)) : "",
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:6px;border-top:1px solid #111111;">
        <tr>
          <td style="padding-top:9px;font-size:15px;font-weight:600;color:#111111;">Σύνολο</td>
          <td align="right" style="padding-top:9px;font-size:15px;font-weight:600;color:#111111;">${money(order.totalGross)}</td>
        </tr>
      </table>`,
      block.space(22),
      block.panel(
        "ΑΠΟΣΤΟΛΗ",
        `<div style="font-size:14px;color:#333;line-height:1.6;">
          ${esc(order.firstName)} ${esc(order.lastName)}<br>
          ${esc(order.shipLine1)}${order.shipLine2 ? `, ${esc(order.shipLine2)}` : ""}<br>
          ${esc(order.shipPostcode)} ${esc(order.shipCity)}<br>
          ${esc(order.phone)}
        </div>`,
      ),
      block.button(link, "Παρακολούθηση παραγγελίας"),
    ],
  });

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
