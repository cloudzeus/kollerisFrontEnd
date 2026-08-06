import "server-only";

/**
 * Sending mail, through Mailgun's EU region.
 *
 * There was no email at all until now. Checkout has been telling customers
 * "θα λάβετε τα στοιχεία με email" and nothing was ever sent — the promise was
 * in the interface and the machinery behind it did not exist.
 *
 * ── EU endpoint, not the default ────────────────────────────────────────────
 *
 * `api.mailgun.net` and `api.eu.mailgun.net` are separate installations with
 * separate data. A domain created in the EU region returns 401 against the US
 * host, and the error says "Forbidden", which reads like a bad key and is not.
 * The endpoint is configuration for that reason.
 *
 * ── Failure never takes the order with it ───────────────────────────────────
 *
 * Every send is wrapped by the caller and its outcome logged. A payment that
 * succeeded and a receipt that did not send are two different facts, and the
 * first must not be undone by the second: the money has moved, and refusing
 * the order because a mail server was slow would be the worse error by far.
 */

const ENDPOINT = process.env.MAILGUN_ENDPOINT ?? "https://api.eu.mailgun.net";
const DOMAIN = process.env.MAILGUN_DOMAIN ?? "";
const API_KEY = process.env.MAILGUN_API_KEY ?? "";
const FROM = process.env.MAIL_FROM ?? "Kolleris <no-reply@kolleris.com>";

/** Long enough for a slow relay, short enough not to hold a request open. */
const TIMEOUT_MS = 15_000;

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string; configured: boolean };

export function mailConfigured(): boolean {
  return API_KEY.length > 0 && DOMAIN.length > 0;
}

export type Mail = {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Some clients show it, and spam filters read it. */
  text: string;
  replyTo?: string;
  bcc?: string;
};

export async function sendMail(mail: Mail): Promise<SendResult> {
  if (!mailConfigured()) {
    return {
      ok: false,
      configured: false,
      error: "MAILGUN_API_KEY / MAILGUN_DOMAIN δεν είναι ρυθμισμένα",
    };
  }

  const form = new URLSearchParams({
    from: FROM,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  if (mail.replyTo) form.set("h:Reply-To", mail.replyTo);
  if (mail.bcc) form.set("bcc", mail.bcc);

  try {
    const response = await fetch(`${ENDPOINT}/v3/${DOMAIN}/messages`, {
      method: "POST",
      headers: {
        // Mailgun's own scheme: the literal user "api" and the key as password.
        Authorization: `Basic ${Buffer.from(`api:${API_KEY}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        configured: true,
        error: `Mailgun ${response.status}: ${body.message ?? "χωρίς μήνυμα"}`,
      };
    }

    return { ok: true, id: body.id ?? "" };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
