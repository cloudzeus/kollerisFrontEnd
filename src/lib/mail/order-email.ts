import "server-only";
import { prisma } from "@/lib/prisma";
import { paymentPageUrl } from "@/lib/payment/viva";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { siteOrigin } from "@/lib/seo/urls";
import { block, esc, renderEmail } from "@/lib/mail/layout";
import { holdDeadline } from "@/lib/orders/hold";

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

/**
 * The deposit slip, as a card.
 *
 * This is the only part of the email with a job beyond being read: somebody has
 * it open beside their banking app and is copying three values across. So it is
 * built around those three — amount, IBAN, reference — each on its own line, at
 * a size you can read from a phone held next to a laptop, and nothing competing
 * with them.
 *
 * ── Why it looks like this ──────────────────────────────────────────────────
 *
 * The IBAN is monospaced and left in its four-character groups. Grouped digits
 * are how the eye checks a long number it is retyping, and a proportional font
 * makes 1 and 7 and 0 and O the same width. Banks strip the spaces.
 *
 * The reference is in a boxed frame rather than bold text, because it is the
 * one field a customer skips — it looks like an optional "message to payee" —
 * and a deposit without it is money in the account that belongs to nobody.
 *
 * Everything is a table with inline styles. Word renders Outlook, and it does
 * not paint padding on an anchor or honour a border-radius on a div.
 */
function depositCard({
  amount,
  reference,
  orderNumber,
  payUrl,
  reservedUntil,
}: {
  amount: string;
  reference: string;
  orderNumber: string;
  payUrl: string | null;
  reservedUntil: Date | null;
}): string {
  const label = (text: string) =>
    `<div style="font-size:10px;letter-spacing:0.12em;font-weight:600;color:#767672;padding-bottom:3px;">${text}</div>`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background:#f7f7f5;border-left:3px solid #e11d2e;">
    <tr><td style="padding:18px 20px 20px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">

      <div style="font-size:11px;letter-spacing:0.12em;font-weight:600;color:#e11d2e;padding-bottom:14px;">ΣΤΟΙΧΕΙΑ ΚΑΤΑΘΕΣΗΣ</div>

      ${label("ΠΟΣΟ")}
      <div style="font-size:30px;line-height:1;font-weight:600;color:#111111;padding-bottom:16px;">${amount}</div>

      ${label("IBAN")}
      <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:16px;line-height:1.4;font-weight:600;color:#111111;word-break:break-all;">${esc(BANK.iban)}</div>
      ${BANK.holder ? `<div style="font-size:13px;line-height:1.5;color:#333333;padding-top:5px;">${esc(BANK.holder)}</div>` : ""}
      ${BANK.bank ? `<div style="font-size:12px;line-height:1.5;color:#767672;">${esc(BANK.bank)}</div>` : ""}

      <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>

      ${label("ΑΙΤΙΟΛΟΓΙΑ &mdash; ΓΡΑΨΤΕ ΤΟΝ ΑΚΡΙΒΩΣ")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="border:1.5px solid #111111;background:#ffffff;padding:9px 16px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:19px;font-weight:600;letter-spacing:0.06em;color:#111111;">${esc(reference)}</td></tr>
      </table>

      <div style="font-size:12px;line-height:1.6;color:#767672;padding-top:10px;">
        Χωρίς αυτόν τον κωδικό η κατάθεση φτάνει χωρίς όνομα και δεν μπορούμε να τη
        συνδέσουμε με την παραγγελία σας${reference === orderNumber ? "" : ` <span style="color:#333333;">(${esc(orderNumber)})</span>`}.
      </div>

      ${
        reservedUntil
          ? `<div style="font-size:12px;line-height:1.6;color:#111111;padding-top:8px;">
               Κρατάμε τα προϊόντα σας <strong>έως ${esc(holdDeadline(reservedUntil))}</strong>.
             </div>`
          : ""
      }

      ${
        payUrl
          ? `<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
             <table role="presentation" cellpadding="0" cellspacing="0" border="0">
               <tr><td align="center" bgcolor="#111111" style="background:#111111;">
                 <a href="${payUrl}" style="display:inline-block;padding:12px 24px;font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;">Ή πληρώστε τώρα με κάρτα</a>
               </td></tr>
             </table>
             <div style="font-size:11px;line-height:1.6;color:#767672;padding-top:8px;">Η ίδια παραγγελία, πληρωμένη αμέσως — δεν χρειάζεται κατάθεση.</div>`
          : ""
      }

    </td></tr>
  </table>`;
}

export type OrderEmailOutcome =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Build the message without sending it.
 *
 * Split from `sendOrderEmail` so the thing that goes to a customer can be
 * looked at before it does. An email is the one surface with no staging: you
 * cannot reload it, and the way to find out that the deposit card renders as
 * three grey lines in Outlook should not be a customer telling you.
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
  /*
   * WHICH reference the customer writes on the transfer.
   *
   * The Viva code when there is one, and this is not a presentation choice. A
   * deposit quoting the Viva payment code is matched by Viva itself and the
   * webhook marks the order paid within minutes; a deposit quoting KOL-… lands
   * in the bank with nothing to match it to and waits for somebody to reconcile
   * it by hand.
   *
   * It also settles a disagreement. The confirmation page has always shown the
   * Viva code and said «αναγράψτε τον κωδικό στην αιτιολογία», while this email
   * said the order number — two references for one deposit, so whichever the
   * shop reconciles against, one of the two channels was telling the customer
   * the wrong thing.
   */
  const reference = order.vivaOrderCode || order.orderNumber;

  const deposit = !awaitingTransfer
    ? ""
    : bankConfigured()
      ? depositCard({
          amount: money(order.totalGross),
          reference,
          orderNumber: order.orderNumber,
          payUrl: order.vivaOrderCode ? paymentPageUrl(order.vivaOrderCode) : null,
          reservedUntil: order.reservedUntil,
        })
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
          // The same reference the card shows. Two channels disagreeing about
          // what to write on a transfer is how money arrives unmatched.
          `Αιτιολογία: ${order.vivaOrderCode || order.orderNumber}`,
          ...(order.reservedUntil
            ? [`Κρατάμε τα προϊόντα σας έως ${holdDeadline(order.reservedUntil)}.`]
            : []),
          "",
        ].filter(Boolean)
      : []),
    ...order.lines.map((l) => `${l.quantity} × ${l.name} — ${money(l.lineGross)}`),
    "",
    `Σύνολο: ${money(order.totalGross)}`,
    "",
    `Παρακολούθηση: ${link}`,
  ].join("\n");

  return {
    to: order.email,
    subject: `${heading} — ${order.orderNumber}`,
    html,
    text,
  };
}

/**
 * Send the confirmation for one order.
 *
 * Reads the order fresh rather than taking it from the caller: this runs from a
 * webhook and from a checkout action, and the two have different ideas of how
 * complete the row is.
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
