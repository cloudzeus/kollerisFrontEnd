import "server-only";

/**
 * The shell every email we send sits in.
 *
 * Email is not the web and this is written for the clients, not for a browser:
 * tables rather than flex or grid, every style inline, no external stylesheet
 * and no web font. Outlook renders with Word's engine, Gmail strips `<style>`
 * blocks from forwarded mail, and both ignore anything they do not recognise —
 * so the layout has to survive being read by a renderer from 2007.
 *
 * ── Three things that are here on purpose ───────────────────────────────────
 *
 * A PREHEADER: the grey line an inbox shows next to the subject. Left out, the
 * client fills it with whatever text comes first, which is usually the brand
 * name repeated or the word "Kolleris" three times.
 *
 * A BULLETPROOF button: a table cell with a background colour and a padded
 * link, not a styled `<a>`. Outlook does not paint padding on an anchor, so a
 * plain one arrives as bare underlined text in the middle of the message.
 *
 * `max-width` AND `width` on the wrapper: the first is what modern clients
 * honour, the second is what Word needs, and a message that ignores both is
 * 900 pixels wide on a phone.
 */

const INK = "#111111";
const RED = "#e11d2e";
const LINE = "#e6e6e3";
const MUTED = "#767672";

export type EmailBlock = string;

/** A heading, a paragraph, a spacer — the pieces a message is built from. */
export const block = {
  heading: (text: string): EmailBlock =>
    `<h1 style="margin:0 0 6px;font-size:21px;line-height:1.25;font-weight:600;color:${INK};">${text}</h1>`,

  sub: (text: string): EmailBlock =>
    `<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:${MUTED};">${text}</p>`,

  text: (html: string): EmailBlock =>
    `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#333333;">${html}</p>`,

  /**
   * A framed panel — deposit details, a warning, anything that must not be
   * skimmed past. The left rule is a border on the cell, which every client
   * paints, rather than a pseudo-element, which none do.
   */
  panel: (title: string, body: string, accent: string = INK): EmailBlock =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background:#f7f7f5;border-left:3px solid ${accent};">
      <tr><td style="padding:16px 18px;">
        <div style="font-size:13px;font-weight:600;color:${INK};margin-bottom:8px;">${title}</div>
        ${body}
      </td></tr>
    </table>`,

  /** Label and value on one line, the way a receipt reads. */
  row: (label: string, value: string, strong = false): EmailBlock =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="padding:3px 0;font-size:14px;color:${MUTED};">${label}</td>
        <td align="right" style="padding:3px 0;font-size:14px;color:${INK};${strong ? "font-weight:600;" : ""}">${value}</td>
      </tr>
    </table>`,

  button: (href: string, label: string): EmailBlock =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;">
      <tr><td align="center" bgcolor="${INK}" style="background:${INK};">
        <a href="${href}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${label}</a>
      </td></tr>
    </table>`,

  divider: (): EmailBlock =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid ${LINE};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`,

  space: (px = 18): EmailBlock =>
    `<div style="height:${px}px;line-height:${px}px;font-size:0;">&nbsp;</div>`,
};

/** HTML-escape anything that came from a customer, an ERP or a supplier. */
export function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type LayoutOptions = {
  /** The grey line beside the subject in the inbox. Never shown in the body. */
  preheader: string;
  body: EmailBlock[];
  /** Optional line under the rule, above the address. */
  footerNote?: string;
};

export function renderEmail({ preheader, body, footerNote }: LayoutOptions): string {
  return `<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Kolleris</title>
</head>
<body style="margin:0;padding:0;background:#f0f0ee;-webkit-font-smoothing:antialiased;">

<!-- Preheader: read by the inbox, hidden in the message. The trailing spaces
     stop the client from padding it with the first line of real content. -->
<div style="display:none;font-size:1px;color:#f0f0ee;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  ${esc(preheader)}${"&#847;&zwnj;&nbsp;".repeat(60)}
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f0f0ee;">
  <tr>
    <td align="center" style="padding:24px 12px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:#ffffff;">

        <!-- Brand bar -->
        <tr>
          <td style="padding:22px 32px;background:${INK};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-size:19px;font-weight:700;letter-spacing:0.08em;color:#ffffff;">KOLLERIS</td>
                <td align="right" style="font-size:11px;letter-spacing:0.12em;color:rgba(255,255,255,0.55);">ΕΡΓΑΛΕΙΑ &amp; ΕΞΟΠΛΙΣΜΟΣ</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="height:3px;line-height:3px;font-size:0;background:${RED};">&nbsp;</td></tr>

        <!-- Body -->
        <tr>
          <td style="padding:30px 32px 26px;">
            ${body.join("\n")}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:0 32px 28px;">
            ${block.divider()}
            <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
            ${footerNote ? `<p style="margin:0 0 10px;font-size:12px;line-height:1.6;color:${MUTED};">${footerNote}</p>` : ""}
            <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
              Κολλέρης — εργαλεία και εξοπλισμός<br>
              Απαντήστε σε αυτό το email για οτιδήποτε χρειαστείτε.
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}
